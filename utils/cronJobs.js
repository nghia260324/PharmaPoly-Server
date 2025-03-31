const cron = require("node-cron");
const mongoose = require("mongoose");
const Orders = require("../models/orders");
const OrderItems = require("../models/orderItems");
const Products = require("../models/products");
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
        let restockedProducts = {};

        for (const order of orders) {
            const orderItems = await OrderItems.find({ order_id: order._id }).populate("product_id");

            for (const item of orderItems) {
                const productId = item.product_id._id.toString();

                await Products.updateOne(
                    { _id: productId },
                    { $inc: { stock_quantity: item.quantity } }
                );

                if (!restockedProducts[productId]) {
                    restockedProducts[productId] = { 
                        name: item.product_id.name, 
                        quantity: 0 
                    };
                }
                restockedProducts[productId].quantity += item.quantity;
            }

            order.status = "canceled";
            order.payment_status = "failed";
            await order.save();
            canceledCount++;
        }

        // if (canceledCount > 0) {
        //     console.log(`Total ${canceledCount} orders have been auto-canceled.`);

        //     console.log("Restocked items:");
        //     for (const [productId, info] of Object.entries(restockedProducts)) {
        //         console.log(`- ${info.name}: +${info.quantity} items`);
        //     }
        // }
    } catch (error) {
        console.error("Error auto-canceling orders:", error);
    }
});

console.log("Cron job for auto-canceling unpaid orders is running...");
