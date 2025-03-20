const mongoose = require('mongoose');
const Schema = mongoose.Schema;


const DiscountUsage = new Schema({
    discount_code_id: { type: Schema.Types.ObjectId, ref: 'discountCode', required: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    order_id: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    discount_value: { type: Number, required: true },
    payment_method: { 
        type: String, 
        enum: ["cod", "online"], 
        required: true 
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});
module.exports = mongoose.model('discountUsage', DiscountUsage, 'discountUsages');
