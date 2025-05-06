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
const { Types } = require("mongoose");
const mongoose = require("mongoose");
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
const StockEntries = require("./models/stockEntries");
const Notifications = require("./models/notifications");
const Users = require("./models/users");

const { sendNotification, sendNotificationToAdmin } = require('./utils/notification');

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
      return res.status(400).send("Dữ liệu webhook không hợp lệ");
    }

    if (data.ShopID !== SHOP_ID) {
      return res.status(403).send("ShopID không hợp lệ");
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
      console.log(`Trạng thái GHN ${data.Status} không được nhận diện.`);
      return res.status(200).send("Trạng thái GHN không xác định, đã bỏ qua");
    }

    const order = await Orders.findOne({ order_code: data.OrderCode });

    if (!order) {
      console.log(`Không tìm thấy đơn hàng với mã ${data.OrderCode}`);
      return res.status(200).send("Không tìm thấy đơn hàng");
    }

    if (order.status === "delivered") {
      return res.status(200).send("Đơn hàng đã được giao, không cần cập nhật");
    }

    const updateFields = { status: newStatus };

    if (newStatus === "delivered") {
      updateFields.delivered_at = new Date();
      if (order.payment_method === "COD") {
        updateFields.payment_status = "paid";
      }
    }

    const updatedOrder = await Orders.findOneAndUpdate(
      { order_code: data.OrderCode },
      updateFields,
      { new: true }
    );

    if (!updatedOrder) {
      console.log(`Không thể cập nhật đơn hàng ${data.OrderCode}`);
      return res.status(404).send("Không thể cập nhật đơn hàng");
    }

    // if (newStatus === "returned") {
    // }

    if (
      newStatus === 'picked' ||
      newStatus === 'delivering' ||
      newStatus === 'delivered'
    ) {
      sendPickedNotification(order, newStatus);
    }

    console.log(`Đơn hàng ${updatedOrder.order_code} đã được cập nhật trạng thái ${updatedOrder.status}`);
    res.status(200).send("Đơn hàng đã được cập nhật");


  } catch (error) {
    console.error("Lỗi khi xử lý webhook:", error);
    res.status(500).send("Lỗi hệ thống");
  }
});

// app.post("/webhook/payment", async (req, res) => {
//   try {
//     const { error, data } = req.body;

//     if (error !== 0 || !data) {
//       console.log("Dữ liệu Casso không hợp lệ:", req.body);
//       return res.status(200).json({ status: 200, message: "Dữ liệu Casso không hợp lệ, đã bỏ qua" });
//     }

//     const { reference, description, amount } = data;

//     if (!reference || !description || !amount) {
//       console.log("Thiếu trường dữ liệu bắt buộc:", data);
//       return res.status(200).json({ status: 200, message: "Thiếu trường dữ liệu, đã bỏ qua" });
//     }

//     if (reference === "MA_GIAO_DICH_THU_NGHIEM" || description === "giao dich thu nghiem") {
//       return res.json({ status: 200, message: "Đã nhận giao dịch thử nghiệm thành công" });
//     }


//     if (description.startsWith('REJECT')) {
//       const refundMatch = description.match(/REJECT([a-f0-9]{24})END/);
//       if (refundMatch) {
//         const orderId = refundMatch[1];
//         const order = await Orders.findById(orderId);
//         if (!order) {
//           console.log(`Không tìm thấy đơn hàng để từ chối: ${orderId}`);
//           return res.status(200).json({ status: 200, message: "Không tìm thấy đơn hàng để từ chối, đã bỏ qua" });
//         }

//         const paidAmount = Number(amount);
//         if (order.total_price !== paidAmount) {
//           console.log(`Số tiền từ chối không chính xác cho đơn hàng ${orderId}: Mong đợi ${order.total_price}, nhận được ${paidAmount}`);
//           return res.status(200).json({ status: 200, message: "Số tiền hoàn trả không chính xác, đã bỏ qua" });
//         }

//         order.payment_status = 'refunded';
//         order.status = 'rejected';
//         await order.save();

//         await sendRejectedNotification(order);

//         await db.ref(`reject_requests/${orderId}`).remove();

//         console.log(`Đơn hàng ${orderId} đã bị từ chối thành công`);
//         return res.json({ status: 200, message: "Từ chối đơn hàng và hoàn tiền thành công" });
//       }

//       console.log("Mẫu từ chối không khớp");
//       return res.status(200).json({ status: 200, message: "Mẫu từ chối không hợp lệ, đã bỏ qua" });
//     }

//     if (description.startsWith('REFUND')) {
//       const refundMatch = description.match(/REFUND([a-f0-9]{24})END/);
//       if (refundMatch) {
//         const orderId = refundMatch[1];
//         const order = await Orders.findById(orderId);
//         if (!order) {
//           console.log(`Không tìm thấy đơn hàng để hoàn tiền: ${orderId}`);
//           return res.status(200).json({ status: 200, message: "Không tìm thấy đơn hàng để hoàn tiền, đã bỏ qua" });
//         }
//         const paidAmount = Number(amount);
//         if (order.total_price !== paidAmount) {
//           console.log(`Số tiền từ chối không chính xác cho đơn hàng ${orderId}: Mong đợi ${order.total_price}, nhận được ${paidAmount}`);
//           return res.status(200).json({ status: 200, message: "Số tiền hoàn trả không chính xác, đã bỏ qua" });
//         }

//         order.payment_status = 'refunded';
//         order.status = 'canceled';
//         await order.save();

//         await sendRefundNotification(order);

//         console.log(`Hoàn tiền thành công cho đơn hàng ${orderId}`);
//         return res.json({ status: 200, message: "Đã xử lý hoàn tiền thành công" });
//       }

//       console.log("Mẫu hoàn tiền không khớp");
//       return res.status(200).json({ status: 200, message: "Mẫu hoàn tiền không hợp lệ, đã bỏ qua" });
//     }


//     const match = description.match(/OID([a-f0-9]{24})END/);
//     if (!match) {
//       return res.status(200).json({ status: 200, message: "Mẫu giao dịch không hợp lệ, đã bỏ qua" });
//     }

//     const orderId = match[1];

//     const order = await Orders.findById(orderId);
//     if (!order) {
//       console.log(`Không tìm thấy đơn hàng: ${orderId}`);
//       return res.status(200).json({ status: 200, message: "Không tìm thấy đơn hàng, đã bỏ qua" });
//     }

//     if (order.payment_status === "paid") {
//       return res.json({ status: 200, message: "Đơn hàng đã được thanh toán" });
//     }

//     const paidAmount = Number(amount);
//     if (order.total_price !== paidAmount) {
//       console.log(`Số tiền thanh toán không chính xác cho đơn hàng ${orderId}: Mong đợi ${order.total_price}, nhận được ${paidAmount}`);
//       return res.status(200).json({ status: 200, message: "Số tiền thanh toán không chính xác, đã bỏ qua" });
//     }

//     order.payment_status = "paid";
//     order.transaction_id = reference;
//     await order.save();

//     console.log(`Thanh toán thành công cho đơn hàng ${orderId}`);
//     res.json({ status: 200, message: "Đã nhận webhook thành công" });

//   } catch (error) {
//     console.error("Lỗi Webhook:", error);
//     res.status(500).json({ status: 500, message: "Lỗi máy chủ nội bộ" });
//   }
// });


app.post("/webhook/payment", async (req, res) => {
  try {
    const { error, data } = req.body;
    if (error !== 0 || !data) {
      console.log("Dữ liệu Casso không hợp lệ:", req.body);
      return res.status(200).json({ status: 200, message: "Dữ liệu Casso không hợp lệ, đã bỏ qua" });
    }

    const { reference, description, amount } = data;

    if (!reference || !description || !amount) {
      console.log("Thiếu trường dữ liệu bắt buộc:", data);
      return res.status(200).json({ status: 200, message: "Thiếu trường dữ liệu, đã bỏ qua" });
    }

    if (reference === "MA_GIAO_DICH_THU_NGHIEM" || description === "giao dich thu nghiem") {
      return res.json({ status: 200, message: "Đã nhận giao dịch thử nghiệm thành công" });
    }

    const match = description.match(/^(REJECT|REFUND|OID)([a-f0-9]{24})END$/);
    if (!match) {
      return res.status(200).json({ status: 200, message: "Mẫu giao dịch không hợp lệ, đã bỏ qua" });
    }

    const [, type, orderId] = match;
    const order = await Orders.findById(new mongoose.Types.ObjectId(orderId));
    if (!order) {
      console.log(`Không tìm thấy đơn hàng: ${orderId}`);
      return res.status(200).json({ status: 200, message: "Không tìm thấy đơn hàng, đã bỏ qua" });
    }

    if (["canceled", "rejected"].includes(order.status)) {
      console.log(`Đơn hàng ${orderId} đã bị huỷ hoặc từ chối, bỏ qua thanh toán.`);
      return res.status(200).json({ status: 200, message: "Đơn hàng đã được xử lý" });
    }

    const paidAmount = Number(amount);
    if (order.status === 'returned') {
      if (order.total_price - order.shipping_fee !== paidAmount) {
        console.log(`Số tiền không chính xác cho đơn hàng ${orderId}`);
        return res.status(200).json({ status: 200, message: "Số tiền thanh toán không chính xác, đã bỏ qua" });
      }
    } else {
      if (order.total_price !== paidAmount) {
        console.log(`Số tiền không chính xác cho đơn hàng ${orderId}`);
        return res.status(200).json({ status: 200, message: "Số tiền thanh toán không chính xác, đã bỏ qua" });
      }
    }

    let message = "Đã xử lý thành công";

    switch (type) {
      case 'REJECT':
        order.payment_status = 'refunded';
        order.status = 'rejected';
        await order.save();
        await sendRejectedNotification(order);
        await db.ref(`reject_requests/${orderId}`).remove();
        message = "Từ chối đơn hàng và hoàn tiền thành công";
        console.log(`Đơn hàng ${orderId} đã bị từ chối thành công`);
        break;

      case 'REFUND':
        if (order.status !== 'returned') {
          order.status = 'canceled';
        }

        order.payment_status = 'refunded';

        const orderItems = await OrderItems.find({ order_id: order._id })
          .populate({
            path: "product_product_type_id",
            model: "productProductType",
            populate: {
              path: "product_id",
              model: "product",
              select: "name"
            }
          });
        for (const item of orderItems) {
          for (const batch of item.batches) {
            const stockEntry = await StockEntries.findOne({ batch_number: batch.batch_number });
            if (stockEntry) {
              stockEntry.remaining_quantity += batch.quantity;
              if (stockEntry.status === "sold_out" && stockEntry.remaining_quantity > 0) {
                stockEntry.status = "active";
              }
              await stockEntry.save();
            }
          }
        }

        await order.save();
        await sendRefundNotification(order);

        const ref = db.ref(`admin_notifications/${orderId}`);
        await ref.remove();

        message = "Đã xử lý hoàn tiền thành công";
        console.log(`Hoàn tiền thành công cho đơn hàng ${orderId}`);
        break;

      case 'OID':
        if (order.payment_status === "paid") {
          return res.json({ status: 200, message: "Đơn hàng đã được thanh toán" });
        }
        order.payment_status = "paid";
        order.transaction_id = reference;
        await order.save();
        await sendPaymentNotification(order);
        message = "Thanh toán thành công";
        console.log(`Thanh toán thành công cho đơn hàng ${orderId}`);
        break;
    }

    return res.json({ status: 200, message });

  } catch (error) {
    console.error("Lỗi Webhook:", error);
    res.status(500).json({ status: 500, message: "Lỗi máy chủ nội bộ" });
  }
});


const sendPickedNotification = async (order, newStatus) => {
  try {
    const orderItems = await OrderItems.find({ order_id: order._id })
      .populate({
        path: "product_product_type_id",
        model: "productProductType",
        populate: {
          path: "product_id",
          model: "product",
          select: "name"
        }
      });
    const firstProductName = orderItems[0]?.product_product_type_id?.product_id?.name || "sản phẩm";

    const shortenName = (name, maxLength = 40) => {
      return name.length > maxLength ? name.slice(0, maxLength).trim() + '…' : name;
    };

    const shortName = shortenName(firstProductName);
    const otherCount = orderItems.length - 1;

    const productSummary = otherCount > 0
      ? `${shortName} và ${otherCount} sản phẩm khác`
      : shortName;

    let title = '';
    let message = '';

    switch (newStatus) {
      case 'picked':
        title = 'Đơn hàng đã được tiếp nhận';
        message = `Đơn hàng của bạn (${productSummary}) đã được tiếp nhận và đang trong quá trình vận chuyển.`;
        break;
      case 'delivering':
        title = 'Đơn hàng đang được giao';
        message = `Đơn hàng của bạn (${productSummary}) đang trên đường giao đến bạn.`;
        break;
      case 'delivered':
        title = 'Đơn hàng đã giao thành công';
        message = `Đơn hàng của bạn (${productSummary}) đã được giao thành công. Cảm ơn bạn đã mua hàng!`;
        break;
      default:
        return;
    }

    await sendNotification({
      user_id: order.user_id,
      title,
      message
    });
  } catch (error) {
    console.error("Lỗi khi gửi thông báo cho trạng thái 'picked':", error.message);
  }
};

const sendRefundNotification = async (order) => {
  const orderItems = await OrderItems.find({ order_id: order._id })
    .populate({
      path: "product_product_type_id",
      model: "productProductType",
      populate: {
        path: "product_id",
        model: "product",
        select: "name"
      }
    });
  const firstProductName = orderItems[0]?.product_product_type_id?.product_id?.name || "sản phẩm";
  const shortenName = (name, maxLength = 40) =>
    name.length > maxLength ? name.slice(0, maxLength).trim() + '…' : name;
  const shortName = shortenName(firstProductName);
  const otherCount = orderItems.length - 1;

  const productSummary =
    otherCount > 0 ? `${shortName} và ${otherCount} sản phẩm khác` : shortName;

  let title = 'Yêu cầu hủy đơn hàng đã được xác nhận và hoàn tiền';

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

  let message = `- Yêu cầu hủy đơn hàng (${productSummary}) của bạn đã được xác nhận và hoàn tiền thành công.\n` +
    `- Số tiền hoàn lại: ${formattedPrice}.\n` +
    `- Tiền đã được hoàn về STK ${stk} tại ngân hàng ${bank.shortName}.\n` +
    `- Thời gian hoàn tiền: ${formattedTime}.`;

  if (order.status === "returned") {
    title = 'Đơn hàng bị trả lại và đã hoàn tiền';

    message =
      `- Đơn hàng (${productSummary}) của bạn đã bị trả lại do không nhận hàng.\n` +
      `- Số tiền được hoàn lại (không bao gồm phí vận chuyển): ${formattedPrice}.\n` +
      `- Tiền đã được hoàn về STK ${stk} tại ngân hàng ${bank.shortName}.\n` +
      `- Thời gian hoàn tiền: ${formattedTime}.`;
  }

  await sendNotification({
    user_id: order.user_id,
    title,
    message
  });
};

const sendPaymentNotification = async (order) => {
  const orderItems = await OrderItems.find({ order_id: order._id })
    .populate({
      path: "product_product_type_id",
      model: "productProductType",
      populate: {
        path: "product_id",
        model: "product",
        select: "name"
      }
    });
  const firstProductName = orderItems[0]?.product_product_type_id?.product_id?.name || "sản phẩm";
  const shortenName = (name, maxLength = 40) => {
    return name.length > maxLength ? name.slice(0, maxLength).trim() + '…' : name;
  };

  const shortName = shortenName(firstProductName);
  const otherCount = orderItems.length - 1;

  const productSummary = otherCount > 0
    ? `${shortName} và ${otherCount} sản phẩm khác`
    : shortName;

  const currentTime = new Date();
  const formattedTime = `${currentTime.getHours()}:${currentTime.getMinutes().toString().padStart(2, '0')} ngày ${currentTime.getDate()}/${currentTime.getMonth() + 1}/${currentTime.getFullYear()}`;

  const message =
    `- Đơn hàng của bạn (${productSummary}) đã thanh toán thành công.\n` +
    `- Số tiền: ${order.total_price.toLocaleString()} VNĐ.\n` +
    `- Thời gian thanh toán: ${formattedTime}`;

  await sendNotification({
    user_id: order.user_id,
    title: 'Thanh toán thành công cho đơn hàng của bạn',
    message: message
  });
};

const sendRejectedNotification = async (order) => {
  const orderItems = await OrderItems.find({ order_id: order._id })
    .populate({
      path: "product_product_type_id",
      model: "productProductType",
      populate: {
        path: "product_id",
        model: "product",
        select: "name"
      }
    });
  const firstProductName = orderItems[0]?.product_product_type_id?.product_id?.name || "sản phẩm";
  const shortenName = (name, maxLength = 40) => {
    return name.length > maxLength ? name.slice(0, maxLength).trim() + '…' : name;
  };

  const shortName = shortenName(firstProductName);
  const otherCount = orderItems.length - 1;

  const rejectReasonRef = await db.ref(`reject_requests/${order._id}`).once('value');
  const rejectReason = rejectReasonRef.val();

  const productSummary = otherCount > 0
    ? `${shortName} và ${otherCount} sản phẩm khác`
    : shortName;

  const message =
    `- Đơn hàng của bạn (${productSummary}) đã bị từ chối.\n` +
    `- Lý do: ${rejectReason}.`;


  await sendNotification({
    user_id: order.user_id,
    title: 'Đơn hàng của bạn đã bị từ chối',
    message: message
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
//   const order = await Orders.findById("681733b250f229660edb194a")
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