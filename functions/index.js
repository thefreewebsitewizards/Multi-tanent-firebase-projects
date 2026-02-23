const { addProduct } = require("./src/products/addProduct");
const { updateProduct } = require("./src/products/updateProduct");
const { deleteProduct } = require("./src/products/deleteProduct");
const { addStaff } = require("./src/staff/addStaff");
const { addAdmin } = require("./src/staff/addAdmin");
const { assignCustomerClaims } = require("./src/staff/assignCustomerClaims");
const { bootstrapAdminClaims } = require("./src/staff/bootstrapAdminClaims");
const { createCheckoutSession } = require("./src/payments/createCheckoutSession");
const { createCheckoutSessionForByrnActive } = require("./src/payments/createCheckoutSessionForByrnActive");
const { createCheckoutSessionForFrederick, createCheckoutSessionForLisa } = require("./src/payments/createCheckoutSessionForFrederick");
const { stripeWebhook } = require("./src/payments/stripeWebhook");
const { getShippingRatesForFrederick, getShippingRatesForLisa } = require("./src/shipping/getShippingRatesForTenant");
const { createOrderForFrederick, createOrderForLisa } = require("./src/orders/createOrder");

// Export functions
exports.addProduct = addProduct;
exports.updateProduct = updateProduct;
exports.deleteProduct = deleteProduct;
exports.addStaff = addStaff;
exports.addAdmin = addAdmin;
exports.assignCustomerClaims = assignCustomerClaims;
exports.bootstrapAdminClaims = bootstrapAdminClaims;
exports.createCheckoutSession = createCheckoutSession;
exports.createCheckoutSessionForByrnActive = createCheckoutSessionForByrnActive;
exports.createCheckoutSessionForFrederick = createCheckoutSessionForFrederick;
exports.createCheckoutSessionForLisa = createCheckoutSessionForLisa;
exports.stripeWebhook = stripeWebhook;
exports.getShippingRatesForFrederick = getShippingRatesForFrederick;
exports.getShippingRatesForLisa = getShippingRatesForLisa;
exports.createOrderForFrederick = createOrderForFrederick;
exports.createOrderForLisa = createOrderForLisa;

// Example of other potential exports
// exports.createPaymentIntent = require("./src/payments/createPaymentIntent").createPaymentIntent;
