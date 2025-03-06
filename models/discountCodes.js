const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const DiscountCodes = new Schema({
    code: { type: String, required: true, unique: true },
    applies_to: { 
        type: String, 
        enum: ["all", "order", "product", "category", "brand"], 
        required: true 
    },
    target_ids: [{ type: Schema.Types.ObjectId, refPath: 'applies_to' }],
    type: { 
        type: String, 
        enum: ["percent", "fixed", "freeship"], 
        required: true 
    },
    value: { type: Number, required: true },
    min_order_value: { type: Number, default: 0 },
    max_discount: { type: Number, default: null },
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true },
    usage_limit: { type: Number, default: -1 },
    used_count: { type: Number, default: 0 },
    stackable: { type: Boolean, default: false },
    status: { 
        type: Number, 
        enum: [0, 1, 2, 3], 
        default: 1 
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('discountCode', DiscountCodes, 'discountCodes');
