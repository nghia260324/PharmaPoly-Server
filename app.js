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

const registerHelpers = require('./utils/hbsHelpers');
registerHelpers();

const { authenticateToken, authorizeAdmin } = require("./middlewares/authenticateToken");

var app = express();



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
    if (req.method !== 'POST') {
      return res.status(405).send("Method Not Allowed");
    }
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
      return res.status(400).send("Unknown GHN status");
    }

    const order = await Orders.findOne({ order_code: data.OrderCode });

    if (!order) {
      console.log(`Order ${data.OrderCode} not found`);
      return res.status(404).send("Order not found");
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
      return res.status(400).json({ status: 400, message: "Invalid Casso data" });
    }

    const { reference, description, amount } = data;

    if (!reference || !description || !amount) {
      return res.status(400).json({ status: 400, message: "Missing required fields" });
    }

    if (reference === "MA_GIAO_DICH_THU_NGHIEM" || description === "giao dich thu nghiem") {
      return res.json({ status: 200, message: "Test transaction received successfully" });
    }

    if (description.length < 48) {
      return res.status(400).json({ status: 400, message: "Invalid transaction description format" });
    }

    const match = description.match(/OID([a-f0-9]{24})END/);
    if (!match) {
      return res.status(400).json({ status: 400, message: "Invalid transaction format" });
    }


    const orderId = match[1];

    const order = await Orders.findOne({ _id: orderId });
    if (!order) {
      return res.status(404).json({ status: 404, message: "Order not found" });
    }

    if (order.payment_status === "paid") {
      return res.json({ status: 200, message: "Order already paid" });
    }

    const userId = order.user_id;

    const paidAmount = Number(amount);
    if (order.total_price === paidAmount) {
      order.payment_status = "paid";
      order.transaction_id = reference;
      await order.save();

      await db.ref(`payment_status/${userId}`).set("PAID");

      res.json({ status: 200, message: "Webhook received successfully" });
    } else {
      return res.status(400).json({ status: 400, message: "Incorrect payment amount" });
    }
  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).json({ status: 500, message: "Internal Server Error" });
  }
});
// order.payment_status = "paid";
// order.transaction_id = reference;
// await order.save();

// await db.ref(`payment_status/${userId}`).set("PAID");

const verifyCassoSignature = (req, res, next) => {
  try {
    const secretKey = process.env.CASSO_SECRET_KEY;
    const cassoSignature = req.headers["x-casso-signature"];
    const requestBody = JSON.stringify(req.body);

    const computedSignature = crypto
      .createHmac("sha256", secretKey)
      .update(requestBody)
      .digest("hex");

    if (computedSignature !== cassoSignature) {
      return res.status(403).json({ status: 403, message: "Invalid signature" });
    }
    next();
  } catch (error) {
    console.error("❌ Lỗi xác thực Webhook:", error);
    res.status(500).json({ status: 500, message: "Internal Server Error" });
  }
};



database.connect();
// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});



app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error', { layout: false });

});

module.exports = app;