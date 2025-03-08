const DISCOUNT_CONDITIONS = [
    {
      key: "minimum_items",
      label: "Số lượng sản phẩm tối thiểu",
      inputType: "number",
      validValues: { min: 1 }
    },
    {
      key: "first_time_user",
      label: "Áp dụng cho khách hàng mới",
      inputType: "boolean",
      validValues: null
    },
    {
      key: "specific_payment_method",
      label: "Chỉ áp dụng với một số phương thức thanh toán",
      inputType: "array",
      validValues: ["cod", "online"]
    },
    {
      key: "specific_time_range",
      label: "Chỉ áp dụng trong khoảng thời gian cụ thể",
      inputType: "object",
      validValues: { from: "HH:mm", to: "HH:mm" }
    },
    {
      key: "customer_group",
      label: "Chỉ áp dụng cho nhóm khách hàng",
      inputType: "string",
      validValues: ["vip", "regular"]
    },
    {
      key: "minimum_order_value",
      label: "Giá trị đơn hàng tối thiểu",
      inputType: "number",
      validValues: { min: 1 }
    },
    {
      key: "maximum_order_value",
      label: "Giá trị đơn hàng tối đa",
      inputType: "number",
      validValues: null
    },
    {
      key: "specific_users",
      label: "Chỉ áp dụng cho danh sách khách hàng cụ thể",
      inputType: "array",
      validValues: "fetch_users"
    },
    {
      key: "excluded_users",
      label: "Không áp dụng cho danh sách khách hàng cụ thể",
      inputType: "array",
      validValues: "fetch_users"
    },
    {
      key: "specific_products",
      label: "Chỉ áp dụng cho một số sản phẩm",
      inputType: "array",
      validValues: "fetch_products"
    },
    {
      key: "excluded_products",
      label: "Không áp dụng cho một số sản phẩm",
      inputType: "array",
      validValues: "fetch_products"
    },
    {
      key: "specific_brands",
      label: "Chỉ áp dụng cho một số thương hiệu",
      inputType: "array",
      validValues: "fetch_brands"
    },
    {
      key: "excluded_brands",
      label: "Không áp dụng cho một số thương hiệu",
      inputType: "array",
      validValues: "fetch_brands"
    },
    {
      key: "specific_categories",
      label: "Chỉ áp dụng cho một số danh mục sản phẩm",
      inputType: "array",
      validValues: "fetch_categories"
    },
    {
      key: "excluded_categories",
      label: "Không áp dụng cho một số danh mục sản phẩm",
      inputType: "array",
      validValues: "fetch_categories"
    },
    {
      key: "new_product_only",
      label: "Chỉ áp dụng cho sản phẩm mới ra mắt",
      inputType: "number",
      validValues: { min: 1, max: 365 }
    },
    {
      key: "first_n_orders",
      label: "Chỉ áp dụng cho X đơn hàng đầu tiên trong hệ thống",
      inputType: "number",
      validValues: { min: 1 }
    },
    {
      key: "first_n_orders_per_user",
      label: "Chỉ áp dụng cho X đơn hàng đầu tiên của mỗi người dùng",
      inputType: "number",
      validValues: { min: 1 }
    },
    {
      key: "specific_shipping_method",
      label: "Chỉ áp dụng với một số phương thức vận chuyển",
      inputType: "array",
      validValues: ["fast_shipping", "standard_shipping"]
    },
    {
      key: "excluded_shipping_method",
      label: "Không áp dụng với một số phương thức vận chuyển",
      inputType: "array",
      validValues: ["cod"]
    },
    {
      key: "maximum_usage_per_user",
      label: "Giới hạn số lần sử dụng trên mỗi user",
      inputType: "number",
      validValues: { min: 1 }
    },
    {
      key: "day_of_week",
      label: "Chỉ áp dụng vào các ngày cụ thể trong tuần",
      inputType: "array",
      validValues: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    },
    {
      key: "specific_hour_range",
      label: "Chỉ áp dụng vào khung giờ cụ thể trong ngày",
      inputType: "object",
      validValues: { from: "HH:mm", to: "HH:mm" }
    },
    {
      key: "total_spent_over",
      label: "Chỉ áp dụng nếu tổng chi tiêu của người dùng vượt mức",
      inputType: "number",
      validValues: { min: 0 }
    }
  ];
  
  module.exports = DISCOUNT_CONDITIONS;
  