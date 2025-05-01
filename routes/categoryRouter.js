var express = require('express');
var router = express.Router();

const Categories = require('../models/categories');
const { removeDiacritics } = require('../utils/textUtils');

// router.get('/', async function (req, res, next) {
//     const { page = 1, limit = 10, search, sort } = req.query;

//     let query = {};
//     if (search) {
//         query.name = { $regex: search, $options: 'i' };
//     }

//     let sortOption = { name: 1 };
//     if (sort === 'name_desc') sortOption = { name: -1 };

//     const categories = await Categories.find(query)
//         .sort(sortOption)
//         .skip((page - 1) * limit)
//         .limit(parseInt(limit));

//     const totalCategories = await Categories.countDocuments(query);
//     const totalPages = Math.ceil(totalCategories / limit);

//     res.render('categories/list', {
//         categories,
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

    let categories = await Categories.find().sort(sortOption);

    if (search) {
        const keyword = removeDiacritics(search.toLowerCase());

        categories = categories.filter(item => {
            const nameNoDiacritics = removeDiacritics(item.name.toLowerCase());
            const idMatch = item._id.toString().includes(keyword);
            const nameMatch = nameNoDiacritics.includes(keyword);
            return idMatch || nameMatch;
        });
    }

    const totalCategories = categories.length;
    const totalPages = Math.ceil(totalCategories / limit);
    const currentPage = parseInt(page);
    const paginatedCategories = categories.slice((currentPage - 1) * limit, currentPage * limit);

    res.render('categories/list', {
        categories: paginatedCategories,
        currentPage,
        totalPages,
        limit: parseInt(limit),
        search,
        sort
    });
});

router.post('/add', async (req, res) => {
    try {
        const data = req.body;

        if (!data.name) {
            return res.status(400).json({ status: 400, message: "Tên danh mục sản phẩm là bắt buộc!" });
        }

        const existingType = await Categories.findOne({ name: { $regex: new RegExp(`^${data.name}$`, 'i') } });
        if (existingType) {
            return res.status(404).json({ status: 404, message: `Danh mục sản phẩm "${data.name}" đã tồn tại!` });
        }

        const newCategory = new Categories({ name: data.name });
        const result = await newCategory.save();

        res.json({
            status: 200,
            message: `Đã thêm danh mục sản phẩm "${data.name}" thành công!`,
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
            return res.status(400).json({ status: 400, message: "ID danh mục sản phẩm là bắt buộc!" });
        }

        const result = await Categories.findByIdAndDelete(id);

        if (result) {
            return res.status(200).json({ status: 200, message: `Đã xóa danh mục sản phẩm "${result.name}" thành công!` });
        } else {
            return res.status(404).json({ status: 404, message: "Không tìm thấy danh mục sản phẩm!" });
        }
    } catch (error) {
        return res.status(500).json({ status: 500, message: "Lỗi máy chủ nội bộ!", error: error.message });
    }
});

router.put('/update/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ status: 400, message: "Tên danh mục sản phẩm là bắt buộc!" });
        }
        const existedCategory = await Categories.findOne({
            _id: { $ne: id },
            name: { $regex: `^${name}$`, $options: 'i' }
        });

        if (existedCategory) {
            return res.status(400).json({ status: 400, message: "Tên danh mục sản phẩm này đã được sử dụng bởi danh mục khác!" });
        }

        const updatedCategory = await Categories.findByIdAndUpdate(id, { name }, { new: true });

        if (updatedCategory) {
            return res.status(200).json({
                status: 200,
                message: `Đã cập nhật danh mục sản phẩm "${updatedCategory.name}" thành công!`,
                data: updatedCategory
            });
        } else {
            return res.status(404).json({ status: 404, message: "Không tìm thấy danh mục sản phẩm!" });
        }
    } catch (error) {
        return res.status(500).json({ status: 500, message: "Lỗi máy chủ nội bộ!", error: error.message });
    }
});

router.get('/all', async (req, res) => {
    try {
        const categories = await Categories.find();
        res.json(categories);
    } catch (error) {
        res.status(500).json({ status: 500, message: "Lỗi máy chủ nội bộ!", error: error.message });
    }
});

module.exports = router;
