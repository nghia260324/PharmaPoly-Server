const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const Notifications = new Schema({
    user_id: { type: Schema.Types.ObjectId, ref: 'user', required: true }, // Người nhận thông báo
    title: { type: String, required: true }, // Tiêu đề thông báo
    message: { type: String, required: true }, // Nội dung chi tiết
    is_read: { type: Boolean, default: false }, // Đã đọc hay chưa
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('notification', Notifications, 'notifications');