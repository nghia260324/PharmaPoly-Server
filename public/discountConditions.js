const DISCOUNT_CONDITIONS = [
  {
    key: "specific_payment_method",
    label: "Chỉ áp dụng với một số phương thức thanh toán",
    inputType: "array",
    validValues: ["cod", "online"]
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
    key: "excluded_users",
    label: "Không áp dụng cho danh sách khách hàng cụ thể",
    inputType: "array",
    validValues: "fetch_user"
  },
  {
    key: "excluded_products",
    label: "Không áp dụng cho một số sản phẩm",
    inputType: "array",
    validValues: "fetch_product"
  },
  {
    key: "excluded_brands",
    label: "Không áp dụng cho một số thương hiệu",
    inputType: "array",
    validValues: "fetch_brand"
  },
  {
    key: "excluded_categories",
    label: "Không áp dụng cho một số danh mục sản phẩm",
    inputType: "array",
    validValues: "fetch_category"
  },
  {
    key: "specific_hour_range",
    label: "Chỉ áp dụng vào khung giờ cụ thể trong ngày",
    inputType: "object",
    validValues: { from: "HH:mm", to: "HH:mm" }
  }
];
module.exports = DISCOUNT_CONDITIONS;




// {
  //   key: "first_time_user",
  //   label: "Áp dụng cho khách hàng mới",
  //   inputType: "boolean",
  //   validValues: null
  // },
    // {
  //   key: "new_product_only",
  //   label: "Chỉ áp dụng cho sản phẩm mới ra mắt",
  //   inputType: "number",
  //   validValues: { min: 1, max: 365 }
  // },
  // {
  //   key: "specific_shipping_method",
  //   label: "Chỉ áp dụng với một số phương thức vận chuyển",
  //   inputType: "array",
  //   validValues: ["fast_shipping", "standard_shipping"]
  // },