const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const Carts = new Schema({
    user_id: { type: Schema.Types.ObjectId, ref: 'user', required: true },
    total_items: { type: Number, required: true, default: 0 },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('cart', Carts, 'carts');
