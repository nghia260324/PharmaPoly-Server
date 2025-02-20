var express = require('express');
var router = express.Router();

require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { encrypt } = require('../utils/crypto');

const checkPhoneVerification = require('../utils/checkPhoneVerification');

const Users = require('../models/users');
const Products = require('../models/products');
const ProductImages = require('../models/productImages');
const ProductSections = require('../models/productSections');
const ProductSectionDetails = require('../models/productSectionDetails');
const Categories = require('../models/categories');
const Brands = require('../models/brands');
const ProductTypes = require('../models/productTypes');
const Sections = require('../models/sections');
const ProductReviews = require('../models/productReviews');
const Questions = require('../models/questions');
const Answers = require('../models/answers');

function authenticateToken(req, res, next) {
    // const token = req.headers['authorization']?.split(' ')[1]; 
    // if (!token) {
    //     return res.status(401).json({ message: 'Unauthorized: No token provided' });
    // }

    // jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    //     if (err) {
    //         return res.status(403).json({ message: 'Forbidden: Invalid token' });
    //     }
    //     req.user = user; 
    //     next();
    // });
    return next();
}

router.post('/check-phone', async (req, res) => {
    try {
        const { phone_number } = req.body;

        if (!phone_number) {
            return res.status(400).json({
                status: 400,
                message: "Phone number is required!"
            });
        }

        const user = await Users.findOne({ phone_number });
        if (user) {
            return res.status(200).json({
                status: 200,
                message: "Phone number is already registered."
            });
        } else {
            return res.status(404).json({
                status: 404,
                message: "Phone number is not registered."
            });

        }
    } catch (error) {
        console.error("Error checking phone number:", error);
        res.status(500).json({
            status: 500,
            message: "Internal server error!" + error.message
        });
    }
});

router.post('/create-account', async (req, res) => {
    try {
        const { uid, phone_number, password, confirm_password, verification_id } = req.body;

        if (!uid || !phone_number || !password || !confirm_password || !verification_id) {
            return res.status(400).json({
                status: 400,
                message: "Missing required fields!"
            });
        }

        // if (!isValidPhoneNumber(phone_number)) {
        //     return res.status(400).json({
        //         status: 400,
        //         message: "Invalid phone number format!"
        //     });
        // }


        // if (password !== confirm_password) {
        //     return res.status(404).json({
        //         status: 404,
        //         message: "Passwords do not match!"
        //     });
        // }

        const isPhoneVerified = await checkPhoneVerification(phone_number);
        if (!isPhoneVerified) {
            return res.status(400).json({
                status: 400,
                message: "Phone number is not verified!"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new Users({
            uid: uid,
            phone_number: phone_number,
            password: hashedPassword
        });

        await newUser.save();

        res.status(200).json({
            status: 200,
            message: "Account created successfully!",
        });

    } catch (error) {
        console.error("Error creating account:", error);
        res.status(500).json({
            status: 500,
            message: "Internal server error"
        });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { phone_number, password } = req.body;

        if (!phone_number || !password) {
            return res.status(400).json({
                status: 400,
                message: "Phone number and password are required!"
            });
        }

        const user = await Users.findOne({ phone_number });
        if (!user) {
            return res.status(404).json({
                status: 404,
                message: "User not found!"
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                status: 401,
                message: "Invalid password!"
            });
        }

        const token = jwt.sign(
            { uid: user.uid, phone_number: user.phone_number },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(200).json({
            status: 200,
            message: "Login successful!",
            data: token,
        });

    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({
            status: 500,
            message: "Internal server error"
        });
    }
});

// ----- Product Router ----- //
router.get('/product/:id', authenticateToken, async function (req, res, next) {
    try {
        const { id } = req.params;
        const product = await Products.findById(id);
        if (!product) {
            return res.status(404).json({
                status: 404,
                message: 'Product not found!'
            });
        }
        const formattedProduct = {
            ...product.toObject(),
            create_at: product.createdAt,
            update_at: product.updatedAt,
        };
        delete formattedProduct.__v;
        delete formattedProduct.createdAt;
        delete formattedProduct.updatedAt;

        return res.status(200).json({
            status: 200,
            message: 'Get Product Success!',
            data: formattedProduct
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});

router.get('/product/:id/details', authenticateToken, async function (req, res, next) {
    try {
        const { id } = req.params;
        const product = await Products
            .findById(id)
            .populate('category_id')
            .populate('brand_id')
            .populate('product_type_id');

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

        const productSections = await ProductSections.find({ product_id: id }).lean();

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

        const formattedProduct = {
            ...product.toObject(),
            category_id: product.category_id._id,
            brand_id: product.brand_id._id,
            product_type_id: product.product_type_id._id,
            category: {
                _id: product.category_id._id,
                name: product.category_id.name,
            },
            brand: {
                _id: product.brand_id._id,
                name: product.brand_id.name,
                description: product.brand_id.description,
            },
            product_type: {
                _id: product.product_type_id._id,
                name: product.product_type_id.name,
            },
            images: images,
            sections: productSections,
            create_at: product.createdAt,
            update_at: product.updatedAt,
        };

        delete formattedProduct.__v;
        delete formattedProduct.createdAt;
        delete formattedProduct.updatedAt;


        return res.status(200).json({
            status: 200,
            message: 'Get Product Success!',
            data: formattedProduct
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});

router.get('/product/:id/sections', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const productSections = await ProductSections.find({ product_id: id })
            //.populate('section_id', 'name')
            .lean();

        if (productSections.length === 0) {
            return res.status(404).json({
                status: 404,
                message: 'No Sections found for this Product'
            });
        }

        const formattedProductSections = productSections.map(section => ({
            ...section,
            //section: section.section_id,
            //create_at: section.createdAt,
            //update_at: section.updatedAt
        })).map(section => {
            delete section.__v;
            delete section.createdAt;
            delete section.updatedAt;
            return section;
        });

        return res.status(200).json({
            status: 200,
            message: 'Get Sections for Product Success!',
            data: formattedProductSections
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});

router.get('/product/:id/sections/details', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const productSections = await ProductSections.find({ product_id: id })
            .populate('section_id', 'name')
            .lean();

        if (productSections.length === 0) {
            return res.status(404).json({
                status: 404,
                message: 'No Product Sections found for this Product'
            });
        }

        const formattedProductSections = productSections.map(section => ({
            ...section,
            section: section.section_id,
        })).map(section => {
            delete section.section_id;
            delete section.__v;
            delete section.createdAt;
            delete section.updatedAt;
            return section;
        });

        return res.status(200).json({
            status: 200,
            message: 'Get Product Sections for Product Success!',
            data: formattedProductSections
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});

router.get('/product/:id/images', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const productImages = await ProductImages.find({ product_id: id }).lean();

        if (productImages.length === 0) {
            return res.status(404).json({
                status: 404,
                message: 'No images found for this product'
            });
        }

        const formattedProductImages = productImages.map(image => ({
            _id: image._id,
            product_id: image.product_id,
            image_url: image.image_url,
            is_primary: image.is_primary,
            sort_order: image.sort_order
        })).map(image => {
            delete image.__v;
            delete image.createdAt;
            delete image.updatedAt;
            return image;
        });

        return res.status(200).json({
            status: 200,
            message: 'Get Product Images Success!',
            data: formattedProductImages
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});

router.get('/product/:id/image-primary', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const primaryImage = await ProductImages.findOne({
            product_id: id,
            is_primary: true
        }).lean();

        if (!primaryImage) {
            return res.status(404).json({
                status: 404,
                message: 'Primary image not found for this product'
            });
        }

        const formattedImage = {
            _id: primaryImage._id,
            product_id: primaryImage.product_id,
            image_url: primaryImage.image_url,
            sort_order: primaryImage.sort_order,
            is_primary: true
        };

        delete formattedImage.__V;
        delete formattedImage.createAt;
        delete formattedImage.updateAt;


        return res.status(200).json({
            status: 200,
            message: 'Get Primary Product Image Success!',
            data: formattedImage
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});

router.get('/product/:id/reviews', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const productReviews = await ProductReviews.find({ product_id: id })
            .sort({ createdAt: -1 })
            .lean();

        if (productReviews.length === 0) {
            return res.status(404).json({
                status: 500,
                message: 'No reviews found for this product'
            });
        }


        const formattedReviews = productReviews.map(review => ({
            _id: review._id,
            product_id: review.product_id,
            rating: review.rating,
            review: review.review,
            created_at: review.createdAt,
        })).map(productReview => {
            delete productReview.__v;
            delete productReview.createdAt;
            delete productReview.updatedAt;
            return productReview;
        });

        return res.status(200).json({
            status: 200,
            message: 'Get Product Reviews Success!',
            data: formattedReviews
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});

router.get('/product/:id/questions', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const questions = await Questions.find({ product_id: id })
            .sort({ createdAt: -1 })
            .lean();

        if (questions.length === 0) {
            return res.status(404).json({
                status: 404,
                message: 'No question found for this product'
            });
        }


        const formattedReviews = questions.map(question => ({
            _id: question._id,
            user_id: question.user_id,
            product_id: question.product_id,
            content: question.content,
            created_at: question.createdAt,
            status: question.status
        })).map(question => {
            delete question.__v;
            delete question.createdAt;
            delete question.updatedAt;
            return question;
        });

        return res.status(200).json({
            status: 200,
            message: 'Get Product Reviews Success!',
            data: formattedReviews
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});



// ----- Category Router ----- //

router.get('/categories', authenticateToken, async (req, res) => {
    try {
        const categories = await Categories.find();
        const formattedCategories = categories.map(category => {
            const obj = category.toObject();
            return {
                ...obj,
                create_at: obj.createdAt,
                update_at: obj.updatedAt,
            };
        });

        formattedCategories.forEach(category => {
            delete category.__v;
            delete category.createdAt;
            delete category.updatedAt;
        });
        return res.status(200).json({
            status: 200,
            message: 'Get Categories Success!',
            data: formattedCategories
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});

router.get('/category/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const category = await Categories.findById(id).lean();
        if (!category) {
            return res.status(404).json({
                status: 404,
                message: 'Category not found'
            });
        }

        const formattedCategory = {
            ...category,
            create_at: category.createdAt,
            update_at: category.updatedAt,
        };
        delete formattedCategory.__v;
        delete formattedCategory.createdAt;
        delete formattedCategory.updatedAt;

        return res.status(200).json({
            status: 200,
            message: 'Get Category Success!',
            data: formattedCategory
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});

// ----- Brand Router ----- //

router.get('/brands', authenticateToken, async (req, res) => {
    try {
        const brands = await Brands.find();
        const formattedBrands = brands.map(brand => {
            const obj = brand.toObject();
            return {
                ...obj,
                create_at: obj.createdAt,
                update_at: obj.updatedAt,
            };
        });

        formattedBrands.forEach(brand => {
            delete brand.__v;
            delete brand.createdAt;
            delete brand.updatedAt;
        });

        return res.status(200).json({
            status: 200,
            message: 'Get Brands Success!',
            data: formattedBrands
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});

router.get('/brand/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const brand = await Brands.findById(id).lean();
        if (!brand) {
            return res.status(404).json({
                status: 404,
                message: 'Brand not found'
            });
        }

        const formattedBrand = {
            ...brand,
            create_at: brand.createdAt,
            update_at: brand.updatedAt,
        };

        delete formattedBrand.__v;
        delete formattedBrand.createdAt;
        delete formattedBrand.updatedAt;

        return res.status(200).json({
            status: 200,
            message: 'Get Brand Success!',
            data: formattedBrand
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});


// ----- Product Type Router ----- //

router.get('/product-types', authenticateToken, async (req, res) => {
    try {
        const productTypes = await ProductTypes.find();
        const formattedProductTypes = productTypes.map(productType => {
            const obj = productType.toObject();
            return {
                ...obj,
                create_at: obj.createdAt,
                update_at: obj.updatedAt,
            };
        });

        formattedProductTypes.forEach(productType => {
            delete productType.__v;
            delete productType.createdAt;
            delete productType.updatedAt;
        });

        return res.status(200).json({
            status: 200,
            message: 'Get Product Types Success!',
            data: formattedProductTypes
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});

router.get('/product-type/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const productType = await ProductTypes.findById(id).lean();
        if (!productType) {
            return res.status(404).json({
                status: 404,
                message: 'Product Type not found'
            });
        }

        const formattedProductType = {
            ...productType,
            create_at: productType.createdAt,
            update_at: productType.updatedAt,
        };

        delete formattedProductType.__v;
        delete formattedProductType.createdAt;
        delete formattedProductType.updatedAt;

        return res.status(200).json({
            status: 200,
            message: 'Get Product Type Success!',
            data: formattedProductType
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});


// ----- Section Router ----- //

router.get('/sections', authenticateToken, async (req, res) => {
    try {
        const sections = await Sections.find();
        const formattedSections = sections.map(section => {
            const obj = section.toObject();
            return {
                ...obj,
                create_at: obj.createdAt,
                update_at: obj.updatedAt,
            };
        });

        formattedSections.forEach(section => {
            delete section.__v;
            delete section.createdAt;
            delete section.updatedAt;
        });

        return res.status(200).json({
            status: 200,
            message: 'Get Sections Success!',
            data: formattedSections
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});

router.get('/section/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const section = await Sections.findById(id).lean();

        if (!section) {
            return res.status(404).json({
                status: 404,
                message: 'Section not found'
            });
        }

        const formattedSection = {
            ...section,
            create_at: section.createdAt,
            update_at: section.updatedAt,
        };

        delete formattedSection.__v;
        delete formattedSection.createdAt;
        delete formattedSection.updatedAt;

        return res.status(200).json({
            status: 200,
            message: 'Get Section Success!',
            data: formattedSection
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});

// ----- Product Section Router ----- //

router.get('/product-section/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const productSection = await ProductSections.findById(id).lean();
        if (!productSection) {
            return res.status(404).json({
                status: 404,
                message: 'Product Section not found'
            });
        }

        delete productSection.__v;
        delete productSection.createdAt;
        delete productSection.updatedAt;

        return res.status(200).json({
            status: 200,
            message: 'Get Product Section Success!',
            data: productSection
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});

router.get('/product-section/:id/details', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const productSection = await ProductSections.findById(id)
            .populate('section_id', 'name')
            .lean();
        if (!productSection) {
            return res.status(404).json({
                status: 404,
                message: 'Product Section not found'
            });
        }

        const formattedProductSection = {
            ...productSection,
            section: productSection.section_id
        };

        delete formattedProductSection.section_id;
        delete formattedProductSection.__v;
        delete formattedProductSection.createdAt;
        delete formattedProductSection.updatedAt;

        return res.status(200).json({
            status: 200,
            message: 'Get Product Section Success!',
            data: formattedProductSection
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});


// ----- Product Review Router ----- //

router.get('/product-review/get/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const productReview = await ProductReviews.findById(id).lean();
        if (!productReview) {
            return res.status(404).json({
                status: 404,
                message: 'Product Review not found'
            });
        }

        delete productReview.__v;
        delete productReview.updatedAt;

        return res.status(200).json({
            status: 200,
            message: 'Get Product Review Success!',
            data: productReview
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});
router.post('/product-review/create', authenticateToken, async (req, res) => {
    try {
        const { product_id, rating, review } = req.body;

        if (!product_id || !rating || !review) {
            return res.status(400).json({
                status: 400,
                message: 'Missing required fields'
            });
        }

        const newReview = new ProductReviews({
            product_id,
            rating,
            review,
        });

        const savedReview = await newReview.save();

        const product = await Products.findById(product_id);
        if (product) {
            const newReviewCount = product.review_count + 1;
            const newAverageRating = ((product.average_rating * product.review_count) + Number(rating)) / newReviewCount;

            product.review_count = newReviewCount;
            product.average_rating = parseFloat(newAverageRating.toFixed(2)); // Giữ 2 số thập phân
            await product.save();
        }

        return res.status(200).json({
            status: 200,
            message: 'Create Product Review Success!',
            data: savedReview
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});
router.delete('/product-review/delete/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const review = await ProductReviews.findById(id);
        if (!review) {
            return res.status(404).json({
                status: 404,
                message: 'Product Review not found'
            });
        }

        const product = await Products.findById(review.product_id);
        if (!product) {
            return res.status(404).json({
                status: 404,
                message: 'Product not found for this review'
            });
        }

        if (product.review_count > 1) {
            const allReviews = await ProductReviews.find({ product_id: review.product_id, _id: { $ne: id } });
            const totalRating = allReviews.reduce((sum, r) => sum + Number(r.rating), 0);
            const newAverageRating = totalRating / (product.review_count - 1);

            product.review_count -= 1;
            product.average_rating = parseFloat(newAverageRating.toFixed(2));
        } else {
            product.review_count = 0;
            product.average_rating = 0;
        }

        await product.save();

        await ProductReviews.findByIdAndDelete(id);

        return res.status(200).json({
            status: 200,
            message: 'Delete Product Review Success!',
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});

// ----- Question Router ----- //

router.post('/question/create', authenticateToken, async (req, res) => {
    try {
        const { user_id, product_id, content } = req.body;

        if (!user_id || !product_id || !content) {
            return res.status(400).json({
                status: 400,
                message: 'Missing required fields'
            });
        }

        const user = await Users.findById(user_id);
        if (!user) {
            return res.status(404).json({
                status: 404,
                message: 'User not found'
            });
        }

        const product = await Products.findById(product_id);
        if (!product) {
            return res.status(404).json({
                status: 404,
                message: 'Product not found'
            });
        }

        const newQuestion = new Questions({
            user_id,
            product_id,
            content,
        });

        const savedQuestion = await newQuestion.save();

        return res.status(200).json({
            status: 200,
            message: 'Create Question Review Success!',
            data: savedQuestion
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});

router.get('/question/get/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const question = await Questions.findById(id).lean();
        if (!question) {
            return res.status(404).json({
                status: 404,
                message: 'Question not found'
            });
        }

        const formattedQuestion = {
            ...question,
            create_at: question.createdAt,
        };

        delete formattedQuestion.__v;
        delete formattedQuestion.updatedAt;

        return res.status(200).json({
            status: 200,
            message: 'Get question Review Success!',
            data: formattedQuestion
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ 
            status: 500,
            message: 'Internal Server Error' });
    }
});

// Xóa câu hỏi (Chỉ user đặt câu hỏi mới đc xóa)
router.delete('/question/delete/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;


        const question = await Questions.findById(id);
        if (!question) {
            return res.status(404).json({
                status: 404,
                message: 'Question not found'
            });
        }

        if (question.user_id.toString() !== userId.toString()) {
            return res.status(403).json({
                status: 403,
                message: 'You do not have permission to delete this question'
            });
        }

        await Questions.findByIdAndDelete(id);

        return res.status(200).json({
            status: 200,
            message: 'Question deleted successfully'
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});



module.exports = router;
