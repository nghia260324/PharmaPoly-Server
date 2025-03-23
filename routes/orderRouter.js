// const express = require('express');
// const router = express.Router();

// const Orders = require('../models/orders');
// const { db } = require("../firebase/firebaseAdmin");

// router.get('/', async function (req, res, next) {
//     const orders = await Orders.find().sort({ created_at: -1 }); 
//     res.render('orders/list', {
//         orders: orders
//     });
// });

// router.get('/', async function (req, res, next) {
//     const orders = await Orders.find().sort({ created_at: -1 });
//     res.render('orders/list', { orders: orders });
// });

// db.ref("new_orders").on("value", async (snapshot) => {
//     if (snapshot.exists()) {
//         const newOrderData = snapshot.val();
//         const newOrder = await Orders.findOne({ order_code: newOrderData.order_code });

//         if (newOrder) {
//             const io = require('../app').get("io"); 
//             io.emit("new_order", newOrder);
//         }

//         db.ref("new_orders").remove();
//     }
// });
// module.exports = router;


const express = require('express');
const router = express.Router();
const Orders = require('../models/orders');
const OrderItems = require('../models/orderItems');
const { db } = require("../firebase/firebaseAdmin");

router.get('/', async function (req, res, next) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const orders = await Orders.find()
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit);

        const totalOrders = await Orders.countDocuments();
        const totalPages = Math.ceil(totalOrders / limit);

        res.render('orders/list', {
            orders: orders,
            currentPage: page,
            totalPages: totalPages,
            limit: limit
        });
    } catch (error) {
        next(error);
    }
});


// router.get('/:id/detail', async function (req, res, next) {
//     try {

//         res.render('orders/detail', {
    
//         });
//     } catch (error) {
//         next(error);
//     }
// });

router.get("/:id/detail", async function (req, res, next) {
    try {
        const orderId = req.params.id;

        // Lấy thông tin đơn hàng
        const order = await Orders.findById(orderId).populate("user_id");

        // Lấy danh sách sản phẩm trong đơn hàng
        const orderItems = await OrderItems.find({ order_id: orderId })
            .populate("product_id");

        res.render("orders/detail", {
            order,
            orderItems,
        });
    } catch (error) {
        next(error);
    }
});




db.ref("new_orders").on("value", async (snapshot) => {
    if (snapshot.exists()) {
        const newOrderData = snapshot.val();
        const newOrder = await Orders.findOne({ order_code: newOrderData.order_code });

        if (newOrder) {
            const io = require('../app').get("io"); 
            io.emit("new_order", newOrder);
        }

        db.ref("new_orders").remove();
    }
});

module.exports = router;
