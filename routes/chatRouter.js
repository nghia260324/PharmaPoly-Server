const express = require('express');
const router = express.Router();
const Chats = require('../models/chats');
const Users = require('../models/users');



// router.get('/', async function (req, res, next) {

//     const chats = await Chats.find(
//         {},
//         { _id: 0, "fullChat._id": 0 } 
//     ).exec();

//     const userIds = chats.map(chat => chat.user_id);
//     const users = await Users.find({ _id: { $in: userIds } }).select("_id full_name phone_number").lean();
//     console.log(chats);

//     const userNames = {};
//     users.forEach(user => {
//         userNames[user._id.toString()] = user.full_name || user.phone_number;
//     });
//     userNames["67b344c3744eaa2ff0f0ce7d"] = "You";

//     res.render('chats/chat',{
//         chats: chats,
//         userNames: userNames
//     });
// });

router.get('/', async function (req, res, next) {
    const chats = await Chats.find(
        {},
        { _id: 0, "fullChat._id": 0 }
    ).lean();

    const userIds = chats.map(chat => chat.user_id);

    const users = await Users.find({
        _id: { $in: userIds },
        role: 1
    }).select("_id full_name phone_number avatar_url").lean();

    const userMap = {};
    users.forEach(user => {
        userMap[user._id.toString()] = {
            name: user.full_name || user.phone_number,
            avatar: user.avatar_url || '/images/default_avatar.png'
        };
    });
    res.render('chats/chat', {
        chats: chats,
        userMap: userMap
    });
});


module.exports = router;