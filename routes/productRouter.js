var express = require('express');
var router = express.Router();
const path = require('path');
const fs = require('fs');

const { bucket } = require("../firebase/firebaseAdmin");

const Products = require('../models/products');
const Categories = require('../models/categories');
const Sections = require('../models/sections');
const Brands = require('../models/brands');
const ProductTypes = require('../models/productTypes');
const ProductImages = require('../models/productImages');
const ProductSections = require('../models/productSections');
const ProductSectionDetails = require('../models/productSectionDetails');
const Uploads = require('../config/common/upload');


// async function updateAllProducts() {
//     try {
//         const result = await Products.updateMany({}, { 
//             stock_quantity: 1000, 
//             expiry_date: new Date("2026-01-28") 
//         });

//         console.log(`Updated ${result.modifiedCount} products successfully!`);
//     } catch (error) {
//         console.error("Error updating products:", error);
//     }
// }

// // Gọi hàm để chạy cập nhật
// updateAllProducts();
// router.get('/', async function (req, res, next) {
//     try {
//         const [products, categories, sections, brands, productTypes] = await Promise.all([
//             Products.find(),
//             Categories.find(),
//             Sections.find(),
//             Brands.find(),
//             ProductTypes.find()
//         ]);

//         const productIds = products.map(p => p._id);
//         const images = await ProductImages.find({ product_id: { $in: productIds }, is_primary: true }).lean();

//         const productMap = images.reduce((acc, img) => {
//             acc[img.product_id] = img.image_url;
//             return acc;
//         }, {});

//         products.forEach(p => {
//             p.image = productMap[p._id];
//         });

//         res.render('products/list', {
//             products,
//             categories,
//             sections,
//             brands,
//             productTypes
//         });
//     } catch (error) {
//         next(error);
//     }
// });

router.get("/", async (req, res) => {
    const { page = 1, limit = 10, search, sort } = req.query;
    let query = {};

    if (search) {
        query.name = { $regex: search, $options: "i" };
    }

    let sortOption = { created_at: -1 };
    if (sort === "name_asc") sortOption = { name: 1 };
    if (sort === "name_desc") sortOption = { name: -1 };
    if (sort === "price_asc") sortOption = { price: 1 };
    if (sort === "price_desc") sortOption = { price: -1 };

    const [categories, sections, brands, productTypes] = await Promise.all([
        Categories.find(),
        Sections.find(),
        Brands.find(),
        ProductTypes.find()
    ]);

    const products = await Products.find(query)
        .sort(sortOption)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean();

    // Lấy danh sách ảnh chính của các sản phẩm
    const productIds = products.map(p => p._id);
    const images = await ProductImages.find({ product_id: { $in: productIds }, is_primary: true }).lean();

    // Tạo mapping giữa product_id và image_url
    const productMap = images.reduce((acc, img) => {
        acc[img.product_id] = img.image_url;
        return acc;
    }, {});

    // Gán ảnh cho từng sản phẩm
    products.forEach(p => {
        p.image = productMap[p._id] || "/default-image.jpg"; // Ảnh mặc định nếu không có ảnh chính
    });

    const totalProducts = await Products.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    res.render("products/list", {
        products,
        categories,
        sections,
        brands,
        productTypes,
        currentPage: parseInt(page),
        totalPages,
        search,
        sort,
        limit
    });
});



router.post('/add', Uploads.array('images', 10), async (req, res) => {
    try {
        const data = req.body;
        const files = req.files;

        if (!data.name ||
            !data.category_id ||
            !data.brand_id ||
            !data.product_type_id ||
            !data.price ||
            !data.short_description ||
            !data.specification ||
            !data.origin_country ||
            !data.manufacturer ||
            !data.stock_quantity ||
            !data.expiry_date) {
            return res.status(400).json({ status: 400, message: "Please provide all required product information!" });
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
            stock_quantity: data.stock_quantity,
            expiry_date: new Date(data.expiry_date),
        });
        const savedProduct = await newProduct.save();

        let imageDocs = [];
        if (files && files.length > 0) {
            for (let index = 0; index < files.length; index++) {
                const file = files[index];

                const fileName = `Product_Images/${Date.now()}-${file.originalname}`;
                const fileUpload = bucket.file(fileName);

                const stream = fileUpload.createWriteStream({
                    metadata: { contentType: file.mimetype }
                });

                stream.end(file.buffer);

                await new Promise((resolve, reject) => {
                    stream.on("finish", resolve);
                    stream.on("error", reject);
                });

                await fileUpload.makePublic();
                const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

                imageDocs.push({
                    product_id: savedProduct._id,
                    image_url: publicUrl,
                    is_primary: index === 0,
                    sort_order: index,
                });
            }

            await ProductImages.insertMany(imageDocs);
        }

        let savedSections = [];
        if (data.sections) {
            try {
                const sections = typeof data.sections === "string" ? JSON.parse(data.sections) : data.sections;

                let uniqueSections = new Set();

                for (const section of sections) {
                    if (uniqueSections.has(section.section_id)) {
                        return res.status(404).json({
                            status: 404,
                            message: `Section "${section.section_id}" đã tồn tại, vui lòng chọn section khác!`
                        });
                    }
                    uniqueSections.add(section.section_id);

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
            } catch (parseError) {
                console.error("Error parsing sections:", parseError);
                return res.status(400).json({ status: 400, message: "Invalid sections format!" });
            }
        }

        res.json({
            status: 200,
            message: `Product "${data.name}" has been added successfully!`,
            data: { product: savedProduct, images: imageDocs },
        });

    } catch (error) {
        console.error("Error adding product:", error);
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

        for (const image of images) {
            await deleteFile(image.image_url);
        }

        await ProductImages.deleteMany({ product_id: id });

        const productSections = await ProductSections.find({ product_id: id });
        for (const section of productSections) {
            await ProductSectionDetails.deleteMany({ product_section_id: section._id });
        }
        await ProductSections.deleteMany({ product_id: id });

        await Products.findByIdAndDelete(id);

        res.json({
            status: 200,
            message: `Product "${product.name}" and its images deleted successfully!`
        });
    } catch (error) {
        console.error("❌ Error deleting product:", error);
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
        console.log("Received Data:", data);

        if (!data.name ||
            !data.category_id ||
            !data.brand_id ||
            !data.product_type_id ||
            !data.price ||
            !data.short_description ||
            !data.specification ||
            !data.origin_country ||
            !data.manufacturer ||
            !data.stock_quantity ||
            !data.expiry_date) {
            return res.status(400).json({ status: 400, message: "Please provide all required product information!" });
        }

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
            stock_quantity: data.stock_quantity,
            expiry_date: new Date(data.expiry_date),
        }, { new: true });

        if (!updatedProduct) {
            return res.status(404).json({ status: 404, message: "Product not found!" });
        }

        if (data.deleted_images) {
            const deletedImageIds = JSON.parse(data.deleted_images);
            const deletedImages = await ProductImages.find({ _id: { $in: deletedImageIds } });

            for (const img of deletedImages) {
                await deleteFile(img.image_url);
            }

            await ProductImages.deleteMany({ _id: { $in: deletedImageIds } });
        }

        if (data.updateImages) {
            const updatedImages = JSON.parse(data.updateImages);
            for (let img of updatedImages) {
                await ProductImages.findByIdAndUpdate(img.id, {
                    is_primary: img.is_primary,
                    sort_order: img.sort_order
                });
            }
        }

        if (files && files.length > 0) {
            const sortOrders = JSON.parse(data.new_images_sort_order);
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fileUrl = await uploadFileToFirebase(file);

                await ProductImages.create({
                    product_id: productId,
                    image_url: fileUrl,
                    is_primary: sortOrders[i] === 0,
                    sort_order: sortOrders[i]
                });
            }
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
            data: { product: updatedProduct }
        });
    } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});

async function deleteFile(fileUrl) {
    try {
        const filePath = fileUrl.replace(`https://storage.googleapis.com/${bucket.name}/`, "");
        await bucket.file(filePath).delete();
        //console.log(`✅ Đã xóa file: ${filePath}`);
    } catch (error) {
        console.error(`Lỗi khi xóa file ${fileUrl}:`, error.message);
    }
}
async function uploadFileToFirebase(file) {
    return new Promise((resolve, reject) => {
        const fileName = `Product_Images/${Date.now()}_${file.originalname}`;
        const fileUpload = bucket.file(fileName);
        const stream = fileUpload.createWriteStream({
            metadata: { contentType: file.mimetype }
        });

        stream.on("error", (err) => reject(err));
        stream.on("finish", async () => {
            await fileUpload.makePublic();
            resolve(`https://storage.googleapis.com/${bucket.name}/${fileName}`);
        });

        stream.end(file.buffer);
    });
}

module.exports = router;
