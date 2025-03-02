const passwordPattern = /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
var express = require('express');
var router = express.Router();

require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { encrypt } = require('../utils/crypto');

const { checkPhoneVerification, checkUidAndPhoneNumber } = require('../utils/checkPhoneVerification');

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
const CartItems = require('../models/cartItems');
const Carts = require('../models/carts');
const upload = require('../config/common/upload');

const MAX_QUANTITY_PER_PRODUCT = 10;

function authenticateToken(req, res, next) {
    // if (process.env.NODE_ENV === 'development') {
    //     return next();
    // }
    return next();
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
        return res.status(401).json({
            status: 401,
            message: 'Unauthorized: No token provided'
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({
                status: 403,
                message: 'Forbidden: Invalid token'
            });
        }
        req.user_id = decoded._id;
        next();
    });
}
function checkMissingFields(fields, requiredFields) {
    let missingFields = [];

    requiredFields.forEach(field => {
        if (!fields[field]) {
            missingFields.push(field);
        }
    });

    if (missingFields.length > 0) {
        return `Missing required fields: ${missingFields.join(', ')}`;
    }

    return null;
}

// ----- User ----- //

router.post('/user/check-phone', async (req, res) => {
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

router.post('/user/create-account', async (req, res) => {
    try {
        const { uid, phone_number, password, confirm_password } = req.body;

        const requiredFields = ['uid', 'phone_number', 'password', 'confirm_password'];

        const missingFieldsMessage = checkMissingFields(req.body, requiredFields);
        if (missingFieldsMessage) {
            return res.status(400).json({
                status: 400,
                message: missingFieldsMessage
            });
        }

        if (!passwordPattern.test(password)) {
            return res.status(400).json({
                status: 400,
                message: "Password must be at least 8 characters long, contain at least one uppercase letter, one number, and one special character."
            });
        }

        if (password !== confirm_password) {
            return res.status(400).json({
                status: 400,
                message: "Passwords do not match!"
            });
        }

        const isPhoneVerified = await checkPhoneVerification(phone_number);
        if (!isPhoneVerified) {
            return res.status(400).json({
                status: 400,
                message: "Phone number is not verified!"
            });
        }

        const isUidValid = await checkUidAndPhoneNumber(uid, phone_number);
        if (!isUidValid) {
            return res.status(400).json({
                status: 400,
                message: "UID does not match the phone number!"
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

router.post('/user/login', async (req, res) => {
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
            { _id: user._id, phone_number: user.phone_number },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const refreshToken = jwt.sign(
            { _id: user._id, phone_number: user.phone_number },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: '7d' }
        );
        const userObj = user.toObject();
        delete userObj.password;
        res.status(200).json({
            status: 200,
            message: "Login successful!",
            data: userObj,
            token: token,
            refreshToken: refreshToken
        });

    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({
            status: 500,
            message: "Internal server error"
        });
    }
});

router.put('/user/update-profile', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        const { full_name, date_of_birth, gender, address } = req.body;
        const file = req.file;

        const user = await Users.findById(req.user_id);
        if (!user) {
            return res.status(404).json({ status: 404, message: "User not found!" });
        }

        let updateData = {};
        if (full_name !== undefined) updateData.full_name = full_name;
        if (date_of_birth !== undefined) updateData.date_of_birth = date_of_birth;
        if (gender !== undefined) updateData.gender = gender;
        if (address !== undefined) updateData.address = address;

        if (file) {
            if (user.avatar_url) {
                const oldImagePath = path.join(__dirname, '../public', user.avatar_url);
                fs.unlink(oldImagePath, (err) => {
                    if (err && err.code !== 'ENOENT') {
                        console.error('Error deleting old avatar:', err);
                    }
                });
            }
            updateData.avatar_url = `/uploads/${file.filename}`;
        }

        const updatedUser = await Users.findByIdAndUpdate(
            { _id: req.user_id },
            { $set: updateData },
            { new: true }
        );

        const formattedUser = {
            ...updatedUser.toObject(),
            created_at: updatedUser.createdAt,
            updated_at: updatedUser.updatedAt
        };

        delete formattedUser.__v;
        delete formattedUser.password;
        delete formattedUser.createdAt;
        delete formattedUser.updatedAt;

        res.status(200).json({
            status: 200,
            message: "Profile updated successfully!",
            data: formattedUser
        });

    } catch (error) {
        console.error("Error updating profile:", error);
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) {
                    console.error('Error:', err);
                }
            });
        }
        res.status(500).json({ status: 500, message: "Internal server error", error: error.message });
    }
});

router.put('/user/change-password', authenticateToken, async (req, res) => {
    try {
        const { password, new_password, confirm_password } = req.body;

        const requiredFields = ['password', 'new_password', 'confirm_password'];
        const missingFieldsMessage = checkMissingFields(req.body, requiredFields);
        if (missingFieldsMessage) {
            return res.status(400).json({
                status: 400,
                message: missingFieldsMessage
            });
        }

        const user = await Users.findById(req.user_id);
        if (!user) {
            return res.status(404).json({
                status: 404,
                message: "User not found!"
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                status: 403,
                message: "Incorrect current password!"
            });
        }

        const passwordPattern = /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordPattern.test(new_password)) {
            return res.status(400).json({
                status: 402,
                message: "New password must be at least 8 characters long, contain at least one uppercase letter, one number, and one special character."
            });
        }

        if (new_password !== confirm_password) {
            return res.status(400).json({
                status: 401,
                message: "New password and confirm password do not match!"
            });
        }

        const hashedNewPassword = await bcrypt.hash(new_password, 10);
        user.password = hashedNewPassword;
        await user.save();

        res.status(200).json({
            status: 200,
            message: "Password changed successfully!"
        });

    } catch (error) {
        console.error("Error changing password:", error);
        res.status(500).json({
            status: 500,
            message: "Internal server error"
        });
    }
});

router.post('/refresh-token', async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(400).json({
            status: 400,
            message: 'Refresh token is required!'
        });
    }

    try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const user = await Users.findById(decoded.uid);
        if (!user || user.refreshToken !== refreshToken) {
            return res.status(403).json({
                status: 403,
                message: 'Invalid refresh token!'
            });
        }

        const newAccessToken = jwt.sign(
            { uid: user._id, phone_number: user.phone_number },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({
            status: 200,
            message: 'Access token refreshed!',
            data: { accessToken: newAccessToken }
        });
    } catch (err) {
        return res.status(403).json({ message: 'Invalid refresh token!' });
    }
});

router.get('/user/cart/items', authenticateToken, async (req, res) => {
    try {
        const { user_id } = req.body;

        let cart = await Carts.findOne({ user_id });
        if (!cart) {
            return res.status(404).json({ status: 404, message: 'Cart not found' });
        }

        let cartItems = await CartItems.find({ cart_id: cart._id })
            .populate('product_id');


        const productIds = cartItems.map(item => item.product_id._id);

        const primaryImages = await ProductImages.find({
            product_id: { $in: productIds },
            is_primary: true
        });

        const imageMap = primaryImages.reduce((acc, img) => {
            acc[img.product_id] = img;
            return acc;
        }, {});

        cartItems = cartItems.map(item => {
            let product = item.product_id.toObject();
            product.images = [imageMap[product._id]] || null;
            return { ...item.toObject(), product_id: product };
        });

        return res.status(200).json({
            status: 200,
            message: 'Cart items retrieved successfully!',
            data: {
                cart,
                cartItems
            }
        });

    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ status: 500, message: 'Internal Server Error' });
    }
});


// ----- Product ----- //

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

        const primaryImage = await ProductImages.findOne({ product_id: id, is_primary: true })
            .lean();

        delete primaryImage.__v;

        const formattedProduct = {
            ...product.toObject(),
            create_at: product.createdAt,
            update_at: product.updatedAt,
            images: primaryImage ? [primaryImage] : []
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


router.get('/product/top-rated/:limit?', authenticateToken, async (req, res) => {
    try {
        let limit = parseInt(req.params.limit) || 10;
        limit = limit > 20 ? 20 : limit;
        
        const products = await Products.find()
            .sort({ average_rating: -1 })
            .limit(limit)
            .populate('category_id')
            .populate('brand_id')
            .populate('product_type_id')
            .lean();
        
        const productIds = products.map(product => product._id);
        const primaryImages = await ProductImages.find({ 
            product_id: { $in: productIds }, 
            is_primary: true 
        }).lean();

        const productsWithDetails = products.map(product => {
            const primaryImage = primaryImages.find(img => img.product_id.equals(product._id));

            return {
                ...product,
                images: primaryImage ? [primaryImage] : [],
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
                }
            };
        });

        return res.status(200).json({
            status: 200,
            message: 'Get Top Rated Products Success!',
            data: productsWithDetails
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});

router.get('/product/most-reviewed/:limit?', authenticateToken, async (req, res) => {
    try {
        let limit = parseInt(req.params.limit) || 10;
        limit = limit > 20 ? 20 : limit;

        const products = await Products.find()
            .sort({ review_count: -1 })
            .limit(limit)
            .populate('category_id')
            .populate('brand_id')
            .populate('product_type_id')
            .lean();

        const productIds = products.map(product => product._id);
        const primaryImages = await ProductImages.find({
            product_id: { $in: productIds },
            is_primary: true
        }).lean();

        const productsWithDetails = products.map(product => {
            const primaryImage = primaryImages.find(img => img.product_id.equals(product._id));

            return {
                ...product,
                images: primaryImage ? [primaryImage] : [],
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
                }
            };
        });

        return res.status(200).json({
            status: 200,
            message: 'Get Most Reviewed Products Success!',
            data: productsWithDetails
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

        const productExists = await Products.findById(id).lean();
        if (!productExists) {
            return res.status(404).json({
                status: 404,
                message: 'Product not found'
            });
        }

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

        const productExists = await Products.findById(id).lean();
        if (!productExists) {
            return res.status(404).json({
                status: 404,
                message: 'Product not found'
            });
        }

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

        const productExists = await Products.findById(id).lean();
        if (!productExists) {
            return res.status(404).json({
                status: 404,
                message: 'Product not found'
            });
        }

        const productImages = await ProductImages.find({ product_id: id }).lean();

        if (productImages.length === 0) {
            return res.status(401).json({
                status: 401,
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

        const productExists = await Products.findById(id).lean();
        if (!productExists) {
            return res.status(404).json({
                status: 404,
                message: 'Product not found'
            });
        }

        const primaryImage = await ProductImages.findOne({
            product_id: id,
            is_primary: true
        }).lean();

        if (!primaryImage) {
            return res.status(401).json({
                status: 401,
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

        const productExists = await Products.findById(id).lean();
        if (!productExists) {
            return res.status(404).json({
                status: 404,
                message: 'Product not found'
            });
        }

        const productReviews = await ProductReviews.find({ product_id: id })
            .sort({ createdAt: -1 })
            .lean();

        if (productReviews.length === 0) {
            return res.status(401).json({
                status: 401,
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

        const productExists = await Products.findById(id).lean();
        if (!productExists) {
            return res.status(404).json({
                status: 404,
                message: 'Product not found'
            });
        }

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
            message: 'Get Product Questions Success!',
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

router.get('/category/:id/products', async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10 } = req.query;

        const pageNumber = parseInt(page);
        const limitNumber = parseInt(limit);
        const skip = (pageNumber - 1) * limitNumber;

        const products = await Products.find({ category_id: id })
            .skip(skip)
            .limit(limitNumber)
            .lean();

        const totalProducts = await Products.countDocuments({ category_id: id });
        const totalPages = Math.ceil(totalProducts / limitNumber);

        res.json({
            status: 200,
            message: "Success",
            data: {
                products,
                pagination: {
                    currentPage: pageNumber,
                    totalPages,
                    totalProducts,
                    hasNextPage: pageNumber < totalPages,
                    hasPrevPage: pageNumber > 1
                }
            }
        });

    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ status: 500, message: "Internal Server Error", error: error.message });
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
        const formattedProductReview = {
            ...productReview,
            create_at: productReview.createdAt,
        };

        delete formattedProductReview.__v;
        delete formattedProductReview.createdAt;
        delete formattedProductReview.updatedAt;

        return res.status(200).json({
            status: 200,
            message: 'Get Product Review Success!',
            data: formattedProductReview
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
        const { user_id, product_id, rating, review } = req.body;

        if (!user_id || !product_id || rating === undefined) {
            return res.status(400).json({
                status: 400,
                message: 'Missing required fields'
            });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({
                status: 401,
                message: 'Rating must be between 1 and 5 stars'
            });
        }

        const user = await Users.findById(user_id);
        if (!user) {
            return res.status(404).json({
                status: 402,
                message: 'User not found'
            });
        }
        const product = await Products.findById(product_id);
        if (!product) {
            return res.status(404).json({
                status: 403,
                message: 'Product not found'
            });
        }

        const newReview = new ProductReviews({
            user_id,
            product_id,
            rating,
            review,
        });

        const savedReview = await newReview.save();

        const allReviews = await ProductReviews.find({ product_id });
        const totalRating = allReviews.reduce((sum, r) => sum + Number(r.rating), 0);
        const averageRating = totalRating / allReviews.length;

        product.review_count = allReviews.length;
        product.average_rating = parseFloat((Math.round(averageRating * 2) / 2).toFixed(2));
        await product.save();

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


router.put('/product-review/update/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, review } = req.body;

        if (rating !== undefined && (rating < 1 || rating > 5)) {
            return res.status(400).json({
                status: 400,
                message: 'Rating must be between 1 and 5 stars'
            });
        }

        const existingReview = await ProductReviews.findById(id);
        if (!existingReview) {
            return res.status(404).json({
                status: 404,
                message: 'Product Review not found'
            });
        }

        const product = await Products.findById(existingReview.product_id);
        if (!product) {
            return res.status(404).json({
                status: 404,
                message: 'Product not found for this review'
            });
        }

        if (rating !== undefined) {
            const allReviews = await ProductReviews.find({ product_id: product._id, _id: { $ne: id } });
            const totalRating = allReviews.reduce((sum, r) => sum + Number(r.rating), 0) + Number(rating);
            const newAverageRating = totalRating / (allReviews.length + 1);
            product.average_rating = parseFloat(newAverageRating.toFixed(2));
            await product.save();
        }

        if (review !== undefined) {
            existingReview.review = review;
        }

        if (rating !== undefined) {
            existingReview.rating = rating;
        }

        await existingReview.save();

        const allReviews = await ProductReviews.find({ product_id: product._id });
        const totalRating = allReviews.reduce((sum, r) => sum + Number(r.rating), 0);
        const averageRating = totalRating / allReviews.length;

        product.review_count = allReviews.length;
        product.average_rating = parseFloat((Math.round(averageRating * 2) / 2).toFixed(2));
        await product.save();

        return res.status(200).json({
            status: 200,
            message: 'Update Product Review Success!',
            data: existingReview
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
            message: 'Create Question Success!',
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
            message: 'Internal Server Error'
        });
    }
});

router.get('/question/get/:id/details', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const question = await Questions.findById(id).lean();
        if (!question) {
            return res.status(404).json({
                status: 404,
                message: 'Question not found'
            });
        }

        const user = await Users.findById(question.user_id).lean();
        if (!user) {
            return res.status(404).json({
                status: 404,
                message: 'User not found'
            });
        }

        const formattedQuestion = {
            ...question,
            user: {
                full_name: user.full_name,
                avatar_url: user.avatar_url
            },
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
            message: 'Internal Server Error'
        });
    }
});

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

// ----- Answer Router ----- //



router.post('/answer/create', authenticateToken, async (req, res) => {
    try {
        const { question_id, user_id, content } = req.body;

        if (!question_id || !user_id || !content) {
            return res.status(400).json({
                status: 400,
                message: 'Missing required fields'
            });
        }

        const question = await Questions.findById(question_id);
        if (!question) {
            return res.status(404).json({
                status: 404,
                message: 'Question not found'
            });
        }

        const user = await Products.findById(user_id);
        if (!user) {
            return res.status(404).json({
                status: 404,
                message: 'Product not found'
            });
        }

        const newAnswer = new Answers({
            question_id: question_id,
            user_id: user_id,
            content: content,
        });

        const saveAnswer = await newAnswer.save();

        return res.status(200).json({
            status: 200,
            message: 'Create Answer Success!',
            data: saveAnswer
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});



router.post('/cart-item/add', authenticateToken, async (req, res) => {
    try {
        const { user_id, product_id } = req.body;
        const quantity = parseInt(req.body.quantity, 10);
        if (!user_id || !product_id || !quantity || quantity < 1) {
            return res.status(400).json({
                status: 400,
                message: 'Missing or invalid required fields'
            });
        }
        if (quantity > MAX_QUANTITY_PER_PRODUCT) {
            return res.status(400).json({
                status: 400,
                message: `You can only add up to ${MAX_QUANTITY_PER_PRODUCT} units per product`
            });
        }

        const product = await Products.findById(product_id);
        if (!product) {
            return res.status(404).json({
                status: 404,
                message: 'Product not found'
            });
        }

        let cart = await Carts.findOne({ user_id });

        if (!cart) {
            cart = new Carts({
                user_id: user_id,
                total_price: 0,
                total_items: 0
            });
            cart = await cart.save();
        }

        let cartItem = await CartItems.findOne({ cart_id: cart._id, product_id });

        if (cartItem) {
            cartItem.quantity = Math.min(cartItem.quantity + quantity, MAX_QUANTITY_PER_PRODUCT);
            cartItem.total_price = cartItem.quantity * product.price;
        } else {
            cartItem = new CartItems({
                cart_id: cart._id,
                product_id: product_id,
                quantity: Math.min(quantity, MAX_QUANTITY_PER_PRODUCT),
                price: product.price,
                total_price: Math.min(quantity, MAX_QUANTITY_PER_PRODUCT) * product.price
            });
        }

        await cartItem.save();

        const cartItems = await CartItems.find({ cart_id: cart._id });

        cart.total_items = cartItems.length;
        cart.total_price = cartItems.reduce((sum, item) => sum + item.total_price, 0);

        await cart.save();

        return res.status(200).json({
            status: 200,
            message: 'Product added to cart successfully!',
            data: {
                cart,
                cartItem
            }
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error'
        });
    }
});
router.post('/cart-item/update', authenticateToken, async (req, res) => {
    try {
        const { cart_item_id } = req.body;
        const newQuantity = parseInt(req.body.new_quantity, 10);

        if (!cart_item_id || isNaN(newQuantity) || newQuantity < 1) {
            return res.status(400).json({
                status: 400,
                message: 'Missing or invalid required fields'
            });
        }

        let cartItem = await CartItems.findById(cart_item_id);
        if (!cartItem) {
            return res.status(404).json({ status: 404, message: 'Cart item not found' });
        }
        cartItem.quantity = Math.min(newQuantity, MAX_QUANTITY_PER_PRODUCT);
        cartItem.total_price = cartItem.quantity * cartItem.price;

        await cartItem.save();

        let cart = await Carts.findById(cartItem.cart_id);
        if (!cart) {
            return res.status(404).json({ status: 404, message: 'Cart not found' });
        }

        const cartItems = await CartItems.find({ cart_id: cart._id });

        cart.total_price = cartItems.reduce((sum, item) => sum + item.total_price, 0);

        await cart.save();

        return res.status(200).json({
            status: 200,
            message: 'Cart item updated successfully!',
            data: { cart, cartItem }
        });

    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ status: 500, message: 'Internal Server Error' });
    }
});

router.delete('/cart-item/remove', authenticateToken, async (req, res) => {
    try {
        const { cart_item_id } = req.body;

        if (!cart_item_id) {
            return res.status(400).json({
                status: 400,
                message: 'Missing required field: cart_item_id'
            });
        }

        let cartItem = await CartItems.findById(cart_item_id);
        if (!cartItem) {
            return res.status(404).json({ status: 404, message: 'Cart item not found' });
        }

        let cart = await Carts.findById(cartItem.cart_id);
        if (!cart) {
            return res.status(404).json({ status: 404, message: 'Cart not found' });
        }

        await CartItems.findByIdAndDelete(cart_item_id);

        const cartItems = await CartItems.find({ cart_id: cart._id });

        if (cartItems.length === 0) {
            await Carts.findByIdAndDelete(cart._id);
            return res.status(200).json({
                status: 200,
                message: 'Cart item removed, cart deleted as it was empty',
                data: { cart: null }
            });
        }
        cart.total_price = cartItems.reduce((sum, item) => sum + item.total_price, 0);
        cart.total_items = cartItems.length;

        await cart.save();

        return res.status(200).json({
            status: 200,
            message: 'Cart item removed successfully!',
            data: { cart }
        });

    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ status: 500, message: 'Internal Server Error' });
    }
});



module.exports = router;
