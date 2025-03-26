const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const Orders = new Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    order_code: { type: String },
    to_name: String,
    to_phone: String,
    to_address: String,
    to_district_id: Number,
    to_ward_code: String,
    payment_method: String,
    shipping_fee: Number,
    total_price: { type: Number, required: true },
    status: {
        type: String,
        enum: [
            "pending", // Đơn hàng đang chờ xác nhận
            "confirmed", // Đơn hàng đã được xác nhận, chuẩn bị gửi GHN
            "ready_to_pick", // Đơn hàng đã gửi GHN, chờ lấy hàng
            "picking", // GHN đang lấy hàng
            "picked", // GHN đã lấy hàng thành công
            "delivering", // Đơn hàng đang giao
            "money_collect_delivering", // Đang giao hàng (đơn COD)
            "delivered", // Giao hàng thành công
            "delivery_fail", // Giao hàng thất bại
            "waiting_to_return", // Chờ hoàn hàng về
            "return", // Đang hoàn hàng
            "returned", // Đã hoàn hàng về người gửi
            "return_fail", // Hoàn hàng không thành công
            "canceled" // Đơn hàng bị hủy
        ],
        default: "pending"
    },
    delivered_at: { type: Date, default: null },
    cancel_request: {
        type: Boolean,
        default: false
    },
    return_request: {
        type: Boolean,
        default: false
    },
    created_at: { type: Date, default: Date.now }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('order', Orders, 'orders');
