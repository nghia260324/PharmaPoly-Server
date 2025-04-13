var express = require('express');
var router = express.Router();

const Sections = require('../models/sections');

// router.get('/', async function (req, res, next) {
//     const sections = await Sections.find();
//     res.render('sections/list', {
//         sections: sections,
//     });
// });

router.get('/', async function (req, res, next) {
    const { page = 1, limit = 10, search, sort } = req.query;

    let query = {};
    if (search) {
        query.name = { $regex: search, $options: 'i' };
    }

    let sortOption = { created_at: -1 };
    if (sort === 'name_asc') sortOption = { name: 1 };
    if (sort === 'name_desc') sortOption = { name: -1 };

    const sections = await Sections.find(query)
        .sort(sortOption)
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const totalSections = await Sections.countDocuments(query);
    const totalPages = Math.ceil(totalSections / limit);

    res.render('sections/list', {
        sections,
        currentPage: parseInt(page),
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
            return res.status(400).json({ status: 400, message: "Section name is required!" });
        }

        const newSection = new Sections({ name: data.name });
        const result = await newSection.save();

        res.json({
            status: 200,
            message: `Section "${data.name}" added successfully!`,
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
            return res.status(400).json({ status: 400, message: "Section ID is required!" });
        }

        const result = await Sections.findByIdAndDelete(id);

        if (result) {
            return res.status(200).json({ status: 200, message: `Section "${result.name}" deleted successfully!` });
        } else {
            return res.status(404).json({ status: 404, message: "Section not found!" });
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
            return res.status(400).json({ status: 400, message: "Section name is required!" });
        }

        const updatedSection = await Sections.findByIdAndUpdate(id, { name }, { new: true });

        if (updatedSection) {
            return res.status(200).json({
                status: 200,
                message: `Section "${updatedSection.name}" updated successfully!`,
                data: updatedSection
            });
        } else {
            return res.status(404).json({ status: 404, message: "Section not found!" });
        }
    } catch (error) {
        return res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});


module.exports = router;
