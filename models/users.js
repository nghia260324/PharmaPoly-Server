const mongoose = require('mongoose');
const Scheme = mongoose.Schema;

const Users = new Scheme({
    full_name: {type: String, maxLength: 255},
    date_of_birth: {type: Date},
    gender: {type: Number, default: 0},
    phone_number: {type: String, unique: true},
    shipping_phone_number: { 
        type: String, 
        required: true, 
        default: function() { return this.phone_number; }
    },
    password: {type: String,maxLength: 255},
    google_id: {type: String},
    address: {type: String},
    avatar_url: {type: String},
    uid: {type : String, unique: true},
    role: {type: Number, default: 1},
    status: {type: Number, default: 1}
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});
module.exports = mongoose.model('user', Users, 'users');