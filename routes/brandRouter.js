const express = require('express');
const router = express.Router();
const Brands = require('../models/brands');
const { removeDiacritics } = require('../utils/textUtils');


router.get('/', async function (req, res, next) {
    const { page = 1, limit = 10, search = '', sort } = req.query;

    let sortOption = { created_at: -1 };
    if (sort === 'name_asc') sortOption = { name: 1 };
    if (sort === 'name_desc') sortOption = { name: -1 };

    let brands = await Brands.find().sort(sortOption);

    if (search) {
        const keyword = removeDiacritics(search.toLowerCase());

        brands = brands.filter(item => {
            const nameNoDiacritics = removeDiacritics(item.name.toLowerCase())
            const idMatch = item._id.toString().includes(keyword);
            const nameMatch = nameNoDiacritics.includes(keyword);
            return idMatch || nameMatch;
        });
    }

    const totalBrands = brands.length;
    const totalPages = Math.ceil(totalBrands / limit);
    const currentPage = parseInt(page);
    const paginatedBrands = brands.slice((currentPage - 1) * limit, currentPage * limit);

    res.render('brands/list', {
        brands: paginatedBrands,
        currentPage,
        totalPages,
        limit: parseInt(limit),
        search,
        sort
    });
});
// Lấy tất cả thương hiệu
router.get('/all', async (req, res) => {
    try {
        const brands = await Brands.find();
        res.json(brands);
    } catch (error) {
        res.status(500).json({ status: 500, message: "Lỗi máy chủ nội bộ!", error: error.message });
    }
});

// Thêm thương hiệu
router.post('/add', async (req, res) => {
    try {
        const data = req.body;

        if (!data.name || !data.description) {
            return res.status(400).json({ status: 400, message: "Tên thương hiệu và mô tả là bắt buộc!" });
        }

        const newBrand = new Brands({ name: data.name, description: data.description });
        const result = await newBrand.save();

        res.json({
            status: 200,
            message: `Đã thêm thương hiệu "${data.name}" thành công!`,
            data: result,
        });
    } catch (error) {
        res.status(500).json({ status: 500, message: "Lỗi máy chủ nội bộ!", error: error.message });
    }
});

// Xóa thương hiệu
router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ status: 400, message: "ID thương hiệu là bắt buộc!" });
        }

        const result = await Brands.findByIdAndDelete(id);

        if (result) {
            return res.status(200).json({ status: 200, message: `Đã xóa thương hiệu "${result.name}" thành công!` });
        } else {
            return res.status(404).json({ status: 404, message: "Không tìm thấy thương hiệu!" });
        }
    } catch (error) {
        return res.status(500).json({ status: 500, message: "Lỗi máy chủ nội bộ!", error: error.message });
    }
});

// Cập nhật thương hiệu
router.put('/update/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;

        if (!name || !description) {
            return res.status(400).json({ status: 400, message: "Tên thương hiệu và mô tả là bắt buộc!" });
        }

        const updatedBrand = await Brands.findByIdAndUpdate(id, { name, description }, { new: true });

        if (updatedBrand) {
            return res.status(200).json({
                status: 200,
                message: `Đã cập nhật thương hiệu "${updatedBrand.name}" thành công!`,
                data: updatedBrand
            });
        } else {
            return res.status(404).json({ status: 404, message: "Không tìm thấy thương hiệu!" });
        }
    } catch (error) {
        return res.status(500).json({ status: 500, message: "Lỗi máy chủ nội bộ!", error: error.message });
    }
});


module.exports = router;