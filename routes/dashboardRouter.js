const express = require('express');
const router = express.Router();
const Brands = require('../models/brands');


router.get('/', async function (req, res, next) {
    
    res.render('dashboards/list', {

    });
});


module.exports = router;