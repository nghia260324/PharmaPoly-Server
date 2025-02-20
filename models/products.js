const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const Products = new Schema({
    name: {type: String, required: true},
    category_id: {type: Schema.Types.ObjectId, ref: 'category', required: true},
    brand_id: {type: Schema.Types.ObjectId, ref: 'brand', required: true},
    product_type_id: {type: Schema.Types.ObjectId, ref: 'productType', required: true},
    price: {type: Number, required: true},
    short_description: {type: String, required: true},
    specification: {type: String, required: true},
    origin_country: {type: String, required: true},
    manufacturer: {type: String, required: true},
    average_rating: {type: Number, required: true, default: 0},
    review_count: {type: Number, required: true, default: 0},
},{
    timestamps: true
})
module.exports = mongoose.model('product', Products, 'products');