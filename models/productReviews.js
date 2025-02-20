const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ProductReviews = new Schema({
    user_id: {type: Schema.Types.ObjectId, ref: 'user', required: true},
    product_id: {type: Schema.Types.ObjectId, ref: 'product', required: true},
    rating: {type: String, required: true},
    review: {type: String},
},{
    timestamps: true
})
module.exports = mongoose.model('productReview', ProductReviews, 'productReviews');