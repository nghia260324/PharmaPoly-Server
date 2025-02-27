var createError = require('http-errors');
var express = require('express');
var hbs = require('hbs');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const firebaseAdmin = require('./firebase/firebaseAdmin');

const indexRouter = require('./routes/index');
const apiRouter = require('./routes/api')
const categoryRouter = require("./routes/categoryRouter");
const sectionRouter = require("./routes/sectionRouter");
const productTypeRouter = require("./routes/productTypeRouter");
const brandRouter = require("./routes/brandRouter");
const productRouter = require("./routes/productRouter");
const userRouter = require("./routes/userRouter");
const productImageRouter = require("./routes/productImageRouter");
const authenticateToken = require("./middlewares/authenticateToken"); // Import middleware

var app = express();

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

app.use("/categories" , authenticateToken,categoryRouter);
app.use("/sections",authenticateToken, sectionRouter);
app.use("/product-types", authenticateToken,productTypeRouter);
app.use("/brands",authenticateToken, brandRouter);
app.use("/products",authenticateToken, productRouter);
//app.use("/users", userRouter);
//app.use("/product-images", productImageRouter);

database.connect();
// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error', {layout: false });
  
});

module.exports = app;