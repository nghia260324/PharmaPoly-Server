const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CartItems = new Schema({
    cart_id: { type: Schema.Types.ObjectId, ref: 'cart', required: true },
    product_id: { type: Schema.Types.ObjectId, ref: 'product', required: true },
    quantity: { type: Number, required: true, default: 1 },
    discounted_price: { type: Number, required: true, default: 0 },
    original_price: { type: Number, required: true, default: 0 },
    total_price: { type: Number}
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

CartItems.pre('save', function (next) {
    this.total_price = this.quantity * this.discounted_price;
    next();
});

module.exports = mongoose.model('cartItem', CartItems, 'cartItems');
