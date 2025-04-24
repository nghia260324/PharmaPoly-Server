const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongoose').Types;
const Orders = require('../models/orders');
const Products = require('../models/products');
const OrderItems = require('../models/orderItems');
const StockEntries = require('../models/stockEntries');
const ProductImages = require('../models/productImages');
const Categories = require('../models/categories');
const Brands = require('../models/brands');

const { startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, subWeeks, parseISO } = require('date-fns');

const { format } = require('date-fns');
const viLocale = require('date-fns/locale/vi');

router.get('/revenue', async function (req, res, next) {
    const { timePeriod, startDate, paymentMethod, endDate } = req.query;
    try {
        const now = new Date();

        // match cho đơn đã giao để tính doanh thu/lợi nhuận
        let matchStageDelivered = { status: 'delivered' };
        if (paymentMethod) {
            matchStageDelivered.payment_method = paymentMethod;
        }
        // match tất cả đơn hàng để đếm trạng thái và tổng số đơn
        let matchStageAll = {};

        // Tạo điều kiện ngày
        if (timePeriod) {
            let dateFilter;
            switch (timePeriod) {
                case 'last_week':
                    dateFilter = {
                        $gte: startOfWeek(subWeeks(now, 1)),
                        $lte: endOfWeek(subWeeks(now, 1))
                    };
                    break;
                case 'last_month':
                    dateFilter = {
                        $gte: startOfMonth(subMonths(now, 1)),
                        $lte: endOfMonth(subMonths(now, 1))
                    };
                    break;
                case 'this_month':
                    dateFilter = {
                        $gte: startOfMonth(now),
                        $lte: endOfMonth(now)
                    };
                    break;
                case 'last_3_months':
                    dateFilter = {
                        $gte: subMonths(startOfMonth(now), 3),
                        $lte: endOfMonth(now)
                    };
                    break;
                case 'custom':
                    if (startDate && endDate) {
                        dateFilter = {
                            $gte: new Date(`${startDate}T00:00:00`),
                            $lte: new Date(`${endDate}T23:59:59`)
                        };
                    }
                    break;
            }

            if (dateFilter) {
                matchStageDelivered.created_at = dateFilter;
                matchStageAll.created_at = dateFilter;
            }
        }

        // Tính doanh thu và lợi nhuận cho đơn đã giao
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
            {
                $lookup: {
                    from: "stockEntries",
                    let: { ppid: "$items.product_product_type_id", batch: "$items.batch_number" },
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
                        $dateToString: { format: "%Y-%m-%d", date: "$created_at" }
                    }
                }
            },
            {
                $group: {
                    _id: { orderId: "$_id", date: "$date", status: "$status", total_price: "$total_price" },
                    total_cost: {
                        $sum: { $multiply: ["$items.quantity", "$import_price"] }
                    }
                }
            },
            {
                $group: {
                    _id: "$_id.date",
                    totalRevenue: { $sum: "$_id.total_price" },
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



router.get('/products', async function (req, res, next) {
    try {
        //let { sortBy, status, perPage = 10, page = 1, timePeriod, startDate, endDate } = req.query;
        let { sortBy, status, perPage = 10, page = 1, timePeriod, startDate, endDate, category, brand, minPrice, maxPrice } = req.query;

        sortBy = sortBy || 'best_selling';
        status = status || 'all';

        page = parseInt(page);
        perPage = parseInt(perPage);

        let statusMatch = {};
        if (status !== 'all') {
            statusMatch['product.status'] = status;
        }
        const matchProduct = {};
        // if (status !== 'all') {
        //     matchProduct['product.status'] = status;
        // }
        if (category) {
            matchProduct['product.category_id'] = new ObjectId(category);
        }
        if (brand) {
            matchProduct['product.brand_id'] = new ObjectId(brand);
        }
        let dateFilter = {};
        const now = new Date();

        if (timePeriod) {
            switch (timePeriod) {
                case 'last_week':
                    dateFilter.created_at = {
                        $gte: startOfWeek(subWeeks(now, 1)),
                        $lte: endOfWeek(subWeeks(now, 1))
                    };
                    break;
                case 'last_month':
                    dateFilter.created_at = {
                        $gte: startOfMonth(subMonths(now, 1)),
                        $lte: endOfMonth(subMonths(now, 1))
                    };
                    break;
                case 'this_month':
                    dateFilter.created_at = {
                        $gte: startOfMonth(now),
                        $lte: endOfMonth(now)
                    };
                    break;
                case 'last_3_months':
                    dateFilter.created_at = {
                        $gte: subMonths(startOfMonth(now), 3),
                        $lte: endOfMonth(now)
                    };
                    break;
                case 'custom':
                    if (startDate && endDate) {
                        const start = new Date(`${startDate}T00:00:00`);
                        const end = new Date(`${endDate}T23:59:59`);
                        dateFilter.created_at = {
                            $gte: start,
                            $lte: end
                        };
                    }
                    break;
            }
        }

        const matchOrder = {
            'order.status': { $in: ['delivered'] },
            ...(dateFilter.created_at && {
                'order.created_at': dateFilter.created_at
            })
        };

        // Các tùy chọn sắp xếp
        const sortOptions = {
            best_selling: { sold_quantity: -1 },
            worst_selling: { sold_quantity: 1 },
            highest_revenue: { total_revenue: -1 },
            lowest_revenue: { total_revenue: 1 },
            highest_rating: { 'product.average_rating': -1 }
        };

        const aggregatePipeline = [
            {
                $lookup: {
                    from: 'orders',
                    localField: 'order_id',
                    foreignField: '_id',
                    as: 'order'
                }
            },
            { $unwind: '$order' },
            { $match: matchOrder },
            {
                $lookup: {
                    from: 'productProductTypes',
                    localField: 'product_product_type_id',
                    foreignField: '_id',
                    as: 'ppt'
                }
            },
            { $unwind: '$ppt' },
            {
                $match: {
                    ...matchProduct,
                    ...(minPrice || maxPrice) && {
                        'ppt.price': {
                            ...(minPrice && { $gte: parseFloat(minPrice) }),
                            ...(maxPrice && { $lte: parseFloat(maxPrice) })
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: 'productTypes',
                    localField: 'ppt.product_type_id',
                    foreignField: '_id',
                    as: 'product_type'
                }
            },
            { $unwind: '$product_type' },
            {
                $group: {
                    _id: '$ppt.product_id',
                    sold_quantity: { $sum: '$quantity' },
                    total_revenue: { $sum: { $multiply: ['$quantity', '$price'] } },
                    earliest_order: { $min: '$created_at' },
                    product_type_name: { $first: '$product_type.name' },
                    price: { $first: '$ppt.price' }
                }
            },
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            // { $match: matchProduct },
            { $match: { ...matchProduct, ...statusMatch } },
            { $sort: sortOptions[sortBy] || { 'product.created_at': -1 } },
            {
                $project: {
                    _id: 1,
                    sold_quantity: 1,
                    total_revenue: 1,
                    product_type_name: 1,
                    price: 1,
                    product: {
                        name: '$product.name',
                        status: '$product.status',
                        average_rating: '$product.average_rating',
                        review_count: '$product.review_count',
                        short_description: '$product.short_description',
                        created_at: '$product.created_at'
                    }
                }
            },
            { $skip: (page - 1) * perPage },
            { $limit: perPage }
        ];

        // Lấy dữ liệu + tổng số
        const [products, totalCount] = await Promise.all([
            OrderItems.aggregate(aggregatePipeline),
            OrderItems.aggregate([
                {
                    $lookup: {
                        from: 'orders',
                        localField: 'order_id',
                        foreignField: '_id',
                        as: 'order'
                    }
                },
                { $unwind: '$order' },
                { $match: matchOrder },
                {
                    $lookup: {
                        from: 'productProductTypes',
                        localField: 'product_product_type_id',
                        foreignField: '_id',
                        as: 'ppt'
                    }
                },
                { $unwind: '$ppt' },
                {
                    $group: {
                        _id: '$ppt.product_id'
                    }
                },
                { $count: 'total' }
            ])
        ]);

        const total = totalCount[0]?.total || 0;
        const totalPages = Math.ceil(total / perPage);

        // Lấy ảnh
        const productIds = products.map(p => p._id);
        const images = await ProductImages.find({
            product_id: { $in: productIds },
            is_primary: true
        }).lean();

        const imageMap = Object.fromEntries(
            images.map(img => [img.product_id.toString(), img.image_url])
        );

        const finalProducts = products.map(p => ({
            ...p.product,
            _id: p._id,
            sold_quantity: p.sold_quantity,
            total_revenue: p.total_revenue,
            product_type_name: p.product_type_name,
            image: imageMap[p._id.toString()],
            price: p.price
        }));
        const categories = await Categories.find();
        const brands = await Brands.find();
        res.render('dashboards/products', {
            products: finalProducts,
            currentPage: page,
            totalPages,
            perPage,
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
                minPrice,
                maxPrice
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).render('error', { message: 'Lỗi máy chủ. Vui lòng thử lại sau.' });
    }
});


router.get('/inventory', async (req, res) => {
    try {
        // let { sortBy, status, timePeriod, startDate, endDate, page = 1, perPage = 10 } = req.query;
        let { sortBy, status, perPage = 10, page = 1, timePeriod, startDate, endDate, category, brand, minPrice, maxPrice, expiryDate } = req.query;
        page = parseInt(page);
        perPage = parseInt(perPage);

        let dateFilter = {};
        const now = new Date();

        if (timePeriod) {
            switch (timePeriod) {
                case 'last_week':
                    dateFilter.created_at = {
                        $gte: startOfWeek(subWeeks(now, 1)),
                        $lte: endOfWeek(subWeeks(now, 1))
                    };
                    break;
                case 'last_month':
                    dateFilter.created_at = {
                        $gte: startOfMonth(subMonths(now, 1)),
                        $lte: endOfMonth(subMonths(now, 1))
                    };
                    break;
                case 'this_month':
                    dateFilter.created_at = {
                        $gte: startOfMonth(now),
                        $lte: endOfMonth(now)
                    };
                    break;
                case 'last_3_months':
                    dateFilter.created_at = {
                        $gte: subMonths(startOfMonth(now), 3),
                        $lte: endOfMonth(now)
                    };
                    break;
                case 'custom':
                    if (startDate && endDate) {
                        const start = new Date(`${startDate}T00:00:00`);
                        const end = new Date(`${endDate}T23:59:59`);
                        dateFilter.created_at = {
                            $gte: start,
                            $lte: end
                        };
                    }
                    break;
                case 'expiring_soon':
                    if (expiryDate) {
                        const expiryLimit = new Date();
                        expiryLimit.setDate(expiryLimit.getDate() + parseInt(expiryDate));
                        dateFilter.expiry_date = {
                            $lte: expiryLimit
                        };
                    }
                    break;
            }
        }

        const filter = {
            ...dateFilter
        };
        if (status) {
            filter.status = status;
        }
        if (minPrice || maxPrice) {
            filter.import_price = {};
            if (minPrice) {
                filter.import_price.$gte = parseFloat(minPrice);
            }
            if (maxPrice) {
                filter.import_price.$lte = parseFloat(maxPrice);
            }
        }
        // const sortOptions = {};
        // if (sortBy) {
        //     sortOptions[sortBy] = -1;
        // } else {
        //     sortOptions.remaining_quantity = -1;
        // }
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

        const aggregatePipeline = [
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
            {
                $project: {
                    batch_number: 1,
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
            { $skip: (page - 1) * perPage },
            { $limit: perPage }
        ];

        const [inventory, totalCount] = await Promise.all([
            StockEntries.aggregate(aggregatePipeline),
            StockEntries.countDocuments(filter)
        ]);

        const totalPages = Math.ceil(totalCount / perPage);
        const categories = await Categories.find();
        const brands = await Brands.find();
        res.render('dashboards/inventory', {
            stocks: inventory,
            currentPage: page,
            totalPages,
            perPage,
            total: totalCount,
            categories,
            brands,
            // filters: { sortBy, status, timePeriod, startDate, endDate }
            filters: {
                sortBy,
                status,
                timePeriod,
                startDate,
                endDate,
                category,
                brand,
                minPrice,
                maxPrice,
                expiryDate
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).render('error', { message: 'Lỗi máy chủ. Vui lòng thử lại sau.' });
    }
});



module.exports = router;