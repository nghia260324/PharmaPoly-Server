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

const authenticateToken = require("./middlewares/authenticateToken");

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

app.use("/categories", authenticateToken, categoryRouter);
app.use("/sections", authenticateToken, sectionRouter);
app.use("/product-types", authenticateToken, productTypeRouter);
app.use("/brands", authenticateToken, brandRouter);
app.use("/products", authenticateToken, productRouter);
app.use("/dashboards", authenticateToken, dashboardRouter);
// app.use("/discounts", authenticateToken, discountRouter);
app.use("/discounts", discountRouter);
app.use("/users", authenticateToken, userRouter);
app.use("/orders", authenticateToken, orderRouter);
app.use("/chat", authenticateToken, chatRouter);


// hbs.registerHelper('formatType', function(type) {
//   const formattedTypes = {
//       "percent": "Percentage",
//       "fixed": "Fixed Amount",
//       "free_shipping": "Free Shipping"
//   };
//   return formattedTypes[type] || type;
// });


app.post('/webhook/ghn', async (req, res) => {
  try {
    const data = req.body;
    console.log("GHN Webhook Received:", data);

    if (!data || !data.OrderCode || !data.Status) {
      return res.status(400).send("Invalid Webhook Data");
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

    const newStatus = ghnStatusMap[data.Status] || null;

    if (!newStatus) {
      console.log(`GHN status ${data.Status} is not recognized.`);
      return res.status(400).send("Unknown GHN status");
    }

    const updatedOrder = await Orders.findOneAndUpdate(
      { order_code: data.OrderCode },
      { status: newStatus},
      { new: true }
    );

    if (!updatedOrder) {
      console.log(`Order ${data.OrderCode} not found`);
      return res.status(404).send("Order not found");
    }

    //console.log(`Order ${updatedOrder.order_code} updated to status ${updatedOrder.status}`);
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

    const order = await Orders.findOne({ _id: orderId});
    const userId = order.user_id;
    if (!order) {
      return res.status(404).json({ status: 404, message: "Order not found" });
    }
    order.payment_status = "paid";
    order.transaction_id = reference;
    await order.save();

    await db.ref(`payment_status/${userId}`).set("PAID");
    // if (order.total_price === amount) {
    //   order.payment_status = "paid";
    //   order.transaction_id = reference;
    //   await order.save();

    //   await db.ref(`payment_status/${userId}`).set("PAID");
    // } else {
    //   return res.status(400).json({ status: 400, message: "Incorrect payment amount" });
    // }

    res.json({ status: 200, message: "Webhook received successfully" });
  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).json({ status: 500, message: "Internal Server Error" });
  }
});


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