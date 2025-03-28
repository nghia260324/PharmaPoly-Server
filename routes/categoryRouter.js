var express = require('express');
var router = express.Router();

const Categories = require('../models/categories');


router.get('/', async function (req, res, next) {
    const categories = await Categories.find();
    res.render('categories/list', {
        categories: categories,
    });
});

module.exports = router;

router.post('/add', async (req, res) => {
    try {
        const data = req.body;

        if (!data.name) {
            return res.status(400).json({ status: 400, message: "Category name is required!" });
        }

        const newCategory = new Categories({ name: data.name });
        const result = await newCategory.save();

        res.json({
            status: 200,
            message: `Category "${data.name}" added successfully!`,
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
            return res.status(400).json({ status: 400, message: "Category ID is required!" });
        }

        const result = await Categories.findByIdAndDelete(id);

        if (result) {
            return res.status(200).json({ status: 200, message: `Category "${result.name}" deleted successfully!` });
        } else {
            return res.status(404).json({ status: 404, message: "Category not found!" });
        }
    } catch (error) {
        return res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});


router.put('/update/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ status: 400, message: "Category name is required!" });
        }

        const updatedCategory = await Categories.findByIdAndUpdate(id, { name }, { new: true });

        if (updatedCategory) {
            return res.status(200).json({
                status: 200,
                message: `Category "${updatedCategory.name}" updated successfully!`,
                data: updatedCategory
            });
        } else {
            return res.status(404).json({ status: 404, message: "Category not found!" });
        }
    } catch (error) {
        return res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});

router.get('/all', async (req, res) => {
    try {
        const categories = await Categories.find();
        res.json(categories);
    } catch (error) {
        res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});

