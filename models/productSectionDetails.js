const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ProductSectionDetails = new Schema({
    product_section_id: {type: Schema.Types.ObjectId, ref: 'productSection', required: true},
    title: {type: String, required: true},
    content: {type: String, required: true}
},{
    timestamps: true
})
module.exports = mongoose.model('productSectionDetails', ProductSectionDetails, 'productSectionDetails');