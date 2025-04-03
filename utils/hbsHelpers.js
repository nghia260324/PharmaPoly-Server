const hbs = require("hbs");

// Định nghĩa các helper
const registerHelpers = () => {
  hbs.registerHelper("ifCond", function (v1, v2, options) {
    return v1 === v2 ? options.fn(this) : options.inverse(this);
  });

  hbs.registerHelper("formatDiscountField", function (value, fieldType) {
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
    const statusClasses = {
      "pending": "bg-warning",
      "confirmed": "bg-primary",
      "ready_to_pick": "bg-info",
      "picking": "bg-info",
      "picked": "bg-secondary",
      "delivering": "bg-primary",
      "money_collect_delivering": "bg-success",
      "delivered": "bg-success",
      "delivery_fail": "bg-danger",
      "waiting_to_return": "bg-warning",
      "return": "bg-info",
      "returned": "bg-success",
      "return_fail": "bg-danger",
      "canceled": "bg-danger"
    };
    return statusClasses[status] || "bg-secondary";
  });

  hbs.registerHelper("getStatusText", function (status) {
    const statusTexts = {
      "pending": "Chờ xác nhận",
      "confirmed": "Đã xác nhận",
      "ready_to_pick": "Chờ lấy hàng",
      "picking": "Đang lấy hàng",
      "picked": "Đã lấy hàng thành công",
      "delivering": "Đang giao hàng",
      "money_collect_delivering": "Đang giao COD",
      "delivered": "Giao hàng thành công",
      "delivery_fail": "Giao hàng thất bại",
      "waiting_to_return": "Chờ hoàn hàng",
      "return": "Đang hoàn hàng",
      "returned": "Đã hoàn hàng",
      "return_fail": "Hoàn hàng thất bại",
      "canceled": "Đơn hàng bị hủy"
    };
    return statusTexts[status] || "Không xác định";
  });

  hbs.registerHelper("getPaymentClass", function (method) {
    const paymentClasses = {
      "COD": "bg-secondary",
      "MOMO": "bg-pink",
      "VNPAY": "bg-blue"
    };
    return paymentClasses[method] || "bg-dark";
  });

  hbs.registerHelper("gt", (a, b) => a > b);
  hbs.registerHelper("lt", (a, b) => a < b);
  hbs.registerHelper("eq", (a, b) => a === b);
  hbs.registerHelper('neq', (a, b) => a !== b);
  hbs.registerHelper("or", (a, b) => a || b);
  hbs.registerHelper("multiply", (a, b) => a * b);
  hbs.registerHelper("addOne", (value) => value + 1);
  hbs.registerHelper("json", (context) => JSON.stringify(context));
  hbs.registerHelper("add", (a, b) => a + b);
  hbs.registerHelper("sub", (a, b) => a - b);
  hbs.registerHelper("and", (a, b) => a && b);
  hbs.registerHelper('formatProductStatus', function (status) {
    switch (status) {
      case 'not_started':
        return 'Chưa bắt đầu bán';
      case 'active':
        return 'Đang bán';
      case 'paused':
        return 'Tạm ngừng bán';
      case 'out_of_stock':
        return 'Hết hàng';
      default:
        return 'Trạng thái không xác định';
    }
  });
  hbs.registerHelper("getProductStatusClass", function (status) {
    const statusClasses = {
      "not_started": "bg-secondary",
      "active": "bg-success",
      "paused": "bg-warning",
      "out_of_stock": "bg-danger"
    };
    return statusClasses[status] || "bg-secondary";
  });
  hbs.registerHelper("formatPrice", function (price) {
    if (typeof price !== "number") {
      return "N/A";
    }
    return price.toLocaleString("vi-VN");
  });

};

module.exports = registerHelpers;
