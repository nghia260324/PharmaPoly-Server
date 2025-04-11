const express = require('express');
const router = express.Router();
const Orders = require('../models/orders');
const Products = require('../models/products');
const OrderItems = require('../models/orderItems');
const StockEntries = require('../models/stockEntries');
const ProductImages = require('../models/productImages');

const { startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, subWeeks } = require('date-fns');

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
        const { sortBy, status, perPage = 10, page = 1 } = req.query;

        const query = {};
        if (status) query.status = status;

        const sortOptions = {
            best_selling: { sold_quantity: -1 },
            worst_selling: { sold_quantity: 1 },
            highest_revenue: { total_revenue: -1 },
            lowest_revenue: { total_revenue: 1 },
            highest_rating: { average_rating: -1 }
        };

        const total_product = await Products.countDocuments(query);

        const products = await Products.find(query)
            .sort(sortOptions[sortBy] || {})
            .skip((page - 1) * +perPage)
            .limit(+perPage)
            .lean();

        const productIds = products.map(p => p._id);
        const images = await ProductImages.find({
            product_id: { $in: productIds },
            is_primary: true
        }).lean();
        const imageMap = {};
        images.forEach(img => {
            imageMap[img.product_id.toString()] = img.image_url;
        });
        products.forEach(p => {
            p.image = imageMap[p._id.toString()];
        });













        

        res.render('dashboards/products', {
            products,
            total: total_product
        });
    } catch (err) {
    }
});
module.exports = router;