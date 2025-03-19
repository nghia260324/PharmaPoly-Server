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
        enum: ["percent", "fixed", "free_shipping"],
        required: true
    },
    value: { type: Number, required: true, default: null },
    min_order_value: { type: Number, default: 0 },
    max_discount: { type: Number, default: null },
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true },
    usage_limit: { type: Number, default: null },
    used_count: { type: Number, default: 0 },
    stackable: { type: Boolean, default: false },
    status: {
        type: Number,
        enum: [0, 1, 2, 3],
        default: 1,
        description: "0: Inactive, 1: Active, 2: Expired, 3: Disabled"
    }

}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});
DiscountCodes.pre('save', function (next) {
    if (this.type === "free_shipping") {
        this.value = null;
    }
    if (this.type === "fixed") {
        this.max_discount = null;
    }
    if (this.applies_to === "all" || this.applies_to === "order") {
        this.target_ids = null;
    }
    if (this.value !== null && this.value < 0) {
        return next(new Error("Discount value cannot be negative."));
    }
    if (this.type === "percent" && this.max_discount !== null && this.max_discount < 0) {
        return next(new Error("Max discount cannot be negative."));
    }
    if (this.type === "percent" && this.max_discount !== null && this.max_discount < this.value) {
        return next(new Error("Max discount should be greater than or equal to discount value."));
    }
    if (this.end_date < this.start_date) {
        return next(new Error("End date must be greater than or equal to start date."));
    }
    if (this.usage_limit !== null && this.usage_limit < 0) {
        return next(new Error("Usage limit cannot be negative."));
    }
    if (this.usage_limit !== null && this.used_count > this.usage_limit) {
        return next(new Error("Used count cannot exceed usage limit."));
    }
    // if (this.applies_to === "all" && this.stackable) {
    //     return next(new Error("Stackable discounts cannot apply to all products."));
    // }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (this.start_date < today) {
        return next(new Error("Start date must be today or a future date."));
    }
    if (this.end_date < today) {
        return next(new Error("End date must be today or a future date."));
    }
    
    next();
});

module.exports = mongoose.model('discountCode', DiscountCodes, 'discountCodes');
