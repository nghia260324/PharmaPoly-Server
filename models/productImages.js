const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ProductImages = new Schema({
    product_id: {type: Schema.Types.ObjectId, ref: 'product', required: true},
    image_url: {type: String, required: true},
    is_primary: {type: Boolean, required: true},
    sort_order: {type: Number, required: true},
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});
module.exports = mongoose.model('productImage', ProductImages, 'productImages');