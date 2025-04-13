const mongoose = require('mongoose');
const Scheme = mongoose.Schema;

const Users = new Scheme({
    full_name: { type: String, maxLength: 255 },
    date_of_birth: { type: Date },
    gender: {
        type: Number,
        enum: [0, 1, 2],
        default: 0  // 0: Nam, 1: Nữ, 2: Khác
    },
    phone_number: {
        type: String,
        unique: true,
        required: true,
        match: [/^\+84\d{9}$/, 'Số điện thoại không hợp lệ (định dạng +84xxxxxxxxx)']
    },
    shipping_phone_number: {
        type: String,
        required: true,
        default: function () { return this.phone_number; },
        match: [/^\+84\d{9}$/, 'Số điện thoại giao hàng không hợp lệ']
    },
    password: { type: String, maxLength: 255 },
    avatar_url: { type: String },
    uid: { type: String, unique: true },
    role: {
        type: Number,
        enum: [0, 1],
        default: 1 // 0: Admin, 1: User
    },
    status: {
        type: Number,
        enum: [0, 1],
        default: 1 // 0: Vô hiệu hóa, 1: Kích hoạt
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});
module.exports = mongoose.model('user', Users, 'users');