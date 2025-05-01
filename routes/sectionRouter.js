var express = require('express');
var router = express.Router();

const Sections = require('../models/sections');
const { removeDiacritics } = require('../utils/textUtils');
// router.get('/', async function (req, res, next) {
//     const sections = await Sections.find();
//     res.render('sections/list', {
//         sections: sections,
//     });
// });

// router.get('/', async function (req, res, next) {
//     const { page = 1, limit = 10, search, sort } = req.query;

//     let query = {};
//     // if (search) {
//     //     query.name = { $regex: search, $options: 'i' };
//     // }

//     let sortOption = { created_at: -1 };
//     if (sort === 'name_asc') sortOption = { name: 1 };
//     if (sort === 'name_desc') sortOption = { name: -1 };

//     const sections = await Sections.find(query)
//         .sort(sortOption)
//         .skip((page - 1) * limit)
//         .limit(parseInt(limit));

//     const totalSections = await Sections.countDocuments(query);
//     const totalPages = Math.ceil(totalSections / limit);

//     res.render('sections/list', {
//         sections,
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

    let sections = await Sections.find().sort(sortOption);

    if (search) {
        const keyword = removeDiacritics(search.toLowerCase());

        sections = sections.filter(item => {
            const nameNoDiacritics = removeDiacritics(item.name.toLowerCase())
            const idMatch = item._id.toString().includes(keyword);
            const nameMatch = nameNoDiacritics.includes(keyword);
            return idMatch || nameMatch;
        });
    }

    const totalSections = sections.length;
    const totalPages = Math.ceil(totalSections / limit);
    const currentPage = parseInt(page);
    const paginatedSections = sections.slice((currentPage - 1) * limit, currentPage * limit);

    res.render('sections/list', {
        sections: paginatedSections,
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
            return res.status(400).json({ status: 400, message: "Tên mục nội dung là bắt buộc!" });
        }

        const existingType = await Sections.findOne({ name: { $regex: new RegExp(`^${data.name}$`, 'i') } });
        if (existingType) {
            return res.status(409).json({ status: 409, message: `Tên mục nội dung "${data.name}" đã tồn tại!` });
        }

        const newSection = new Sections({ name: data.name });
        const result = await newSection.save();

        res.json({
            status: 200,
            message: `Đã thêm mục nội dung "${data.name}" thành công!`,
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
            return res.status(400).json({ status: 400, message: "ID mục nội dung là bắt buộc!" });
        }

        const result = await Sections.findByIdAndDelete(id);

        if (result) {
            return res.status(200).json({ status: 200, message: `Đã xóa mục nội dung "${result.name}" thành công!` });
        } else {
            return res.status(404).json({ status: 404, message: "Không tìm thấy mục nội dung!" });
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
            return res.status(400).json({ status: 400, message: "Tên mục nội dung là bắt buộc!" });
        }

        const existedSection = await Sections.findOne({
            _id: { $ne: id },
            name: { $regex: `^${name}$`, $options: 'i' }
        });

        if (existedSection) {
            return res.status(400).json({ status: 400, message: "Tên mục nội dung này đã được sử dụng bởi mục khác!" });
        }

        const updatedSection = await Sections.findByIdAndUpdate(id, { name }, { new: true });

        if (updatedSection) {
            return res.status(200).json({
                status: 200,
                message: `Đã cập nhật mục nội dung "${updatedSection.name}" thành công!`,
                data: updatedSection
            });
        } else {
            return res.status(404).json({ status: 404, message: "Không tìm thấy mục nội dung!" });
        }
    } catch (error) {
        return res.status(500).json({ status: 500, message: "Lỗi máy chủ nội bộ!", error: error.message });
    }
});


module.exports = router;
