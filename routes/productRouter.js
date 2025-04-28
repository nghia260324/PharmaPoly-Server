var express = require('express');
var router = express.Router();
const path = require('path');
const fs = require('fs');
const mongoose = require("mongoose");
const { bucket } = require("../firebase/firebaseAdmin");

const Products = require('../models/products');
const Categories = require('../models/categories');
const Sections = require('../models/sections');
const Brands = require('../models/brands');
const ProductTypes = require('../models/productTypes');
const ProductReviews = require('../models/productReviews');
const ProductProductTypes = require('../models/productProductTypes');
const ProductImages = require('../models/productImages');
const ProductSections = require('../models/productSections');
const ProductSectionDetails = require('../models/productSectionDetails');
const Uploads = require('../config/common/upload');
const StockEntries = require('../models/stockEntries');

const { getProductDetails, getAvailableProductTypes } = require("./api");

async function migrateNormalizedName() {
    const products = await Products.find({});
    for (const product of products) {
        product.normalized_name = normalizeText(product.name);
        await product.save();
    }
    console.log('Migration completed!');
}

// migrateNormalizedName();

function normalizeText(text) {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '')
        .toLowerCase();
}

router.get("/", async (req, res) => {
    // const { page = 1, limit = 10, search, sort } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const { search, sort } = req.query;
    let query = {};

    if (search) {
        const normalizedSearch = normalizeText(search);
        query.normalized_name = { $regex: normalizedSearch };
    }

    let sortOption = { created_at: -1 };
    if (sort === "name_asc") sortOption = { name: 1 };
    if (sort === "name_desc") sortOption = { name: -1 };
    // if (sort === "price_asc") sortOption = { price: 1 };
    // if (sort === "price_desc") sortOption = { price: -1 };

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

    const productIds = products.map(p => p._id);

    const productProductTypes = await ProductProductTypes.find({ product_id: { $in: productIds } })
        .populate('product_type_id', 'name')
        .lean();

    const stockEntries = await StockEntries.find({
        product_product_type_id: { $in: productProductTypes.map(pt => pt._id) }
    }).lean();

    const stockMap = stockEntries.reduce((acc, entry) => {
        const productTypeId = entry.product_product_type_id.toString();
        if (!acc[productTypeId]) acc[productTypeId] = 0;
        acc[productTypeId] += entry.remaining_quantity;
        return acc;
    }, {});

    productProductTypes.forEach(pt => {
        pt.stock_quantity = stockMap[pt._id.toString()] || 0;
    });
    const images = await ProductImages.find({ product_id: { $in: productIds }, is_primary: true }).lean();

    const productMap = images.reduce((acc, img) => {
        acc[img.product_id] = img.image_url;
        return acc;
    }, {});

    products.forEach(p => {
        p.image = productMap[p._id] || "/default-image.jpg";
        p.product_types = productProductTypes.filter(pt => pt.product_id.toString() === p._id.toString());
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


router.get("/add", async (req, res) => {
    const [categories, sections, brands, productTypes] = await Promise.all([
        Categories.find(),
        Sections.find(),
        Brands.find(),
        ProductTypes.find()
    ]);

    res.render("products/add", {
        categories,
        sections,
        brands,
        productTypes,
    });
});


router.get("/:id/detail", async (req, res) => {
    const id = req.params.id;
    //const product = await getProductDetails(id)
    const product = await Products
        .findById(id)
        .populate('category_id')
        .populate('brand_id')

    if (!product) {
        return res.status(404).json({
            status: 404,
            message: 'Product not found'
        });
    }
    const images = await ProductImages.find({ product_id: id })
        .sort({ sort_order: 1 })
        .lean();

    product.images = images;

    const productSections = await ProductSections.find({ product_id: id })
        .populate('section_id', '_id name')
        .lean();

    productSections.forEach(section => {
        section.section = section.section_id;
        section.section_id = section.section_id._id;
    });
    for (const section of productSections) {
        const details = await ProductSectionDetails.find({ product_section_id: section._id }).lean();

        delete section.__v;
        section.details = details.map(detail => ({
            _id: detail._id,
            product_section_id: detail.product_section_id,
            title: detail.title,
            content: detail.content
        }));
    }

    const availableProductTypes = await getAvailableProductTypes(id);

    const reviews = await ProductReviews.find({ product_id: id })
        .populate('user_id', 'full_name avatar_url')
        .lean();
    reviews.forEach(review => {
        if (!review.user_id.avatar_url) {
            review.user_id.avatar_url = '/images/default_avatar.png';
        }
    });

    const formattedProduct = {
        ...product.toObject(),
        category_id: product.category_id._id,
        brand_id: product.brand_id._id,
        category: {
            _id: product.category_id._id,
            name: product.category_id.name,
        },
        brand: {
            _id: product.brand_id._id,
            name: product.brand_id.name,
            description: product.brand_id.description,
        },
        product_types: availableProductTypes,
        images: images,
        sections: productSections,
        create_at: product.created_at,
        update_at: product.updated_at,
        reviews: reviews,
    };

    res.render("products/detail", {
        product: formattedProduct,
    });
});

async function getProductStockQuantity(product_id) {
    try {
        const productProductTypes = await ProductProductTypes.find({ product_id }).select('_id').lean();

        if (!productProductTypes.length) {
            return 0;
        }

        const productProductTypeIds = productProductTypes.map(p => p._id);

        const stockEntries = await StockEntries.find({
            product_product_type_id: { $in: productProductTypeIds },
            remaining_quantity: { $gt: 0 }
        }).lean();

        const totalStock = stockEntries.reduce((sum, entry) => sum + entry.remaining_quantity, 0);

        return totalStock;
    } catch (error) {
        console.error('Error getting product stock quantity:', error);
        throw error;
    }
}


router.get('/:id/edit', async (req, res) => {
    try {
        const productId = req.params.id;
        const [categories, sections, brands, productTypes] = await Promise.all([
            Categories.find(),
            Sections.find(),
            Brands.find(),
            ProductTypes.find()
        ]);

        res.render('products/edit', {
            product_id: productId,
            categories,
            sections,
            brands,
            productTypes,
        });
    } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
    }
});

router.get('/:product_id/import-stock', async (req, res) => {
    const { product_id } = req.params;

    try {
        const product = await Products.findById(product_id);

        if (!product) {
            return res.status(404).send('Sản phẩm không tìm thấy');
        }

        const productImage = await ProductImages.findOne({ product_id, is_primary: true });
        const productProductTypes = await ProductProductTypes.find({ product_id })

            .populate('product_type_id', 'name')
            .lean();

        const stockEntries = await StockEntries.find({
            product_product_type_id: { $in: productProductTypes.map(pt => pt._id) }
        })
            .populate({
                path: 'product_product_type_id',
                populate: [
                    { path: 'product_id', select: 'name' },
                    { path: 'product_type_id', select: 'name' }
                ]
            })
            .sort({ import_date: -1 })
            .lean();
        res.render('products/import', {
            product_id: product._id,
            product_name: product.name,
            product_image: productImage.image_url,
            product_product_types: productProductTypes,
            product_status: product.status,
            stockEntries,
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Có lỗi xảy ra khi tải trang nhập hàng');
    }
});

router.post('/:product_id/import-stock/add', async (req, res) => {
    try {
        const { product_product_type_id, batch_number, quantity, import_price, expiry_date } = req.body;

        const productProductType = await ProductProductTypes.findById(product_product_type_id);
        if (!productProductType) {
            return res.status(404).json({
                status: 404,
                message: "Product product type not found!"
            });
        }

        if (!batch_number || !quantity || !import_price) {
            return res.status(400).json({
                status: 400,
                message: "Missing required fields!"
            });
        }

        if (isNaN(quantity) || quantity <= 0) {
            return res.status(400).json({
                status: 400,
                message: "Invalid quantity! It must be a positive number."
            });
        }
        if (isNaN(import_price) || import_price <= 0) {
            return res.status(400).json({
                status: 400,
                message: "Invalid import price! It must be a positive number."
            });
        }

        let expiryDateObj = null;
        if (expiry_date) {
            expiryDateObj = new Date(expiry_date);
            if (isNaN(expiryDateObj.getTime())) {
                return res.status(400).json({
                    status: 400,
                    message: "Invalid expiry date format! Please use YYYY-MM-DD"
                });
            }
            const importDateObj = new Date();
            if (expiryDateObj <= importDateObj) {
                return res.status(400).json({
                    status: 400,
                    message: "Expiry date must be greater than import date!"
                });
            }
        }

        const existingStockEntry = await StockEntries.findOne({ batch_number });
        if (existingStockEntry) {
            return res.status(400).json({
                status: 400,
                message: `Batch number ${batch_number} already exists! Please use a unique batch number.`
            });
        }

        const newStockEntry = new StockEntries({
            batch_number,
            product_product_type_id,
            import_price: Number(import_price),
            quantity: Number(quantity),
            remaining_quantity: Number(quantity),
            expiry_date: expiryDateObj
        });

        const savedEntry = await newStockEntry.save();

        res.status(200).json({
            status: 200,
            message: `Stock entry for product product type added successfully!`,
            data: savedEntry
        });

    } catch (error) {
        console.error("Error adding stock entry:", error);

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                status: 400,
                message: "Validation Error",
                error: error.message
            });
        }

        res.status(500).json({
            status: 500,
            message: "Internal Server Error!",
            error: error.message
        });
    }
});

// router.post('/:product_id/import-stock/:id/update-info', async (req, res) => {
//     const { product_id, id } = req.params;
//     const { batch_number, quantity, import_price, expiry_date, product_product_type_id } = req.body;
//     if (!batch_number || !quantity || !import_price || !expiry_date || !product_product_type_id) {
//         return res.status(400).json({
//             status: 400,
//             message: "Missing required fields!"
//         });
//     }
//     const existingStockEntry = await StockEntries.findOne({
//         batch_number,
//         _id: { $ne: id }
//     });
//     if (existingStockEntry) {
//         return res.status(400).json({
//             status: 400,
//             message: `Batch number ${batch_number} already exists! Please use a unique batch number.`
//         });
//     }

//     const stockEntry = await StockEntries.findById(id);
//     if (!stockEntry) {
//         return res.status(404).json({
//             status: 404,
//             message: "Stock entry not found!"
//         });
//     }

//     try {
//         const product = await Products.findById(product_id);
//         if (!product) {
//             return res.status(404).json({
//                 status: 404,
//                 message: "Product not found!"
//             });
//         }
//         const productProductType = await ProductProductTypes.findById(product_product_type_id);
//         if (!productProductType) {
//             return res.status(404).json({
//                 status: 404,
//                 message: "Product product type not found!"
//             });
//         }



//         if (stockEntry.status !== 'not_started') {
//             return res.status(400).json({
//                 status: 400,
//                 message: "You can only update stock information when the status is 'not_started'."
//             });
//         }

//         stockEntry.batch_number = batch_number;
//         stockEntry.quantity = quantity;
//         stockEntry.import_price = import_price;
//         stockEntry.expiry_date = expiryDateObj;
//         stockEntry.product_product_type_id = product_product_type_id;
//         stockEntry.remaining_quantity = quantity;

//         const updatedStockEntry = await stockEntry.save();

//         res.status(200).json({
//             status: 200,
//             message: `Stock entry ${id} updated successfully!`,
//             data: updatedStockEntry
//         });

//     } catch (error) {
//         console.error("❌ Error updating stock entry information:", error);

//         if (error.name === 'ValidationError') {
//             return res.status(400).json({
//                 status: 400,
//                 message: "Validation Error",
//                 error: error.message
//             });
//         }

//         res.status(500).json({
//             status: 500,
//             message: "Internal Server Error!",
//             error: error.message
//         });
//     }
// });

router.post('/:product_id/import-stock/:id/update-info', async (req, res) => {
    try {
        const { product_id, id } = req.params;
        const { batch_number, quantity, import_price, expiry_date, product_product_type_id } = req.body;

        if (!batch_number || !quantity || !import_price || !product_product_type_id) {
            return res.status(400).json({
                status: 400,
                message: "Missing required fields! (batch_number, quantity, import_price, product_product_type_id)"
            });
        }

        const existingStockEntry = await StockEntries.findOne({
            batch_number,
            _id: { $ne: id }
        });
        if (existingStockEntry) {
            return res.status(400).json({
                status: 400,
                message: `Batch number ${batch_number} already exists! Please use a unique batch number.`
            });
        }

        const stockEntry = await StockEntries.findById(id);
        if (!stockEntry) {
            return res.status(404).json({
                status: 404,
                message: "Stock entry not found!"
            });
        }

        const product = await Products.findById(product_id);
        if (!product) {
            return res.status(404).json({
                status: 404,
                message: "Product not found!"
            });
        }
        const productProductType = await ProductProductTypes.findById(product_product_type_id);
        if (!productProductType) {
            return res.status(404).json({
                status: 404,
                message: "Product product type not found!"
            });
        }

        let expiryDateObj = null;
        if (expiry_date) {
            expiryDateObj = new Date(expiry_date);
            if (isNaN(expiryDateObj.getTime())) {
                return res.status(400).json({
                    status: 400,
                    message: "Invalid expiry date format! Please use YYYY-MM-DD"
                });
            }
            const importDateObj = new Date();
            if (expiryDateObj <= importDateObj) {
                return res.status(400).json({
                    status: 400,
                    message: "Expiry date must be greater than import date!"
                });
            }
        }

        stockEntry.batch_number = batch_number;
        stockEntry.quantity = Number(quantity);
        stockEntry.remaining_quantity = Number(quantity);
        stockEntry.import_price = Number(import_price);
        stockEntry.product_product_type_id = product_product_type_id;

        // stockEntry.expiry_date = expiryDateObj;
        stockEntry.expiry_date = expiryDateObj || null;

        const updatedStockEntry = await stockEntry.save();

        res.status(200).json({
            status: 200,
            message: `Stock entry ${id} updated successfully!`,
            data: updatedStockEntry
        });

    } catch (error) {
        console.error("❌ Error updating stock entry information:", error);

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                status: 400,
                message: "Validation Error",
                error: error.message
            });
        }

        res.status(500).json({
            status: 500,
            message: "Internal Server Error!",
            error: error.message
        });
    }
});





router.put('/:product_id/import-stock/:id/update-status', async (req, res) => {
    const { product_id, id } = req.params;
    const { status } = req.body;

    const validStatuses = ['not_started', 'active', 'paused', 'sold_out', 'expired', 'discontinued'];

    if (!validStatuses.includes(status)) {
        return res.status(400).json({
            status: 400,
            message: "Invalid status! Please use one of the following: not_started, active, paused, sold_out, expired, discontinued."
        });
    }

    try {
        const product = await Products.findById(product_id);
        if (!product) {
            return res.status(404).json({
                status: 404,
                message: "Product not found!"
            });
        }

        const stockEntry = await StockEntries.findById(id);
        if (!stockEntry) {
            return res.status(404).json({
                status: 404,
                message: "Stock entry not found!"
            });
        }

        const currentStatus = stockEntry.status;

        if (status === 'sold_out' || status === 'expired') {

            return res.status(400).json({
                status: 400,
                message: `Cannot change status to ${status}. It is a final state.`
            });
        }

        if (currentStatus === 'sold_out' || currentStatus === 'expired' || currentStatus === 'discontinued') {
            return res.status(400).json({
                status: 400,
                message: `Cannot change status from ${currentStatus}. It is a final state.`
            });
        }

        if (currentStatus === 'active' || currentStatus === 'paused') {
            if (status === 'discontinued') {
                stockEntry.status = status;
            } else if (status !== 'active' && status !== 'paused') {
                return res.status(400).json({
                    status: 400,
                    message: `Cannot change from ${currentStatus} to ${status}. You can only toggle between 'active', 'paused', and 'discontinued'.`
                });
            } else {
                stockEntry.status = status;
            }
        } else if (currentStatus === 'not_started') {
            // Từ 'not_started' có thể chuyển sang 'active', 'paused', hoặc 'discontinued'
            if (status !== 'active' && status !== 'paused' && status !== 'discontinued') {
                return res.status(400).json({
                    status: 400,
                    message: `Cannot change from 'not_started' to ${status}. You can only transition to 'active', 'paused', or 'discontinued'.`
                });
            }
            stockEntry.status = status;
        } else if (currentStatus === 'discontinued') {
            return res.status(400).json({
                status: 400,
                message: "Cannot change status from 'discontinued'. It is a final state."
            });
        }

        const updatedStockEntry = await stockEntry.save();

        res.status(200).json({
            status: 200,
            message: `Stock entry ${id} status updated to ${status}!`,
            data: updatedStockEntry
        });

    } catch (error) {
        console.error("❌ Error updating stock entry status:", error);

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                status: 400,
                message: "Validation Error",
                error: error.message
            });
        }

        res.status(500).json({
            status: 500,
            message: "Internal Server Error!",
            error: error.message
        });
    }
});

router.delete('/:product_id/import-stock/:id/delete', async (req, res) => {
    const { id } = req.params;

    try {
        const stockEntry = await StockEntries.findById(id);
        if (!stockEntry) {
            return res.status(404).json({
                status: 404,
                message: "Lô hàng không tồn tại!"
            });
        }
        if (stockEntry.status !== 'not_started') {
            return res.status(400).json({
                status: 400,
                message: "Chỉ có thể xóa lô hàng khi trạng thái là 'not_started'."
            });
        }

        await StockEntries.findByIdAndDelete(id);

        res.status(200).json({
            status: 200,
            message: "Lô hàng đã được xóa thành công!"
        });

    } catch (error) {
        console.error("❌ Lỗi khi xóa lô hàng:", error);
        res.status(500).json({
            status: 500,
            message: "Lỗi server khi xóa lô hàng!",
            error: error.message
        });
    }
});


// router.post('/add', Uploads.array('images', 10), async (req, res) => {
//     try {
//         const data = req.body;
//         const files = req.files;
//         if (!data.name ||
//             !data.category_id ||
//             !data.brand_id ||
//             !data.short_description ||
//             !data.specification ||
//             !data.origin_country ||
//             !data.manufacturer ||
//             !data.product_product_types) {
//             return res.status(400).json({ status: 400, message: "Please provide all required product information!" });
//         }

//         const session = await mongoose.startSession();
//         session.startTransaction();

//         const newProduct = new Products({
//             name: data.name,
//             normalized_name: normalizeText(data.name),
//             category_id: data.category_id,
//             brand_id: data.brand_id,
//             short_description: data.short_description,
//             specification: data.specification,
//             origin_country: data.origin_country,
//             manufacturer: data.manufacturer,
//         });
//         const savedProduct = await newProduct.save();

//         let imageDocs = [];
//         if (files && files.length > 0) {
//             for (let index = 0; index < files.length; index++) {
//                 const file = files[index];

//                 const fileName = `Product_Images/${Date.now()}-${file.originalname}`;
//                 const fileUpload = bucket.file(fileName);

//                 const stream = fileUpload.createWriteStream({
//                     metadata: { contentType: file.mimetype }
//                 });

//                 stream.end(file.buffer);

//                 await new Promise((resolve, reject) => {
//                     stream.on("finish", resolve);
//                     stream.on("error", reject);
//                 });

//                 await fileUpload.makePublic();
//                 const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

//                 imageDocs.push({
//                     product_id: savedProduct._id,
//                     image_url: publicUrl,
//                     is_primary: index === 0,
//                     sort_order: index,
//                 });
//             }

//             await ProductImages.insertMany(imageDocs);
//         }

//         let productTypeData = [];
//         try {
//             const productTypes = typeof data.product_product_types === "string"
//                 ? JSON.parse(data.product_product_types)
//                 : data.product_product_types;

//             for (const type of productTypes) {
//                 if (!type.type_id || !type.price) {
//                     return res.status(400).json({ status: 400, message: "Dữ liệu loại sản phẩm không hợp lệ!" });
//                 }

//                 productTypeData.push({
//                     product_id: savedProduct._id,
//                     product_type_id: type.type_id,
//                     price: type.price,
//                 });
//             }

//             await ProductProductTypes.insertMany(productTypeData);
//         } catch (parseError) {
//             console.error("Lỗi khi parse product_product_types:", parseError);
//             return res.status(400).json({ status: 400, message: "Định dạng product_product_types không hợp lệ!" });
//         }

//         let savedSections = [];
//         if (data.sections) {
//             try {
//                 const sections = typeof data.sections === "string" ? JSON.parse(data.sections) : data.sections;

//                 let uniqueSections = new Set();

//                 for (const section of sections) {
//                     if (uniqueSections.has(section.section_id)) {
//                         return res.status(404).json({
//                             status: 404,
//                             message: `Section "${section.section_id}" đã tồn tại, vui lòng chọn section khác!`
//                         });
//                     }
//                     uniqueSections.add(section.section_id);

//                     const newProductSection = new ProductSections({
//                         product_id: savedProduct._id,
//                         section_id: section.section_id,
//                     });

//                     const savedSection = await newProductSection.save();
//                     savedSections.push(savedSection);

//                     if (section.details && section.details.length > 0) {
//                         const sectionDetails = section.details.map(detail => ({
//                             product_section_id: savedSection._id,
//                             title: detail.title,
//                             content: detail.content,
//                         }));

//                         await ProductSectionDetails.insertMany(sectionDetails);
//                     }
//                 }
//             } catch (parseError) {
//                 console.error("Error parsing sections:", parseError);
//                 return res.status(400).json({ status: 400, message: "Invalid sections format!" });
//             }
//         }

//         await session.commitTransaction();
//         session.endSession();

//         res.json({
//             status: 200,
//             message: `Product "${data.name}" has been added successfully!`,
//             data: { product: savedProduct, images: imageDocs },
//         });

//     } catch (error) {
//         console.error("Error adding product:", error);

//         await session.abortTransaction();
//         session.endSession();

//         res.status(500).json({ status: 500, message: "Internal Server Error!", error: error.message });
//     }
// });

router.post('/add', Uploads.array('images', 10), async (req, res) => {
    let session;
    try {
        const data = req.body;
        const files = req.files;

        if (!data.name) return res.status(400).json({ status: 400, message: "Vui lòng nhập tên sản phẩm!" });
        if (!data.category_id) return res.status(400).json({ status: 400, message: "Vui lòng chọn danh mục sản phẩm!" });
        if (!data.brand_id) return res.status(400).json({ status: 400, message: "Vui lòng chọn thương hiệu sản phẩm!" });
        if (!data.short_description) return res.status(400).json({ status: 400, message: "Vui lòng nhập mô tả ngắn!" });
        if (!data.specification) return res.status(400).json({ status: 400, message: "Vui lòng nhập quy cách!" });
        if (!data.origin_country) return res.status(400).json({ status: 400, message: "Vui lòng nhập nước xuất xứ!" });
        if (!data.manufacturer) return res.status(400).json({ status: 400, message: "Vui lòng nhập nhà sản xuất!" });
        if (!data.product_product_types) return res.status(400).json({ status: 400, message: "Vui lòng chọn loại sản phẩm!" });

        if (!files || files.length === 0) {
            return res.status(400).json({ status: 400, message: "Vui lòng tải lên ít nhất một ảnh!" });
        }

        session = await mongoose.startSession();
        session.startTransaction();

        const newProduct = new Products({
            name: data.name,
            normalized_name: normalizeText(data.name),
            category_id: data.category_id,
            brand_id: data.brand_id,
            short_description: data.short_description,
            specification: data.specification,
            origin_country: data.origin_country,
            manufacturer: data.manufacturer,
        });
        const savedProduct = await newProduct.save({ session });

        const imageDocs = await Promise.all(files.map(async (file, index) => {
            const fileName = `Product_Images/${Date.now()}-${file.originalname}`;
            const fileUpload = bucket.file(fileName);

            await new Promise((resolve, reject) => {
                fileUpload.createWriteStream({
                    metadata: { contentType: file.mimetype }
                })
                    .on('finish', resolve)
                    .on('error', reject)
                    .end(file.buffer);
            });

            await fileUpload.makePublic();
            return {
                product_id: savedProduct._id,
                image_url: `https://storage.googleapis.com/${bucket.name}/${fileName}`,
                is_primary: index === 0,
                sort_order: index
            };
        }));
        await ProductImages.insertMany(imageDocs, { session });


        const productTypes = JSON.parse(data.product_product_types);
        if (!Array.isArray(productTypes) || productTypes.length === 0) {
            throw new Error("Định dạng loại sản phẩm không hợp lệ!");
        }

        const productTypeData = productTypes.map(type => {
            if (!type.type_id || !type.price || isNaN(type.price) || type.price <= 0) {
                throw new Error("Thông tin loại sản phẩm không hợp lệ!");
            }
            return {
                product_id: savedProduct._id,
                product_type_id: type.type_id,
                price: Number(type.price)
            };
        });
        await ProductProductTypes.insertMany(productTypeData, { session });

        if (data.sections) {
            const sections = JSON.parse(data.sections);
            const uniqueSections = new Set();

            for (const section of sections) {
                if (!section.section_id) throw new Error("Thiếu ID section!");
                if (uniqueSections.has(section.section_id)) {
                    throw new Error(`Section ${section.section_id} đã tồn tại!`);
                }
                uniqueSections.add(section.section_id);

                if (!section.details || !Array.isArray(section.details)) {
                    throw new Error("Thông tin details không hợp lệ!");
                }

                const sectionDetails = section.details.map(detail => {
                    const title = detail.title?.trim();
                    const content = detail.content?.trim();
                    if (!title || !content) {
                        throw new Error("Tiêu đề và nội dung detail không được để trống!");
                    }
                    return { title, content };
                });

                const newSection = await ProductSections.create([{
                    product_id: savedProduct._id,
                    section_id: section.section_id
                }], { session });

                await ProductSectionDetails.insertMany(sectionDetails.map(detail => ({
                    product_section_id: newSection[0]._id,
                    ...detail
                })), { session });
            }
        }

        await session.commitTransaction();
        res.json({
            status: 200,
            message: `Thêm sản phẩm "${data.name}" thành công!`,
            data: { product: savedProduct, images: imageDocs }
        });

    } catch (error) {
        if (session) {
            await session.abortTransaction();
            session.endSession();
        }

        console.error("Lỗi thêm sản phẩm:", error);
        const statusCode = error instanceof SyntaxError ? 400 : 500;
        res.status(statusCode).json({
            status: statusCode,
            message: error.message || "Lỗi server!"
        });
    }
});

function normalizeText(text) {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '')
        .toLowerCase();
}

router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const product = await Products.findById(id);
        if (!product) {
            return res.status(404).json({ status: 404, message: "Sản phẩm không tồn tại!" });
        }

        if (product.status !== 'not_started') {
            return res.status(400).json({
                status: 400,
                message: "Không thể xóa sản phẩm trong trạng thái này."
            });
        }

        const productTypes = await ProductProductTypes.find({ product_id: id });
        for (const productType of productTypes) {
            const stockEntries = await StockEntries.find({ product_product_type_id: productType._id });
            if (stockEntries.length > 0) {
                return res.status(400).json({
                    status: 400,
                    message: "Không thể xóa sản phẩm vì nó có mục nhập kho."
                });
            }
        }

        const images = await ProductImages.find({ product_id: id });

        const session = await mongoose.startSession();
        session.startTransaction();

        for (const image of images) {
            await deleteFile(image.image_url);
        }

        await ProductImages.deleteMany({ product_id: id });

        const productSections = await ProductSections.find({ product_id: id });
        for (const section of productSections) {
            await ProductSectionDetails.deleteMany({ product_section_id: section._id });
        }
        await ProductSections.deleteMany({ product_id: id });

        await ProductProductTypes.deleteMany({ product_id: id });

        await Products.findByIdAndDelete(id);

        await session.commitTransaction();
        session.endSession();

        res.json({
            status: 200,
            message: `Sản phẩm "${product.name}" và các hình ảnh của nó đã được xóa thành công!`
        });
    } catch (error) {
        console.error("❌ Lỗi khi xóa sản phẩm:", error);
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ status: 500, message: "Lỗi máy chủ nội bộ!", error: error.message });
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

        const productProductTypes = await ProductProductTypes.find({ product_id: id })
            .populate('product_type_id', 'name')
            .lean();
        product.product_product_types = productProductTypes;

        res.json(product);
    } catch (error) {
        console.error("Error:", error)
    }
});

router.put('/edit/:id', Uploads.array('images', 10), async (req, res) => {
    let session;
    try {
        const productId = req.params.id;
        const data = req.body;
        const files = req.files;

        if (!data.name) return res.status(400).json({ status: 400, message: "Vui lòng nhập tên sản phẩm!" });
        if (!data.category_id) return res.status(400).json({ status: 400, message: "Vui lòng chọn danh mục sản phẩm!" });
        if (!data.brand_id) return res.status(400).json({ status: 400, message: "Vui lòng chọn thương hiệu sản phẩm!" });
        if (!data.short_description) return res.status(400).json({ status: 400, message: "Vui lòng nhập mô tả ngắn!" });
        if (!data.specification) return res.status(400).json({ status: 400, message: "Vui lòng nhập quy cách!" });
        if (!data.origin_country) return res.status(400).json({ status: 400, message: "Vui lòng nhập nước xuất xứ!" });
        if (!data.manufacturer) return res.status(400).json({ status: 400, message: "Vui lòng nhập nhà sản xuất!" });
        if (!data.product_product_types) return res.status(400).json({ status: 400, message: "Vui lòng chọn loại sản phẩm!" });

        const existingProduct = await Products.findById(productId);
        if (!existingProduct) {
            return res.status(404).json({ status: 404, message: "Sản phẩm không tồn tại!" });
        }

        if (!files || files.length === 0) {
            const productImages = await ProductImages.find({ product_id: productId });

            if (productImages.length === 0) {
                return res.status(400).json({ status: 400, message: "Vui lòng tải lên ít nhất một ảnh!" });
            }
        }

        if (data.deleted_images) {
            const deletedImageIds = JSON.parse(data.deleted_images);
            const deletedImages = await ProductImages.find({ _id: { $in: deletedImageIds }, product_id: productId });

            const remainingImages = await ProductImages.find({ product_id: productId });
            if (remainingImages.length === deletedImageIds.length && (!files || files.length === 0)) {
                return res.status(400).json({ status: 400, message: "Vui lòng tải lên ít nhất một ảnh mới!" });
            }

            if (remainingImages.length > deletedImageIds.length) {
                for (const img of deletedImages) {
                    await deleteFile(img.image_url);
                }
                await ProductImages.deleteMany({ _id: { $in: deletedImageIds } });
            }
        }


        if (existingProduct.status === 'discontinued' && data.status !== 'discontinued') {
            return res.status(400).json({
                status: 400,
                message: "Không thể thay đổi trạng thái của sản phẩm đã ngừng bán vĩnh viễn."
            });
        }

        if (['active', 'paused', 'out_of_stock'].includes(existingProduct.status) && data.status === 'not_started') {
            return res.status(400).json({
                status: 400,
                message: "Không thể thay đổi trạng thái về 'not_started' từ 'active', 'paused' hoặc 'out_of_stock'."
            });
        }


        session = await mongoose.startSession();
        session.startTransaction();

        const updatedProduct = await Products.findByIdAndUpdate(productId, {
            name: data.name,
            category_id: data.category_id,
            brand_id: data.brand_id,
            short_description: data.short_description,
            specification: data.specification,
            origin_country: data.origin_country,
            manufacturer: data.manufacturer,
            status: data.status,
        }, { new: true });

        if (!updatedProduct) {
            return res.status(404).json({ status: 404, message: "Sản phẩm không tồn tại!" });
        }


        const newProductTypes = JSON.parse(data.product_product_types);

        const existingProductTypes = await ProductProductTypes.find({ product_id: productId });

        const newTypeIds = newProductTypes.map(pt => String(pt.product_type_id));
        const existingTypeIds = existingProductTypes.map(pt => String(pt.product_type_id));

        const toDelete = existingProductTypes.filter(pt => !newTypeIds.includes(String(pt.product_type_id)));
        if (toDelete.length > 0) {
            await ProductProductTypes.deleteMany({ _id: { $in: toDelete.map(pt => pt._id) } });
        }

        for (let pt of newProductTypes) {
            if (existingTypeIds.includes(String(pt.product_type_id))) {
                await ProductProductTypes.updateOne(
                    { product_id: productId, product_type_id: pt.product_type_id },
                    { price: pt.price }
                );
            } else {
                await ProductProductTypes.create({
                    product_id: productId,
                    product_type_id: pt.product_type_id,
                    price: pt.price
                });
            }
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
        await session.commitTransaction();
        res.json({
            status: 200,
            message: `Sản phẩm "${data.name}" đã được cập nhật thành công!`,
            data: { product: updatedProduct }
        });

    } catch (error) {
        console.error("Lỗi khi cập nhật sản phẩm:", error);
        if (session) {
            await session.abortTransaction();
            session.endSession();
        }
        res.status(500).json({ status: 500, message: "Lỗi máy chủ nội bộ!", error: error.message });
    }
});

router.put('/edit/:id/status', async (req, res) => {
    try {
        const productId = req.params.id;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ status: 400, message: "Thiếu trạng thái cần cập nhật!" });
        }

        const product = await Products.findById(productId);
        if (!product) {
            return res.status(404).json({ status: 404, message: "Không tìm thấy sản phẩm!" });
        }

        if (product.status === 'discontinued') {
            return res.status(400).json({
                status: 400,
                message: "Không thể thay đổi trạng thái của sản phẩm đã ngừng bán vĩnh viễn."
            });
        }

        if (['active', 'paused', 'out_of_stock'].includes(product.status) && status === 'not_started') {
            return res.status(400).json({
                status: 400,
                message: "Không thể chuyển trạng thái về 'Chưa bắt đầu bán'."
            });
        }

        if (product.status === 'not_started' && status === 'active') {
            const productTypesCount = await ProductProductTypes.countDocuments({ product_id: productId });
            if (productTypesCount === 0) {
                return res.status(400).json({
                    status: 400,
                    message: "Sản phẩm phải có ít nhất 1 loại sản phẩm để chuyển trạng thái thành 'Đang bán'."
                });
            }

            const validStock = await StockEntries.findOne({
                product_product_type_id: { $in: product.product_types },
                status: 'active',
                remaining_quantity: { $gt: 0 },
                expiry_date: { $gte: new Date() }
            });

            if (!validStock) {
                return res.status(400).json({
                    status: 400,
                    message: "Sản phẩm phải có ít nhất 1 lô hàng đang bán và còn hàng."
                });
            }
        }

        product.status = status;
        await product.save();

        res.json({
            status: 200,
            message: `Cập nhật trạng thái sản phẩm thành công!`,
            data: { product }
        });
    } catch (error) {
        console.error("Error updating product status:", error);
        res.status(500).json({ status: 500, message: "Lỗi server!", error: error.message });
    }
});

router.put('/edit/:id/product-types/:typeId/price', async (req, res) => {
    const { id, typeId } = req.params;
    const { price } = req.body;

    try {
        const productType = await ProductProductTypes.findOneAndUpdate(
            { product_id: id, product_type_id: typeId },
            { price },
            { new: true }
        );

        if (!productType) {
            return res.status(404).json({ message: 'Loại sản phẩm không tìm thấy.' });
        }

        res.status(200).json({ message: 'Cập nhật giá thành công.', productType });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Có lỗi xảy ra khi cập nhật giá.' });
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








async function checkInvalidProductImages() {
    try {
        const productImages = await ProductImages.find({});
        console.log(`🔎 Đang kiểm tra ${productImages.length} product images...`);

        for (const image of productImages) {
            const product = await Products.findById(image.product_id);
            if (!product) {
                console.log(`❌ ProductImage ID ${image._id} liên kết tới product_id đã bị xóa: ${image.product_id}`);
            }
        }

        console.log('✅ Kiểm tra hoàn tất!');
    } catch (error) {
        console.error('❌ Lỗi khi kiểm tra product images:', error);
    }
}
// checkInvalidProductImages();

async function fixBrokenProductImage() {
    try {
        const brokenImageId = '67ee9f0cf34feb2ba98f596d';

        const image = await ProductImages.findById(brokenImageId);

        if (!image) {
            console.log(`❗ Không tìm thấy ProductImage ID ${brokenImageId}.`);
            return;
        }

        console.log(`🚀 Đang xóa ảnh liên kết tới ProductImage ID ${brokenImageId}`);

        // Xóa ảnh trên Firebase
        await deleteFile(image.image_url);

        // Xóa bản ghi trong MongoDB
        await ProductImages.findByIdAndDelete(brokenImageId);

        console.log(`✅ Đã xóa thành công ProductImage ID ${brokenImageId} và file ảnh.`);
    } catch (error) {
        console.error('❌ Lỗi khi fix broken product image:', error);
    }
}

// Gọi hàm luôn
// fixBrokenProductImage();


// async function checkInvalidStockEntries() {
//     try {
//         const stockEntries = await StockEntries.find({});
//         console.log(`🔎 Đang kiểm tra ${stockEntries.length} stock entries...`);

//         for (const entry of stockEntries) {
//             const productProductType = await ProductProductTypes.findById(entry.product_product_type_id);
//             if (!productProductType) {
//                 console.log(`⚠️ StockEntry ID ${entry._id} liên kết tới product_product_type_id không tồn tại: ${entry.product_product_type_id}`);
//                 continue;
//             }

//             const product = await Products.findById(productProductType.product_id);
//             if (!product) {
//                 console.log(`❌ StockEntry ID ${entry._id} liên kết tới product_id đã bị xóa: ${productProductType.product_id}`);
//             }
//         }

//         console.log('✅ Kiểm tra hoàn tất!');
//     } catch (error) {
//         console.error('❌ Lỗi khi kiểm tra stock entries:', error);
//     }
// }

// async function checkInvalidProductProductTypes() {
//     try {
//         const productProductTypes = await ProductProductTypes.find({});
//         console.log(`🔎 Đang kiểm tra ${productProductTypes.length} product product types...`);

//         for (const ppt of productProductTypes) {
//             const product = await Products.findById(ppt.product_id);
//             if (!product) {
//                 console.log(`❌ ProductProductType ID ${ppt._id} liên kết tới product_id đã bị xóa: ${ppt.product_id}`);
//             }
//         }

//         console.log('✅ Kiểm tra hoàn tất!');
//     } catch (error) {
//         console.error('❌ Lỗi khi kiểm tra product product types:', error);
//     }
// }