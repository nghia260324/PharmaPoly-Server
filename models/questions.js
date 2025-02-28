const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const Questions = new Schema({
    user_id: {type: Schema.Types.ObjectId, ref: 'user', required: true},
    product_id: {type: Schema.Types.ObjectId, ref: 'product', required: true},
    content: {type: String, required: true},
    status: {type: Number, required: true, default: 0},
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});
module.exports = mongoose.model('question', Questions, 'questions');