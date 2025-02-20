const express = require('express');
const router = express.Router();
const Brands = require('../models/brands');


router.get('/', async function (req, res, next) {
    const brands = await Brands.find();
    res.render('brands/list', {
        brands: brands,
    });
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