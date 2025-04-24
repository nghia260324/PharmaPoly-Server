var express = require('express');
var router = express.Router();

const ProductTypes = require('../models/productTypes');
const { removeDiacritics } = require('../utils/textUtils');

// router.get('/', async function (req, res, next) {
//     const productTypes = await ProductTypes.find();
//     res.render('productTypes/list', {
//         productTypes: productTypes,
//     });
// });
// router.get('/', async function (req, res, next) {
//     const { page = 1, limit = 10, search, sort } = req.query;

//     let query = {};
//     if (search) {
//         query.name = { $regex: search, $options: 'i' };
//     }

//     let sortOption = { name: 1 };
//     if (sort === 'name_desc') sortOption = { name: -1 };

//     const productTypes = await ProductTypes.find(query)
//         .sort(sortOption)
//         .skip((page - 1) * limit)
//         .limit(parseInt(limit));

//     const totalProductTypes = await ProductTypes.countDocuments(query);
//     const totalPages = Math.ceil(totalProductTypes / limit);

//     res.render('productTypes/list', {
//         productTypes,
//         currentPage: parseInt(page),
//         totalPages,
//         limit: parseInt(limit),
//         search,
//         sort
//     });
// });
router.get('/', async function (req, res, next) {
    const { page = 1, limit = 10, search = '', sort } = req.query;

    let sortOption = { created_at: -1 };
    if (sort === 'name_asc') sortOption = { name: 1 };
    if (sort === 'name_desc') sortOption = { name: -1 };

    let productTypes = await ProductTypes.find().sort(sortOption);

    if (search) {
        const keyword = removeDiacritics(search.toLowerCase());

        productTypes = productTypes.filter(item => {
            const nameNoDiacritics = removeDiacritics(item.name.toLowerCase())
            const idMatch = item._id.toString().includes(keyword);
            const nameMatch = nameNoDiacritics.includes(keyword);
            return idMatch || nameMatch;
        });
    }

    const totalProductTypes = productTypes.length;
    const totalPages = Math.ceil(totalProductTypes / limit);
    const currentPage = parseInt(page);
    const paginatedProductTypes = productTypes.slice((currentPage - 1) * limit, currentPage * limit);

    res.render('productTypes/list', {
        productTypes: paginatedProductTypes,
        currentPage,
        totalPages,
        limit: parseInt(limit),
        search,
        sort
    });
});


module.exports = router;

router.post('/add', async (req, res) => {
    try {
        const data = req.body;

        if (!data.name) {
            return res.status(400).json({ status: 400, message: "Tên loại sản phẩm là bắt buộc!" });
        }

        const existingType = await ProductTypes.findOne({ name: { $regex: new RegExp(`^${data.name}$`, 'i') } });
        if (existingType) {
            return res.status(409).json({ status: 409, message: `Loại sản phẩm "${data.name}" đã tồn tại!` });
        }

        const newProductType = new ProductTypes({ name: data.name });
        const result = await newProductType.save();

        res.json({
            status: 200,
            message: `Thêm loại sản phẩm "${data.name}" thành công!`,
            data: result,
        });
    } catch (error) {
        res.status(500).json({ status: 500, message: "Lỗi máy chủ nội bộ!", error: error.message });
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
            return res.status(400).json({ status: 400, message: "Tên loại sản phẩm là bắt buộc!" });
        }

        const existingType = await ProductTypes.findOne({
            name: { $regex: new RegExp(`^${name}$`, 'i') },
            _id: { $ne: id }
        });

        if (existingType) {
            return res.status(409).json({ status: 409, message: `Loại sản phẩm "${name}" đã tồn tại!` });
        }

        const updatedProductType = await ProductTypes.findByIdAndUpdate(id, { name }, { new: true });

        if (updatedProductType) {
            return res.status(200).json({
                status: 200,
                message: `Cập nhật loại sản phẩm "${updatedProductType.name}" thành công!`,
                data: updatedProductType
            });
        } else {
            return res.status(404).json({ status: 404, message: "Không tìm thấy loại sản phẩm!" });
        }
    } catch (error) {
        return res.status(500).json({ status: 500, message: "Lỗi máy chủ nội bộ!", error: error.message });
    }
});

