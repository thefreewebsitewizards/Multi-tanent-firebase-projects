const { addProduct } = require("./src/products/addProduct");
const { updateProduct } = require("./src/products/updateProduct");
const { deleteProduct } = require("./src/products/deleteProduct");
const { addStaff } = require("./src/staff/addStaff");
const { addAdmin } = require("./src/staff/addAdmin");
const { assignCustomerClaims } = require("./src/staff/assignCustomerClaims");
const { bootstrapAdminClaims } = require("./src/staff/bootstrapAdminClaims");
const { createCheckoutSession } = require("./src/payments/createCheckoutSession");
const { stripeWebhook } = require("./src/payments/stripeWebhook");

// Export functions
exports.addProduct = addProduct;
exports.updateProduct = updateProduct;
exports.deleteProduct = deleteProduct;
exports.addStaff = addStaff;
exports.addAdmin = addAdmin;
exports.assignCustomerClaims = assignCustomerClaims;
exports.bootstrapAdminClaims = bootstrapAdminClaims;
exports.createCheckoutSession = createCheckoutSession;
exports.stripeWebhook = stripeWebhook;

// Example of other potential exports
// exports.createPaymentIntent = require("./src/payments/createPaymentIntent").createPaymentIntent;
