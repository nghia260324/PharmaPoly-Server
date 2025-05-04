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

const REJECT_REASONS = [
    { code: "OUT_OF_STOCK", reason: "Sản phẩm tạm thời hết hàng" },
    { code: "DISCONTINUED", reason: "Sản phẩm đã ngừng kinh doanh" },
    { code: "SHOP_PAUSED", reason: "Shop đang tạm ngưng hoạt động" },
    { code: "PRICE_CHANGED", reason: "Giá sản phẩm thay đổi, cần xác nhận lại" },
    { code: "CUSTOMER_CANCEL", reason: "Khách yêu cầu hủy đơn" },
    { code: "AREA_UNSUPPORTED", reason: "Không hỗ trợ giao đến khu vực của khách hàng" },
    { code: "OTHER", reason: "Lý do khác" }
];

router.get("/", async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const { search, status, sort, payment_method, payment_status, timePeriod, startDate, endDate, filterPrice, min_price, max_price } = req.query;

    let query = {};

    let cleanedSearch = "";
    if (search && typeof search === "string") {
        // cleanedSearch = normalizeText(search);
        cleanedSearch = removeVietnameseTones(cleanedSearch);
        if (cleanedSearch.startsWith("#")) {
            cleanedSearch = cleanedSearch.substring(1);
        }

        query.$or = [
            { order_code: { $regex: cleanedSearch, $options: "i" } },
            { to_name: { $regex: cleanedSearch, $options: "i" } } 
        ];
    }

    if (status) {
        if (status === "cancel_request_pending") {
            query.cancel_request = true;
            query.status = { $ne: "canceled" };
        } else if (status === "cancel_request_completed") {
            query.cancel_request = true;
            query.status = 'canceled'
        } else {
            query.status = status;
        }
    }
    if (payment_method) {
        query.payment_method = payment_method;
    }
    if (payment_status) {
        query.payment_status = payment_status;
    }

    if (filterPrice) {
        if (min_price) {
            query.total_price = { $gte: parseFloat(min_price) };
        }
        if (max_price) {
            if (!query.total_price) {
                query.total_price = {};
            }
            query.total_price.$lte = parseFloat(max_price);
        }
    }

    const today = new Date();
    let start, end;
    const offsetMs = 7 * 60 * 60 * 1000;

    switch (timePeriod) {
        case "today": {
            const now = new Date();
            const start = new Date(now);
            start.setHours(0, 0, 0, 0);
            const end = new Date(now);
            end.setHours(23, 59, 59, 999);
            query.created_at = {
                $gte: new Date(start.getTime() - offsetMs),
                $lte: new Date(end.getTime() - offsetMs)
            };
            break;
        }
        case "last_week": {
            const now = new Date();
            const day = now.getUTCDay(); // Sunday = 0
            const diffToLastWeekStart = 7 + day;
            const start = new Date(now);
            start.setUTCDate(start.getUTCDate() - diffToLastWeekStart);
            start.setUTCHours(0, 0, 0, 0);

            const end = new Date(start);
            end.setUTCDate(end.getUTCDate() + 6);
            end.setUTCHours(23, 59, 59, 999);

            query.created_at = {
                $gte: new Date(start.getTime() + offsetMs),
                $lte: new Date(end.getTime() + offsetMs)
            };
            break;
        }
        case "last_month": {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
            const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
            query.created_at = {
                $gte: new Date(start.getTime() - offsetMs),
                $lte: new Date(end.getTime() - offsetMs)
            };
            break;
        }
        case "this_month": {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            query.created_at = {
                $gte: new Date(start.getTime() - offsetMs),
                $lte: new Date(end.getTime() - offsetMs)
            };
            break;
        }
        case "last_3_months": {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            query.created_at = {
                $gte: new Date(start.getTime() - offsetMs),
                $lte: new Date(end.getTime() - offsetMs)
            };
            break;
        }
        case "custom_order":
            if (startDate && endDate) {
                const start = new Date(startDate + "T00:00:00+07:00");
                const end = new Date(endDate + "T23:59:59+07:00");
                query.created_at = { $gte: start, $lte: end };
            } else if (startDate) {
                const start = new Date(startDate + "T00:00:00+07:00");
                query.created_at = { $gte: start };
            } else if (endDate) {
                const end = new Date(endDate + "T23:59:59+07:00");
                query.created_at = { $lte: end };
            }
            break;

        case "custom_delivery":
            if (startDate && endDate) {
                const start = new Date(startDate + "T00:00:00+07:00");
                const end = new Date(endDate + "T23:59:59+07:00");
                query.delivered_at = { $gte: start, $lte: end };
            } else if (startDate) {
                const start = new Date(startDate + "T00:00:00+07:00");
                query.delivered_at = { $gte: start };
            } else if (endDate) {
                const end = new Date(endDate + "T23:59:59+07:00");
                query.delivered_at = { $lte: end };
            }
            break;

    }

    let sortOption = { created_at: -1 };
    if (sort === "created_at_asc") sortOption = { created_at: 1 };
    if (sort === "total_price_desc") sortOption = { total_price: -1 };
    if (sort === "total_price_asc") sortOption = { total_price: 1 };

    const ordersRaw = await Orders.find(query)
        .sort(sortOption)
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    let orders = ordersRaw;

    if (cleanedSearch) {
        const normalizedSearch = normalizeText(cleanedSearch);
        orders = ordersRaw.filter(order => {
            const nameMatch = order.to_name && normalizeText(order.to_name).includes(normalizedSearch);
            const codeMatch = order.order_code && normalizeText(order.order_code).includes(normalizedSearch);
            return nameMatch || codeMatch;
        });
    }


    const totalOrders = await Orders.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit);

    res.render("orders/list", {
        orders,
        currentPage: parseInt(page),
        totalPages,
        limit,
        filters: {
            search,
            status,
            sort,
            payment_method,
            payment_status,
            timePeriod,
            startDate,
            endDate,
            filterPrice,
            min_price,
            max_price
        }
    });
});
function removeVietnameseTones(str) {
    const map = {
        a: 'áàạảãâấầậẩẫăắằặẳẵ',
        e: 'éèẹẻẽêếềệểễ',
        i: 'íìịỉĩ',
        o: 'óòọỏõôốồộổỗơớờợởỡ',
        u: 'úùụủũûứừựửữướừựửữ',
        y: 'ýỳỵỷỹ',
        d: 'đ'
    };
    return str.split('').map(c => {
        for (let key in map) {
            if (map[key].indexOf(c) !== -1) {
                return key;
            }
        }
        return c;
    }).join('');
}
function normalizeText(text) {
    return text
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '')
        .toLowerCase();
}

router.get("/:id/detail", async function (req, res, next) {
    try {
        const orderId = req.params.id;

        const order = await Orders.findById(orderId).populate("user_id");
        const userAddress = await getUserAddress(order.user_id);

        const orderItems = await OrderItems.find({ order_id: orderId })
            .populate({
                path: "product_product_type_id",
                populate: [
                    {
                        path: "product_id",
                        select: "_id name"
                    },
                    {
                        path: "product_type_id",
                        select: "name"
                    }
                ]

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

        // const orderItemsWithImages = orderItems.map(item => ({
        //     ...item.toObject(),
        //     image_url: imageMap[item.product_product_type_id.product_id._id.toString()] || null
        // }));

        const allBatchNumbers = orderItems.flatMap(item =>
            item.batches.map(b => b.batch_number)
        );

        const batchDetails = await StockEntries.find({
            batch_number: { $in: allBatchNumbers }
        });

        const batchMap = batchDetails.reduce((acc, batch) => {
            acc[batch.batch_number] = {
                expiry_date: batch.expiry_date,
                import_date: batch.import_date,
                status: batch.status
            };
            return acc;
        }, {});
        const orderItemsWithImages = orderItems.map(item => ({
            ...item.toObject(),
            image_url: imageMap[item.product_product_type_id.product_id._id.toString()] || null,
            batches: item.batches.map(b => ({
                ...b.toObject(),
                ...batchMap[b.batch_number]
            }))
        }));
        res.render("orders/detail", {
            order,
            orderItems: orderItemsWithImages,
            userAddress,
            rejectReasons: REJECT_REASONS
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
function generateRejectQRLink(order, bankId, accountNo) {
    const template = process.env.TEMPLATE || "compact";
    const addInfo = `REJECT${order._id}END`;

    return `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.png?amount=${order.total_price}&addInfo=${addInfo}`;
}
router.get("/:order_id/refund-qr", async (req, res) => {
    try {
        const { order_id } = req.params;

        const order = await Orders.findById(order_id);
        if (!order) {
            return res.status(404).json({ error: "Không tìm thấy đơn hàng" });
        }

        const transaction_id = order.transaction_id;
        const amount = order.total_price;
        if (!transaction_id || !amount) {
            return res.status(400).json({ error: "Thiếu thông tin giao dịch trong đơn hàng" });
        }

        const txData = await getTransactionInfo(transaction_id);
        const bin = txData.data["Mã BIN ngân hàng đối ứng"];
        const accountNo = txData.data["Số tài khoản đối ứng"];

        if (!bin || !accountNo) {
            return res.status(400).json({ error: "Thiếu mã BIN hoặc số tài khoản trong dữ liệu giao dịch" });
        }

        const bank = await getBankFromVietQR(bin);
        const qrLink = generateVietQRQuickLink(order, bank.code, accountNo, amount);

        res.json({
            qrLink
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || "Lỗi máy chủ" });
    }
});


router.put("/:order_id/confirm", async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { order_id } = req.params;

        const order = await Orders.findById(order_id);
        if (!order) {
            return res.status(404).json({ status: 404, message: "Không tìm thấy đơn hàng" });
        }

        if (order.status !== "pending") {
            return res.status(400).json({ status: 400, message: "Không thể xác nhận đơn hàng ở trạng thái hiện tại" });
        }
        if (order.payment_method === "ONLINE" && order.payment_status !== "paid") {
            return res.status(400).json({
                status: 400,
                message: "Không thể xác nhận đơn hàng online khi chưa được thanh toán"
            });
        }

        const orderItems = await OrderItems.find({ order_id })
            .populate({
                path: "product_product_type_id",
                model: "productProductType",
                populate: {
                    path: "product_id",
                    model: "product",
                    select: "name"
                }
            });

        const batchesMap = {};
        let isStockSufficient = true;

        for (const item of orderItems) {
            let quantityNeeded = item.quantity;
            let totalAvailableQuantity = 0;

            const stockEntries = await StockEntries.find({
                product_product_type_id: item.product_product_type_id._id,
                remaining_quantity: { $gt: 0 },
                status: "active"
            }).sort({ import_date: 1 }).session(session);

            for (const stockEntry of stockEntries) {
                totalAvailableQuantity += stockEntry.remaining_quantity;
            }

            if (totalAvailableQuantity < quantityNeeded) {
                isStockSufficient = false;
                break;
            }

            let tempBatches = [];
            for (const stockEntry of stockEntries) {
                if (quantityNeeded <= 0) break;

                const available = stockEntry.remaining_quantity;
                const useQty = Math.min(available, quantityNeeded);

                tempBatches.push({
                    batch_number: stockEntry.batch_number,
                    quantity: useQty
                });

                quantityNeeded -= useQty;
            }

            batchesMap[item._id] = tempBatches;
        }

        if (isStockSufficient) {
            for (const item of orderItems) {
                const batches = batchesMap[item._id];

                item.batches = batches;
                await item.save({ session });

                for (const batch of batches) {
                    const stockEntry = await StockEntries.findOne({
                        batch_number: batch.batch_number,
                        product_product_type_id: item.product_product_type_id._id,
                        status: "active"
                    }).session(session);

                    if (stockEntry) {
                        stockEntry.remaining_quantity -= batch.quantity;
                        if (stockEntry.remaining_quantity === 0) {
                            stockEntry.status = "sold_out";
                        }
                        await stockEntry.save({ session });
                    }
                }
            }
            order.status = "confirmed";
            await order.save({ session });
        } else {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                status: 400,
                message: `Không đủ tồn kho cho các sản phẩm trong đơn hàng.`
            });
        }
        

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
        res.status(200).json({ status: 200, message: "Xác nhận đơn hàng thành công", data: order });
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
        const { reason, value } = req.body;

        const validReason = REJECT_REASONS.find(r => r.code === reason);
        if (!validReason) {
            return res.status(400).json({
                status: 400,
                message: "Lý do từ chối không hợp lệ"
            });
        }

        if (reason === "OTHER" && !value.trim()) {
            return res.status(400).json({
                status: 400,
                message: "Vui lòng nhập lý do khác"
            });
        }

        const order = await Orders.findById(order_id);
        if (!order) {
            return res.status(404).json({ status: 404, message: "Không tìm thấy đơn hàng" });
        }

        if (order.status !== "pending") {
            return res.status(400).json({
                status: 400,
                message: "Không thể từ chối đơn hàng ở trạng thái hiện tại"
            });
        }
        if (order.payment_method === "ONLINE" && order.payment_status !== "paid") {
            return res.status(400).json({
                status: 400,
                message: "Không thể từ chối đơn hàng online khi chưa được thanh toán"
            });
        }

        if (order.payment_method === 'COD') {
            order.status = "rejected";
            await order.save();
            const orderItems = await OrderItems.find({ order_id })
                .populate({
                    path: "product_product_type_id",
                    model: "productProductType",
                    populate: {
                        path: "product_id",
                        model: "product",
                        select: "name"
                    }
                });

            const firstProductName = orderItems[0]?.product_product_type_id?.product_id?.name || "sản phẩm";
            const shortenName = (name, maxLength = 40) => {
                return name.length > maxLength ? name.slice(0, maxLength).trim() + '…' : name;
            };

            const shortName = shortenName(firstProductName);
            const otherCount = orderItems.length - 1;
            const finalReason = reason === "OTHER" ? value : validReason.reason;

            const productSummary = otherCount > 0
                ? `${shortName} và ${otherCount} sản phẩm khác`
                : shortName;

            const message =
                `- Đơn hàng của bạn (${productSummary}) đã bị từ chối.\n` +
                `- Lý do: ${finalReason}.`;


            await sendNotification({
                user_id: order.user_id,
                title: 'Đơn hàng của bạn đã bị từ chối',
                message: message
            });

            return res.status(200).json({
                status: 200,
                message: "Đã từ chối đơn hàng",
                data: order
            });
        } else if (order.payment_method === "ONLINE" && order.payment_status === 'paid') {

            await db.ref(`reject_requests/${order._id}`).set(reason === "OTHER" ? value : validReason.reason);

            const transaction_id = order.transaction_id;
            const amount = order.total_price;
            if (!transaction_id || !amount) {
                return res.status(400).json({ error: "Thiếu thông tin giao dịch trong đơn hàng" });
            }

            const txData = await getTransactionInfo(transaction_id);
            const bin = txData.data["Mã BIN ngân hàng đối ứng"];
            const accountNo = txData.data["Số tài khoản đối ứng"];

            if (!bin || !accountNo) {
                return res.status(400).json({ error: "Thiếu mã BIN hoặc số tài khoản trong dữ liệu giao dịch" });
            }

            const bank = await getBankFromVietQR(bin);
            const qrLink = generateRejectQRLink(order, bank.code, accountNo, amount);

            res.json({
                qrLink
            });
        }
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
            return res.status(404).json({ status: 404, message: "Không tìm thấy đơn hàng" });
        }

        if (order.status !== "confirmed") {
            return res.status(400).json({ status: 400, message: "Không thể gửi đơn hàng đi GHN khi đơn hàng chưa ở trạng thái 'Đã xác nhận'" });
        }

        const orderItems = await OrderItems.find({ order_id })
            .populate({
                path: 'product_product_type_id',
                populate: {
                    path: 'product_id',
                    select: 'name'
                }
            })
            .lean();

        if (!orderItems.length) {
            return res.status(400).json({ status: 400, message: "Đơn hàng không có sản phẩm" });
        }

        const formattedOrderItems = orderItems.map(item => {
            if (!item.product_product_type_id?.product_id) {
                throw new Error("Sản phẩm không còn tồn tại hoặc đã bị xóa.");
            }

            return {
                ...item,
                product_name: item.product_product_type_id.product_id.name,
                product_id: item.product_product_type_id.product_id._id
            };
        });

        const shopInfo = await getShopInfo();
        const servicesResponse = await axios.get(`${GHN_API}/v2/shipping-order/available-services`, {
            params: { shop_id: SHOP_ID, from_district: shopInfo.from_district_id, to_district: order.to_district_id },
            headers: { "Token": TOKEN_GHN }
        });

        if (!servicesResponse.data.data || !servicesResponse.data.data.length) {
            return res.status(500).json({
                status: 500,
                message: "Giao Hàng Nhanh chưa hỗ trợ giao hàng đến khu vực này."
            });
        }

        const service = servicesResponse.data.data[0];

        const payment_type_id = order.payment_method === "COD" ? 2 : 1;
        const cod_amount = order.payment_method === "COD" ? order.total_price - order.shipping_fee : 0;

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
            cod_amount: order.payment_method === "COD" ? cod_amount : 0,
            insurance_value: cod_amount,
        }, {
            headers: { "Content-Type": "application/json", "Token": TOKEN_GHN, "ShopId": SHOP_ID }
        });

        if (ghnResponse.data.code !== 200) {
            return res.status(500).json({ status: 500, message: "Tạo đơn hàng GHN thất bại", error: ghnResponse.data });
        }

        const order_code = ghnResponse.data.data.order_code;

        order.status = "ready_to_pick";
        order.order_code = order_code;
        await order.save();

        res.status(200).json({
            status: 200,
            message: "Đơn hàng đã được xác nhận và tạo đơn trên Giao Hàng Nhanh thành công",
            data: { order, order_code }
        });

    } catch (error) {
        console.error("Lỗi khi xác nhận đơn hàng:", error);
        return res.status(500).json({
            status: 500,
            message: "Lỗi hệ thống",
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
            return res.status(404).json({ status: 404, message: "Không tìm thấy đơn hàng" });
        }

        if (!["pending", "confirmed", "ready_to_pick"].includes(order.status)) {
            return res.status(400).json({ status: 400, message: "Không thể hủy đơn hàng ở trạng thái hiện tại" });
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
                    return res.status(400).json({ status: 400, message: "Hủy đơn hàng trên GHN thất bại", error: ghnResponse.data });
                }
            } catch (ghnError) {
                console.error("Lỗi khi hủy đơn trên GHN:", ghnError.response?.data || ghnError.message);
                return res.status(500).json({ status: 500, message: "Hủy đơn hàng trên GHN thất bại", error: ghnError.message });
            }
        }

        // const orderItems = await OrderItems.find({ order_id: orderId });
        const orderItems = await OrderItems.find({ order_id: orderId })
            .populate({
                path: "product_product_type_id",
                model: "productProductType",
                populate: {
                    path: "product_id",
                    model: "product",
                    select: "name"
                }
            });
        for (const item of orderItems) {
            for (const batch of item.batches) {
                const stockEntry = await StockEntries.findOne({ batch_number: batch.batch_number });
                if (stockEntry) {
                    stockEntry.remaining_quantity += batch.quantity;
                    if (stockEntry.status === "sold_out" && stockEntry.remaining_quantity > 0) {
                        stockEntry.status = "active";
                    }
                    await stockEntry.save();
                }
            }
        }

        const firstProductName = orderItems[0]?.product_product_type_id?.product_id?.name || "sản phẩm";
        const shortenName = (name, maxLength = 40) => {
            return name.length > maxLength ? name.slice(0, maxLength).trim() + '…' : name;
        };

        const shortName = shortenName(firstProductName);
        const otherCount = orderItems.length - 1;

        const productSummary = otherCount > 0
            ? `${shortName} và ${otherCount} sản phẩm khác`
            : shortName;

        const message = `Yêu cầu hủy đơn hàng (${productSummary}) của bạn đã được chấp nhận. Đơn hàng đã được hủy thành công.`;

        await sendNotification({
            user_id: order.user_id,
            title: 'Đơn hàng đã được hủy',
            message: message
        });

        order.status = "canceled";
        await order.save();

        res.status(200).json({ status: 200, message: "Hủy đơn hàng thành công", data: order });
    } catch (error) {
        console.error("Lỗi khi hủy đơn hàng:", error);
        res.status(500).json({ status: 500, message: "Lỗi máy chủ nội bộ", error: error.message });
    }
});

router.get('/payment_status/:order_id', async (req, res) => {
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
