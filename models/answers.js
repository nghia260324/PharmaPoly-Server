const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const Answers = new Schema({
    question_id: {type: Schema.Types.ObjectId, ref: 'question', required: true},
    user_id: {type: Schema.Types.ObjectId, ref: 'user', required: true},
    content: {type: String, required: true},
},{
    timestamps: true
})
module.exports = mongoose.model('answer', Answers, 'answers');