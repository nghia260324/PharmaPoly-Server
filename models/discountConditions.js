const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const DiscountConditions = new Schema({
    discount_code_id: { type: Schema.Types.ObjectId, ref: 'discountCode', required: true },
    condition_key: { type: String, required: true },
    input_type: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true }
});

module.exports = mongoose.model('discountCondition', DiscountConditions, 'discountConditions');
