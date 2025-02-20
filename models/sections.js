const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const Sections = new Schema({
    name: {type: String, required: true}
})

module.exports = mongoose.model('section', Sections, 'sections');