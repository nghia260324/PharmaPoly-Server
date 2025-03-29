const cron = require("node-cron");
const mongoose = require("mongoose");
const Orders = require("../models/orders");
const OrderItems = require("../models/orderItems");
const dotenv = require("dotenv");

dotenv.config();


cron.schedule("*/2 * * * *", async () => {
    try {
        const orders = await Orders.find({
            payment_method: "ONLINE",
            payment_status: "pending",
            status: "confirmed"
        });
        let canceledCount = 0;

        for (const order of orders) {
            const orderItems = await OrderItems.find({ order_id: order._id }).populate("product_id");

            for (const item of orderItems) {
                await Products.updateOne(
                    { _id: item.product_id._id },
                    { $inc: { stock_quantity: item.quantity } }
                );
                totalRestocked += item.quantity;
            }

            order.status = "canceled";
            order.payment_status = "failed";
            await order.save();

            console.log(`Order ${order._id} has been auto-canceled and stock updated.`);
        }

        if (canceledCount > 0) {
            console.log(`Total ${canceledCount} orders have been auto-canceled.`);
        }
    } catch (error) {
        console.error("Error auto-canceling orders:", error);
    }
});

console.log("Cron job for auto-canceling unpaid orders is running...");
