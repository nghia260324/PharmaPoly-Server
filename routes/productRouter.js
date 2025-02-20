var express = require('express');
var router = express.Router();
const path = require('path');
const fs = require('fs');


const Products = require('../models/products');
const Categories = require('../models/categories');
const Sections = require('../models/sections');
const Brands = require('../models/brands');
const ProductTypes = require('../models/productTypes');
const ProductImages = require('../models/productImages');
const ProductSections = require('../models/productSections');
const ProductSectionDetails = require('../models/productSectionDetails');
const Uploads = require('../config/common/upload');

router.get('/', async function (req, res, next) {
    try {
        const [products, categories, sections, brands, productTypes] = await Promise.all([
            Products.find(),
            Categories.find(),
            Sections.find(),
            Brands.find(),
            ProductTypes.find()
        ]);

        const productIds = products.map(p => p._id);
        const images = await ProductImages.find({ product_id: { $in: productIds }, is_primary: true }).lean();

        const productMap = images.reduce((acc, img) => {
            acc[img.product_id] = img.image_url;
            return acc;
        }, {});

        products.forEach(p => {
            p.image = productMap[p._id];
        });

        res.render('products/list', {
            products,
            categories,
            sections,
            brands,
            productTypes
        });
    } catch (error) {
        next(error);
    }
});

router.post('/add', Uploads.array('images', 10), async (req, res) => {
    try {
        const data = req.body;
        const files = req.files;

        if (!data.name || !data.category_id || !data.brand_id || !data.product_type_id || !data.price || !data.short_description || !data.specification || !data.origin_country || !data.manufacturer) {
            return res.status(400).json({ status: 400, messenger: "Please provide all required product information!" });
        }

        const newProduct = new Products({
            name: data.name,
            category_id: data.category_id,
            brand_id: data.brand_id,
            product_type_id: data.product_type_id,
            price: data.price,
            short_description: data.short_description,
            specification: data.specification,
            origin_country: data.origin_country,
            manufacturer: data.manufacturer,
        });
        const savedProduct = await newProduct.save();

        let imageDocs = [];
        if (files && files.length > 0) {
            imageDocs = files.map((file, index) => ({
                product_id: savedProduct._id,
                image_url: `/uploads/${file.filename}`,
                is_primary: index === 0,
                sort_order: index,
            }));

            await ProductImages.insertMany(imageDocs);
        }

        let savedSections = [];
        if (data.sections) {
            const sections = JSON.parse(data.sections);

            for (const section of sections) {
                const newProductSection = new ProductSections({
                    product_id: savedProduct._id,
                    section_id: section.section_id,
                });

                const savedSection = await newProductSection.save();
                savedSections.push(savedSection);

                if (section.details && section.details.length > 0) {
                    const sectionDetails = section.details.map(detail => ({
                        product_section_id: savedSection._id,
                        title: detail.title,
                        content: detail.content,
                    }));

                    await ProductSectionDetails.insertMany(sectionDetails);
                }
            }
        }

        res.json({
            status: 200,
            message: `Product "${data.name}" has been added successfully!`,
            data: { product: savedProduct, images: imageDocs },
        });
    } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});


router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const product = await Products.findById(id);
        if (!product) {
            return res.status(404).json({ status: 404, message: "Product not found!" });
        }

        const images = await ProductImages.find({ product_id: id });

        images.forEach(image => {
            const imagePath = path.join(__dirname, '../public', image.image_url);
            console.log(`Deleting image: ${imagePath}`);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            } else {
                console.warn(`File not found: ${imagePath}`);
            }
        });

        await ProductImages.deleteMany({ product_id: id });

        const productSections = await ProductSections.find({ product_id: id });

        for (const section of productSections) {
            await ProductSectionDetails.deleteMany({ product_section_id: section._id });
        }

        await ProductSections.deleteMany({ product_id: id });

        await Products.findByIdAndDelete(id);

        res.json({
            status: 200,
            message: `Product "${product.name}" deleted successfully!`
        });
    } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});
router.get('/all', async function (req, res, next) {
    try {
        const products = await Products.find().lean();
        const productIds = products.map(p => p._id);
        const images = await ProductImages.find({ product_id: { $in: productIds }, is_primary: true }).lean();

        const productMap = images.reduce((acc, img) => {
            acc[img.product_id] = img.image_url;
            return acc;
        }, {});

        products.forEach(p => {
            p.image = productMap[p._id] || null;
        });

        res.json(products);
    } catch (error) {
        next(error);
    }
});

router.get('/id/:id', async function (req, res, next) {
    try {
        const { id } = req.params;
        const product = await Products
            .findById(id)
            .populate('category_id')
            .populate('brand_id')
            .populate('product_type_id')
            .lean();
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        const images = await ProductImages.find({ product_id: id })
            .sort({ sort_order: 1 })
            .lean();

        product.images = images;


        const productSections = await ProductSections.find({ product_id: id }).lean();

        for (const section of productSections) {
            section.details = await ProductSectionDetails.find({ product_section_id: section._id }).lean();
        }

        product.sections = productSections;


        res.json(product);
    } catch (error) {
        console.error("Error:", error)
    }
});

router.put('/edit/:id', Uploads.array('images', 10), async (req, res) => {
    try {
        const productId = req.params.id;
        const data = req.body;
        const files = req.files;

        if (!data.name || !data.category_id || !data.brand_id || !data.product_type_id || !data.price || !data.short_description || !data.specification || !data.origin_country || !data.manufacturer) {
            return res.status(400).json({ status: 400, message: "Please provide all required product information!" });
        }

        // Update product information
        const updatedProduct = await Products.findByIdAndUpdate(productId, {
            name: data.name,
            category_id: data.category_id,
            brand_id: data.brand_id,
            product_type_id: data.product_type_id,
            price: data.price,
            short_description: data.short_description,
            specification: data.specification,
            origin_country: data.origin_country,
            manufacturer: data.manufacturer,
        }, { new: true });

        if (!updatedProduct) {
            return res.status(404).json({ status: 404, message: "Product not found!" });
        }

        const deletedImageIds = JSON.parse(data.deleted_images);
        if (deletedImageIds.length > 0) {
            await ProductImages.deleteMany({ _id: { $in: deletedImageIds } });
        }

        const updatedImages = JSON.parse(data.updateImages);

        for (let img of updatedImages) {
            await ProductImages.findByIdAndUpdate(img.id, {
                is_primary: img.is_primary,
                sort_order: img.sort_order
            });
        }
        const sortOrders = JSON.parse(data.new_images_sort_order);
        if (files && files.length > 0) {
            files.forEach(async (file, index) => {
                const sortOrder = sortOrders[index];
                console.log(sortOrder);
                await ProductImages.create({
                    product_id: productId,
                    image_url: `/uploads/${file.filename}`,
                    is_primary: sortOrder === 0,
                    sort_order: sortOrder
                });
            });
        }


        if (data.sections) {
            const sections = JSON.parse(data.sections);

            const oldSections = await ProductSections.find({ product_id: productId });
            const oldSectionIds = oldSections.map(section => section._id);
            await ProductSections.deleteMany({ product_id: productId });
            await ProductSectionDetails.deleteMany({ product_section_id: { $in: oldSectionIds } });

            for (const section of sections) {
                const newProductSection = new ProductSections({
                    product_id: productId,
                    section_id: section.section_id,
                });
                const savedSection = await newProductSection.save();

                if (section.details && section.details.length > 0) {
                    const sectionDetails = section.details.map(detail => ({
                        product_section_id: savedSection._id,
                        title: detail.title,
                        content: detail.content,
                    }));
                    await ProductSectionDetails.insertMany(sectionDetails);
                }
            }
        }

        res.json({
            status: 200,
            message: `Product "${data.name}" has been updated successfully!`,
            data: { product: updatedProduct, images: [] },
        });
    } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});

router.delete('/delete/:id', async (req, res) => {
    try {
        const productId = req.params.id;

        const product = await Products.findById(productId);
        if (!product) {
            return res.status(404).json({ status: 404, message: "Product not found!" });
        }

        await ProductImages.deleteMany({ product_id: productId });

        const productSections = await ProductSections.find({ product_id: productId });
        const productSectionIds = productSections.map(section => section._id);

        await ProductSectionDetails.deleteMany({ product_section_id: { $in: productSectionIds } });
        await ProductSections.deleteMany({ product_id: productId });

        await Products.findByIdAndDelete(productId);

        res.json({ status: 200, message: `Product "${product.name}" has been deleted successfully!` });
    } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});



module.exports = router;
