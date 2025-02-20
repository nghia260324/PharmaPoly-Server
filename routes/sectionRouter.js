var express = require('express');
var router = express.Router();

const Sections = require('../models/sections');

router.get('/', async function (req, res, next) {
    const sections = await Sections.find();
    res.render('sections/list', {
        sections: sections,
    });
});

module.exports = router;

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
