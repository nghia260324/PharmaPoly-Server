const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const Sections = new Schema({
    name: {type: String, required: true}
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});
module.exports = mongoose.model('section', Sections, 'sections');