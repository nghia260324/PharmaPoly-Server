const cron = require("node-cron");
const mongoose = require("mongoose");
const Orders = require("../models/orders");
const OrderItems = require("../models/orderItems");
const Products = require("../models/products");
const StockEntrys = require("../models/stockEntries");
const dotenv = require("dotenv");

dotenv.config();

cron.schedule("* * * * *", async () => {
    try {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

        const orders = await Orders.find({
            payment_method: "ONLINE",
            payment_status: "pending",
            status: "pending",
            created_at: { $lte: tenMinutesAgo }
        });
        if (orders.length === 0) return;

        const orderIds = orders.map(order => order._id);

        await Orders.updateMany(
            { _id: { $in: orderIds } },
            {
                $set: {
                    status: "canceled",
                    payment_status: "failed",
                    updated_at: new Date()
                }
            }
        );

        console.log(`✅ Canceled ${orders.length} unpaid online orders.`);
    } catch (error) {
        console.error("❌ Error auto-canceling orders:", error);
    }
});

cron.schedule("0 0 * * *", async () => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const expiredStock = await StockEntrys.updateMany(
            {
                expiry_date: { $lte: today },
                status: { $nin: ['expired', 'discontinued'] }
            },
            {
                $set: { status: 'expired' }
            }
        );

        console.log("✅ Cập nhật trạng thái 'expired', chi tiết:", expiredStock);

    } catch (error) {
        console.error("❌ Lỗi khi cập nhật trạng thái lô hàng đã hết hạn:", error);
    }
});

console.log("🚀 Cron job for auto-canceling unpaid orders is running...");