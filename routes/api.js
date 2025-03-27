var express = require('express');
var router = express.Router();

require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { encrypt } = require('../utils/crypto');
const axios = require('axios');

const passwordPattern = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+=|<>?{}[\]~-]).{8,}$/;
const GHN_API = 'https://dev-online-gateway.ghn.vn/shiip/public-api';
const TOKEN_GHN = process.env.GHN_TOKEN;
const SHOP_ID = process.env.GHN_SHOP_ID;

const { checkPhoneVerification, checkUidAndPhoneNumber } = require('../utils/checkPhoneVerification');
const { db, bucket } = require("../firebase/firebaseAdmin");

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
const DiscountCodes = require('../models/discountCodes');
const DiscountConditions = require('../models/discountConditions');
const UserAddress = require('../models/userAddress');
const Orders = require('../models/orders');
const OrderItems = require('../models/orderItems');

const upload = require('../config/common/upload');
const { removeDiacritics } = require('../utils/textUtils');


const MAX_QUANTITY_PER_PRODUCT = 20;
const statusGroups = {
    processing: ["pending", "confirmed", "ready_to_pick"],
    shipping: ["picking", "picked", "delivering", "money_collect_delivering"],
    delivered: ["delivered"],
    returning: ["waiting_to_return", "return", "returned", "return_fail"],
    canceled: ["canceled", "delivery_fail"],
};

function authenticateToken(req, res, next) {
    // if (process.env.NODE_ENV === 'development') {
    //     return next();
    // }
    // return next();
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

// Kiểm tra số điện thoại
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

// Tạo tài khoản
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
        userObj.address = await getUserAddress(user._id);
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


router.put('/user/address/update', authenticateToken, async (req, res) => {
    try {
        //console.log(req.body);
        const { province_id, district_id, ward_id, street_address } = req.body;
        const user_id = req.user_id;

        if (!province_id && !district_id && !ward_id && !street_address) {
            return res.status(400).json({ status: 400, message: "No data to update!" });
        }

        const user = await Users.findById(user_id);
        if (!user) {
            return res.status(404).json({ status: 404, message: "User not found!" });
        }

        let updateData = {};
        if (province_id !== undefined) updateData.province_id = Number(province_id);
        if (district_id !== undefined) updateData.district_id = Number(district_id);
        if (ward_id !== undefined) updateData.ward_id = String(ward_id);
        if (street_address !== undefined) updateData.street_address = street_address;

        let address = await UserAddress.findOne({ user_id });

        if (address) {
            address = await UserAddress.findOneAndUpdate(
                { user_id },
                { $set: updateData },
                { new: true }
            );
        } else {
            address = new UserAddress({
                user_id,
                ...updateData
            });
            await address.save();
        }
        const [province, district, ward] = await Promise.all([
            getProvince(province_id),
            getDistrict(district_id),
            getWard(district_id, ward_id)
        ]);
        const formattedAddress = { ...address.toObject() };
        formattedAddress.province = province;
        formattedAddress.district = district;
        formattedAddress.ward = ward;

        delete formattedAddress.__v;
        // console.log(formattedAddress);
        res.status(200).json({
            status: 200,
            message: "Address updated successfully!",
            data: formattedAddress
        });


    } catch (error) {
        console.error("Error updating address:", error);
        res.status(500).json({ status: 500, message: "Internal server error", error: error.message });
    }
});



// Cập nhật thông tin cá nhân
// router.put('/user/update-profile', authenticateToken, upload.single('avatar'), async (req, res) => {
//     try {
//         const { full_name, date_of_birth, gender, address } = req.body;
//         const file = req.file;

//         const user = await Users.findById(req.user_id);
//         if (!user) {
//             return res.status(404).json({ status: 404, message: "User not found!" });
//         }

//         let updateData = {};
//         if (full_name !== undefined) updateData.full_name = full_name;
//         if (date_of_birth !== undefined) updateData.date_of_birth = date_of_birth;
//         if (gender !== undefined) updateData.gender = gender;
//         if (address !== undefined) updateData.address = address;

//         if (file) {
//             if (user.avatar_url) {
//                 const oldImagePath = path.join(__dirname, '../public', user.avatar_url);
//                 fs.unlink(oldImagePath, (err) => {
//                     if (err && err.code !== 'ENOENT') {
//                         console.error('Error deleting old avatar:', err);
//                     }
//                 });
//             }
//             updateData.avatar_url = `/uploads/${file.filename}`;
//         }

//         const updatedUser = await Users.findByIdAndUpdate(
//             { _id: req.user_id },
//             { $set: updateData },
//             { new: true }
//         );

//         const formattedUser = {
//             ...updatedUser.toObject()
//         };

//         delete formattedUser.__v;
//         delete formattedUser.password;

//         res.status(200).json({
//             status: 200,
//             message: "Profile updated successfully!",
//             data: formattedUser
//         });

//     } catch (error) {
//         console.error("Error updating profile:", error);
//         if (req.file) {
//             fs.unlink(req.file.path, (err) => {
//                 if (err) {
//                     console.error('Error:', err);
//                 }
//             });
//         }
//         res.status(500).json({ status: 500, message: "Internal server error", error: error.message });
//     }
// });


router.put('/user/update-profile', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        const { full_name, date_of_birth, gender, shipping_phone_number } = req.body;
        const file = req.file;
        const user = await Users.findById(req.user_id);
        if (!user) {
            return res.status(404).json({ status: 404, message: "User not found!" });
        }

        let updateData = {};
        if (full_name !== undefined) updateData.full_name = full_name;
        if (date_of_birth !== undefined) updateData.date_of_birth = new Date(date_of_birth);
        if (gender !== undefined) updateData.gender = gender;
        if (shipping_phone_number !== undefined) updateData.shipping_phone_number = shipping_phone_number;

        if (file) {
            if (user.avatar_url) {
                const oldImagePath = user.avatar_url.replace(`https://storage.googleapis.com/${bucket.name}/`, '');
                const oldFile = bucket.file(oldImagePath);

                try {
                    await oldFile.delete();
                } catch (error) {
                    if (error.code !== 404) {
                        console.error("Error deleting old avatar:", error);
                    }
                }
            }

            const fileName = `User_Avatars/${Date.now()}-${file.originalname}`;
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

            updateData.avatar_url = publicUrl;
        }

        const updatedUser = await Users.findByIdAndUpdate(
            { _id: req.user_id },
            { $set: updateData },
            { new: true }
        );

        const formattedUser = {
            ...updatedUser.toObject()
        };

        delete formattedUser.__v;
        delete formattedUser.password;

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






// Đổi mật khẩu
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


// Làm mới token
// router.post('/refresh-token', async (req, res) => {
//     const { refreshToken } = req.body;

//     if (!refreshToken) {
//         return res.status(400).json({
//             status: 400,
//             message: 'Refresh token is required!'
//         });
//     }

//     try {
//         const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
//         const user = await Users.findById(decoded.uid);
//         if (!user || user.refreshToken !== refreshToken) {
//             return res.status(403).json({
//                 status: 403,
//                 message: 'Invalid refresh token!'
//             });
//         }

//         const newAccessToken = jwt.sign(
//             { uid: user._id, phone_number: user.phone_number },
//             process.env.JWT_SECRET,
//             { expiresIn: '1h' }
//         );

//         res.json({
//             status: 200,
//             message: 'Access token refreshed!',
//             data: { newAccessToken }
//         });
//     } catch (err) {
//         return res.status(403).json({ message: 'Invalid refresh token!' });
//     }
// });
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

        const user = await Users.findById(decoded._id);
        if (!user) {
            return res.status(404).json({ status: 404, message: 'User not found!' });
        }

        const newAccessToken = jwt.sign(
            { _id: user._id, phone_number: user.phone_number },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const userObj = user.toObject();
        userObj.address = await getUserAddress(user._id);
        delete userObj.password;

        res.json({
            status: 200,
            message: 'Access token refreshed!',
            data: userObj,
            token: newAccessToken,
            refreshToken: refreshToken
        });

    } catch (err) {
        return res.status(500).json({
            status: 500,
            message: 'Invalid refresh token!'
        });
    }
});



// router.get('/user/cart', authenticateToken, async (req, res) => {
//     try {
//         const user_id = req.user_id;
//         let cart = await Carts.findOne({ user_id });
//         if (!cart) {
//             return res.status(404).json({ status: 404, message: 'Cart not found' });
//         }

//         let cartItems = await CartItems.find({ cart_id: cart._id })
//             .populate({
//                 path: 'product_id',
//                 select: '_id name category_id brand_id product_type_id',
//                 populate: [
//                     { path: 'category_id', select: '_id name' },
//                     { path: 'brand_id', select: '_id name description' },
//                     { path: 'product_type_id', select: '_id name' }
//                 ]
//             });

//         const productIds = cartItems.map(item => item.product_id._id);

//         const primaryImages = await ProductImages.find({
//             product_id: { $in: productIds },
//             is_primary: true
//         });

//         const imageMap = primaryImages.reduce((acc, img) => {
//             acc[img.product_id] = img;
//             return acc;
//         }, {});

//         cartItems = cartItems.map(item => {
//             let product = item.product_id.toObject();
//             let productDetails = {
//                 _id: product._id,
//                 name: product.name,
//                 category_id: product.category_id ? product.category_id._id : null,
//                 brand_id: product.brand_id ? product.brand_id._id : null,
//                 product_type_id: product.product_type_id ? product.product_type_id._id : null,
//                 category: product.category_id ? {
//                     _id: product.category_id._id,
//                     name: product.category_id.name
//                 } : null,
//                 brand: product.brand_id ? {
//                     _id: product.brand_id._id,
//                     name: product.brand_id.name,
//                     description: product.brand_id.description
//                 } : null,
//                 product_type: product.product_type_id ? {
//                     _id: product.product_type_id._id,
//                     name: product.product_type_id.name
//                 } : null,
//                 images: [imageMap[product._id]] || null
//             };

//             return {
//                 ...item.toObject(),
//                 product_id: product._id,
//                 product: productDetails
//             };
//         });

//         let cartData = cart.toObject();
//         cartData.cartItems = cartItems;

//         return res.status(200).json({
//             status: 200,
//             message: 'Cart items retrieved successfully!',
//             data: cartData
//         });

//     } catch (error) {
//         console.error("Error:", error);
//         return res.status(500).json({ status: 500, message: 'Internal Server Error' });
//     }
// });


// router.get('/user/cart', authenticateToken, async (req, res) => {
//     try {
//         const user_id = req.user_id;
//         let cart = await Carts.findOne({ user_id });

//         if (!cart) {
//             return res.status(404).json({ status: 404, message: 'Cart not found' });
//         }

//         let cartItems = await CartItems.find({ cart_id: cart._id });

//         let updatedCartItems = await Promise.all(cartItems.map(async (item) => {
//             let product = await getDiscountedProductById(item.product_id);

//             return {
//                 ...item.toObject(),
//                 product
//             };
//         }));

//         let cartData = cart.toObject();
//         cartData.cartItems = updatedCartItems;

//         return res.status(200).json({
//             status: 200,
//             message: 'Cart items retrieved successfully!',
//             data: cartData
//         });

//     } catch (error) {
//         console.error("Error:", error);
//         return res.status(500).json({ status: 500, message: 'Internal Server Error' });
//     }
// });


router.get('/user/cart', authenticateToken, async (req, res) => {
    try {
        const user_id = req.user_id;
        const cart = await Carts.findOne({ user_id }).lean();

        if (!cart) {
            return res.status(404).json({ status: 404, message: 'Cart not found' });
        }

        let cartItems = await CartItems.find({ cart_id: cart._id }).lean();

        const updatedCartItems = await Promise.all(cartItems.map(async (item) => {
            const product = await getDiscountedProductById(item.product_id);

            let shouldUpdate = false;

            if (item.original_price !== product.price) {
                shouldUpdate = true;
            }

            if (!shouldUpdate && item.discounted_price !== product.discounted_price) {
                shouldUpdate = true;
            }

            let product_discounted_price = item.original_price;

            if (product.discounted_price == null || product.discount == null) {
                product_discounted_price = item.original_price;
            } else if (product.discount) {
                if (product.discount.type === "percent") {
                    product_discounted_price = Math.round(item.original_price * (1 - product.discount.value / 100));
                } else if (product.discount.type === "fixed") {
                    product_discounted_price = Math.max(0, item.original_price - product.discount.value);
                }
            }

            if (shouldUpdate || item.discounted_price !== product_discounted_price) {
                item.discounted_price = product_discounted_price;

                await CartItems.updateOne(
                    { _id: item._id },
                    { $set: { discounted_price: product_discounted_price } }
                );
            }

            return { ...item, product };
        }));

        return res.status(200).json({
            status: 200,
            message: 'Cart items retrieved successfully!',
            data: { ...cart, cartItems: updatedCartItems }
        });

    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ status: 500, message: 'Internal Server Error' });
    }
});






// ----- Product ----- //

// Lấy sản phẩm theo id


// router.get('/product/top-rated/:limit?', authenticateToken, async (req, res) => {
//     try {
//         let limit = parseInt(req.params.limit) || 10;
//         limit = limit > 20 ? 20 : limit;

//         const products = await Products.find()
//             .sort({ average_rating: -1 })
//             .limit(limit)
//             .populate('category_id')
//             .populate('brand_id')
//             .populate('product_type_id')
//             .lean();

//         const productIds = products.map(product => product._id);
//         const primaryImages = await ProductImages.find({
//             product_id: { $in: productIds },
//             is_primary: true
//         }).lean();

//         const productsWithDetails = products.map(product => {
//             const primaryImage = primaryImages.find(img => img.product_id.equals(product._id));

//             return {
//                 ...product,
//                 images: primaryImage ? [primaryImage] : [],
//                 category_id: product.category_id._id,
//                 brand_id: product.brand_id._id,
//                 product_type_id: product.product_type_id._id,
//                 category: {
//                     _id: product.category_id._id,
//                     name: product.category_id.name,
//                 },
//                 brand: {
//                     _id: product.brand_id._id,
//                     name: product.brand_id.name,
//                     description: product.brand_id.description,
//                 },
//                 product_type: {
//                     _id: product.product_type_id._id,
//                     name: product.product_type_id.name,
//                 }
//             };
//         });

//         return res.status(200).json({
//             status: 200,
//             message: 'Get Top Rated Products Success!',
//             data: productsWithDetails
//         });
//     } catch (error) {
//         console.error("Error:", error);
//         return res.status(500).json({
//             status: 500,
//             message: 'Internal Server Error'
//         });
//     }
// });


// Top sản phẩm được đánh giá cao nhất

router.get('/product/top-rated', authenticateToken, async (req, res) => {
    try {
        let { page = 1, limit = 10 } = req.query;

        const pageNumber = parseInt(page);
        let limitNumber = parseInt(limit);

        if (limitNumber > 20) {
            limitNumber = 20;
        }

        const skip = (pageNumber - 1) * limitNumber;

        const products = await Products.find()
            .sort({ average_rating: -1 })
            .skip(skip)
            .limit(limitNumber)
            .populate('category_id', '_id name')
            .populate('brand_id', '_id name description')
            .populate('product_type_id', '_id name')
            .lean();

        const totalProducts = await Products.countDocuments();
        const totalPages = Math.ceil(totalProducts / limitNumber);

        const formattedProducts = await Promise.all(products.map(p => getProductDetails(p._id)));

        return res.status(200).json({
            status: 200,
            message: 'Get Top Rated Products Success!',
            data: {
                currentPage: pageNumber,
                totalPages,
                totalProducts,
                hasNextPage: pageNumber < totalPages,
                hasPrevPage: pageNumber > 1,
                data: formattedProducts
            }
        });

    } catch (error) {
        console.error("Error fetching top-rated products:", error);
        return res.status(500).json({ status: 500, message: "Internal Server Error" });
    }
});

const getProductDetails = async (product_id) => {
    try {
        const product = await Products.findById(product_id)
            .populate('category_id', '_id name')
            .populate('brand_id', '_id name description')
            .populate('product_type_id', '_id name')
            .lean();

        if (!product) {
            return null;
        }

        const primaryImage = await ProductImages.findOne({
            product_id: product._id,
            is_primary: true
        }).lean();

        return {
            _id: product._id,
            name: product.name,
            description: product.description,
            price: product.price,
            average_rating: product.average_rating,
            category_id: product.category_id?._id,
            brand_id: product.brand_id?._id,
            product_type_id: product.product_type_id?._id,
            category: product.category_id,
            brand: product.brand_id,
            product_type: product.product_type_id,
            images: primaryImage ? [primaryImage] : [],
            created_at: product.createdAt,
            updated_at: product.updatedAt
        };

    } catch (error) {
        console.error("Error fetching product details:", error);
        return null;
    }
};


// Lấy sản phẩm theo id


// router.get('/product/most-reviewed/:limit?', authenticateToken, async (req, res) => {
//     try {
//         let limit = parseInt(req.params.limit) || 10;
//         limit = limit > 20 ? 20 : limit;

//         const products = await Products.find()
//             .sort({ review_count: -1 })
//             .limit(limit)
//             .populate('category_id')
//             .populate('brand_id')
//             .populate('product_type_id')
//             .lean();

//         const productIds = products.map(product => product._id);
//         const primaryImages = await ProductImages.find({
//             product_id: { $in: productIds },
//             is_primary: true
//         }).lean();

//         const productsWithDetails = products.map(product => {
//             const primaryImage = primaryImages.find(img => img.product_id.equals(product._id));

//             return {
//                 ...product,
//                 images: primaryImage ? [primaryImage] : [],
//                 category_id: product.category_id._id,
//                 brand_id: product.brand_id._id,
//                 product_type_id: product.product_type_id._id,
//                 category: {
//                     _id: product.category_id._id,
//                     name: product.category_id.name,
//                 },
//                 brand: {
//                     _id: product.brand_id._id,
//                     name: product.brand_id.name,
//                     description: product.brand_id.description,
//                 },
//                 product_type: {
//                     _id: product.product_type_id._id,
//                     name: product.product_type_id.name,
//                 }
//             };
//         });

//         return res.status(200).json({
//             status: 200,
//             message: 'Get Most Reviewed Products Success!',
//             data: productsWithDetails
//         });
//     } catch (error) {
//         console.error("Error:", error);
//         return res.status(500).json({
//             status: 500,
//             message: 'Internal Server Error'
//         });
//     }
// });

// Các sản phẩm có nhiều đánh giá nhất
router.get('/product/most-reviewed', authenticateToken, async (req, res) => {
    try {
        let { page = 1, limit = 10 } = req.query;
        page = parseInt(page);
        limit = Math.min(parseInt(limit), 20); // Giới hạn tối đa 20 sản phẩm
        const skip = (page - 1) * limit;

        const totalProducts = await Products.countDocuments();
        const totalPages = Math.ceil(totalProducts / limit);

        const products = await Products.find()
            .sort({ review_count: -1 }) // Sắp xếp theo số lượng đánh giá giảm dần
            .skip(skip)
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
                category_id: product.category_id?._id,
                brand_id: product.brand_id?._id,
                product_type_id: product.product_type_id?._id,
                category: product.category_id
                    ? { _id: product.category_id._id, name: product.category_id.name }
                    : null,
                brand: product.brand_id
                    ? { _id: product.brand_id._id, name: product.brand_id.name, description: product.brand_id.description }
                    : null,
                product_type: product.product_type_id
                    ? { _id: product.product_type_id._id, name: product.product_type_id.name }
                    : null
            };
        });

        return res.status(200).json({
            status: 200,
            message: 'Get Most Reviewed Products Success!',
            data: {
                currentPage: page,
                totalPages,
                totalProducts,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                products: productsWithDetails,
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

// Lấy sản phẩm theo id
// router.get('/product/:id', authenticateToken, async function (req, res, next) {
//     try {
//         const { id } = req.params;
//         const product = await Products.findById(id);
//         if (!product) {
//             return res.status(404).json({
//                 status: 404,
//                 message: 'Product not found!'
//             });
//         }

//         const primaryImage = await ProductImages.findOne({ product_id: id, is_primary: true })
//             .lean();

//         delete primaryImage.__v;

//         const formattedProduct = {
//             ...product.toObject(),
//             create_at: product.createdAt,
//             update_at: product.updatedAt,
//             images: primaryImage ? [primaryImage] : []
//         };
//         delete formattedProduct.__v;
//         delete formattedProduct.createdAt;
//         delete formattedProduct.updatedAt;

//         return res.status(200).json({
//             status: 200,
//             message: 'Get Product Success!',
//             data: formattedProduct
//         });
//     } catch (error) {
//         console.error("Error:", error);
//         return res.status(500).json({
//             status: 500,
//             message: 'Internal Server Error'
//         });
//     }
// });
router.get('/product/:id', authenticateToken, async function (req, res, next) {
    try {
        const { id } = req.params;
        const product = await Products.findById(id)
            .populate('category_id', '_id name')
            .populate('brand_id', '_id name description')
            .populate('product_type_id', '_id name')
            .lean();

        if (!product) {
            return res.status(404).json({
                status: 404,
                message: 'Product not found!'
            });
        }

        const primaryImage = await ProductImages.findOne({ product_id: id, is_primary: true }).lean();

        if (primaryImage) delete primaryImage.__v;

        const formattedProduct = {
            ...product,
            create_at: product.createdAt,
            update_at: product.updatedAt,
            images: primaryImage ? [primaryImage] : [],
            category_id: product.category_id?._id,
            brand_id: product.brand_id?._id,
            product_type_id: product.product_type_id?._id,
            category: product.category_id || null,
            brand: product.brand_id || null,
            product_type: product.product_type_id || null
        };

        delete formattedProduct.__v;

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


// Lấy chi tiết sản phẩm
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

// Lấy 
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

        const userIds = [...new Set(productReviews.map(r => r.user_id))];

        const users = await Users.find({ _id: { $in: userIds } }, '_id full_name avatar_url').lean();
        const userMap = new Map(users.map(user => [user._id.toString(), user]));

        const formattedReviews = productReviews.map(review => ({
            _id: review._id,
            user_id: review.user_id,
            product_id: review.product_id,
            rating: review.rating,
            review: review.review,
            created_at: review.createdAt,
            user: userMap.get(review.user_id.toString()) || null,
        }));

        // const formattedReviews = productReviews.map(review => ({
        //     _id: review._id,
        //     user_id: review.user_id,
        //     product_id: review.product_id,
        //     rating: review.rating,
        //     review: review.review,
        //     created_at: review.createdAt,
        // })).map(productReview => {
        //     delete productReview.__v;
        //     delete productReview.createdAt;
        //     delete productReview.updatedAt;
        //     return productReview;
        // });

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

        const userIds = [...new Set([...questions.map(q => q.user_id)])];
        const users = await Users.find({ _id: { $in: userIds } }, '_id full_name avatar_url').lean();
        const userMap = new Map(users.map(user => [user._id.toString(), user]));

        const questionIds = questions.map(q => q._id);
        const answers = await Answers.find({ question_id: { $in: questionIds } }).lean();

        const answerUserIds = [...new Set(answers.map(a => a.user_id))];
        const answerUsers = await Users.find({ _id: { $in: answerUserIds } }, '_id full_name avatar_url').lean();
        const answerUserMap = new Map(answerUsers.map(user => [user._id.toString(), user]));

        const answersMap = new Map();
        answers.forEach(answer => {
            if (!answersMap.has(answer.question_id.toString())) {
                answersMap.set(answer.question_id.toString(), []);
            }
            answersMap.get(answer.question_id.toString()).push({
                _id: answer._id,
                user_id: answer.user_id,
                content: answer.content,
                created_at: answer.created_at,
                user: answerUserMap.get(answer.user_id.toString()) || null
            });
        });

        const formattedQuestions = questions.map(question => {
            return {
                _id: question._id,
                user_id: question.user_id,
                product_id: question.product_id,
                content: question.content,
                created_at: question.createdAt,
                status: question.status,
                user: userMap.get(question.user_id.toString()) || null,
                answers: answersMap.get(question._id.toString()) || []
            };
        });

        return res.status(200).json({
            status: 200,
            message: 'Get Product Questions Success!',
            data: formattedQuestions
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

// router.get('/category/:id/products', async (req, res) => {
//     try {
//         const { id } = req.params;
//         const { page = 1, limit = 10 } = req.query;

//         const pageNumber = parseInt(page);
//         const limitNumber = parseInt(limit);
//         const skip = (pageNumber - 1) * limitNumber;

//         const products = await Products.find({ category_id: id })
//             .skip(skip)
//             .limit(limitNumber)
//             .lean();

//         const totalProducts = await Products.countDocuments({ category_id: id });
//         const totalPages = Math.ceil(totalProducts / limitNumber);

//         res.json({
//             status: 200,
//             message: "Success",
//             data: {
//                 products,
//                 pagination: {
//                     currentPage: pageNumber,
//                     totalPages,
//                     totalProducts,
//                     hasNextPage: pageNumber < totalPages,
//                     hasPrevPage: pageNumber > 1
//                 }
//             }
//         });

//     } catch (error) {
//         console.error("Error fetching products:", error);
//         res.status(500).json({ status: 500, message: "Internal Server Error", error: error.message });
//     }
// });





router.get('/category/:id/products', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        let { page = 1, limit = 10 } = req.query;

        const pageNumber = parseInt(page) || 1;
        let limitNumber = Math.min(parseInt(limit) || 10, 20);
        const skip = (pageNumber - 1) * limitNumber;

        const products = await Products.find({ category_id: id })
            .populate({ path: 'category_id', select: '_id name' })
            .populate({ path: 'brand_id', select: '_id name description' })
            .populate({ path: 'product_type_id', select: '_id name' })
            .skip(skip)
            .limit(limitNumber)
            .lean();

        const productIds = products.map(product => product._id);

        const primaryImages = await ProductImages.find({
            product_id: { $in: productIds },
            is_primary: true
        });

        const imageMap = primaryImages.reduce((acc, img) => {
            acc[img.product_id] = img;
            return acc;
        }, {});

        const formattedProducts = products.map(product => ({
            _id: product._id,
            name: product.name,
            category_id: product.category_id ? product.category_id._id : null,
            brand_id: product.brand_id ? product.brand_id._id : null,
            product_type_id: product.product_type_id ? product.product_type_id._id : null,
            category: product.category_id ? {
                _id: product.category_id._id,
                name: product.category_id.name
            } : null,
            brand: product.brand_id ? {
                _id: product.brand_id._id,
                name: product.brand_id.name,
                description: product.brand_id.description
            } : null,
            product_type: product.product_type_id ? {
                _id: product.product_type_id._id,
                name: product.product_type_id.name
            } : null,
            price: product.price,
            short_description: product.short_description,
            specification: product.specification,
            origin_country: product.origin_country,
            manufacturer: product.manufacturer,
            average_rating: product.average_rating,
            review_count: product.review_count,
            images: imageMap[product._id] ? [imageMap[product._id]] : []
        }));

        const totalProducts = await Products.countDocuments({ category_id: id });
        const totalPages = Math.ceil(totalProducts / limitNumber);

        res.json({
            status: 200,
            message: "Success",
            data: {
                currentPage: pageNumber,
                totalPages,
                totalProducts,
                hasNextPage: pageNumber < totalPages,
                hasPrevPage: pageNumber > 1,
                data: formattedProducts,
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


router.get('/brand/:id/products', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        let { page = 1, limit = 10 } = req.query;

        const pageNumber = parseInt(page);
        let limitNumber = parseInt(limit);

        if (limitNumber > 20) {
            limitNumber = 20;
        }

        const skip = (pageNumber - 1) * limitNumber;

        const products = await Products.find({ brand_id: id })
            .populate('category_id', '_id name')
            .populate('brand_id', '_id name description')
            .populate('product_type_id', '_id name')
            .skip(skip)
            .limit(limitNumber)
            .lean();

        const totalProducts = await Products.countDocuments({ brand_id: id });
        const totalPages = Math.ceil(totalProducts / limitNumber);

        const productIds = products.map(p => p._id);
        const primaryImages = await ProductImages.find({
            product_id: { $in: productIds },
            is_primary: true
        }).lean();

        const imageMap = primaryImages.reduce((acc, img) => {
            acc[img.product_id] = img;
            return acc;
        }, {});

        const formattedProducts = products.map(product => ({
            _id: product._id,
            name: product.name,
            description: product.description,
            price: product.price,
            category_id: product.category_id._id,
            brand_id: product.brand_id._id,
            product_type_id: product.product_type_id._id,
            category: product.category_id,
            brand: product.brand_id,
            product_type: product.product_type,
            primary_image: imageMap[product._id] || null,
            create_at: product.createdAt,
            update_at: product.updatedAt
        }));

        return res.status(200).json({
            status: 200,
            message: 'Get Products by Brand Success!',
            data: {
                currentPage: pageNumber,
                totalPages,
                totalProducts,
                hasNextPage: pageNumber < totalPages,
                hasPrevPage: pageNumber > 1,
                data: formattedProducts
            }
        });

    } catch (error) {
        console.error("Error fetching brand products:", error);
        return res.status(500).json({ status: 500, message: "Internal Server Error" });
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
        const { product_id, content } = req.body;
        const user_id = req.user_id;
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
            return res.status(401).json({
                status: 401,
                message: 'Question not found'
            });
        }

        const user = await Users.findById(user_id);
        if (!user) {
            return res.status(404).json({
                status: 404,
                message: 'User not found'
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
        const user_id = req.user_id;
        const product_id = req.body.product_id;
        const quantity = parseInt(req.body.quantity, 10);
        if (!user_id || !product_id || !quantity || quantity < 1) {
            return res.status(400).json({
                status: 400,
                message: 'Missing or invalid required fields'
            });
        }
        if (quantity > MAX_QUANTITY_PER_PRODUCT) {
            return res.status(401).json({
                status: 401,
                message: `You can only add up to ${MAX_QUANTITY_PER_PRODUCT} units per product`
            });
        }

        const product = await getDiscountedProductById(product_id);
        if (!product) {
            return res.status(404).json({
                status: 404,
                message: 'Product not found'
            });
        }
        const original_price = product.price;
        const discounted_price = product.discounted_price || original_price;

        let cart = await Carts.findOne({ user_id });

        if (!cart) {
            cart = new Carts({
                user_id: user_id,
            });
            cart = await cart.save();
        }

        let cartItem = await CartItems.findOne({ cart_id: cart._id, product_id });

        if (cartItem) {
            cartItem.quantity = Math.min(cartItem.quantity + quantity, MAX_QUANTITY_PER_PRODUCT);
        } else {
            cartItem = new CartItems({
                cart_id: cart._id,
                product_id: product_id,
                product: getDiscountedProductById(product_id),
                quantity: Math.min(quantity, MAX_QUANTITY_PER_PRODUCT),
                original_price,
                discounted_price
            });
        }

        await cartItem.save();

        const cartItems = await CartItems.find({ cart_id: cart._id });
        cart.total_items = cartItems.length;
        await cart.save();

        return res.status(200).json({
            status: 200,
            message: 'Product added to cart successfully!',
            data: cartItem
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
        const user_id = req.user_id;
        const newQuantity = parseInt(req.body.new_quantity, MAX_QUANTITY_PER_PRODUCT);

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

        let cart = await Carts.findById(cartItem.cart_id);
        if (!cart || cart.user_id.toString() !== user_id) {
            return res.status(403).json({ status: 403, message: 'Unauthorized to update this cart item' });
        }
        if (!cart) {
            return res.status(404).json({ status: 404, message: 'Cart not found' });
        }


        cartItem.quantity = Math.min(newQuantity, MAX_QUANTITY_PER_PRODUCT);

        await cartItem.save();



        const cartItems = await CartItems.find({ cart_id: cart._id });
        cart.total_items = cartItems.length;
        await cart.save();

        const product = await getDiscountedProductById(cartItem.product_id);
        cartItem = cartItem.toObject();
        cartItem.product = product;

        return res.status(200).json({
            status: 200,
            message: 'Cart item updated successfully!',
            data: cartItem
        });

    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ status: 500, message: 'Internal Server Error' });
    }
});


// router.delete('/cart-item/remove', authenticateToken, async (req, res) => {
//     try {
//         const { cart_item_id } = req.query;
//         const userId = req.user_id;

//         if (!cart_item_id) {
//             return res.status(400).json({ status: 400, message: 'Missing required field: cart_item_id' });
//         }

//         const cartItem = await CartItems.findById(cart_item_id);
//         if (!cartItem) {
//             return res.status(404).json({ status: 404, message: 'Cart item not found' });
//         }
//         await CartItems.findByIdAndDelete(cart_item_id);

//         let cartItems = await CartItems.find({ cart_id: cartItem.cart_id })
//             .populate({
//                 path: 'product_id',
//                 select: '_id name category_id brand_id product_type_id',
//                 populate: [
//                     { path: 'category_id', select: '_id name' },
//                     { path: 'brand_id', select: '_id name description' },
//                     { path: 'product_type_id', select: '_id name' }
//                 ]
//             });
//         if (cartItems.length === 0) {
//             await Carts.findByIdAndDelete(cartItem.cart_id);
//             return res.status(200).json({
//                 status: 200,
//                 message: 'Cart item removed, cart deleted as it was empty',
//                 data: null
//             });
//         }

//         const cart = await Carts.findOneAndUpdate(
//             { _id: cartItem.cart_id, user_id: userId },
//             {
//                 total_price: cartItems.reduce((sum, item) => sum + item.total_price, 0),
//                 total_items: cartItems.length
//             },
//             { new: true }
//         );

//         if (!cart) {
//             return res.status(404).json({ status: 404, message: 'Cart not found or access denied' });
//         }


//         cartItems = cartItems.map(item => {
//             return {
//                 ...item.toObject(),
//                 product_id: item._id,
//                 product: getDiscountedProductById(item._id)
//             };
//         });

//         let cartData = cart.toObject();
//         cartData.cartItems = cartItems;
//         return res.status(200).json({
//             status: 200,
//             message: 'Cart item removed successfully!',
//             data: cartData
//         });

//     } catch (error) {
//         console.error("Error:", error);
//         return res.status(500).json({ status: 500, message: 'Internal Server Error' });
//     }
// });






router.delete('/cart-item/remove', authenticateToken, async (req, res) => {
    try {
        const { cart_item_id } = req.query;
        const user_id = req.user_id;

        if (!cart_item_id) {
            return res.status(400).json({ status: 400, message: 'Missing required field: cart_item_id' });
        }

        const cartItem = await CartItems.findById(cart_item_id);
        if (!cartItem) {
            return res.status(404).json({ status: 404, message: 'Cart item not found' });
        }

        let cart = await Carts.findById(cartItem.cart_id);
        if (!cart || cart.user_id.toString() !== user_id) {
            return res.status(403).json({ status: 403, message: 'Unauthorized to remove this cart item' });
        }

        await CartItems.findByIdAndDelete(cart_item_id);

        let cartItems = await CartItems.find({ cart_id: cart._id });
        if (cartItems.length === 0) {
            await Carts.findByIdAndDelete(cart._id);
            return res.status(200).json({ status: 200, message: 'Cart item removed, cart deleted as it was empty', data: null });
        }
        cart.total_items = cartItems.length;
        await cart.save();

        return res.status(200).json({ status: 200, message: 'Cart item removed successfully!', data: cart });

    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ status: 500, message: 'Internal Server Error' });
    }
});





router.get('/search', authenticateToken, async (req, res) => {
    try {
        let { keyword, order = 'asc' } = req.query;

        if (!keyword) {
            return res.status(400).json({
                status: 400,
                message: 'Missing required field: keyword'
            });
        }

        const normalizedKeyword = removeDiacritics(keyword);
        const words = normalizedKeyword.trim().split(/\s+/);

        let products = await Products.find()
            .populate({ path: 'category_id', select: '_id name' })
            .populate({ path: 'brand_id', select: '_id name description' })
            .populate({ path: 'product_type_id', select: '_id name' })
            .lean();

        let categories = await Categories.find().lean();
        let brands = await Brands.find().lean();

        let filteredProducts = products.filter(product => {
            const normalizedName = removeDiacritics(product.name);
            return words.every(word => normalizedName.includes(word));
        });

        let filteredCategories = categories.filter(category => {
            const normalizedCategoryName = removeDiacritics(category.name);
            return words.every(word => normalizedCategoryName.includes(word));
        });

        let filteredBrands = brands.filter(brand => {
            const normalizedBrandName = removeDiacritics(brand.name);
            return words.every(word => normalizedBrandName.includes(word));
        });

        const sortOrder = order === 'desc' ? -1 : 1;
        filteredProducts.sort((a, b) => (a.price - b.price) * sortOrder);

        const productIds = filteredProducts.map(product => product._id);

        const primaryImages = await ProductImages.find({
            product_id: { $in: productIds },
            is_primary: true
        });

        const imageMap = primaryImages.reduce((acc, img) => {
            acc[img.product_id] = img;
            return acc;
        }, {});

        const formattedProducts = filteredProducts.map(product => ({
            _id: product._id,
            name: product.name,
            category_id: product.category_id ? product.category_id._id : null,
            brand_id: product.brand_id ? product.brand_id._id : null,
            product_type_id: product.product_type_id ? product.product_type_id._id : null,
            category: product.category_id ? {
                _id: product.category_id._id,
                name: product.category_id.name
            } : null,
            brand: product.brand_id ? {
                _id: product.brand_id._id,
                name: product.brand_id.name,
                description: product.brand_id.description
            } : null,
            product_type: product.product_type_id ? {
                _id: product.product_type_id._id,
                name: product.product_type_id.name
            } : null,
            price: product.price,
            short_description: product.short_description,
            average_rating: product.average_rating,
            review_count: product.review_count,
            images: imageMap[product._id] ? [imageMap[product._id]] : []
        }));

        return res.status(200).json({
            status: 200,
            message: 'Search completed successfully!',
            data: {
                products: formattedProducts,
                categories: filteredCategories,
                brands: filteredBrands
            }
        });

    } catch (error) {
        console.error("Search error:", error);
        return res.status(500).json({ status: 500, message: 'Internal Server Error' });
    }
});








router.get("/products/discounted", async (req, res) => {
    try {
        let { page = 1, limit = 10 } = req.query;
        const pageNumber = parseInt(page);
        let limitNumber = parseInt(limit);
        if (limitNumber > 20) limitNumber = 20;
        const skip = (pageNumber - 1) * limitNumber;

        const activeDiscounts = await DiscountCodes.find({
            start_date: { $lte: new Date() },
            end_date: { $gte: new Date() },
            type: { $ne: "free_shipping" }
        }).lean();

        const productIds = new Set();
        const categoryIds = new Set();
        const brandIds = new Set();

        activeDiscounts.forEach(discount => {
            if (discount.applies_to === "product") {
                discount.target_ids.forEach(id => productIds.add(id.toString()));
            }
            if (discount.applies_to === "category") {
                discount.target_ids.forEach(id => categoryIds.add(id.toString()));
            }
            if (discount.applies_to === "brand") {
                discount.target_ids.forEach(id => brandIds.add(id.toString()));
            }
            if (discount.applies_to === "all") {
                productIds.clear();
                categoryIds.clear();
                brandIds.clear();
            }
        });

        let productFilter = {};
        if (productIds.size) {
            productFilter._id = { $in: [...productIds] };
        }
        if (categoryIds.size) {
            productFilter.category_id = { $in: [...categoryIds] };
        }
        if (brandIds.size) {
            productFilter.brand_id = { $in: [...brandIds] };
        }

        const products = await Products.find(productFilter)
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limitNumber)
            .populate("category_id", "_id name")
            .populate("brand_id", "_id name description")
            .populate("product_type_id", "_id name")
            .lean();

        const totalProducts = await Products.countDocuments(productFilter);
        const totalPages = Math.ceil(totalProducts / limitNumber);

        const productIdsArray = products.map(p => p._id);
        const primaryImages = await ProductImages.find({
            product_id: { $in: productIdsArray },
            is_primary: true
        }).lean();

        const imageMap = primaryImages.reduce((acc, img) => {
            acc[img.product_id] = img;
            return acc;
        }, {});

        const validProducts = [];
        for (const product of products) {
            const discount = activeDiscounts.find(d =>
                d.applies_to === "all" ||
                (d.applies_to === "product" && productIds.has(product._id.toString())) ||
                (d.applies_to === "category" && categoryIds.has(product.category_id.toString())) ||
                (d.applies_to === "brand" && brandIds.has(product.brand_id.toString()))
            );

            if (!discount) continue;

            const conditions = await DiscountConditions.find({ discount_id: discount._id }).lean();
            let isValid = true;

            for (const condition of conditions) {
                if (condition.condition_key === "excluded_products" && condition.value.includes(product._id.toString())) {
                    isValid = false;
                    break;
                }
                if (condition.condition_key === "excluded_categories" && condition.value.includes(product.category_id.toString())) {
                    isValid = false;
                    break;
                }
                if (condition.condition_key === "excluded_brands" && condition.value.includes(product.brand_id.toString())) {
                    isValid = false;
                    break;
                }
                if (condition.condition_key === "day_of_week") {
                    const today = new Date().toLocaleString("en-US", { weekday: "long" }).toLowerCase();
                    if (!condition.value.includes(today)) {
                        isValid = false;
                        break;
                    }
                }
                if (condition.condition_key === "specific_hour_range") {
                    const now = new Date();
                    const currentHour = now.getHours();
                    const fromHour = parseInt(condition.value.from.split(":")[0], 10);
                    const toHour = parseInt(condition.value.to.split(":")[0], 10);
                    if (currentHour < fromHour || currentHour >= toHour) {
                        isValid = false;
                        break;
                    }
                }
            }

            if (isValid) {

                let discountedPrice = product.price;

                if (discount && typeof product.price === "number") {
                    if (discount.type === "percent" && typeof discount.value === "number") {
                        discountedPrice = product.price * (1 - discount.value / 100);
                    } else if (discount.type === "fixed" && typeof discount.value === "number") {
                        discountedPrice = Math.max(0, product.price - discount.value);
                    }
                }


                discountedPrice = Math.round(discountedPrice);

                validProducts.push({
                    _id: product._id,
                    name: product.name,
                    description: product.description,
                    price: product.price,
                    discounted_price: discountedPrice,
                    discount_code: {
                        _id: discount._id,
                        code: discount.code,
                        type: discount.type,
                        value: discount.value,
                        applies_to: discount.applies_to,
                        start_date: discount.start_date,
                        end_date: discount.end_date,
                        usage_limit: discount.usage_limit || null,
                    },
                    average_rating: product.average_rating,
                    category_id: product.category_id._id,
                    brand_id: product.brand_id._id,
                    product_type_id: product.product_type_id._id,
                    category: product.category_id,
                    brand: product.brand_id,
                    product_type: product.product_type_id,
                    images: imageMap[product._id] ? [imageMap[product._id]] : []
                });
            }
        }

        return res.status(200).json({
            status: 200,
            message: "Get Discounted Products Success!",
            data: {
                currentPage: pageNumber,
                totalPages,
                totalProducts: validProducts.length,
                hasNextPage: pageNumber < totalPages,
                hasPrevPage: pageNumber > 1,
                data: validProducts
            }
        });

    } catch (error) {
        console.error("Error fetching discounted products:", error);
        return res.status(500).json({ status: 500, message: "Internal Server Error" });
    }
});



const getDiscountedProductById = async (productId) => {
    try {
        const product = await Products.findById(productId)
            .populate("category_id", "_id name")
            .populate("brand_id", "_id name description")
            .populate("product_type_id", "_id name")
            .lean();

        if (!product) return null;

        // Lấy danh sách ảnh và ánh xạ ảnh chính của từng sản phẩm
        const productImages = await ProductImages.find({ product_id: product._id }).lean();
        const imageMap = productImages.reduce((acc, img) => {
            if (!acc[img.product_id]) {
                acc[img.product_id] = img; // Chọn ảnh đầu tiên làm ảnh chính
            }
            return acc;
        }, {});

        const activeDiscounts = await DiscountCodes.find({
            start_date: { $lte: new Date() },
            end_date: { $gte: new Date() },
            type: { $ne: "free_shipping" }
        }).lean();

        let discount = activeDiscounts.find(d =>
            d.applies_to === "all" ||
            (d.applies_to === "product" && d.target_ids.includes(product._id.toString())) ||
            (d.applies_to === "category" && d.target_ids.includes(product.category_id._id.toString())) ||
            (d.applies_to === "brand" && d.target_ids.includes(product.brand_id._id.toString()))
        );

        let discountedPrice = null;
        let finalDiscount = null;

        if (discount) {
            const conditions = await DiscountConditions.find({ discount_id: discount._id }).lean();
            let isValid = true;

            for (const condition of conditions) {


                if (condition.condition_key === "excluded_products" && condition.value.includes(product._id.toString())) {
                    isValid = false;
                    break;
                }
                if (condition.condition_key === "excluded_categories" && condition.value.includes(product.category_id._id.toString())) {
                    isValid = false;
                    break;
                }
                if (condition.condition_key === "excluded_brands" && condition.value.includes(product.brand_id._id.toString())) {
                    isValid = false;
                    break;
                }
                if (condition.condition_key === "day_of_week") {
                    const today = new Date().toLocaleString("en-US", { weekday: "long" }).toLowerCase();
                    if (!condition.value.includes(today)) {
                        isValid = false;
                        break;
                    }
                }
                if (condition.condition_key === "specific_hour_range") {
                    const now = new Date();
                    const currentHour = now.getHours();
                    const fromHour = parseInt(condition.value.from.split(":")[0], 10);
                    const toHour = parseInt(condition.value.to.split(":")[0], 10);
                    if (currentHour < fromHour || currentHour >= toHour) {
                        isValid = false;
                        break;
                    }
                }
            }

            if (isValid) {
                if (discount.type === "percent") {
                    discountedPrice = Math.round(product.price * (1 - discount.value / 100));
                } else if (discount.type === "fixed") {
                    discountedPrice = Math.max(0, product.price - discount.value);
                }

                let usageLeft = null;
                if (discount.max_usage) {
                    const usageCount = await DiscountUsage.countDocuments({ discount_id: discount._id });
                    usageLeft = Math.max(0, discount.max_usage - usageCount);
                }

                finalDiscount = {
                    _id: discount._id,
                    code: discount.code,
                    type: discount.type,
                    value: discount.value,
                    applies_to: discount.applies_to,
                    start_date: discount.start_date,
                    end_date: discount.end_date,
                    usage_limit: discount.usage_limit || null,
                    usage_left: usageLeft,
                };
            }
        }

        return {
            _id: product._id,
            name: product.name,
            description: product.description,
            price: product.price,
            discounted_price: discountedPrice,
            discount: finalDiscount,
            category_id: product.category_id._id,
            brand_id: product.brand_id._id,
            product_type_id: product.product_type_id._id,
            category: product.category_id,
            brand: product.brand_id,
            product_type: product.product_type_id,
            images: imageMap[product._id] ? [imageMap[product._id]] : []
        };

    } catch (error) {
        console.error("Error fetching discounted product by ID:", error);
        return null;
    }
};


const getProvince = async (province_id) => {
    try {
        const response = await axios.get(`${GHN_API}/master-data/province`, {
            headers: { Token: TOKEN_GHN, ShopId: SHOP_ID }
        });
        const province = response.data.data.find(p => p.ProvinceID === province_id);
        return province ? { ProvinceID: province.ProvinceID, ProvinceName: province.ProvinceName } : null;
    } catch (error) {
        console.error('Lỗi khi lấy tỉnh:', error.response?.data || error.message);
        return null;
    }
};

const getDistrict = async (district_id) => {
    try {
        const response = await axios.get(`${GHN_API}/master-data/district`, {
            headers: { Token: TOKEN_GHN, ShopId: SHOP_ID }
        });
        const district = response.data.data.find(d => d.DistrictID === district_id);
        return district ? { DistrictID: district.DistrictID, ProvinceID: district.ProvinceID, DistrictName: district.DistrictName } : null;
    } catch (error) {
        console.error('Lỗi khi lấy quận/huyện:', error.response?.data || error.message);
        return null;
    }
};

const getWard = async (district_id, ward_id) => {
    try {
        const response = await axios.post(`${GHN_API}/master-data/ward`, { district_id: Number(district_id) }, {
            headers: { Token: TOKEN_GHN, ShopId: SHOP_ID }
        });

        const ward = response.data.data.find(w => w.WardCode === String(ward_id));

        return ward ? { WardCode: ward.WardCode, DistrictID: ward.DistrictID, WardName: ward.WardName } : null;
    } catch (error) {
        console.error('Lỗi khi lấy phường/xã:', error.response?.data || error.message);
        return null;
    }
};



const getUserAddress = async (user_id) => {
    try {
        const address = await UserAddress.findOne({ user_id }).lean();
        if (!address) {
            return null;
        }

        const { _id, province_id, district_id, ward_id, street_address } = address;

        const [province, district, ward] = await Promise.all([
            getProvince(province_id),
            getDistrict(district_id),
            getWard(district_id, ward_id)
        ]);

        return {
            _id,
            province_id,
            district_id,
            ward_id: String(ward_id),
            street_address,
            province,
            district,
            ward
        };
    } catch (error) {
        console.error('Lỗi khi lấy địa chỉ người dùng:', error.message);
        return null;
    }
};


const getShopDistrict = async () => {
    try {
        const response = await axios.get(`${GHN_API}/v2/shop/all`, {
            headers: {
                "Token": TOKEN_GHN
            }
        });

        if (response.data.code === 200 && response.data.data.shops.length > 0) {
            return response.data.data.shops[0].district_id;
        } else {
            return null;
        }
    } catch (error) {
        console.error("Lỗi khi gọi API GHN:", error.message);
        return null;
    }
};

const getShopInfo = async () => {
    try {
        const response = await axios.get(`${GHN_API}/v2/shop/all`, {
            headers: { "Token": TOKEN_GHN }
        });

        if (response.data.code === 200 && response.data.data.shops.length > 0) {
            const shop = response.data.data.shops[0];
            const districtInfo = await getDistrict(shop.district_id);
            const wardInfo = await getWard(shop.district_id, shop.ward_code);
            return {
                from_name: shop.name,
                from_phone: shop.phone,
                from_address: shop.address,
                from_ward_name: wardInfo.WardName,
                from_ward_code: wardInfo.WardCode,
                from_district_name: districtInfo.DistrictName,
                from_district_id: shop.district_id
            };
        } else {
            return null;
        }
    } catch (error) {
        console.error("Lỗi khi lấy thông tin cửa hàng từ GHN:", error.message);
        return null;
    }
};




router.get("/shop-info", async (req, res) => {
    try {
        const shopInfo = await getShopInfo();
        if (!shopInfo) {
            return res.status(500).json({ status: 500, message: "Không lấy được thông tin cửa hàng từ GHN" });
        }

        res.status(200).json({ status: 200, message: "Lấy thông tin shop thành công", data: shopInfo });
    } catch (error) {
        console.error("Lỗi khi lấy thông tin cửa hàng:", error);
        res.status(500).json({ status: 500, message: "Lỗi server", error: error.message });
    }
});



router.post("/calculate-shipping-fee", async (req, res) => {
    try {
        const { to_district_id, to_ward_code } = req.body;

        if (!to_district_id || !to_ward_code) {
            return res.status(400).json({ status: 400, message: "Missing required fields: to_district_id, to_ward_code" });
        }

        const shippingFee = await calculateShippingFee(to_district_id, to_ward_code);
        return res.status(200).json({
            code: 200,
            message: "Shipping fee calculated successfully!",
            data: { total: shippingFee }

        });

    } catch (error) {
        return res.status(500).json({ status: 500, message: error.message });
    }
});


router.post("/orders/create", authenticateToken, async (req, res) => {
    try {
        const { payment_method, items } = req.body;
        const user_id = req.user_id;

        if (!user_id) {
            return res.status(401).json({ status: 401, message: "Unauthorized" });
        }

        const user = await Users.findById(user_id);
        if (!user) {
            return res.status(404).json({ status: 404, message: "User not found" });
        }

        const userAddress = await UserAddress.findOne({ user_id });
        if (!userAddress) {
            return res.status(404).json({ status: 404, message: "User address not found" });
        }

        const to_name = user.full_name;
        const to_phone = user.shipping_phone_number;
        const to_address = userAddress.street_address;
        const to_district_id = userAddress.district_id;
        const to_ward_code = userAddress.ward_id;

        if (!to_name || !to_phone || !to_address || !to_district_id || !to_ward_code || !payment_method || !items || items.length === 0) {
            return res.status(400).json({ status: 400, message: "Missing required fields" });
        }

        const shipping_fee = await calculateShippingFee(to_district_id, to_ward_code);

        const totalItemPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const total_price = totalItemPrice + shipping_fee;

        const newOrder = new Orders({
            user_id,
            to_name,
            to_phone,
            to_address,
            to_district_id,
            to_ward_code,
            payment_method,
            shipping_fee,
            total_price,
            payment_status: payment_method === "ONLINE" ? "pending" : null
        });

        await newOrder.save();

        const orderItems = items.map(item => ({
            order_id: newOrder._id,
            product_id: item.product_id,
            quantity: item.quantity,
            price: item.price
        }));

        await OrderItems.insertMany(orderItems);
        await CartItems.deleteMany({ user_id, _id: { $in: items.map(item => item._id) } });
        await db.ref("new_orders").set({ _id: newOrder._id.toString(), timestamp: Date.now() });

        let qrCodeUrl = null;
        if (payment_method === "ONLINE") {
            qrCodeUrl = generateVietQRQuickLink(newOrder, user_id);
        }

        return res.status(200).json({
            status: 200,
            message: "Order created successfully",
            data: qrCodeUrl,
        });

    } catch (error) {
        console.error("Error creating order:", error);
        return res.status(500).json({
            status: 500,
            message: "Internal Server Error",
            error: error.response?.data || error.message
        });
    }
});

function generateVietQRQuickLink(order, userId) {
    const bankId = process.env.BANK_ID;
    const accountNo = process.env.ACCOUNT_NO;
    const template = process.env.TEMPLATE || "compact";
    const addInfo = encodeURIComponent(`${userId}${order._id}`);

    return `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.png?amount=${order.total_price}&addInfo=${addInfo}`;
}

router.get("/orders/get-payment-qrcode/:order_id", authenticateToken, async (req, res) => {
    try {
        const { order_id } = req.params;
        const user_id = req.user_id;

        if (!user_id) {
            return res.status(401).json({ status: 401, message: "Unauthorized" });
        }

        const order = await Orders.findOne({ _id: order_id, user_id });

        if (!order) {
            return res.status(404).json({ status: 404, message: "Order not found" });
        }

        if (order.payment_status === "paid") {
            return res.status(400).json({ status: 400, message: "Order already paid" });
        }

        const qrCodeUrl = generateVietQRQuickLink(order, user_id);

        return res.status(200).json({
            status: 200,
            message: "QR code generated successfully",
            data: qrCodeUrl,
        });

    } catch (error) {
        console.error("Error generating QR code:", error);
        return res.status(500).json({
            status: 500,
            message: "Internal Server Error",
            error: error.message,
        });
    }
});


router.get("/test/qr", authenticateToken ,(req, res) => {
    const amount = req.query.amount; 
    const orderId = "67e3bc09f19d55474a9727b1";
    const userId = req.user_id;

    const qrCodeUrl = generateVietQRQuickLink(amount, orderId, userId);
    res.json({ status: 200, qr_code: qrCodeUrl });
});

// router.post("/orders/payment", authenticateToken, async (req, res) => {
//     try {
//         const { payment_method, total_price } = req.body;
//         const user_id = req.user_id;

//         if (!user_id || !payment_method || !total_price) {
//             return res.status(400).json({ status: 400, message: "Missing required fields" });
//         }

//         const paymentUrl = await createPaymentLink(user_id, total_price);

//         res.status(200).json({ status: 200, message: "Payment link generated", data: { paymentUrl } });
//     } catch (error) {
//         console.error("Error processing payment:", error);
//         res.status(500).json({ status: 500, message: "Internal Server Error" });
//     }
// });
// router.post("/orders/payment/callback", async (req, res) => {
//     try {
//         const { user_id, payment_status, payment_method, total_price } = req.body;

//         if (payment_status !== "success") {
//             return res.status(400).json({ status: 400, message: "Payment failed or canceled" });
//         }

//         const user = await Users.findById(user_id);
//         if (!user) return res.status(404).json({ status: 404, message: "User not found" });

//         const userAddress = await UserAddress.findOne({ user_id });
//         if (!userAddress) return res.status(404).json({ status: 404, message: "User address not found" });

//         const order = new Orders({
//             user_id,
//             to_name: user.full_name,
//             to_phone: user.shipping_phone_number,
//             to_address: userAddress.street_address,
//             to_district_id: userAddress.district_id,
//             to_ward_code: userAddress.ward_id,
//             payment_method,
//             shipping_fee: await calculateShippingFee(userAddress.district_id, userAddress.ward_id),
//             total_price
//         });

//         await order.save();
//         res.status(200).json({ status: 200, message: "Order created successfully", data: order });

//     } catch (error) {
//         console.error("Error creating order after payment:", error);
//         res.status(500).json({ status: 500, message: "Internal Server Error" });
//     }
// });


router.get("/orders", authenticateToken, async (req, res) => {
    try {
        const { group } = req.query;
        const user_id = req.user_id;

        if (!statusGroups[group]) {
            return res.status(400).json({
                status: 400,
                message: "Invalid order status group!"
            });
        }

        const orders = await Orders.find({
            user_id: user_id,
            status: { $in: statusGroups[group] }
        }).sort({ created_at: -1 }).lean();

        if (orders.length === 0) {
            return res.status(200).json({
                status: 200,
                message: "No orders found",
                data: []
            });
        }

        const orderIds = orders.map(order => order._id);

        const orderItems = await OrderItems.find({ order_id: { $in: orderIds } })
            .lean();

        const itemsWithProducts = await Promise.all(orderItems.map(async (item) => {
            const product = await getProductDetails(item.product_id);
            return { ...item, product };
        }));

        const ordersWithItems = orders.map(order => ({
            ...order,
            items: itemsWithProducts.filter(item => item.order_id.toString() === order._id.toString())
        }));
        
        res.status(200).json({
            status: 200,
            message: "Success",
            data: ordersWithItems
        });

    } catch (error) {
        console.error("Error retrieving orders:", error);
        res.status(500).json({
            status: 500,
            message: "Internal server error!"
        });
    }
});

router.get("/orders/:id/detail", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user_id;

        const order = await Orders.findOne({ _id: id, user_id }).lean();
        if (!order) {
            return res.status(404).json({
                status: 404,
                message: "Order not found!"
            });
        }

        const orderItems = await OrderItems.find({ order_id: id }).lean();

        const itemsWithProducts = await Promise.all(orderItems.map(async (item) => {
            const product = await getProductDetails(item.product_id);
            return { ...item, product };
        }));
        const district = await getDistrict(order.to_district_id);
        const province = await getProvince(district.ProvinceID);
        const ward = await getWard(order.to_district_id, order.to_ward_code);
        res.status(200).json({
            status: 200,
            message: "Success",
            data: {
                ...order,
                district,
                province,
                ward,
                items: itemsWithProducts
            }
        });

    } catch (error) {
        console.error("Error retrieving order details:", error);
        res.status(500).json({
            status: 500,
            message: "Internal server error!"
        });
    }
});


router.post("/orders/:id/cancel", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const order = await Orders.findById(id);

        if (!order) {
            return res.status(404).json({
                status: 404,
                message: "Order not found!"
            });
        }

        if (order.user_id.toString() !== req.user_id) {
            return res.status(403).json({
                status: 403,
                message: "You do not have permission to cancel this order!"
            });
        }

        if (!statusGroups.processing.includes(order.status)) {
            return res.status(400).json({
                status: 400,
                message: "This order cannot be canceled at its current stage!"
            });
        }

        if (order.status === "pending") {
            order.status = "canceled";
        } else {
            order.cancel_request = true;
        }
        await order.save();

        res.status(200).json({
            status: 200,
            message: "Order cancellation request submitted successfully!"
        });

    } catch (error) {
        console.error("Error canceling order:", error);
        res.status(500).json({
            status: 500,
            message: "Internal server error!"
        });
    }
});


const calculateShippingFee = async (to_district_id, to_ward_code) => {
    try {
        const from_district_id = await getShopDistrict();
        if (!from_district_id) throw new Error("Cannot retrieve shop address");

        const servicesResponse = await axios.get(`${GHN_API}/v2/shipping-order/available-services`, {
            params: { shop_id: SHOP_ID, from_district: from_district_id, to_district: to_district_id },
            headers: { "Token": TOKEN_GHN }
        });

        const services = servicesResponse.data.data;
        if (!services || services.length === 0) throw new Error("No available shipping services");

        const service = services[0];
        const fixedWeight = 1;
        const fixedLength = 1;
        const fixedWidth = 1;
        const fixedHeight = 1;
        const shippingFeeResponse = await axios.post(`${GHN_API}/v2/shipping-order/fee`, {
            from_district_id,
            to_district_id: parseInt(to_district_id, 10),
            to_ward_code: String(to_ward_code),
            service_id: service.service_id,
            service_type_id: service.service_type_id,
            weight: fixedWeight,
            length: fixedLength,
            width: fixedWidth,
            height: fixedHeight,
            insurance_value: 1000000,
            cod_failed_amount: 0,
            coupon: null
        }, {
            headers: { "Content-Type": "application/json", "Token": TOKEN_GHN, "ShopId": SHOP_ID }
        });

        return shippingFeeResponse.data.data.total;
    } catch (error) {
        console.error("Error calculating shipping fee:", error);
        throw new Error(error.response?.data?.message || "Shipping fee calculation failed");
    }
};



module.exports = { router, getUserAddress, getShopInfo };