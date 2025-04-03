const cron = require("node-cron");
const mongoose = require("mongoose");
const Orders = require("../models/orders");
const OrderItems = require("../models/orderItems");
const Products = require("../models/products");
const dotenv = require("dotenv");

dotenv.config();
cron.schedule("*/2 * * * *", async () => {
    try {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

        const orders = await Orders.find({
            payment_method: "ONLINE",
            payment_status: "pending",
            status: "confirmed",
            created_at: { $lte: tenMinutesAgo }
        });

        if (orders.length === 0) return;

        const orderIds = orders.map(order => order._id);

        await Orders.updateMany(
            { _id: { $in: orderIds } },
            { status: "canceled", payment_status: "failed" }
        );

        console.log(`✅ Canceled ${orders.length} unpaid online orders.`);
    } catch (error) {
        console.error("❌ Error auto-canceling orders:", error);
    }
});

console.log("🚀 Cron job for auto-canceling unpaid orders is running...");