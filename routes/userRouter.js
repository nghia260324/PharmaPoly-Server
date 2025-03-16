var express = require('express');
var router = express.Router();

const Users = require('../models/users');

router.get('/all', async (req, res) => {
    try {
        const users = await Users.find({}, "_id full_name avatar_url").lean();

        const formattedUsers = users.map(user => ({
            id: user._id,
            name: user.full_name,
            image: user.avatar_url
        }));

        res.json(formattedUsers);
    } catch (error) {
        res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});

module.exports = router;
