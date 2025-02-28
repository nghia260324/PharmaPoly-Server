const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ProductSections = new Schema({
    product_id: {type: Schema.Types.ObjectId, ref: 'product', required: true},
    section_id: {type: Schema.Types.ObjectId, ref: 'section', required: true},

}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});
module.exports = mongoose.model('productSection', ProductSections, 'productSections');