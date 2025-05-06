const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongoose').Types;
const Orders = require('../models/orders');
const Products = require('../models/products');
const OrderItems = require('../models/orderItems');
const StockEntries = require('../models/stockEntries');
const ProductProductTypes = require('../models/productProductTypes');
const ProductImages = require('../models/productImages');
const Categories = require('../models/categories');
const Brands = require('../models/brands');

const { startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, subWeeks, parseISO } = require('date-fns');

const { format } = require('date-fns');
const viLocale = require('date-fns/locale/vi');
const offsetMs = 7 * 60 * 60 * 1000;


router.get('/revenue', async function (req, res, next) {
    const { timePeriod, startDate, paymentMethod, endDate } = req.query;
    try {
        const now = new Date();

        let matchStageDelivered = { status: 'delivered' };
        if (paymentMethod) {
            matchStageDelivered.payment_method = paymentMethod;
        }
        let matchStageAll = {};
        let dateFilter = {};

        if (timePeriod) {

            switch (timePeriod) {
                case 'last_week': {
                    const now = new Date();
                    const day = now.getUTCDay();
                    const diff = (day === 0 ? 7 : day);

                    const start = new Date(now);
                    start.setUTCDate(start.getUTCDate() - diff - 6);
                    start.setUTCHours(0, 0, 0, 0);

                    const end = new Date(start);
                    end.setUTCDate(end.getUTCDate() + 6);
                    end.setUTCHours(23, 59, 59, 999);

                    dateFilter.created_at = {
                        $gte: new Date(start.getTime() + offsetMs),
                        $lte: new Date(end.getTime() + offsetMs)
                    };
                    break;
                }


                case 'last_month': {
                    const now = new Date();
                    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
                    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
                    dateFilter.created_at = {
                        $gte: new Date(start.getTime() - offsetMs),
                        $lte: new Date(end.getTime() - offsetMs)
                    };
                    break;
                }

                case 'this_month': {
                    const now = new Date();
                    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
                    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                    dateFilter.created_at = {
                        $gte: new Date(start.getTime() - offsetMs),
                        $lte: new Date(end.getTime() - offsetMs)
                    };
                    break;
                }

                case 'last_3_months': {
                    const now = new Date();
                    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0);
                    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                    dateFilter.created_at = {
                        $gte: new Date(start.getTime() - offsetMs),
                        $lte: new Date(end.getTime() - offsetMs)
                    };
                    break;
                }

                case 'custom': {
                    if (startDate && endDate) {
                        const start = new Date(startDate + "T00:00:00+07:00");
                        const end = new Date(endDate + "T23:59:59+07:00");
                        dateFilter.created_at = { $gte: start, $lte: end };
                    } else if (startDate) {
                        const start = new Date(startDate + "T00:00:00+07:00");
                        dateFilter.created_at = { $gte: start };
                    } else if (endDate) {
                        const end = new Date(endDate + "T23:59:59+07:00");
                        dateFilter.created_at = { $lte: end };
                    }
                    break;

                }
            }
            if (dateFilter) {
                matchStageDelivered.created_at = dateFilter.created_at;
                matchStageAll.created_at = dateFilter.created_at;
            }
        }

        const revenueData = await Orders.aggregate([
            { $match: matchStageDelivered },
            {
                $lookup: {
                    from: "orderItems",
                    localField: "_id",
                    foreignField: "order_id",
                    as: "items"
                }
            },
            { $unwind: "$items" },
            { $unwind: "$items.batches" },
            {
                $lookup: {
                    from: "stockEntries",
                    let: {
                        ppid: "$items.product_product_type_id",
                        batch: "$items.batches.batch_number"
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$product_product_type_id", "$$ppid"] },
                                        { $eq: ["$batch_number", "$$batch"] }
                                    ]
                                }
                            }
                        },
                        { $limit: 1 }
                    ],
                    as: "stock_info"
                }
            },
            {
                $addFields: {
                    import_price: {
                        $ifNull: [{ $arrayElemAt: ["$stock_info.import_price", 0] }, 0]
                    },
                    date: {
                        // $dateToString: { format: "%Y-%m-%d", date: "$created_at" }
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$created_at",
                            timezone: "+07:00"
                          }                          
                    }
                }
            },
            {
                $group: {
                    _id: {
                        orderId: "$_id",
                        date: "$date",
                        status: "$status",
                        total_price: "$total_price",
                        shipping_fee: "$shipping_fee"
                    },
                    total_cost: {
                        $sum: {
                            $multiply: ["$items.batches.quantity", "$import_price"]
                        }
                    }
                }
            },
            {
                $group: {
                    _id: "$_id.date",
                    totalRevenue: {
                        $sum: {
                            $subtract: ["$_id.total_price", { $ifNull: ["$_id.shipping_fee", 0] }]
                        }
                    },
                    totalCost: { $sum: "$total_cost" },
                    orderCount: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);


        const revenueLabels = revenueData.map(r => format(new Date(r._id), 'dd/MM/yyyy', { locale: viLocale.vi }));
        const revenueValues = revenueData.map(r => r.totalRevenue);
        const orderValues = revenueData.map(r => r.orderCount);
        const totalRevenue = revenueData.reduce((sum, r) => sum + r.totalRevenue, 0);
        const totalCost = revenueData.reduce((sum, r) => sum + r.totalCost, 0);
        const totalOrders = revenueData.reduce((sum, r) => sum + r.orderCount, 0);
        const totalProfit = totalRevenue - totalCost;

        const numberOfDays = revenueData.length || 1;

        const averageRevenue = Math.round(totalRevenue / numberOfDays);
        const averageProfit = Math.round(totalProfit / numberOfDays);
        const averageOrders = Math.round(totalOrders / numberOfDays);

        const orderStatusCount = await Orders.aggregate([
            { $match: matchStageAll },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                }
            }
        ]);

        const statusMap = {
            delivered: 0,
            delivering: 0,
            pending: 0,
            canceled: 0
        };

        orderStatusCount.forEach(item => {
            statusMap[item._id] = item.count;
        });

        res.render('dashboards/list', {
            totalOrders,
            totalRevenue,
            totalProfit,
            orders: orderValues,
            averageRevenue,
            averageProfit,
            averageOrders,
            revenueLabels: JSON.stringify(revenueLabels),
            revenueData: JSON.stringify(revenueValues),
            orderLabels: JSON.stringify(revenueLabels),
            orderData: JSON.stringify(orderValues),
            orderStatusData: JSON.stringify([
                statusMap.delivered,
                statusMap.delivering,
                statusMap.pending,
                statusMap.canceled
            ]),
            filters: { timePeriod, startDate, paymentMethod, endDate }
        });
    } catch (err) {
        console.error(err);
        next(err);
    }
});



// router.get('/products', async function (req, res, next) {
//     try {
//         //let { sortBy, status, perPage = 10, page = 1, timePeriod, startDate, endDate } = req.query;
//         let { sortBy, status, perPage = 10, page = 1, timePeriod, startDate, endDate, category, brand, minPrice, maxPrice } = req.query;

//         sortBy = sortBy || 'best_selling';
//         status = status || 'all';

//         page = parseInt(page);
//         perPage = parseInt(perPage);

//         let statusMatch = {};
//         if (status !== 'all') {
//             statusMatch['product.status'] = status;
//         }
//         const matchProduct = {};
//         // if (status !== 'all') {
//         //     matchProduct['product.status'] = status;
//         // }
//         if (category) {
//             matchProduct['product.category_id'] = new ObjectId(category);
//         }
//         if (brand) {
//             matchProduct['product.brand_id'] = new ObjectId(brand);
//         }
//         let dateFilter = {};
//         const now = new Date();

//         if (timePeriod) {
//             switch (timePeriod) {
//                 case 'last_week':
//                     dateFilter.created_at = {
//                         $gte: startOfWeek(subWeeks(now, 1)),
//                         $lte: endOfWeek(subWeeks(now, 1))
//                     };
//                     break;
//                 case 'last_month':
//                     dateFilter.created_at = {
//                         $gte: startOfMonth(subMonths(now, 1)),
//                         $lte: endOfMonth(subMonths(now, 1))
//                     };
//                     break;
//                 case 'this_month':
//                     dateFilter.created_at = {
//                         $gte: startOfMonth(now),
//                         $lte: endOfMonth(now)
//                     };
//                     break;
//                 case 'last_3_months':
//                     dateFilter.created_at = {
//                         $gte: subMonths(startOfMonth(now), 3),
//                         $lte: endOfMonth(now)
//                     };
//                     break;
//                 case 'custom':
//                     if (startDate && endDate) {
//                         const start = new Date(`${startDate}T00:00:00`);
//                         const end = new Date(`${endDate}T23:59:59`);
//                         dateFilter.created_at = {
//                             $gte: start,
//                             $lte: end
//                         };
//                     }
//                     break;
//             }
//         }

//         const matchOrder = {
//             'order.status': { $in: ['delivered'] },
//             ...(dateFilter.created_at && {
//                 'order.created_at': dateFilter.created_at
//             })
//         };

//         // Các tùy chọn sắp xếp
//         const sortOptions = {
//             best_selling: { sold_quantity: -1 },
//             worst_selling: { sold_quantity: 1 },
//             highest_revenue: { total_revenue: -1 },
//             lowest_revenue: { total_revenue: 1 },
//             highest_rating: { 'product.average_rating': -1 }
//         };

//         const aggregatePipeline = [
//             {
//                 $lookup: {
//                     from: 'orders',
//                     localField: 'order_id',
//                     foreignField: '_id',
//                     as: 'order'
//                 }
//             },
//             { $unwind: '$order' },
//             { $match: matchOrder },
//             {
//                 $lookup: {
//                     from: 'productProductTypes',
//                     localField: 'product_product_type_id',
//                     foreignField: '_id',
//                     as: 'ppt'
//                 }
//             },
//             { $unwind: '$ppt' },
//             {
//                 $match: {
//                     ...matchProduct,
//                     ...(minPrice || maxPrice) && {
//                         'ppt.price': {
//                             ...(minPrice && { $gte: parseFloat(minPrice) }),
//                             ...(maxPrice && { $lte: parseFloat(maxPrice) })
//                         }
//                     }
//                 }
//             },
//             {
//                 $lookup: {
//                     from: 'productTypes',
//                     localField: 'ppt.product_type_id',
//                     foreignField: '_id',
//                     as: 'product_type'
//                 }
//             },
//             { $unwind: '$product_type' },
//             {
//                 $group: {
//                     _id: '$ppt._id', // mỗi loại sản phẩm
//                     sold_quantity: { $sum: '$quantity' },
//                     total_revenue: { $sum: { $multiply: ['$quantity', '$price'] } },
//                     product_id: { $first: '$ppt.product_id' },
//                     product_type_name: { $first: '$product_type.name' },
//                     price: { $first: '$ppt.price' },
//                     earliest_order: { $min: '$created_at' }
//                 }
//             },
//             {
//                 $lookup: {
//                     from: 'products',
//                     localField: 'product_id',
//                     foreignField: '_id',
//                     as: 'product'
//                 }
//             },
//             // { $unwind: '$product' },
//             // { $match: { ...matchProduct, ...statusMatch } },
//             // { $sort: sortOptions[sortBy] || { 'product.created_at': -1 } },
//             { $unwind: '$product' },

//             // Lọc theo category, brand, status
//             ...(Object.keys(matchProduct).length
//               ? [{ $match: Object.entries(matchProduct).reduce((acc, [k, v]) => {
//                   acc[`product.${k}`] = v;
//                   return acc;
//                 }, {}) }]
//               : []),

//             // Sắp xếp
//             {
//               $sort: sortOptions[sortBy] || { 'product.created_at': -1 },
//             },          
//             {
//                 $project: {
//                     _id: 1,
//                     sold_quantity: 1,
//                     total_revenue: 1,
//                     product_type_name: 1,
//                     price: 1,
//                     product: {
//                         _id: '$product._id',
//                         name: '$product.name',
//                         status: '$product.status',
//                         average_rating: '$product.average_rating',
//                         review_count: '$product.review_count',
//                         short_description: '$product.short_description',
//                         created_at: '$product.created_at'
//                     }
//                 }
//             },
//             { $skip: (page - 1) * perPage },
//             { $limit: perPage }
//         ];

//         // Lấy dữ liệu + tổng số loại sản phẩm
//         const [products, totalCount] = await Promise.all([
//             OrderItems.aggregate(aggregatePipeline),
//             OrderItems.aggregate([
//                 {
//                     $lookup: {
//                         from: 'orders',
//                         localField: 'order_id',
//                         foreignField: '_id',
//                         as: 'order'
//                     }
//                 },
//                 { $unwind: '$order' },
//                 { $match: matchOrder },
//                 {
//                     $lookup: {
//                         from: 'productProductTypes',
//                         localField: 'product_product_type_id',
//                         foreignField: '_id',
//                         as: 'ppt'
//                     }
//                 },
//                 { $unwind: '$ppt' },
//                 {
//                     $match: {
//                         ...matchProduct,
//                         ...(minPrice || maxPrice) && {
//                             'ppt.price': {
//                                 ...(minPrice && { $gte: parseFloat(minPrice) }),
//                                 ...(maxPrice && { $lte: parseFloat(maxPrice) })
//                             }
//                         }
//                     }
//                 },
//                 {
//                     $group: {
//                         _id: '$ppt._id'
//                     }
//                 },
//                 { $count: 'total' }
//             ])
//         ]);

//         const total = totalCount[0]?.total || 0;
//         const totalPages = Math.ceil(total / perPage);

//         const productIds = products.map(p => p.product._id.toString());
//         const images = await ProductImages.find({
//             product_id: { $in: productIds },
//             is_primary: true
//         }).lean();

//         const imageMap = Object.fromEntries(
//             images.map(img => [img.product_id.toString(), img.image_url])
//         );
//         const finalProducts = products.map(p => ({
//             ...p.product,
//             _id: p._id,
//             sold_quantity: p.sold_quantity,
//             total_revenue: p.total_revenue,
//             product_type_name: p.product_type_name,
//             image: imageMap[p.product._id.toString()],
//             price: p.price
//         }));
//         const categories = await Categories.find();
//         const brands = await Brands.find();
//         res.render('dashboards/products', {
//             products: finalProducts,
//             currentPage: page,
//             totalPages,
//             perPage,
//             total,
//             categories,
//             brands,
//             filters: {
//                 sortBy,
//                 status,
//                 timePeriod,
//                 startDate,
//                 endDate,
//                 category,
//                 brand,
//                 minPrice,
//                 maxPrice
//             }
//         });

//     } catch (err) {
//         console.error(err);
//         res.status(500).render('error', { message: 'Lỗi máy chủ. Vui lòng thử lại sau.' });
//     }
// });











router.get('/products', async function (req, res, next) {
    try {
        let {
            search,
            sortBy,
            status,
            limit = 10,
            page = 1,
            timePeriod,
            startDate,
            endDate,
            category,
            brand,
            filterField,
            minValue,
            maxValue,
        } = req.query;

        let normalizedSearch = '';
        if (search) {
            search = search.trim();
            normalizedSearch = normalizeText(search);
        }

        sortBy = sortBy || 'best_selling';
        page = parseInt(page);
        limit = parseInt(limit);

        let dateFilter = {};

        if (timePeriod) {
            const now = new Date();

            switch (timePeriod) {
                case 'last_week': {
                    const day = now.getUTCDay();
                    const diff = day === 0 ? 7 : day;

                    const start = new Date(now);
                    start.setUTCDate(now.getUTCDate() - diff - 6);
                    start.setUTCHours(0, 0, 0, 0);

                    const end = new Date(start);
                    end.setUTCDate(start.getUTCDate() + 6);
                    end.setUTCHours(23, 59, 59, 999);

                    dateFilter.created_at = {
                        $gte: new Date(start.getTime() + offsetMs),
                        $lte: new Date(end.getTime() + offsetMs)
                    };
                    break;
                }

                case 'last_month': {
                    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
                    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
                    dateFilter.created_at = {
                        $gte: new Date(start.getTime() - offsetMs),
                        $lte: new Date(end.getTime() - offsetMs)
                    };
                    break;
                }

                case 'this_month': {
                    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
                    const end = new Date();
                    dateFilter.created_at = {
                        $gte: new Date(start.getTime() - offsetMs),
                        $lte: new Date(end.getTime() - offsetMs)
                    };
                    break;
                }

                case 'last_3_months': {
                    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0);
                    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                    dateFilter.created_at = {
                        $gte: new Date(start.getTime() - offsetMs),
                        $lte: new Date(end.getTime() - offsetMs)
                    };
                    break;
                }

                case 'custom': {
                    const filter = {};
                    if (startDate) {
                        const start = new Date(startDate + "T00:00:00+07:00");
                        filter.$gte = start;
                    }
                    if (endDate) {
                        const end = new Date(endDate + "T23:59:59+07:00");
                        filter.$lte = end;
                    }
                    if (Object.keys(filter).length) {
                        dateFilter.created_at = filter;
                    }
                    break;
                }
            }
        }



        const matchOrder = {
            'order.status': { $in: ['delivered'] },
            ...(dateFilter.created_at && {
                'order.created_at': dateFilter.created_at,
            }),
        };

        const sortOptions = {
            best_selling: { sold_quantity: -1 },
            worst_selling: { sold_quantity: 1 },
            highest_revenue: { total_revenue: -1 },
            lowest_revenue: { total_revenue: 1 },
            highest_rating: { 'product.average_rating': -1 },
        };


        if (sortBy === 'unsold') {
            if (sortBy === 'unsold') {
                const soldProductIdsResult = await OrderItems.aggregate([
                    {
                        $lookup: {
                            from: 'orders',
                            localField: 'order_id',
                            foreignField: '_id',
                            as: 'order',
                        },
                    },
                    { $unwind: '$order' },
                    {
                        $match: {
                            'order.status': { $in: ['delivered'] },
                            ...(timePeriod && dateFilter.created_at && {
                                'order.created_at': dateFilter.created_at,
                            }),
                        },
                    },
                    {
                        $lookup: {
                            from: 'productProductTypes',
                            localField: 'product_product_type_id',
                            foreignField: '_id',
                            as: 'ppt',
                        },
                    },
                    { $unwind: '$ppt' },
                    {
                        $group: {
                            _id: null,
                            productIds: { $addToSet: '$ppt.product_id' },
                        },
                    },
                ]);

                const soldProductIds = soldProductIdsResult[0]?.productIds || [];

                const productFilter = {
                    _id: { $nin: soldProductIds },
                    ...(status && status !== 'all' ? { status } : {}),
                    ...(category ? { category_id: new ObjectId(category) } : {}),
                    ...(brand ? { brand_id: new ObjectId(brand) } : {}),
                };

                const [products, total] = await Promise.all([
                    Products.find(productFilter)
                        .sort({ created_at: -1 })
                        .skip((page - 1) * limit)
                        .limit(limit)
                        .lean(),
                    Products.countDocuments(productFilter),
                ]);

                const productIds = products.map(p => p._id.toString());

                const productTypes = await ProductProductTypes.find({
                    product_id: { $in: productIds },
                    ...(filterField && filterField === 'price' && (minValue || maxValue)
                        ? {
                            price: {
                                ...(minValue && { $gte: parseFloat(minValue) }),
                                ...(maxValue && { $lte: parseFloat(maxValue) }),
                            },
                        }
                        : {}),
                })
                    .populate('product_type_id')
                    .lean();

                const productTypeMap = Object.fromEntries(
                    productTypes.map(ppt => [ppt.product_id.toString(), ppt])
                );

                const images = await ProductImages.find({
                    product_id: { $in: productIds },
                    is_primary: true,
                }).lean();

                const imageMap = Object.fromEntries(
                    images.map(img => [img.product_id.toString(), img.image_url])
                );

                const finalProducts = products.map(p => {
                    const ppt = productTypeMap[p._id.toString()];
                    return {
                        ...p,
                        _id: p?._id,
                        sold_quantity: 0,
                        total_revenue: 0,
                        product_type_name: ppt?.product_type_id?.name || '',
                        image: imageMap[p._id.toString()],
                        price: ppt?.price || 0,
                    };
                });
                const categories = await Categories.find().collation({ locale: 'vi', strength: 1 }).sort({ name: 1 });
                const brands = await Brands.find().collation({ locale: 'vi', strength: 1 }).sort({ name: 1 });


                return res.render('dashboards/products', {
                    products: finalProducts,
                    currentPage: page,
                    totalPages: Math.ceil(total / limit),
                    limit,
                    total,
                    categories,
                    brands,
                    filters: {
                        sortBy,
                        status,
                        timePeriod,
                        startDate,
                        endDate,
                        category,
                        brand,
                        filterField,
                        minValue,
                        maxValue,
                    },
                });
            }
        }
        const aggregatePipeline = [
            {
                $lookup: {
                    from: 'orders',
                    localField: 'order_id',
                    foreignField: '_id',
                    as: 'order',
                },
            },
            { $unwind: '$order' },
            { $match: matchOrder },
            {
                $lookup: {
                    from: 'productProductTypes',
                    localField: 'product_product_type_id',
                    foreignField: '_id',
                    as: 'ppt',
                },
            },
            { $unwind: '$ppt' },

            ...(filterField && filterField === 'price' && (minValue || maxValue)
                ? [
                    {
                        $match: {
                            'ppt.price': {
                                ...(minValue && { $gte: parseFloat(minValue) }),
                                ...(maxValue && { $lte: parseFloat(maxValue) }),
                            },
                        },
                    },
                ]
                : []),

            {
                $lookup: {
                    from: 'productTypes',
                    localField: 'ppt.product_type_id',
                    foreignField: '_id',
                    as: 'product_type',
                },
            },
            { $unwind: '$product_type' },
            {
                $group: {
                    _id: '$ppt._id',
                    sold_quantity: { $sum: '$quantity' },
                    total_revenue: {
                        $sum: { $multiply: ['$quantity', '$price'] },
                    },
                    product_id: { $first: '$ppt.product_id' },
                    product_type_name: { $first: '$product_type.name' },
                    price: { $first: '$ppt.price' },
                    earliest_order: { $min: '$created_at' },
                },
            },
            ...(filterField && filterField === 'revenue' && (minValue || maxValue)
                ? [
                    {
                        $match: {
                            'total_revenue': {
                                ...(minValue && { $gte: parseFloat(minValue) }),
                                ...(maxValue && { $lte: parseFloat(maxValue) }),
                            },
                        },
                    },
                ]
                : []),
            {
                $lookup: {
                    from: 'products',
                    localField: 'product_id',
                    foreignField: '_id',
                    as: 'product',
                },
            },
            { $unwind: '$product' },
            ...(search ? [{
                $match: {
                    $or: [
                        { 'product.normalized_name': { $regex: normalizedSearch, $options: 'i' } }
                    ]
                }
            }] : []),
            ...(status && status !== 'all'
                ? [
                    {
                        $match: {
                            'product.status': status,
                        },
                    },
                ]
                : []),
            ...(category
                ? [
                    {
                        $match: {
                            'product.category_id': new ObjectId(category),
                        },
                    },
                ]
                : []),
            ...(brand
                ? [
                    {
                        $match: {
                            'product.brand_id': new ObjectId(brand),
                        },
                    },
                ]
                : []),

            { $sort: sortOptions[sortBy] || { 'product.created_at': -1 } },
            {
                $project: {
                    _id: 1,
                    sold_quantity: 1,
                    total_revenue: 1,
                    product_type_name: 1,
                    price: 1,
                    product: {
                        _id: '$product._id',
                        name: '$product.name',
                        status: '$product.status',
                        average_rating: '$product.average_rating',
                        review_count: '$product.review_count',
                        short_description: '$product.short_description',
                        created_at: '$product.created_at',
                    },
                },
            },

            { $skip: (page - 1) * limit },
            { $limit: limit },
        ];

        const [products, totalCount] = await Promise.all([
            OrderItems.aggregate(aggregatePipeline),
            OrderItems.aggregate([
                {
                    $lookup: {
                        from: 'orders',
                        localField: 'order_id',
                        foreignField: '_id',
                        as: 'order',
                    },
                },
                { $unwind: '$order' },
                { $match: matchOrder },
                {
                    $lookup: {
                        from: 'productProductTypes',
                        localField: 'product_product_type_id',
                        foreignField: '_id',
                        as: 'ppt',
                    },
                },
                { $unwind: '$ppt' },

                ...(filterField && filterField === 'price' && (minValue || maxValue)
                    ? [
                        {
                            $match: {
                                'ppt.price': {
                                    ...(minValue && { $gte: parseFloat(minValue) }),
                                    ...(maxValue && { $lte: parseFloat(maxValue) }),
                                },
                            },
                        },
                    ]
                    : []),

                {
                    $lookup: {
                        from: 'productTypes',
                        localField: 'ppt.product_type_id',
                        foreignField: '_id',
                        as: 'product_type',
                    },
                },
                { $unwind: '$product_type' },
                {
                    $group: {
                        _id: '$ppt._id',
                        product_id: { $first: '$ppt.product_id' },
                        total_revenue: { $sum: { $multiply: ['$quantity', '$price'] } },
                    },
                },
                ...(filterField && filterField === 'revenue' && (minValue || maxValue)
                    ? [
                        {
                            $match: {
                                'total_revenue': {
                                    ...(minValue && { $gte: parseFloat(minValue) }),
                                    ...(maxValue && { $lte: parseFloat(maxValue) }),
                                },
                            },
                        },
                    ]
                    : []),
                {
                    $lookup: {
                        from: 'products',
                        localField: 'product_id',
                        foreignField: '_id',
                        as: 'product',
                    },
                },
                { $unwind: '$product' },
                ...(search ? [{
                    $match: {
                        $or: [
                            { 'product.normalized_name': { $regex: normalizedSearch, $options: 'i' } }
                        ]
                    }
                }] : []),
                ...(status && status !== 'all'
                    ? [
                        {
                            $match: {
                                'product.status': status,
                            },
                        },
                    ]
                    : []),
                ...(category
                    ? [
                        {
                            $match: {
                                'product.category_id': new ObjectId(category),
                            },
                        },
                    ]
                    : []),
                ...(brand
                    ? [
                        {
                            $match: {
                                'product.brand_id': new ObjectId(brand),
                            },
                        },
                    ]
                    : []),
                { $count: 'total' }
            ]),
        ]);

        const total = totalCount[0]?.total || 0;
        const totalPages = Math.ceil(total / limit);

        const productIds = products.map((p) => p.product._id.toString());
        const images = await ProductImages.find({
            product_id: { $in: productIds },
            is_primary: true,
        }).lean();

        const imageMap = Object.fromEntries(
            images.map((img) => [img.product_id.toString(), img.image_url])
        );

        const finalProducts = products.map((p) => ({
            ...p.product,
            _id: p.product._id,
            sold_quantity: p.sold_quantity,
            total_revenue: p.total_revenue,
            product_type_name: p.product_type_name,
            image: imageMap[p.product._id.toString()],
            price: p.price,
        }));

        const categories = await Categories.find();
        const brands = await Brands.find();

        res.render('dashboards/products', {
            products: finalProducts,
            currentPage: page,
            totalPages,
            limit,
            total,
            categories,
            brands,
            filters: {
                search,
                sortBy,
                status,
                timePeriod,
                startDate,
                endDate,
                category,
                brand,
                filterField,
                minValue,
                maxValue,
            },
        });
    } catch (err) {
        console.error(err);
        res.status(500).render('error', { message: 'Lỗi máy chủ. Vui lòng thử lại sau.' });
    }
});

















// router.get('/products', async function (req, res, next) {
//     try {
//         let {
//             sortBy,
//             status,
//             perPage = 10,
//             page = 1,
//             timePeriod,
//             startDate,
//             endDate,
//             category,
//             brand,
//             minPrice,
//             maxPrice,
//         } = req.query;

//         sortBy = sortBy || 'best_selling';
//         page = parseInt(page);
//         perPage = parseInt(perPage);

//         const now = new Date();
//         let dateFilter = {};

//         // Điều kiện lọc theo thời gian
//         if (timePeriod) {
//             switch (timePeriod) {
//                 case 'last_week':
//                     dateFilter.created_at = {
//                         $gte: startOfWeek(subWeeks(now, 1)),
//                         $lte: endOfWeek(subWeeks(now, 1)),
//                     };
//                     break;
//                 case 'last_month':
//                     dateFilter.created_at = {
//                         $gte: startOfMonth(subMonths(now, 1)),
//                         $lte: endOfMonth(subMonths(now, 1)),
//                     };
//                     break;
//                 case 'this_month':
//                     dateFilter.created_at = {
//                         $gte: startOfMonth(now),
//                         $lte: endOfMonth(now),
//                     };
//                     break;
//                 case 'last_3_months':
//                     dateFilter.created_at = {
//                         $gte: subMonths(startOfMonth(now), 3),
//                         $lte: endOfMonth(now),
//                     };
//                     break;
//                 case 'custom':
//                     if (startDate && endDate) {
//                         const start = new Date(`${startDate}T00:00:00`);
//                         const end = new Date(`${endDate}T23:59:59`);
//                         dateFilter.created_at = {
//                             $gte: start,
//                             $lte: end,
//                         };
//                     }
//                     break;
//             }
//         }

//         const matchOrder = {
//             'order.status': { $in: ['delivered'] },
//             ...(dateFilter.created_at && {
//                 'order.created_at': dateFilter.created_at,
//             }),
//         };

//         const sortOptions = {
//             best_selling: { sold_quantity: -1 },
//             worst_selling: { sold_quantity: 1 },
//             highest_revenue: { total_revenue: -1 },
//             lowest_revenue: { total_revenue: 1 },
//             highest_rating: { 'product.average_rating': -1 },
//         };

//         const aggregatePipeline = [
//             {
//                 $lookup: {
//                     from: 'orders',
//                     localField: 'order_id',
//                     foreignField: '_id',
//                     as: 'order',
//                 },
//             },
//             { $unwind: '$order' },
//             { $match: matchOrder },
//             {
//                 $lookup: {
//                     from: 'productProductTypes',
//                     localField: 'product_product_type_id',
//                     foreignField: '_id',
//                     as: 'ppt',
//                 },
//             },
//             { $unwind: '$ppt' },

//             // Lọc giá
//             ...(minPrice || maxPrice
//                 ? [
//                     {
//                         $match: {
//                             'ppt.price': {
//                                 ...(minPrice && { $gte: parseFloat(minPrice) }),
//                                 ...(maxPrice && { $lte: parseFloat(maxPrice) }),
//                             },
//                         },
//                     },
//                 ]
//                 : []),

//             {
//                 $lookup: {
//                     from: 'productTypes',
//                     localField: 'ppt.product_type_id',
//                     foreignField: '_id',
//                     as: 'product_type',
//                 },
//             },
//             { $unwind: '$product_type' },
//             {
//                 $group: {
//                     _id: '$ppt._id',
//                     sold_quantity: { $sum: '$quantity' },
//                     total_revenue: {
//                         $sum: { $multiply: ['$quantity', '$price'] },
//                     },
//                     product_id: { $first: '$ppt.product_id' },
//                     product_type_name: { $first: '$product_type.name' },
//                     price: { $first: '$ppt.price' },
//                     earliest_order: { $min: '$created_at' },
//                 },
//             },
//             {
//                 $lookup: {
//                     from: 'products',
//                     localField: 'product_id',
//                     foreignField: '_id',
//                     as: 'product',
//                 },
//             },
//             { $unwind: '$product' },
//             ...(status && status !== 'all'
//                 ? [
//                     {
//                         $match: {
//                             'product.status': status,
//                         },
//                     },
//                 ]
//                 : []),


//             ...(category
//                 ? [
//                     {
//                         $match: {
//                             'product.category_id': new ObjectId(category),
//                         },
//                     },
//                 ]
//                 : []),
//             ...(brand
//                 ? [
//                     {
//                         $match: {
//                             'product.brand_id': new ObjectId(brand),
//                         },
//                     },
//                 ]
//                 : []),

//             { $sort: sortOptions[sortBy] || { 'product.created_at': -1 } },
//             {
//                 $project: {
//                     _id: 1,
//                     sold_quantity: 1,
//                     total_revenue: 1,
//                     product_type_name: 1,
//                     price: 1,
//                     product: {
//                         _id: '$product._id',
//                         name: '$product.name',
//                         status: '$product.status',
//                         average_rating: '$product.average_rating',
//                         review_count: '$product.review_count',
//                         short_description: '$product.short_description',
//                         created_at: '$product.created_at',
//                     },
//                 },
//             },

//             { $skip: (page - 1) * perPage },
//             { $limit: perPage },
//         ];

//         const [products, totalCount] = await Promise.all([
//             OrderItems.aggregate(aggregatePipeline),
//             OrderItems.aggregate([
//                 {
//                     $lookup: {
//                         from: 'orders',
//                         localField: 'order_id',
//                         foreignField: '_id',
//                         as: 'order',
//                     },
//                 },
//                 { $unwind: '$order' },
//                 { $match: matchOrder },
//                 {
//                     $lookup: {
//                         from: 'productProductTypes',
//                         localField: 'product_product_type_id',
//                         foreignField: '_id',
//                         as: 'ppt',
//                     },
//                 },
//                 { $unwind: '$ppt' },

//                 // Lọc giá
//                 ...(minPrice || maxPrice
//                     ? [
//                         {
//                             $match: {
//                                 'ppt.price': {
//                                     ...(minPrice && { $gte: parseFloat(minPrice) }),
//                                     ...(maxPrice && { $lte: parseFloat(maxPrice) }),
//                                 },
//                             },
//                         },
//                     ]
//                     : []),

//                 {
//                     $lookup: {
//                         from: 'productTypes',
//                         localField: 'ppt.product_type_id',
//                         foreignField: '_id',
//                         as: 'product_type',
//                     },
//                 },
//                 { $unwind: '$product_type' },
//                 {
//                     $group: {
//                         _id: '$ppt._id',
//                         // sold_quantity: { $sum: '$quantity' },
//                         // total_revenue: {
//                         //     $sum: { $multiply: ['$quantity', '$price'] },
//                         // },
//                         product_id: { $first: '$ppt.product_id' },
//                         // product_type_name: { $first: '$product_type.name' },
//                         // price: { $first: '$ppt.price' },
//                         // earliest_order: { $min: '$created_at' },
//                     },
//                 },
//                 {
//                     $lookup: {
//                         from: 'products',
//                         localField: 'product_id',
//                         foreignField: '_id',
//                         as: 'product',
//                     },
//                 },
//                 { $unwind: '$product' },
//                 ...(status && status !== 'all'
//                     ? [
//                         {
//                             $match: {
//                                 'product.status': status,
//                             },
//                         },
//                     ]
//                     : []),
//                 ...(category
//                     ? [
//                         {
//                             $match: {
//                                 'product.category_id': new ObjectId(category),
//                             },
//                         },
//                     ]
//                     : []),
//                 ...(brand
//                     ? [
//                         {
//                             $match: {
//                                 'product.brand_id': new ObjectId(brand),
//                             },
//                         },
//                     ]
//                     : []),
//                     { $count: 'total' }
//             ]),
//         ]);

//         const total = totalCount[0]?.total || 0;
//         const totalPages = Math.ceil(total / perPage);

//         const productIds = products.map((p) => p.product._id.toString());
//         const images = await ProductImages.find({
//             product_id: { $in: productIds },
//             is_primary: true,
//         }).lean();

//         const imageMap = Object.fromEntries(
//             images.map((img) => [img.product_id.toString(), img.image_url])
//         );

//         const finalProducts = products.map((p) => ({
//             ...p.product,
//             _id: p._id,
//             sold_quantity: p.sold_quantity,
//             total_revenue: p.total_revenue,
//             product_type_name: p.product_type_name,
//             image: imageMap[p.product._id.toString()],
//             price: p.price,
//         }));

//         const categories = await Categories.find();
//         const brands = await Brands.find();

//         res.render('dashboards/products', {
//             products: finalProducts,
//             currentPage: page,
//             totalPages,
//             perPage,
//             total,
//             categories,
//             brands,
//             filters: {
//                 sortBy,
//                 status,
//                 timePeriod,
//                 startDate,
//                 endDate,
//                 category,
//                 brand,
//                 minPrice,
//                 maxPrice,
//             },
//         });
//     } catch (err) {
//         console.error(err);
//         res.status(500).render('error', { message: 'Lỗi máy chủ. Vui lòng thử lại sau.' });
//     }
// });








function toVietnamTime(date) {
    return new Date(date.getTime() + 7 * 60 * 60 * 1000);
}



router.get('/inventory', async (req, res) => {
    try {
        let { search, sortBy, status, limit = 10, page = 1, timePeriod, startDate, endDate, category, brand, filterField, minValue, maxValue, expiryDate, filterByPrice } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);

        let normalizedSearch = '';
        if (search) {
            search = search.trim();
            normalizedSearch = normalizeText(search);
        }
        let dateFilter = {};

        if (timePeriod) {
            const now = toVietnamTime(new Date());

            switch (timePeriod) {
                case "last_week": {
                    const now = new Date();
                    const day = now.getUTCDay();
                    const diff = day === 0 ? 7 : day;

                    const start = new Date(now);
                    start.setUTCDate(now.getUTCDate() - diff - 6);
                    start.setUTCHours(0, 0, 0, 0);

                    const end = new Date(start);
                    end.setUTCDate(start.getUTCDate() + 6);
                    end.setUTCHours(23, 59, 59, 999);

                    dateFilter.import_date = {
                        $gte: new Date(start.getTime() + offsetMs),
                        $lte: new Date(end.getTime() + offsetMs)
                    };
                    break;
                }

                case "last_month": {
                    const now = new Date();
                    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
                    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

                    dateFilter.import_date = {
                        $gte: new Date(start.getTime() - offsetMs),
                        $lte: new Date(end.getTime() - offsetMs)
                    };
                    break;
                }

                case "this_month": {
                    const now = new Date();
                    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
                    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

                    dateFilter.import_date = {
                        $gte: new Date(start.getTime() - offsetMs),
                        $lte: new Date(end.getTime() - offsetMs)
                    };
                    break;
                }

                case "last_3_months": {
                    const now = new Date();
                    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0);
                    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

                    dateFilter.import_date = {
                        $gte: new Date(start.getTime() - offsetMs),
                        $lte: new Date(end.getTime() - offsetMs)
                    };
                    break;
                }

                case "custom_import_date": {
                    const filter = {};
                    if (startDate) {
                        const start = new Date(`${startDate}T00:00:00+07:00`);
                        filter.$gte = start;
                    }
                    if (endDate) {
                        const end = new Date(`${endDate}T23:59:59+07:00`);
                        filter.$lte = end;
                    }
                    dateFilter.import_date = filter;
                    break;
                }

                case "custom_expiry_date": {
                    const filter = {};
                    if (startDate) {
                        const start = new Date(`${startDate}T00:00:00+07:00`);
                        filter.$gte = start;
                    }
                    if (endDate) {
                        const end = new Date(`${endDate}T23:59:59+07:00`);
                        filter.$lte = end;
                    }
                    dateFilter.expiry_date = filter;
                    break;
                }

                case "expiring_soon": {
                    if (expiryDate) {
                        const nowUTC = new Date(now.getTime() - offsetMs);
                        const expiryLimit = new Date(nowUTC);
                        expiryLimit.setDate(expiryLimit.getDate() + parseInt(expiryDate));
                        dateFilter.expiry_date = {
                            $lte: expiryLimit
                        };
                    }
                    break;
                }
            }
        }


        const filter = {
            ...dateFilter
        };
        if (status) {
            filter.status = status;
        }
        switch (filterField) {
            case 'import_price':
                if (minValue || maxValue) {
                    filter.import_price = {};
                    if (minValue) {
                        filter.import_price.$gte = parseFloat(minValue);
                    }
                    if (maxValue) {
                        filter.import_price.$lte = parseFloat(maxValue);
                    }
                }
                break;
            case 'quantity':
                if (minValue || maxValue) {
                    filter.quantity = {};
                    if (minValue) {
                        filter.quantity.$gte = parseFloat(minValue);
                    }
                    if (maxValue) {
                        filter.quantity.$lte = parseFloat(maxValue);
                    }
                }
                break;
            case 'remaining_quantity':
                if (minValue || maxValue) {
                    filter.remaining_quantity = {};
                    if (minValue) {
                        filter.remaining_quantity.$gte = parseFloat(minValue);
                    }
                    if (maxValue) {
                        filter.remaining_quantity.$lte = parseFloat(maxValue);
                    }
                }
                break;
        }

        const sortOptions = {};
        switch (sortBy) {
            case 'highest_stock':
                sortOptions.remaining_quantity = -1;
                break;
            case 'lowest_stock':
                sortOptions.remaining_quantity = 1;
                break;
            case 'newest_stock':
                sortOptions.import_date = -1;
                break;
            case 'oldest_stock':
                sortOptions.import_date = 1;
                break;
            default:
                sortOptions.remaining_quantity = -1;
        }

        const commonPipeline = [
            { $match: filter },
            {
                $lookup: {
                    from: 'productProductTypes',
                    localField: 'product_product_type_id',
                    foreignField: '_id',
                    as: 'productTypeInfo'
                }
            },
            { $unwind: '$productTypeInfo' },
            {
                $lookup: {
                    from: 'productTypes',
                    localField: 'productTypeInfo.product_type_id',
                    foreignField: '_id',
                    as: 'productTypeDetails'
                }
            },
            { $unwind: '$productTypeDetails' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'productTypeInfo.product_id',
                    foreignField: '_id',
                    as: 'productInfo'
                }
            },
            { $unwind: '$productInfo' },
            {
                $match: {
                    ...(category ? { 'productInfo.category_id': new ObjectId(category) } : {}),
                    ...(brand ? { 'productInfo.brand_id': new ObjectId(brand) } : {})
                }
            },
            ...(search ? [{
                $match: {
                    $or: [
                        { batch_number: { $regex: search, $options: 'i' } },
                        { 'productInfo.normalized_name': { $regex: normalizedSearch, $options: 'i' } }
                    ]
                }
            }] : [])
        ];

        const aggregatePipeline = [
            ...commonPipeline,
            {
                $project: {
                    batch_number: 1,
                    product_id: '$productInfo._id',
                    product_name: '$productInfo.name',
                    product_type_name: '$productTypeDetails.name',
                    import_price: 1,
                    quantity: 1,
                    remaining_quantity: 1,
                    expiry_date: 1,
                    import_date: 1,
                    status: 1
                }
            },
            { $sort: sortOptions },
            { $skip: (page - 1) * limit },
            { $limit: limit }
        ];

        const countPipeline = [
            ...commonPipeline,
            { $count: 'total' }
        ];

        const [inventory, countResult] = await Promise.all([
            StockEntries.aggregate(aggregatePipeline),
            StockEntries.aggregate(countPipeline)
        ]);

        const totalCount = countResult[0]?.total || 0;


        const totalPages = Math.ceil(totalCount / limit);
        const categories = await Categories.find();
        const brands = await Brands.find();


        const chartData = await StockEntries.aggregate([
            ...(Object.keys(dateFilter).length > 0 ? [{ $match: dateFilter }] : []),
            {
                $group: {
                    _id: "$status",
                    totalBatches: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    status: "$_id",
                    totalBatches: 1
                }
            }
        ]);

        const orderStatusData = {
            'not_started': 0,
            'active': 0,
            'paused': 0,
            'sold_out': 0,
            'expired': 0,
            'discontinued': 0
        };

        chartData.forEach(item => {
            switch (item.status) {
                case 'not_started':
                    orderStatusData['not_started'] = item.totalBatches;
                    break;
                case 'active':
                    orderStatusData['active'] = item.totalBatches;
                    break;
                case 'paused':
                    orderStatusData['paused'] = item.totalBatches;
                    break;
                case 'sold_out':
                    orderStatusData['sold_out'] = item.totalBatches;
                    break;
                case 'expired':
                    orderStatusData['expired'] = item.totalBatches;
                    break;
                case 'discontinued':
                    orderStatusData['discontinued'] = item.totalBatches;
                    break;
            }
        });
        const stockData = await StockEntries.aggregate([
            ...(Object.keys(dateFilter).length > 0 ? [{ $match: dateFilter }] : []),
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$import_date",
                            timezone: "+07:00"
                        }
                    },
                    totalEntries: { $sum: 1 }
                }
            },
            {
                $addFields: {
                    formattedDate: {
                        $dateFromString: {
                            dateString: "$_id",
                            format: "%Y-%m-%d",
                            timezone: "+07:00"
                        }
                    }
                }
            },
            {
                $sort: {
                    formattedDate: 1
                }
            },
            {
                $project: {
                    _id: 1,
                    totalEntries: 1
                }
            }
        ]);



        res.render('dashboards/inventory', {
            stocks: inventory,
            currentPage: page,
            totalPages,
            limit,
            total: totalCount,
            categories,
            brands,
            filters: {
                search,
                sortBy,
                status,
                timePeriod,
                startDate,
                endDate,
                category,
                brand,
                filterField,
                minValue,
                maxValue,
                expiryDate,
                filterByPrice
            },
            orderStatusData: Object.values(orderStatusData),
            stockData
        });
    } catch (err) {
        console.error(err);
        res.status(500).render('error', { message: 'Lỗi máy chủ. Vui lòng thử lại sau.' });
    }
});

function normalizeText(text) {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '')
        .toLowerCase();
}

module.exports = router;