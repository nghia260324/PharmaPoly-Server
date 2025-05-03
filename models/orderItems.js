const mongoose = require('mongoose');
const Schema = mongoose.Schema;


const OrderItems = new Schema({
    order_id: { type: mongoose.Schema.Types.ObjectId, ref: "order", required: true },
    //product_id: { type: mongoose.Schema.Types.ObjectId, ref: "product", required: true },
    product_product_type_id: { type: Schema.Types.ObjectId, ref: 'productProductType', required: true },
    // batch_number: { type: String },
    batches: [{
        batch_number: { type: String},
        quantity: { type: Number}
    }],
    quantity: { type: Number, required: true},
    price:  { type: Number, required: true}
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});
module.exports = mongoose.model('orderItem', OrderItems, 'orderItems');
