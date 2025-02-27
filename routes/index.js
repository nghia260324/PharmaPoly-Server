var express = require('express');
var router = express.Router();

/* GET home page. */
// router.get('/', function(req, res, next) {
//   res.render('index', { title: 'PharmaPoly' });
// });

router.get('/login', function(req, res) {
  res.render('login/login', { layout: false });
});

const Users = require('../models/users');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

router.post('/api/login', async (req, res) => {
  try {
      const { phone_number, password } = req.body;

      if (!phone_number || !password) {
          return res.status(400).json({
              status: 400,
              message: "Phone number and password are required!"
          });
      }

      const user = await Users.findOne({ phone_number });
      if (!user) {
          return res.status(404).json({
              status: 404,
              message: "User not found!"
          });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
          return res.status(401).json({
              status: 401,
              message: "Invalid password!"
          });
      }

      const token = jwt.sign(
          { _id: user._id, phone_number: user.phone_number },
          process.env.JWT_SECRET,
          { expiresIn: '1h' }
      );

      const refreshToken = jwt.sign(
          { _id: user._id, phone_number: user.phone_number },
          process.env.JWT_REFRESH_SECRET,
          { expiresIn: '7d' }
      );

      res.cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "Strict",
          maxAge: 60 * 60 * 1000,
      });

      res.cookie("refreshToken", refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "Strict",
          maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      const userObj = user.toObject();
      delete userObj.password;
      res.status(200).json({
          status: 200,
          message: "Login successful!",
          //data: userObj
      });

  } catch (error) {
      console.error("Error during login:", error);
      res.status(500).json({
          status: 500,
          message: "Internal server error"
      });
  }
});

module.exports = router;
