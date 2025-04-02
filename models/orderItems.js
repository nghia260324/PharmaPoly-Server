const mongoose = require('mongoose');
const Schema = mongoose.Schema;


const OrderItems = new Schema({
    order_id: { type: mongoose.Schema.Types.ObjectId, ref: "order", required: true },
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: "product", required: true },
    batch_number: { type: String, required: true },
    quantity: Number,
    price: Number
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});
module.exports = mongoose.model('orderItem', OrderItems, 'orderItems');
