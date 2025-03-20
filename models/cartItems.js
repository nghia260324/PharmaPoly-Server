const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CartItems = new Schema({
    cart_id: { type: Schema.Types.ObjectId, ref: 'cart', required: true },
    product_id: { type: Schema.Types.ObjectId, ref: 'product', required: true },
    quantity: { type: Number, required: true, default: 1 },
    discounted_price: { type: Number, required: true, default: 0 },
    original_price: { type: Number, required: true, default: 0 },
    total_price: { 
        type: Number, 
        required: true, 
        default: function() { return this.discounted_price * this.quantity; } 
    },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('cartItem', CartItems, 'cartItems');
