var express = require('express');
var router = express.Router();

const ProductTypes = require('../models/productTypes');

router.get('/', async function (req, res, next) {
    const productTypes = await ProductTypes.find();
    res.render('productTypes/list', {
        productTypes: productTypes,
    });
});

module.exports = router;

router.post('/add', async (req, res) => {
    try {
        const data = req.body;

        if (!data.name) {
            return res.status(400).json({ status: 400, message: "Product Type name is required!" });
        }

        const newProductType = new ProductTypes({ name: data.name });
        const result = await newProductType.save();

        res.json({
            status: 200,
            message: `Product Type "${data.name}" added successfully!`,
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
            return res.status(400).json({ status: 400, message: "Product Type ID is required!" });
        }

        const result = await ProductTypes.findByIdAndDelete(id);

        if (result) {
            return res.status(200).json({ status: 200, message: `Product Type "${result.name}" deleted successfully!` });
        } else {
            return res.status(404).json({ status: 404, message: "Product Type not found!" });
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
            return res.status(400).json({ status: 400, message: "Product Type name is required!" });
        }

        const updatedProductType = await ProductTypes.findByIdAndUpdate(id, { name }, { new: true });

        if (updatedProductType) {
            return res.status(200).json({
                status: 200,
                message: `Product Type "${updatedProductType.name}" updated successfully!`,
                data: updatedProductType
            });
        } else {
            return res.status(404).json({ status: 404, message: "Product Type not found!" });
        }
    } catch (error) {
        return res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});
