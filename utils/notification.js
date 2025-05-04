const Notification = require('../models/notifications');
const { admin } = require('../firebase/firebaseAdmin');
const { getFcmToken } = require('../utils/fcmTokenManager');
const User = require('../models/users');

const sendNotification = async ({ user_id, title, message }) => {
    try {
        await Notification.create({
            user_id,
            title,
            message,
            is_read: false
        });

        const fcmToken = await getFcmToken(user_id);

        if (fcmToken) {
            const payload = {
                notification: {
                    title,
                    body: message,
                },
                token: fcmToken
            };
            await admin.messaging().send(payload);
        }
    } catch (error) {
        console.error('Lỗi gửi thông báo:', error.message);
    }
};
const getAdminUser = async () => {
    try {
        const adminUser = await User.findOne({ role: 0 });
        return adminUser;
    } catch (error) {
        console.error('Lỗi khi lấy admin:', error.message);
        throw error;
    }
};
const sendNotificationToAdmin = async ({ title, message }) => {
    try {
        const admin = await getAdminUser();
        const new_notification = await Notification.create({
            user_id: admin._id,
            title,
            message,
            is_read: false
        });

        const notifications = await Notification.find({user_id: admin._id});

        const io = require('../app').get("io");
        io.emit("admin_notification", new_notification, notifications);
    } catch (error) {
        console.error('Lỗi gửi thông báo tới admin:', error.message);
    }
};

// sendNotificationToAdmin({ title: "Title Test", message: "Content Test" });


module.exports = { sendNotification, sendNotificationToAdmin };
