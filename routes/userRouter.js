var express = require('express');
var router = express.Router();

const Users = require('../models/users');

router.get('/all', async (req, res) => {
    try {
        const users = await Users.find();
        res.json(users);
    } catch (error) {
        res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});

module.exports = router;
