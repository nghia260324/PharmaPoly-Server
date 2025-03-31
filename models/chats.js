const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const messageSchema = new Schema({
  message: { type: String, required: true },
  senderId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const chatSchema = new Schema({
  //user_id: { type: String, required: true },
  user_id: { type: Schema.Types.ObjectId, ref: 'user', required: true },
  lastMessage: { type: String, required: true },
  timeSentLastMessage: { type: Date, required: true },
  sentBy: { type: String, required: true },
  fullChat: { type: [messageSchema], default: [] } 
}); 

const chat = mongoose.model('chat', chatSchema, 'chats');

module.exports = chat;
