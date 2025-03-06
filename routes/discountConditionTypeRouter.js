var express = require('express');
var router = express.Router();

const DISCOUNT_CONDITIONS = require("../public/discountConditions");

function isValidCondition(conditionType, value) {
  const condition = DISCOUNT_CONDITIONS.find(c => c.key === conditionType);
  if (!condition) return false;

  if (condition.validValues) {
    if (Array.isArray(condition.validValues)) {
      return condition.validValues.includes(value);
    }
    if (typeof condition.validValues === "object") {
      if (condition.validValues.min !== undefined && value < condition.validValues.min) return false;
      if (condition.validValues.max !== undefined && value > condition.validValues.max) return false;
    }
  }
  return true;
}

router.get('/', async function (req, res, next) {
    res.render('discounts/discountConditionTypes');
});

module.exports = router;