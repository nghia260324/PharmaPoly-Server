var express = require('express');
var router = express.Router();
var DiscountCode = require('../models/discountCodes');
var DiscountCondition = require('../models/discountConditions');
var DiscountUsage = require('../models/discountUsages');

const DISCOUNT_TYPES = ["percent", "fixed", "free_shipping"];
const APPLIES_TO = ["all", "order", "product", "category", "brand"];
const DISCOUNT_CONDITIONS = require("../public/discountConditions");
const Products = require('../models/products');
const Categories = require('../models/categories');
const Brands = require('../models/brands');
const Users = require('../models/users');
const ProductImages = require('../models/productImages');

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
router.get("/update/:id", async (req, res) => {
    try {
        const discounts = await DiscountCode.find();
        res.render('discounts/edit', {
            discounts,
            appliesTo: APPLIES_TO,
            discountTypes: DISCOUNT_TYPES,
            discountConditions: DISCOUNT_CONDITIONS
        });
    } catch (error) {
        next(error);
    }
});

router.get("/get/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const discount = await DiscountCode.findById(id);
        if (!discount) {
            return res.status(404).json({ status: 404, message: "Discount code not found!" });
        }

        let conditions = await DiscountCondition.find({ discount_code_id: id });

        const fetchPromises = conditions.map(async (condition) => {
            let data = [];

            if (condition.condition_key === "excluded_products") {
                data = await Products.find({ _id: { $in: condition.value } }, "name");

                const productIds = data.map(p => p._id);
                const productImages = await ProductImages.find({
                    product_id: { $in: productIds },
                    is_primary: true
                }, "product_id image_url");

                data = data.map(product => {
                    const image = productImages.find(img => img.product_id.equals(product._id));
                    return {
                        id: product._id,
                        name: product.name,
                        image: image ? image.image_url : null,
                        type: "product"
                    };
                });

            } else if (condition.condition_key === "excluded_brands") {
                data = await Brands.find({ _id: { $in: condition.value } }, "name").lean();
                data = data.map(brand => ({
                    id: brand._id,
                    name: brand.name,
                    type: "brand"
                }));

            } else if (condition.condition_key === "excluded_categories") {
                data = await Categories.find({ _id: { $in: condition.value } }, "name").lean();
                data = data.map(category => ({
                    id: category._id,
                    name: category.name,
                    type: "category"
                }));

            } else if (condition.condition_key === "excluded_users") {
                data = await Users.find({ _id: { $in: condition.value } }, "full_name avatar_url").lean();
                data = data.map(user => ({
                    id: user._id,
                    name: user.full_name,
                    image: user.avatar_url,
                    type: "user"
                }));
            }

            return {
                ...condition.toObject(),
                value: data
            };
        });

        conditions = await Promise.all(fetchPromises);

        let appliesToValue = [];
        if (discount.applies_to === "product") {
            appliesToValue = await Products.find({ _id: { $in: discount.target_ids } }, "name");

            const productIds = appliesToValue.map(p => p._id);
            const productImages = await ProductImages.find({
                product_id: { $in: productIds },
                is_primary: true
            }, "product_id image_url");

            appliesToValue = appliesToValue.map(product => {
                const image = productImages.find(img => img.product_id.equals(product._id));
                return {
                    id: product._id,
                    name: product.name,
                    image: image ? image.image_url : null,
                    type: "product"
                };
            });

        } else if (discount.applies_to === "brand") {
            appliesToValue = await Brands.find({ _id: { $in: discount.target_ids } }, "name").lean();
            appliesToValue = appliesToValue.map(brand => ({
                id: brand._id,
                name: brand.name,
                type: "brand"
            }));

        } else if (discount.applies_to === "category") {
            appliesToValue = await Categories.find({ _id: { $in: discount.target_ids } }, "name").lean();
            appliesToValue = appliesToValue.map(category => ({
                id: category._id,
                name: category.name,
                type: "category"
            }));
        }

        return res.status(200).json({
            status: 200,
            data: {
                ...discount.toObject(),
                conditions,
                applies_to_value: appliesToValue
            }
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});




router.post("/add", async (req, res) => {
    try {
        const {
            code, applies_to, target_ids, type, value, min_order_value, max_discount,
            start_date, end_date, usage_limit, stackable, conditions
        } = req.body;

        // Kiểm tra dữ liệu đầu vào
        if (!code || !type || value == null || !start_date || !end_date) {
            return res.status(400).json({ status: 400, message: "All required fields must be filled!" });
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

        const currentDate = new Date();

        const newDiscount = new DiscountCode({
            code,
            applies_to,
            target_ids,
            type,
            value: parseFloat(value),
            min_order_value: min_order_value || 0,
            max_discount: max_discount || null,
            start_date: startDate,
            end_date: endDate,
            usage_limit: usage_limit || -1,
            used_count: 0,
            stackable: stackable ?? false,
            status: startDate > currentDate ? 0 : 1
        });


        await newDiscount.save();


        let conditionRecords = [];
        if (Array.isArray(conditions) && conditions.length > 0) {
            conditionRecords = conditions.map(condition => {
                let parsedValue;
                try {
                    parsedValue = JSON.parse(condition.value);
                } catch {
                    parsedValue = condition.value;
                }

                return {
                    discount_code_id: newDiscount._id,
                    condition_key: condition.condition_key,
                    input_type: condition.input_type,
                    value: parsedValue
                };
            });

            await DiscountCondition.insertMany(conditionRecords);
        }



        return res.status(200).json({
            status: 200,
            message: `Discount code "${code}" added successfully!`,
            discount: newDiscount,
        });

    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});


router.put("/update/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const {
            code, applies_to, target_ids, type, value, min_order_value, max_discount,
            start_date, end_date, usage_limit, stackable, conditions
        } = req.body;

        let discount = await DiscountCode.findById(id);
        if (!discount) {
            return res.status(404).json({ status: 404, message: "Discount code not found!" });
        }

        if (!code || !type || value == null || !start_date || !end_date) {
            return res.status(400).json({ status: 400, message: "All required fields must be filled!" });
        }

        const startDate = new Date(start_date);
        const endDate = new Date(end_date);

        if (startDate > endDate) {
            return res.status(400).json({ status: 400, message: "Start date cannot be later than expiry date!" });
        }

        if (!DISCOUNT_TYPES.includes(type)) {
            return res.status(400).json({ status: 400, message: "Invalid discount type!" });
        }

        const existingDiscount = await DiscountCode.findOne({ code, _id: { $ne: id } });
        if (existingDiscount) {
            return res.status(400).json({ status: 400, message: "Discount code already exists!" });
        }

        if (type === "percent" && (value <= 0 || value > 100)) {
            return res.status(400).json({ status: 400, message: "Percentage discount must be between 1 and 100!" });
        }

        if (type === "fixed" && value < 0) {
            return res.status(400).json({ status: 400, message: "Fixed discount value must be positive!" });
        }

        // Cập nhật dữ liệu
        discount.code = code;
        discount.applies_to = applies_to;
        discount.target_ids = target_ids;
        discount.type = type;
        discount.value = parseFloat(value);
        discount.min_order_value = min_order_value || 0;
        discount.max_discount = max_discount || null;
        discount.start_date = startDate;
        discount.end_date = endDate;
        discount.usage_limit = usage_limit || -1;
        discount.stackable = stackable ?? false;

        const currentDate = new Date();
        discount.status = startDate > currentDate ? 0 : 1; // 0: Chưa hoạt động, 1: Đang hoạt động

        await discount.save();

        // Xóa điều kiện cũ và thêm điều kiện mới nếu có
        if (Array.isArray(conditions) && conditions.length > 0) {
            await DiscountCondition.deleteMany({ discount_code_id: id });

            const conditionRecords = conditions.map(condition => {
                let parsedValue;
                try {
                    parsedValue = JSON.parse(condition.value); // Chuyển chuỗi thành mảng nếu có
                } catch {
                    parsedValue = condition.value; // Nếu không phải JSON thì giữ nguyên
                }

                return {
                    discount_code_id: id,
                    condition_key: condition.condition_key,
                    input_type: condition.input_type,
                    value: parsedValue
                };
            });

            await DiscountCondition.insertMany(conditionRecords);
        }

        return res.status(200).json({
            status: 200,
            message: `Discount code "${code}" updated successfully!`,
            discount,
        });

    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});


router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const usedDiscount = await DiscountUsage.findOne({ discount_code: id });
        if (usedDiscount) {
            return res.status(400).json({ status: 400, message: "Cannot delete a discount code that has been used!" });
        }

        await DiscountCondition.deleteMany({ discount_code: id });

        const deletedDiscount = await DiscountCode.findByIdAndDelete(id);

        if (!deletedDiscount) {
            return res.status(404).json({ status: 404, message: "Discount code not found!" });
        }

        res.json({ status: 200, message: `Discount code "${deletedDiscount.code}" and its conditions deleted successfully!` });

    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});


// router.delete('/delete/:id', async (req, res) => {
//     try {
//         const { id } = req.params;

//         const deletedDiscount = await DiscountCode.findByIdAndDelete(id);
//         const usedDiscount = await DiscountUsage.findOne({ discount_code: id });
//         if (usedDiscount) {
//             return res.status(404).json({ status: 404, message: "Cannot delete a discount code that has been used!" });
//         }

//         if (!deletedDiscount) {
//             return res.status(404).json({ status: 404, message: "Discount code not found!" });
//         }

//         res.json({ status: 200, message: `Discount code "${deletedDiscount.code}" deleted successfully!` });
//     } catch (error) {
//         console.log("Error:", error);
//         res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
//     }
// });

// router.put('/update/:id', async (req, res) => {
//     try {
//         const { id } = req.params;
//         const { code, type, value, start_date, end_date } = req.body;

//         if (!code || !type || !value || !start_date || !end_date) {
//             return res.status(404).json({ status: 404, message: "All fields are required!" });
//         }

//         const startDate = new Date(start_date);
//         const endDate = new Date(end_date);

//         if (startDate > endDate) {
//             return res.status(404).json({ status: 404, message: "Start date cannot be later than expiry date!" });
//         }

//         if (!DISCOUNT_TYPES.includes(type)) {
//             return res.status(404).json({ status: 404, message: "Invalid discount type!" });
//         }

//         const updatedDiscount = await DiscountCode.findByIdAndUpdate(
//             id,
//             { code, type, value: parseFloat(value), start_date: startDate, end_date: endDate },
//             { new: true }
//         );

//         if (!updatedDiscount) {
//             return res.status(404).json({ status: 404, message: "Discount code not found!" });
//         }

//         if (type === "percent" && (value <= 0 || value > 100)) {
//             return res.status(404).json({ status: 404, message: "Percentage discount must be between 1 and 100!" });
//         }

//         if (type === "fixed" && value < 0) {
//             return res.status(404).json({ status: 404, message: "Fixed discount value must be positive!" });
//         }


//         res.json({ status: 200, message: `Discount code "${updatedDiscount.code}" updated successfully!`, data: updatedDiscount });
//     } catch (error) {
//         console.log("Error:", error);
//         res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
//     }
// });


module.exports = router;
