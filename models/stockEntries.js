const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const StockEntries = new Schema({
    batch_number: { type: String, required: true },
    product_product_type_id: { type: Schema.Types.ObjectId, ref: 'productProductType', required: true },
    import_price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    remaining_quantity: { type: Number, required: true },
    expiry_date: { type: Date, default: null },
    import_date: { type: Date, default: Date.now },
    status: {
        type: String,
        enum: [
            'not_started',   // Lô hàng chưa được sử dụng để bán
            'active',        // Lô hàng đang có sẵn để bán
            'paused',        // Lô hàng còn hàng nhưng tạm ngừng sử dụng
            'sold_out',      // Lô hàng đã bán hết
            'expired',       // Lô hàng đã hết hạn
            'discontinued'   // Lô hàng còn hàng nhưng ngừng bán vĩnh viễn
        ],
        default: 'not_started'
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});


module.exports = mongoose.model('stockEntry', StockEntries, 'stockEntries');
