var createError = require('http-errors');
var express = require('express');
var hbs = require('hbs');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const axios = require("axios");
require("dotenv").config();
const crypto = require("crypto");
require("./utils/cronJobs");

const { firebaseAdmin, db } = require('./firebase/firebaseAdmin');
const SHOP_ID = Number(process.env.GHN_SHOP_ID);

const indexRouter = require('./routes/index');
//const apiRouter = require('./routes/api')
const { router: apiRouter } = require("./routes/api");

const categoryRouter = require("./routes/categoryRouter");
const sectionRouter = require("./routes/sectionRouter");
const productTypeRouter = require("./routes/productTypeRouter");
const brandRouter = require("./routes/brandRouter");
const productRouter = require("./routes/productRouter");
const userRouter = require("./routes/userRouter");
const dashboardRouter = require("./routes/dashboardRouter");
const discountRouter = require("./routes/discountRouter");
const productImageRouter = require("./routes/productImageRouter");
const orderRouter = require("./routes/orderRouter");
const Orders = require('./models/orders');
const chatRouter = require("./routes/chatRouter");
const OrderItems = require("./models/orderItems");

const { sendNotification } = require('./utils/notification');

const registerHelpers = require('./utils/hbsHelpers');
registerHelpers();

const { authenticateToken, authorizeAdmin } = require("./middlewares/authenticateToken");

var app = express();
const binMap = {
  "01203001": "970436",
};


const database = require('./config/db');

// view engine setup
hbs.registerPartials(path.join(__dirname, 'views/partials'));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');


app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));



app.use('/', indexRouter);
app.use('/api', apiRouter);

app.use("/categories", authenticateToken, authorizeAdmin, categoryRouter);
app.use("/sections", authenticateToken, authorizeAdmin, sectionRouter);
app.use("/product-types", authenticateToken, authorizeAdmin, productTypeRouter);
app.use("/brands", authenticateToken, authorizeAdmin, brandRouter);
app.use("/products", authenticateToken, authorizeAdmin, productRouter);
app.use("/dashboards", authenticateToken, authorizeAdmin, dashboardRouter);
// app.use("/discounts", authenticateToken, discountRouter);
app.use("/discounts", authenticateToken, authorizeAdmin, discountRouter);
app.use("/users", authenticateToken, authorizeAdmin, userRouter);
app.use("/orders", authenticateToken, authorizeAdmin, orderRouter);
app.use("/chat", authenticateToken, authorizeAdmin, chatRouter);




app.post('/webhook/ghn', async (req, res) => {
  try {
    const data = req.body;

    if (!data || !data.OrderCode || !data.Status) {
      return res.status(400).send("Invalid Webhook Data");
    }
    if (data.ShopID !== SHOP_ID) {
      return res.status(403).send("Forbidden");
    }
    const ghnStatusMap = {
      "pending": "pending",
      "confirmed": "confirmed",
      "ready_to_pick": "ready_to_pick",
      "picking": "picking",
      "picked": "picked",
      "delivering": "delivering",
      "money_collect_delivering": "money_collect_delivering",
      "delivered": "delivered",
      "delivery_fail": "delivery_fail",
      "waiting_to_return": "waiting_to_return",
      "return": "return",
      "returned": "returned",
      "return_fail": "return_fail",
      "cancel": "canceled"
    };

    const newStatus = ghnStatusMap[data.Status];

    if (!newStatus) {
      console.log(`GHN status ${data.Status} is not recognized.`);
      return res.status(200).send("Unknown GHN status, ignored");
    }

    const order = await Orders.findOne({ order_code: data.OrderCode });

    if (!order) {
      console.log(`Order ${data.OrderCode} not found`);
      return res.status(200).send("Order not found");
    }

    if (order.status === "delivered") {
      return res.status(200).send("Order already delivered");
    }

    const updateFields = { status: newStatus };

    if (newStatus === "delivered") {
      updateFields.delivered_at = new Date();
    }

    const updatedOrder = await Orders.findOneAndUpdate(
      { order_code: data.OrderCode },
      updateFields,
      { new: true }
    );

    if (!updatedOrder) {
      console.log(`Order ${data.OrderCode} not found`);
      return res.status(404).send("Order not found");
    }

    console.log(`Order ${updatedOrder.order_code} updated to status ${updatedOrder.status}`);
    res.status(200).send("Webhook received and order updated");
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).send("Internal Server Error");
  }
});


app.post("/webhook/payment", async (req, res) => {
  try {
    const { error, data } = req.body;

    if (error !== 0 || !data) {
      console.log("Invalid Casso data received:", req.body);
      return res.status(200).json({ status: 200, message: "Invalid Casso data, ignored" });
    }

    const { reference, description, amount } = data;

    if (!reference || !description || !amount) {
      console.log("Missing required fields:", data);
      return res.status(200).json({ status: 200, message: "Missing required fields, ignored" });
    }

    if (reference === "MA_GIAO_DICH_THU_NGHIEM" || description === "giao dich thu nghiem") {
      return res.json({ status: 200, message: "Test transaction received successfully" });
    }

    if (description.startsWith('REFUND')) {
      const refundMatch = description.match(/REFUND([a-f0-9]{24})END/);
      if (refundMatch) {
        const orderId = refundMatch[1];
        const order = await Orders.findById(orderId);
        if (!order) {
          console.log(`Order not found for refund: ${orderId}`);
          return res.status(200).json({ status: 200, message: "Refund order not found, ignored" });
        }

        order.payment_status = 'refunded';
        order.status = 'canceled';
        await order.save();

        await sendRefundNotification(order);

        console.log(`Refund successful for order ${orderId}`);
        return res.json({ status: 200, message: "Refund processed successfully" });
      }

      console.log("Refund pattern not matched");
      return res.status(200).json({ status: 200, message: "Invalid refund format, ignored" });
    }

    const match = description.match(/OID([a-f0-9]{24})END/);
    if (!match) {
      return res.status(200).json({ status: 200, message: "Invalid transaction format, ignored" });
    }

    const orderId = match[1];

    const order = await Orders.findById(orderId);
    if (!order) {
      console.log(`Order not found: ${orderId}`);
      return res.status(200).json({ status: 200, message: "Order not found, ignored" });
    }

    if (order.payment_status === "paid") {
      return res.json({ status: 200, message: "Order already paid" });
    }

    const paidAmount = Number(amount);
    if (order.total_price !== paidAmount) {
      console.log(`Incorrect payment amount for order ${orderId}: Expected ${order.total_price}, received ${paidAmount}`);
      return res.status(200).json({ status: 200, message: "Incorrect payment amount, ignored" });
    }

    order.payment_status = "paid";
    order.transaction_id = reference;
    await order.save();

    await db.ref(`payment_status/${order.user_id}`).set("PAID");

    console.log(`Payment successful for order ${orderId}`);
    res.json({ status: 200, message: "Webhook received successfully" });

  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).json({ status: 500, message: "Internal Server Error" });
  }
});


const sendRefundNotification = async (order) => {
  const orderItems = await OrderItems.find({ order_id: order._id })
    .populate({
      path: "product_product_type_id",
      model: "productProductType",
      populate: {
        path: "product_id",  // Populate thêm thông tin sản phẩm từ mô hình "product"
        model: "product",    // Mô hình sản phẩm là "product"
        select: "name"       // Chỉ lấy tên sản phẩm
      }
    });
  const firstProductName = orderItems[0]?.product_product_type_id?.product_id?.name || "sản phẩm";
  const shortenName = (name, maxLength = 40) =>
    name.length > maxLength ? name.slice(0, maxLength).trim() + '…' : name;
  const shortName = shortenName(firstProductName);
  const otherCount = orderItems.length - 1;

  const productSummary =
    otherCount > 0 ? `${shortName} và ${otherCount} sản phẩm khác` : shortName;

  const title = 'Yêu cầu hủy đơn hàng đã được xác nhận và hoàn tiền';

  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const formattedTime = `vào lúc ${hours}:${minutes} ngày ${day}/${month}/${year}`;

  const formattedPrice = order.total_price.toLocaleString('vi-VN') + ' VNĐ';

  const transaction_data = await getTransactionInfo(order.transaction_id);
  const bank = await getBankFromVietQR(transaction_data.data["Mã BIN ngân hàng đối ứng"]);

  const stk = transaction_data.data["Số tài khoản đối ứng"];

  const message = `- Yêu cầu hủy đơn hàng (${productSummary}) của bạn đã được xác nhận và hoàn tiền thành công.\n` +
    `- Số tiền hoàn lại: ${formattedPrice}.\n` +
    `- Tiền đã được hoàn về STK ${stk} tại ngân hàng ${bank.shortName}.\n` +
    `- Thời gian hoàn tiền: ${formattedTime}.`;

  await sendNotification({
    user_id: order.user_id,
    title,
    message
  });
};

async function getTransactionInfo(transactionId) {
  const url = `https://script.google.com/macros/s/AKfycbzvTz-hwBcrfK6dpRKu3slToY2gLr2ftlnoB0KuR3xLWJvkeCz4_BcXzDfRy_Qo-ywk/exec?transaction_id=${transactionId}`;
  const response = await fetch(url);
  const data = await response.json();
  if (data.error) {
    throw new Error(data.message || "Failed to fetch transaction data");
  }
  return data;
}

async function getBankFromVietQR(bin) {
  const mappedBin = binMap[bin] || bin;
  const url = "https://api.vietqr.io/v2/banks";
  const response = await fetch(url);
  const data = await response.json();

  if (!data.data || data.data.length === 0) {
    throw new Error("No banks found");
  }

  const bank = data.data.find(bank => bank.bin === mappedBin);
  if (!bank) {
    throw new Error("Bank not found for BIN: " + bin);
  }

  return bank;
}


// const testNotification = async () => {
//   const order = await Orders.findById("68118923c42e43956614039d")
//   sendRefundNotification(order);
// };


// testNotification();











database.connect();
app.use(function (req, res, next) {
  next(createError(404));
});



app.use(function (err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  res.status(err.status || 500);
  res.render('error', { layout: false });

});

module.exports = app;