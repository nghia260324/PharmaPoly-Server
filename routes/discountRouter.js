var express = require('express');
var router = express.Router();
var DiscountCode = require('../models/discountCodes');
var DiscountUsage = require('../models/discountUsages');
var DiscountCondition = require('../models/discountConditions');

const DISCOUNT_TYPES = ["percent", "fixed", "free_shipping"];
const APPLIES_TO = ["all", "order", "product", "category", "brand"];
const DISCOUNT_CONDITIONS = require("../public/discountConditions");

function isValidCondition(conditionType, value) {
    const condition = DISCOUNT_CONDITIONS.find(c => c.key === conditionType);
    if (!condition) return false;

    if (condition.validValues) {
        if (Array.isArray(condition.validValues)) {
            return condition.validValues.includes(value);
        }
        if (typeof condition.validValues === "object") {
            if (condition.validValues.min !== undefined && value < condition.validValues.min) return false;
            if (condition.validValues.max !== undefined && value > condition.validValues.max) return false;
        }
    }
    return true;
}


router.get('/', async function (req, res, next) {
    try {
        const discounts = await DiscountCode.find();
        res.render('discounts/discounts', {
            discounts,
            appliesTo: APPLIES_TO,
            discountTypes: DISCOUNT_TYPES,
            discountConditions: DISCOUNT_CONDITIONS
        });
    } catch (error) {
        next(error);
    }
});
router.post('/add', async (req, res) => {
    try {
        const { code, type, value, start_date, end_date } = req.body;

        if (!code || !type || !value || !start_date || !end_date) {
            return res.status(400).json({ status: 400, message: "All fields are required!" });
        }

        const startDate = new Date(start_date);
        const endDate = new Date(end_date);

        if (startDate > endDate) {
            return res.status(400).json({ status: 400, message: "Start date cannot be later than expiry date!" });
        }

        if (!DISCOUNT_TYPES.includes(type)) {
            return res.status(400).json({ status: 400, message: "Invalid discount type!" });
        }

        const existingDiscount = await DiscountCode.findOne({ code });
        if (existingDiscount) {
            return res.status(400).json({ status: 400, message: "Discount code already exists!" });
        }

        if (type === "percent" && (value <= 0 || value > 100)) {
            return res.status(400).json({ status: 400, message: "Percentage discount must be between 1 and 100!" });
        }

        if (type === "fixed" && value < 0) {
            return res.status(400).json({ status: 400, message: "Fixed discount value must be positive!" });
        }


        const newDiscount = new DiscountCode({
            code,
            type,
            value: parseFloat(value),
            start_date: startDate,
            end_date: endDate
        });

        const result = await newDiscount.save();
        res.json({
            status: 200,
            message: `Discount code "${code}" added successfully!`,
            data: result,
        });
    } catch (error) {
        console.log("Error:" + error);
        res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});

router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const deletedDiscount = await DiscountCode.findByIdAndDelete(id);
        const usedDiscount = await DiscountUsage.findOne({ discount_code: id });
        if (usedDiscount) {
            return res.status(404).json({ status: 404, message: "Cannot delete a discount code that has been used!" });
        }

        if (!deletedDiscount) {
            return res.status(404).json({ status: 404, message: "Discount code not found!" });
        }

        res.json({ status: 200, message: `Discount code "${deletedDiscount.code}" deleted successfully!` });
    } catch (error) {
        console.log("Error:", error);
        res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});

router.put('/update/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { code, type, value, start_date, end_date } = req.body;

        if (!code || !type || !value || !start_date || !end_date) {
            return res.status(404).json({ status: 404, message: "All fields are required!" });
        }

        const startDate = new Date(start_date);
        const endDate = new Date(end_date);

        if (startDate > endDate) {
            return res.status(404).json({ status: 404, message: "Start date cannot be later than expiry date!" });
        }

        if (!DISCOUNT_TYPES.includes(type)) {
            return res.status(404).json({ status: 404, message: "Invalid discount type!" });
        }

        const updatedDiscount = await DiscountCode.findByIdAndUpdate(
            id,
            { code, type, value: parseFloat(value), start_date: startDate, end_date: endDate },
            { new: true }
        );

        if (!updatedDiscount) {
            return res.status(404).json({ status: 404, message: "Discount code not found!" });
        }

        if (type === "percent" && (value <= 0 || value > 100)) {
            return res.status(404).json({ status: 404, message: "Percentage discount must be between 1 and 100!" });
        }

        if (type === "fixed" && value < 0) {
            return res.status(404).json({ status: 404, message: "Fixed discount value must be positive!" });
        }


        res.json({ status: 200, message: `Discount code "${updatedDiscount.code}" updated successfully!`, data: updatedDiscount });
    } catch (error) {
        console.log("Error:", error);
        res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});


module.exports = router;
