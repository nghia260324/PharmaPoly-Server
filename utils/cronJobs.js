const cron = require("node-cron");
const mongoose = require("mongoose");
const Orders = require("../models/orders");
const OrderItems = require("../models/orderItems");
const Products = require("../models/products");
const StockEntrys = require("../models/stockEntries");
const dotenv = require("dotenv");
const SIX_HOURS = 6 * 60 * 60 * 1000;

const { sendNotification, sendNotificationToAdmin } = require('../utils/notification');
const { admin } = require('../firebase/firebaseAdmin');

dotenv.config();

cron.schedule("* * * * *", async () => {
    try {
        const now = new Date();
        const tenMinutesAgo = new Date(now - 10 * 60 * 1000);
        const unpaidOnlineOrders = await Orders.find({
            payment_method: "ONLINE",
            payment_status: "pending",
            status: "pending",
            created_at: { $lte: tenMinutesAgo }
        });
        if (unpaidOnlineOrders.length > 0) {
            const orderIds = unpaidOnlineOrders.map(order => order._id);
            await Orders.updateMany(
                { _id: { $in: orderIds } },
                {
                    $set: {
                        status: "canceled",
                        updated_at: now
                    }
                }
            );
            console.log(`✅ Canceled ${unpaidOnlineOrders.length} unpaid ONLINE orders.`);
        }

        const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
        const cancelRequestedCODOrders = await Orders.find({
            // payment_method: "COD",
            cancel_request: true,
            status: { $ne: "canceled" },
            updated_at: { $lte: oneDayAgo }
        });

        if (cancelRequestedCODOrders.length > 0) {
            for (const order of cancelRequestedCODOrders) {

                if (order.payment_method === "COD") {
                    order.status = "canceled";
                    await order.save();
                    sendCanceledNotificationToAdmin(order);
                } else if (order.payment_method === "ONLINE") {

                    const orderRef = admin.database().ref(`admin_notifications/${order._id}`);
                    const snapshot = await orderRef.once("value");
                    const lastSentAt = snapshot.val();
        
                    const nowTimestamp = Date.now();


                    if (!lastSentAt) {
                        await sendCanceledNotificationToAdmin(order);
                        await updateNotificationTime(order._id);
                        console.log(`✅ Sent notification for order ${order._id} (first time)`);
                    } else if (nowTimestamp - lastSentAt >= 6 * 60 * 60 * 1000) {
                        await sendCanceledNotificationToAdmin(order);
                        await updateNotificationTime(order._id);
                        console.log(`✅ Sent notification for order ${order._id} (6 hours passed)`);
                    }

                    //sendCanceledNotificationToAdmin(order);
                }
            }

            console.log(`✅ Auto-canceled ${cancelRequestedCODOrders.length} COD cancel-request orders.`);
        }


    } catch (error) {
        console.error("❌ Error auto-canceling orders:", error);
    }
});
async function updateNotificationTime(orderId) {
    const ref = admin.database().ref(`admin_notifications/${orderId}`);
    await ref.set(Date.now());
}

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

const sendCanceledNotificationToAdmin = async (order) => {
    try {
        const orderItems = await OrderItems.find({ order_id: order._id })
            .populate({
                path: "product_product_type_id",
                model: "productProductType",
                populate: {
                    path: "product_id",
                    model: "product",
                    select: "name"
                }
            });
        const itemDescriptions = orderItems.map(item => {
            const productName = item.product_product_type_id?.product_id?.name || "Sản phẩm không xác định";
            return `- ${productName} x${item.quantity}`;
        }).join('\n');

        const shippingFee = order.shipping_fee?.toLocaleString("vi-VN") || "0";
        const totalPrice = order.total_price?.toLocaleString("vi-VN") || "0";

        // const title = `Đơn hàng từ khách hàng "${order.to_name}" (${order.to_phone}) đã tự động hủy vì yêu cầu hủy không được xử lý trong thời gian quy định.`;
        // const message = `Đơn hàng với các sản phẩm sau đã bị hủy:\n${itemDescriptions}\n\nPhí giao hàng: ${shippingFee}đ\nTổng thanh toán: ${totalPrice}đ`;

        let title = "";
        let message = "";

        if (order.payment_method === "ONLINE") {
            title = `Đơn hàng từ khách "${order.to_name}" (${order.to_phone}) cần xử lý yêu cầu hoàn tiền`;
            message =
                `Khách hàng đã yêu cầu hủy đơn nhưng chưa được xử lý trong vòng 24h.\n` +
                `Vui lòng kiểm tra và hoàn tiền nếu cần thiết.\n\n` +
                `Chi tiết đơn hàng:\n${itemDescriptions}\n\n` +
                `Tổng thanh toán: ${totalPrice}đ`;
        } else {
            title = `Đơn hàng từ khách hàng "${order.to_name}" (${order.to_phone}) đã tự động hủy vì yêu cầu hủy không được xử lý trong thời gian quy định.`;
            message = `Đơn hàng với các sản phẩm sau đã bị hủy:\n${itemDescriptions}\n\nPhí giao hàng: ${shippingFee}đ\nTổng thanh toán: ${totalPrice}đ`;
        }

        await sendNotificationToAdmin({
            title,
            message,
            order_id: order._id
        });

    } catch (error) {
        console.error('Lỗi khi gửi thông báo hủy đơn đến admin:', error);
    }
};



const testNotification = async () => {
    const order = await Orders.findById("681733b250f229660edb194a")
    sendCanceledNotificationToAdmin(order);
};
// testNotification();



console.log("🚀 Cron job for auto-canceling unpaid orders is running...");