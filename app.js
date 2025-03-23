var createError = require('http-errors');
var express = require('express');
var hbs = require('hbs');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const axios = require("axios");
const firebaseAdmin = require('./firebase/firebaseAdmin');

const indexRouter = require('./routes/index');
const apiRouter = require('./routes/api')
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
const authenticateToken = require("./middlewares/authenticateToken");

var app = express();

const PING_INTERVAL = 12 * 60 * 1000;

let lastRequestTime = Date.now();

app.use((req, res, next) => {
  lastRequestTime = Date.now();
  next();
});




const database = require('./config/db');
// const productRoutes = require("./src/routes/productRoutes");
// const userRoutes = require("./src/routes/userRoutes");

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

// hbs.registerHelper('formatType', function(type) {
//   const formattedTypes = {
//       "percent": "Percentage",
//       "fixed": "Fixed Amount",
//       "free_shipping": "Free Shipping"
//   };
//   return formattedTypes[type] || type;
// });
hbs.registerHelper('formatDiscountField', function (value, fieldType) {
  const typeMapping = {
    "percent": "Percentage",
    "fixed": "Fixed Amount",
    "free_shipping": "Free Shipping"
  };

  const appliesToMapping = {
    "all": "All Products",
    "order": "Entire Order",
    "product": "Specific Products",
    "category": "Specific Categories",
    "brand": "Specific Brands"
  };

  if (fieldType === "applies_to") {
    return appliesToMapping[value] || value;
  }

  if (fieldType === "type") {
    return typeMapping[value] || value;
  }

  return value;
});

hbs.registerHelper("getStatusClass", function (status) {
  switch (status) {
      case "pending": return "bg-warning";
      case "confirmed": return "bg-primary";
      case "shipping": return "bg-info";
      case "delivered": return "bg-success";
      case "canceled": return "bg-danger";
      default: return "bg-secondary";
  }
});

hbs.registerHelper("getStatusText", function (status) {
  switch (status) {
      case "pending": return "Chờ xác nhận";
      case "confirmed": return "Đã xác nhận";
      case "shipping": return "Đang giao";
      case "delivered": return "Đã giao";
      case "canceled": return "Đã hủy";
      default: return "Không xác định";
  }
});

hbs.registerHelper("getPaymentClass", function (method) {
  switch (method) {
      case "COD": return "bg-secondary";
      case "MOMO": return "bg-pink";
      case "VNPAY": return "bg-blue";
      default: return "bg-dark";
  }
});
hbs.registerHelper("gt", function (a, b) {
  return a > b;
});
hbs.registerHelper("lt", function (a, b) {
  return a < b;
});
hbs.registerHelper("eq", function (a, b) {
  return a === b;
});
hbs.registerHelper("multiply", function (a, b) {
  return a * b;
});
hbs.registerHelper("addOne", function (value) {
  return value + 1;
});
hbs.registerHelper("json", function (context) {
  return JSON.stringify(context);
});
hbs.registerHelper("add", function (a, b) {
  return a + b;
});
hbs.registerHelper("sub", function (a, b) {
  return a - b;
});
database.connect();
// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// setInterval(async () => {
//   if (Date.now() - lastRequestTime >= PING_INTERVAL) {
//     try {
//       console.log("Pinging server to keep it awake...");
//       await axios.get("https://pharmapoly-server.onrender.com/keep-alive");
//     } catch (error) {
//       console.error("Ping failed:", error.message);
//     }
//   }
// }, PING_INTERVAL);
setInterval(async () => {
  if (Date.now() - lastRequestTime >= PING_INTERVAL) {
    try {
      const now = new Date();
      const timestamp = now.toLocaleString('en-GB', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        day: '2-digit', month: '2-digit', year: 'numeric'
      });

      console.log(`[${timestamp}] Pinging server to keep it awake...`);
      await axios.get("https://pharmapoly-server.onrender.com/keep-alive");
    } catch (error) {
      const now = new Date();
      const timestamp = now.toLocaleString('en-GB', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        day: '2-digit', month: '2-digit', year: 'numeric'
      });

      console.error(`[${timestamp}] Ping failed:`, error.message);
    }
  }
}, PING_INTERVAL);


// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error', { layout: false });

});

module.exports = app;