const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  message: { type: String, required: true },
  senderId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const chatSchema = new mongoose.Schema({
  user_id: { type: String, required: true },
  lastMessage: { type: String, required: true },
  timeSentLastMessage: { type: Date, required: true },
  sentBy: { type: String, required: true },
  fullChat: { type: [messageSchema], default: [] } 
}); 

const chat = mongoose.model('chat', chatSchema, 'chats');

module.exports = chat;
