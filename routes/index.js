var express = require('express');
var router = express.Router();
const { authenticateToken, authorizeAdmin } = require("../middlewares/authenticateToken");
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const Notifications = require("../models/notifications");
const Orders = require("../models/orders");
const Users = require("../models/users");
const { db } = require('../firebase/firebaseAdmin');

router.get('/', (req, res) => {
    const token = req.cookies.token || req.header("Authorization")?.split(" ")[1];

    if (token) {
        jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
            if (!err) {
                return res.redirect('/dashboards/revenue');
            }
        });
    }

    res.redirect('/login');
});


router.get('/login', function (req, res) {
    res.render('login/login', { layout: false });
});

router.get('/admin/refresh-token', async (req, res) => {
    try {
        const token = req.cookies.refreshToken;
        if (!token) {
            return res.status(401).json({ message: "Không có refresh token" });
        }

        jwt.verify(token, process.env.JWT_REFRESH_SECRET, async (err, user) => {
            if (err) return res.status(403).json({ message: "Refresh token không hợp lệ" });

            const newAccessToken = jwt.sign(
                { _id: user._id, phone_number: user.phone_number, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            res.cookie("token", newAccessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "Strict",
                maxAge: 60 * 60 * 1000,
            });

            res.status(200).json({ message: "Token mới đã được cấp" });
        });
    } catch (error) {
        console.error("Lỗi khi làm mới token:", error);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});


router.post('/admin/login', async (req, res) => {
    try {
        const { phone_number, password } = req.body;

        if (!phone_number || !password) {
            return res.status(400).json({
                status: 400,
                message: "Số điện thoại và mật khẩu là bắt buộc!"
            });
        }

        const user = await Users.findOne({ phone_number });
        if (!user) {
            return res.status(404).json({
                status: 404,
                message: "Không tìm thấy người dùng!"
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                status: 401,
                message: "Mật khẩu không đúng!"
            });
        }
        const token = jwt.sign(
            { _id: user._id, phone_number: user.phone_number, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const refreshToken = jwt.sign(
            { _id: user._id, phone_number: user.phone_number, role: user.role },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: '7d' }
        );


        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "Strict",
            maxAge: 60 * 60 * 1000,
        });

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "Strict",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        const userObj = user.toObject();
        delete userObj.password;
        res.status(200).json({
            status: 200,
            message: "Đăng nhập thành công!",
            //data: userObj
        });

    } catch (error) {
        console.error("Lỗi khi đăng nhập:", error);
        res.status(500).json({
            status: 500,
            message: "Lỗi máy chủ nội bộ!"
        });
    }
});
router.get('/logout', (req, res) => {
    res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Strict"
    });
    res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Strict"
    });

    return res.redirect('/login');
});


router.get('/admin/notifications', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const adminUser = await Users.findOne({ role: 0 });

        const notifications = await Notifications.find({ user_id: adminUser._id })
            .sort({ created_at: 1 });

        const unreadCount = await Notifications.countDocuments({
            user_id: adminUser._id,
            is_read: false
        });

        const processedNotifications = notifications.map(notification => {

            const orderIdMatch = notification.message.match(/IDS-([a-f0-9]{24})-IDE/);
            const order_id = orderIdMatch ? orderIdMatch[1] : null;

            const messageWithoutOrderId = notification.message.replace(/IDS-[a-f0-9]{24}-IDE/g, '').trim();

            return {
                ...notification.toObject(),
                message: messageWithoutOrderId,
                order_id: order_id
            };
        });

        res.json({
            status: 200,
            message: 'Lấy danh sách thông báo thành công',
            data: processedNotifications,
            unread_count: unreadCount
        });
    } catch (error) {
        console.error('Lỗi lấy thông báo:', error);
        res.status(500).json({
            status: 500,
            message: 'Đã xảy ra lỗi máy chủ'
        });
    }
});


router.put('/admin/notifications/read/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const adminUser = await Users.findOne({ role: 0 });
        const notificationId = req.params.id;

        const notification = await Notifications.findOne({
            _id: notificationId,
            user_id: adminUser._id
        });

        if (!notification) {
            return res.status(404).json({
                status: 404,
                message: 'Không tìm thấy thông báo'
            });
        }

        if (notification.is_read) {
            return res.status(200).json({
                status: 200,
                message: 'Thông báo đã được đánh dấu là đã đọc trước đó',
                data: notification
            });
        }

        notification.is_read = true;
        await notification.save();

        const orderIdMatch = notification.message.match(/IDS-([a-f0-9]{24})-IDE/);
        const order_id = orderIdMatch ? orderIdMatch[1] : null;

        const order = await Orders.findById(order_id)

        if (order && order.status === 'canceled') {
            const ref = db.ref(`admin_notifications/${order_id}`);
            await ref.remove();   
        }

        res.status(200).json({
            status: 200,
            message: 'Đánh dấu đã đọc thành công',
            data: notification
        });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({
            status: 500,
            message: 'Lỗi server',
            error: error.message
        });
    }
});


























router.get("/keep-alive", (req, res) => {
    res.status(200).send('Server is up and running!');
});

module.exports = router;
