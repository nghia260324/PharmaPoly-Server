const express = require('express');
const router = express.Router();
const Brands = require('../models/brands');


router.get('/', async function (req, res, next) {
    const { page = 1, limit = 10, search, sort } = req.query;

    let query = {};
    if (search) {
        query.name = { $regex: search, $options: 'i' };
    }

    let sortOption = { name: 1 };
    if (sort === 'name_desc') sortOption = { name: -1 };

    const brands = await Brands.find(query)
        .sort(sortOption)
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const totalBrands = await Brands.countDocuments(query);
    const totalPages = Math.ceil(totalBrands / limit);

    res.render('brands/list', {
        brands,
        currentPage: parseInt(page),
        totalPages,
        limit: parseInt(limit),
        search,
        sort
    });
});

router.get('/all', async (req, res) => {
    try {
        const brands = await Brands.find();
        res.json(brands);
    } catch (error) {
        res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});


router.post('/add', async (req, res) => {
    try {
        const data = req.body;

        if (!data.name || !data.description) {
            return res.status(400).json({ status: 400, message: "Brand name and description are required!" });
        }

        const newBrand = new Brands({ name: data.name, description: data.description });
        const result = await newBrand.save();

        res.json({
            status: 200,
            message: `Brand "${data.name}" added successfully!`,
            data: result,
        });
    } catch (error) {
        res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});


router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ status: 400, message: "Brand ID is required!" });
        }

        const result = await Brands.findByIdAndDelete(id);

        if (result) {
            return res.status(200).json({ status: 200, message: `Brand "${result.name}" deleted successfully!` });
        } else {
            return res.status(404).json({ status: 404, message: "Brand not found!" });
        }
    } catch (error) {
        return res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});

// Cập nhật một brand
router.put('/update/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;

        if (!name || !description) {
            return res.status(400).json({ status: 400, message: "Brand name and description are required!" });
        }

        const updatedBrand = await Brands.findByIdAndUpdate(id, { name, description }, { new: true });

        if (updatedBrand) {
            return res.status(200).json({
                status: 200,
                message: `Brand "${updatedBrand.name}" updated successfully!`,
                data: updatedBrand
            });
        } else {
            return res.status(404).json({ status: 404, message: "Brand not found!" });
        }
    } catch (error) {
        return res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});

module.exports = router;