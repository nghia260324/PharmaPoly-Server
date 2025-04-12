const express = require('express');
const router = express.Router();
const Orders = require('../models/orders');
const Products = require('../models/products');
const OrderItems = require('../models/orderItems');
const StockEntries = require('../models/stockEntries');
const ProductImages = require('../models/productImages');

const { startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, subWeeks, parseISO } = require('date-fns');

const { format } = require('date-fns');
const viLocale = require('date-fns/locale/vi');

router.get('/revenue', async function (req, res, next) {
    const { timePeriod, orderStatus, startDate, endDate } = req.query;
    try {
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
        const orders = await Orders.find({
            ...dateFilter,
            ...(orderStatus && { status: orderStatus })
        });

        const totalOrders = orders.length;

        const deliveredOrders = orders.filter(order => order.status === 'delivered');

        const totalRevenue = deliveredOrders.reduce((sum, order) => sum + order.total_price, 0);





        const deliveredOrderIds = deliveredOrders.map(order => order._id);
        const deliveredOrderItems = await OrderItems.find({ order_id: { $in: deliveredOrderIds } });
        const stockEntryMap = new Map();
        let totalCost = 0;
        for (const item of deliveredOrderItems) {
            const key = `${item.product_product_type_id}_${item.batch_number}`;

            let importPrice;

            if (stockEntryMap.has(key)) {
                importPrice = stockEntryMap.get(key);
            } else {
                const stockEntry = await StockEntries.findOne({
                    product_product_type_id: item.product_product_type_id,
                    batch_number: item.batch_number
                });

                importPrice = stockEntry?.import_price || 0;
                stockEntryMap.set(key, importPrice);
            }

            totalCost += importPrice * item.quantity;
        }

        const totalProfit = totalRevenue - totalCost;





        const revenueMap = new Map();

        for (const order of deliveredOrders) {
            const date = format(new Date(order.created_at), 'yyyy-MM-dd');
            revenueMap.set(date, (revenueMap.get(date) || 0) + order.total_price);
        }

        const sortedDates = Array.from(revenueMap.keys()).sort((a, b) => new Date(a) - new Date(b));
        const revenueLabels = sortedDates.map(date =>
            format(new Date(date), 'dd/MM/yyyy', { locale: viLocale.vi })
        );
        const revenueData = sortedDates.map(date => revenueMap.get(date));


        const statusCounts = {
            delivered: 0,
            delivering: 0,
            pending: 0,
            canceled: 0
        };

        for (const order of orders) {
            const status = order.status;
            if (statusCounts.hasOwnProperty(status)) {
                statusCounts[status]++;
            }
        }


        const orderCountMap = new Map();
        for (const order of orders) {
            const date = format(new Date(order.created_at), 'yyyy-MM-dd');
            orderCountMap.set(date, (orderCountMap.get(date) || 0) + 1);
        }

        const sortedOrderDates = Array.from(orderCountMap.keys()).sort((a, b) => new Date(a) - new Date(b));

        const orderLabels = sortedOrderDates.map(date =>
            format(new Date(date), 'dd/MM/yyyy', { locale: viLocale.vi })
        );
        const orderData = sortedOrderDates.map(date => orderCountMap.get(date));

        const numberOfDays = sortedDates.length || 1;

        const averageRevenue = Math.round(totalRevenue / numberOfDays);
        const averageProfit = Math.round(totalProfit / numberOfDays);
        const averageOrders = Math.round(totalOrders / numberOfDays);


        res.render('dashboards/list', {
            totalOrders,
            totalRevenue,
            totalProfit,
            orders,
            averageRevenue,
            averageProfit,
            averageOrders,
            revenueLabels: JSON.stringify(revenueLabels),
            revenueData: JSON.stringify(revenueData),
            orderLabels: JSON.stringify(orderLabels),
            orderData: JSON.stringify(orderData),
            orderStatusData: JSON.stringify([
                statusCounts.delivered,
                statusCounts.delivering,
                statusCounts.pending,
                statusCounts.canceled
            ]),
            filters: { timePeriod, orderStatus, startDate, endDate }
        });
    } catch (err) {
        console.error(err);
        next(err);
    }
});


router.get('/products', async function (req, res, next) {
    try {
        // let { sortBy, status, perPage = 10, page = 1 } = req.query;
        let { sortBy, status, perPage = 10, page = 1, timePeriod, startDate, endDate } = req.query;

        sortBy = sortBy || 'best_selling';
        status = status || 'all';

        // Parse số
        const parsedPage = Math.max(parseInt(page) || 1, 1);
        const parsedPerPage = Math.max(parseInt(perPage) || 10, 1);

        // Điều kiện match sản phẩm
        const matchProduct = {};
        if (status !== 'all') {
            matchProduct['product.status'] = status;
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
            'order.status': { $in: ['delivered'] }
        };
        // if (Object.keys(dateFilter).length > 0) {
        //     matchOrder['order.created_at'] = dateFilter;
        // }

        // Các kiểu sắp xếp
        const sortOptions = {
            best_selling: { sold_quantity: -1 },
            worst_selling: { sold_quantity: 1 },
            highest_revenue: { total_revenue: -1 },
            lowest_revenue: { total_revenue: 1 },
            highest_rating: { 'product.average_rating': -1 }
        };

        const aggregate = [
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
                $match: {
                    'order.status': 'delivered',
                    ...(dateFilter.created_at && {
                        'order.created_at': dateFilter.created_at
                    })
                }
            },
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
                    product_type_name: { $first: '$product_type.name' }
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
            { $match: matchProduct },
            { $sort: sortOptions[sortBy] || { 'product.created_at': -1 } },
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    data: [
                        { $skip: (parsedPage - 1) * parsedPerPage },
                        { $limit: parsedPerPage },
                        {
                            $project: {
                                _id: 1,
                                sold_quantity: 1,
                                total_revenue: 1,
                                product_type_name: 1,
                                product: {
                                    name: '$product.name',
                                    status: '$product.status',
                                    average_rating: '$product.average_rating',
                                    review_count: '$product.review_count',
                                    short_description: '$product.short_description',
                                    created_at: '$product.created_at'
                                }
                            }
                        }
                    ]
                }
            }
        ];

        const [aggregationResult] = await OrderItems.aggregate(aggregate);
        const products = aggregationResult.data;
        const total = aggregationResult.metadata[0]?.total || 0;

        // Get product images
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
            image: imageMap[p._id.toString()]
        }));

        res.render('dashboards/products', {
            products: finalProducts,
            total: total,
            page: parsedPage,
            totalPages: Math.ceil(total / parsedPerPage),
            filters: { sortBy, status, perPage, timePeriod, startDate, endDate }
        });
    } catch (err) {
        next(err);
    }
});

router.get('/inventory', async function (req, res, next) {
    try {
        const {
            sortBy = 'highest_stock',
            status,
            timePeriod,
            startDate,
            endDate,
            page = 1,
            perPage = 10
        } = req.query;

        // Xây dựng query filter
        const filter = {};

        // Filter by status
        if (status) filter.status = status;

        // Filter by time period
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

                        dateFilter.import_date = {
                            $gte: start,
                            $lte: end
                        };
                    }
                    break;
            }
        }

        // Custom date range
        // if (timePeriod === 'custom' && startDate && endDate) {
        //     filter.import_date = {
        //         $gte: new Date(startDate),
        //         $lte: new Date(endDate)
        //     };
        // }

        // Xây dựng sort
        const sortOptions = {};
        switch (sortBy) {
            case 'highest_stock':
                sortOptions.remaining_quantity = -1;
                break;
            case 'lowest_stock':
                sortOptions.remaining_quantity = 1;
                break;
            case 'nearest_expiry':
                sortOptions.expiry_date = 1;
                break;
            case 'oldest_stock':
                sortOptions.import_date = 1;
                break;
            default:
                sortOptions.import_date = -1;
        }

        // Aggregation pipeline
        const pipeline = [
            { $match: filter },
            { $sort: sortOptions },
            {
                $lookup: {
                    from: 'productproducttypes',
                    localField: 'product_product_type_id',
                    foreignField: '_id',
                    as: 'product_type'
                }
            },
            { $unwind: '$product_type' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'product_type.product_id',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $project: {
                    batch_number: 1,
                    import_price: 1,
                    quantity: 1,
                    remaining_quantity: 1,
                    expiry_date: 1,
                    import_date: 1,
                    status: 1,
                    product: {
                        name: '$product.name',
                        category_id: '$product.category_id'
                    },
                    product_type: {
                        name: '$product_type.name'
                    }
                }
            }
        ];

        // Thực hiện truy vấn
        const [results, total] = await Promise.all([
            StockEntries.aggregate(pipeline)
                .skip((page - 1) * perPage)
                .limit(parseInt(perPage)),
            StockEntries.countDocuments(filter)
        ]);


        res.render('dashboards/inventory', {
            stocks: results,
            total,
            page: parseInt(page),
            perPage: parseInt(perPage)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy dữ liệu tồn kho'
        });
    }
});
module.exports = router;