const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ProductTypes = new Schema({
    name: {type: String, required: true}
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('productType', ProductTypes, 'productTypes');