const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ProductTypes = new Schema({
    name: {type: String, required: true}
})

module.exports = mongoose.model('productType', ProductTypes, 'productTypes');