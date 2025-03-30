const express = require('express');
const router = express.Router();
const Chats = require('../models/chats');
const Users = require('../models/users');
router.get('/', async function (req, res, next) {

    const chats = await Chats.find(
        {},
        { _id: 0, "fullChat._id": 0 } 
    ).exec();

    const userIds = chats.map(chat => chat.user_id);

    const users = await Users.find({ _id: { $in: userIds } }).select("_id full_name phone_number").lean();
    console.log(users);

    const userNames = {};
    users.forEach(user => {
        userNames[user._id.toString()] = user.full_name || user.phone_number;
    });

    userNames["W7LRUTJQUEVBBthDw80GYhPK07E2"] = "You";

    res.render('chats/chat',{
        chats: chats,
        userNames: userNames
    });
});

module.exports = router;