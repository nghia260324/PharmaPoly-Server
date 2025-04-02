const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const StockEntries = new Schema({
    batch_number: { type: String, required: true },
    product_id: { type: Schema.Types.ObjectId, ref: 'product', required: true },
    import_price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    remaining_quantity: { type: Number, required: true },
    expiry_date: { type: Date, required: true },
    import_date: { type: Date, default: Date.now }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});
module.exports = mongoose.model('stockEntry', StockEntries, 'stockEntries');