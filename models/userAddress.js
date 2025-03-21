const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserAddress = new Schema({
    _id: { type: Schema.Types.ObjectId, auto: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'user', required: true },
    province_id: { type: Number, required: true },
    district_id: { type: Number, required: true },  
    ward_id: { type: Number, required: true },      
    street_address: { type: String, required: true } 
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('UserAddress', UserAddress, 'userAddresses');
