const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ProductProductTypes = new Schema({
    product_id: { type: Schema.Types.ObjectId, ref: 'product', required: true },
    product_type_id: { type: Schema.Types.ObjectId, ref: 'productType', required: true },
    price: { type: Number, required: true },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});
module.exports = mongoose.model('productProductType', ProductProductTypes, 'productProductTypes');