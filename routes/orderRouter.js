const express = require('express');
const router = express.Router();
const mongoose = require("mongoose");
const Orders = require('../models/orders');
const OrderItems = require('../models/orderItems');
const ProductImages = require('../models/productImages');
const Products = require('../models/products');
const StockEntries = require('../models/stockEntries');
const { db } = require("../firebase/firebaseAdmin");
const { getUserAddress, getShopInfo } = require("./api");
const { sendNotification } = require('../utils/notification');

const axios = require('axios');
const GHN_API = 'https://dev-online-gateway.ghn.vn/shiip/public-api';
const TOKEN_GHN = process.env.GHN_TOKEN;
const SHOP_ID = process.env.GHN_SHOP_ID;

const binMap = {
    "01203001": "970436",
};

router.get("/", async (req, res) => {
    // const { page = 1, limit = 10, search, status, sort } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const { search, status, sort } = req.query;

    let query = {};

    let cleanedSearch = search;
    if (cleanedSearch && cleanedSearch.startsWith("#")) {
        cleanedSearch = cleanedSearch.substring(1);
    }

    if (search) {
        query.$or = [
            { order_code: { $regex: cleanedSearch, $options: "i" } },
            { to_name: { $regex: cleanedSearch, $options: "i" } }
        ];
    }

    if (status) {
        if (status === "cancel_request") {
            query.cancel_request = true;
        } else if (status === "return_request") {
            query.return_request = true;
        } else {
            query.status = status;
        }
    }

    let sortOption = { created_at: -1 };
    if (sort === "created_at_asc") sortOption = { created_at: 1 };
    if (sort === "total_price_desc") sortOption = { total_price: -1 };
    if (sort === "total_price_asc") sortOption = { total_price: 1 };

    const orders = await Orders.find(query)
        .sort(sortOption)
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const totalOrders = await Orders.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit);

    res.render("orders/list", {
        orders,
        currentPage: parseInt(page),
        totalPages,
        // filterStatus: status,
        // sort,
        // limit,
        filters: {
            search,
            status,
            sort
        }
    });
});

router.get("/:id/detail", async function (req, res, next) {
    try {
        const orderId = req.params.id;

        const order = await Orders.findById(orderId).populate("user_id");
        const userAddress = await getUserAddress(order.user_id);

        const orderItems = await OrderItems.find({ order_id: orderId })
            .populate({
                path: "product_product_type_id",
                populate: {
                    path: "product_id",
                    select: "name"
                }
            });


        const productIds = orderItems.map(item => item.product_product_type_id.product_id);

        const primaryImages = await ProductImages.find({
            product_id: { $in: productIds },
            is_primary: true
        });

        const imageMap = primaryImages.reduce((acc, img) => {
            acc[img.product_id.toString()] = img.image_url;
            return acc;
        }, {});

        const orderItemsWithImages = orderItems.map(item => ({
            ...item.toObject(),
            image_url: imageMap[item.product_product_type_id.product_id._id.toString()] || null
        }));

        res.render("orders/detail", {
            order,
            orderItems: orderItemsWithImages,
            userAddress
        });
    } catch (error) {
        next(error);
    }
});

async function getTransactionInfo(transactionId) {
    const url = `https://script.google.com/macros/s/AKfycbzvTz-hwBcrfK6dpRKu3slToY2gLr2ftlnoB0KuR3xLWJvkeCz4_BcXzDfRy_Qo-ywk/exec?transaction_id=${transactionId}`;

    const response = await fetch(url);
    const data = await response.json();
    if (data.error) {
        throw new Error(data.message || "Failed to fetch transaction data");
    }
    return data;
}

async function getBankFromVietQR(bin) {
    const mappedBin = binMap[bin] || bin;
    const url = "https://api.vietqr.io/v2/banks";
    const response = await fetch(url);
    const data = await response.json();

    if (!data.data || data.data.length === 0) {
        throw new Error("No banks found");
    }

    const bank = data.data.find(bank => bank.bin === mappedBin);
    if (!bank) {
        throw new Error("Bank not found for BIN: " + bin);
    }

    return bank;
}
function generateVietQRQuickLink(order, bankId, accountNo) {
    const template = process.env.TEMPLATE || "compact";
    const addInfo = `REFUND${order._id}END`;

    return `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.png?amount=${order.total_price}&addInfo=${addInfo}`;
}

router.get("/:order_id/refund-qr", async (req, res) => {
    try {
        const { order_id } = req.params;

        const order = await Orders.findById(order_id);
        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        const transaction_id = order.transaction_id;
        const amount = order.total_price;
        if (!transaction_id || !amount) {
            return res.status(400).json({ error: "Missing transaction info in order" });
        }

        const txData = await getTransactionInfo(transaction_id);
        const bin = txData.data["Mã BIN ngân hàng đối ứng"];
        const accountNo = txData.data["Số tài khoản đối ứng"];

        if (!bin || !accountNo) {
            return res.status(400).json({ error: "Missing BIN or account number in transaction data" });
        }

        const bank = await getBankFromVietQR(bin);
        const qrLink = generateVietQRQuickLink(order, bank.code, accountNo, amount);

        res.json({
            qrLink
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || "Internal Server Error" });
    }
});





router.put("/:order_id/confirm", async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { order_id } = req.params;

        const order = await Orders.findById(order_id);
        if (!order) {
            return res.status(404).json({ status: 404, message: "Order not found" });
        }

        if (order.status !== "pending") {
            return res.status(400).json({ status: 400, message: "Order can only be confirmed from 'pending' status" });
        }

        const orderItems = await OrderItems.find({ order_id })
            .populate({
                path: "product_product_type_id",
                model: "productProductType",
                populate: {
                    path: "product_id",  // Populate thêm thông tin sản phẩm từ mô hình "product"
                    model: "product",    // Mô hình sản phẩm là "product"
                    select: "name"       // Chỉ lấy tên sản phẩm
                }
            });

        for (const item of orderItems) {
            const quantityNeeded = item.quantity;

            const stockEntry = await StockEntries.findOne({
                product_product_type_id: item.product_product_type_id._id,
                remaining_quantity: { $gte: quantityNeeded },
                status: "active"
            }).sort({ import_date: 1 }).session(session);

            if (!stockEntry) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({
                    status: 400,
                    message: `Không đủ tồn kho cho sản phẩm ${item.product_product_type_id._id}`
                });
            }

            item.batch_number = stockEntry.batch_number;
            await item.save({ session });

            stockEntry.remaining_quantity -= quantityNeeded;
            if (stockEntry.remaining_quantity === 0) {
                stockEntry.status = "sold_out";
            }
            await stockEntry.save({ session });
        }

        order.status = "confirmed";

        const firstProductName = orderItems[0]?.product_product_type_id?.product_id?.name || "sản phẩm";
        const shortenName = (name, maxLength = 40) => {
            return name.length > maxLength ? name.slice(0, maxLength).trim() + '…' : name;
        };
        
        const shortName = shortenName(firstProductName);
        const otherCount = orderItems.length - 1;
        
        const productSummary = otherCount > 0
            ? `${shortName} và ${otherCount} sản phẩm khác`
            : shortName;
        
        const message = `Đơn hàng của bạn (${productSummary}) đã được xác nhận và đang được chuẩn bị.`;
        
        await sendNotification({
            user_id: order.user_id,
            title: 'Đơn hàng đã được xác nhận',
            message: message
        });

        await order.save();
        await session.commitTransaction();

        session.endSession();
        res.status(200).json({ status: 200, message: "Order confirmed", data: order });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Error confirming order:", error);
        return res.status(500).json({
            status: 500,
            message: "Internal Server Error",
            error: error.response?.data || error.message
        });
    }
});

router.put("/:order_id/reject", async (req, res) => {
    try {
        const { order_id } = req.params;

        const order = await Orders.findById(order_id);
        if (!order) {
            return res.status(404).json({ status: 404, message: "Không tìm thấy đơn hàng" });
        }

        if (order.status !== "pending") {
            return res.status(400).json({
                status: 400,
                message: "Chỉ có thể từ chối đơn hàng ở trạng thái 'pending'"
            });
        }

        order.status = "canceled";
        await order.save();

        return res.status(200).json({
            status: 200,
            message: "Đã từ chối đơn hàng",
            data: order
        });
    } catch (error) {
        console.error("Lỗi khi từ chối đơn hàng:", error);
        return res.status(500).json({
            status: 500,
            message: "Lỗi máy chủ",
            error: error.response?.data || error.message
        });
    }
});


router.put("/:order_id/send-to-ghn", async (req, res) => {
    try {
        const { order_id } = req.params;

        const order = await Orders.findById(order_id);
        if (!order) {
            return res.status(404).json({ status: 404, message: "Order not found" });
        }

        if (order.status !== "confirmed") {
            return res.status(400).json({ status: 400, message: "Order must be in 'confirmed' status before sending to GHN" });
        }

        const orderItems = await OrderItems.find({ order_id })
            .populate({
                path: 'product_id',
                select: 'name'
            })
            .lean();

        if (!orderItems.length) {
            return res.status(400).json({ status: 400, message: "Order has no items" });
        }

        const formattedOrderItems = orderItems.map(item => ({
            ...item,
            product_name: item.product_id.name,
            product_id: item.product_id._id
        }));

        const shopInfo = await getShopInfo();
        const servicesResponse = await axios.get(`${GHN_API}/v2/shipping-order/available-services`, {
            params: { shop_id: SHOP_ID, from_district: shopInfo.from_district_id, to_district: order.to_district_id },
            headers: { "Token": TOKEN_GHN }
        });

        if (!servicesResponse.data.data || !servicesResponse.data.data.length) {
            return res.status(500).json({ status: 500, message: "No available GHN services" });
        }

        const service = servicesResponse.data.data[0];

        const payment_type_id = order.payment_method === "COD" ? 2 : 1;

        const ghnResponse = await axios.post(`${GHN_API}/v2/shipping-order/create`, {
            payment_type_id,
            note: "Giao hàng cẩn thận",
            required_note: "KHONGCHOXEMHANG",
            from_name: shopInfo.from_name,
            from_phone: shopInfo.from_phone,
            from_address: shopInfo.from_address,
            from_ward_name: shopInfo.from_ward_name,
            from_district_name: shopInfo.from_district_name,
            from_district_id: shopInfo.from_district_id,
            to_district_id: order.to_district_id,
            to_ward_code: order.to_ward_code,
            to_name: order.to_name,
            to_phone: order.to_phone.startsWith("+84") ? order.to_phone.replace("+84", "0") : order.to_phone,
            to_address: order.to_address,
            return_phone: shopInfo.from_phone,
            return_address: shopInfo.from_address,
            return_district_id: shopInfo.from_district_id,
            return_ward_code: shopInfo.from_ward_code,
            service_id: service.service_id,
            service_type_id: service.service_type_id,
            items: formattedOrderItems.map(item => ({
                name: item.product_name,
                code: item.product_id,
                quantity: item.quantity,
                price: item.price,
                weight: 1
            })),
            weight: 1,
            //cod_amount: order.payment_method === "COD" ? order.total_price - order.shipping_fee : 0,
            cod_amount: order.payment_method === "COD" ? order.total_price : 0,
            insurance_value: order.total_price - order.shipping_fee,
        }, {
            headers: { "Content-Type": "application/json", "Token": TOKEN_GHN, "ShopId": SHOP_ID }
        });

        if (ghnResponse.data.code !== 200) {
            return res.status(500).json({ status: 500, message: "Failed to create GHN order", error: ghnResponse.data });
        }

        const order_code = ghnResponse.data.data.order_code;

        order.status = "ready_to_pick";
        order.order_code = order_code;
        await order.save();

        res.status(200).json({ status: 200, message: "Order confirmed and GHN order created", data: { order, order_code } });

    } catch (error) {
        console.error("Error confirming order:", error);
        return res.status(500).json({
            status: 500,
            message: "Internal Server Error",
            error: error.response?.data || error.message
        });
    }
});


router.post("/:orderId/cancel", async (req, res) => {
    try {
        const { orderId } = req.params;
        const { action } = req.body;

        const order = await Orders.findById(orderId);
        if (!order) {
            return res.status(404).json({ status: 404, message: "Order not found" });
        }

        if (!["pending", "confirmed", "ready_to_pick"].includes(order.status)) {
            return res.status(400).json({ status: 400, message: "Cannot cancel order in this status" });
        }

        if (action === "reject") {
            order.cancel_request = false;
            await order.save();
            return res.status(200).json({ status: 200, message: "Cancel request rejected", data: order });
        }

        if (order.status === "ready_to_pick") {
            try {
                const ghnResponse = await axios.post(`${GHN_API}/v2/switch-status/cancel`, {
                    order_codes: [order.order_code]
                }, {
                    headers: {
                        "Content-Type": "application/json",
                        "Token": TOKEN_GHN
                    }
                });

                if (ghnResponse.data.code !== 200) {
                    return res.status(400).json({ status: 400, message: "Failed to cancel order on GHN", error: ghnResponse.data });
                }
            } catch (ghnError) {
                console.error("Error canceling order on GHN:", ghnError.response?.data || ghnError.message);
                return res.status(500).json({ status: 500, message: "Failed to cancel order on GHN", error: ghnError.message });
            }
        }

        const orderItems = await OrderItems.find({ order_id: orderId }).populate({
            path: "product_id",
            select: "_id stock_quantity"
        });

        for (const item of orderItems) {
            await Products.updateOne(
                { _id: item.product_id._id },
                { $inc: { stock_quantity: item.quantity } }
            );
        }

        order.status = "canceled";
        await order.save();

        res.status(200).json({ status: 200, message: "Order canceled successfully", data: order });
    } catch (error) {
        console.error("Error canceling order:", error);
        res.status(500).json({ status: 500, message: "Internal Server Error", error: error.message });
    }
});



router.get('/payment_status/:order_id',async (req, res) => {
    const orderId = req.params.order_id;

    const order = await Orders.findById(orderId);

    if (!order) {
        return res.status(404).json({
            status: 404,
            message: "Không tìm thấy đơn hàng"
        });
    }
    const paymentStatus = order.payment_status;

    if (paymentStatus === "paid") {
        return res.status(400).json({
            status: 400,
            message: "Thanh toán thành công",
        });
    } else if (paymentStatus === "pending") {
        return res.status(400).json({
            status: 400,
            message: "Đang chờ thanh toán",
        });
    } else if (paymentStatus === "failed") {
        return res.status(400).json({
            status: 400,
            message: "Thanh toán thất bại",
        });
    } else if (paymentStatus === "refunded") {
        return res.status(200).json({
            status: 200,
            message: "Đã hoàn tiền",
        });
    } else {
        return res.status(400).json({
            status: 400,
            message: "Trạng thái thanh toán không xác định",
        });
    }
});

// router.post("/:orderId/confirm-return", async (req, res) => {
//     try {
//         const { orderId } = req.params;
//         const { action } = req.body;

//         const order = await Orders.findById(orderId);
//         if (!order) {
//             return res.status(404).json({ status: 404, message: "Order not found" });
//         }

//         if (!order.return_request) {
//             return res.status(400).json({ status: 400, message: "No return request for this order" });
//         }

//         if (!statusGroups.shipping.includes(order.status)) {
//             return res.status(400).json({ status: 400, message: "Cannot process return for this order status" });
//         }

//         if (action === "reject") {
//             order.return_request = false;
//             await order.save();
//             return res.status(200).json({ status: 200, message: "Return request rejected", data: order });
//         }

//         if (action === "approve") {
//             try {
//                 const ghnResponse = await axios.post(`${GHN_API}/v2/switch-status/return`, {
//                     order_codes: [order.order_code]
//                 }, {
//                     headers: {
//                         "Content-Type": "application/json",
//                         "Token": TOKEN_GHN
//                     }
//                 });

//                 if (ghnResponse.data.code !== 200) {
//                     return res.status(400).json({ status: 400, message: "Failed to request return on GHN", error: ghnResponse.data });
//                 }
//             } catch (ghnError) {
//                 console.error("Error requesting return on GHN:", ghnError.response?.data || ghnError.message);
//                 return res.status(500).json({ status: 500, message: "Failed to request return on GHN", error: ghnError.message });
//             }

//             order.status = "waiting_to_return";
//             await order.save();
//             return res.status(200).json({ status: 200, message: "Return request confirmed successfully", data: order });
//         }
//         return res.status(400).json({ status: 400, message: "Invalid action" });

//     } catch (error) {
//         console.error("Error confirming return request:", error);
//         res.status(500).json({ status: 500, message: "Internal Server Error", error: error.message });
//     }
// });



db.ref("new_orders").on("value", async (snapshot) => {
    if (snapshot.exists()) {
        const newOrderData = snapshot.val();

        const newOrder = await Orders.findById(newOrderData._id);

        if (newOrder) {
            const io = require('../app').get("io");
            io.emit("new_order", newOrder);
        }

        db.ref("new_orders").remove();
    }
});


db.ref("cancel_requests").on("value", async (snapshot) => {
    if (snapshot.exists()) {
        const cancelData = snapshot.val();
        const canceledOrder = await Orders.findById(cancelData._id);

        if (canceledOrder) {
            const io = require('../app').get("io");
            io.emit("cancel_request", canceledOrder);
        }

        db.ref("cancel_requests").remove();
    }
});

// db.ref("return_requests").on("value", async (snapshot) => {
//     if (snapshot.exists()) {
//         const returnData = snapshot.val();
//         const returnOrder = await Orders.findById(returnData._id);

//         if (returnOrder) {
//             const io = require('../app').get("io");
//             io.emit("return_request", returnOrder);
//         }

//         db.ref("return_requests").remove();
//     }
// });



module.exports = router;
