const DISCOUNT_CONDITIONS = [
    {
      key: "minimum_items",
      label: "Số lượng sản phẩm tối thiểu",
      inputType: "number",
      validValues: null // Không giới hạn, miễn là số nguyên dương
    },
    {
      key: "first_time_user",
      label: "Áp dụng cho khách hàng mới",
      inputType: "boolean",
      validValues: [true, false]
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
      validValues: { from: "HH:mm", to: "HH:mm" } // Định dạng giờ phút
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
      validValues: null // Không giới hạn, miễn là số nguyên dương
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
      validValues: null // Danh sách ID khách hàng
    },
    {
      key: "excluded_users",
      label: "Không áp dụng cho danh sách khách hàng cụ thể",
      inputType: "array",
      validValues: null
    },
    {
      key: "specific_products",
      label: "Chỉ áp dụng cho một số sản phẩm",
      inputType: "array",
      validValues: null // Danh sách ID sản phẩm
    },
    {
      key: "excluded_products",
      label: "Không áp dụng cho một số sản phẩm",
      inputType: "array",
      validValues: null
    },
    {
      key: "specific_brands",
      label: "Chỉ áp dụng cho một số thương hiệu",
      inputType: "array",
      validValues: null // Danh sách ID thương hiệu
    },
    {
      key: "excluded_brands",
      label: "Không áp dụng cho một số thương hiệu",
      inputType: "array",
      validValues: null
    },
    {
      key: "specific_categories",
      label: "Chỉ áp dụng cho một số danh mục sản phẩm",
      inputType: "array",
      validValues: null // Danh sách ID danh mục
    },
    {
      key: "excluded_categories",
      label: "Không áp dụng cho một số danh mục sản phẩm",
      inputType: "array",
      validValues: null
    },
    {
      key: "new_product_only",
      label: "Chỉ áp dụng cho sản phẩm mới ra mắt",
      inputType: "number",
      validValues: { min: 1, max: 365 } // Số ngày từ ngày ra mắt
    },
    {
      key: "first_n_orders",
      label: "Chỉ áp dụng cho X đơn hàng đầu tiên trong hệ thống",
      inputType: "number",
      validValues: { min: 1 } // Số đơn hàng tối thiểu là 1
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
      key: "cart_contains_product",
      label: "Chỉ áp dụng nếu giỏ hàng có sản phẩm cụ thể",
      inputType: "array",
      validValues: null // Danh sách ID sản phẩm
    },
    {
      key: "cart_excludes_product",
      label: "Không áp dụng nếu giỏ hàng có sản phẩm cụ thể",
      inputType: "array",
      validValues: null
    },
    {
      key: "maximum_usage_per_user",
      label: "Giới hạn số lần sử dụng trên mỗi user",
      inputType: "number",
      validValues: { min: 1 }
    },
    {
      key: "specific_device",
      label: "Chỉ áp dụng cho đơn hàng đặt trên thiết bị cụ thể",
      inputType: "string",
      validValues: ["mobile", "desktop"]
    },
    {
      key: "specific_app_version",
      label: "Chỉ áp dụng cho một số phiên bản app",
      inputType: "string",
      validValues: null // Phiên bản app bất kỳ
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
      validValues: { min: 0 } // Không giới hạn tối đa
    }
  ];
  
  module.exports = DISCOUNT_CONDITIONS;
  