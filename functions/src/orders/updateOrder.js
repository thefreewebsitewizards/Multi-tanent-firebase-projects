const { onCall } = require("firebase-functions/v2/https");
const { db } = require("../utils/firebase");
const { validateStore } = require("../utils/helpers");

exports.updateOrder = onCall(async (request) => {
    const { data } = request;
    const storeId = validateStore(data, request);
    const { orderId, status } = data;

    if (!orderId || !status) {
        throw new require("firebase-functions/v2/https").HttpsError('invalid-argument', 'Missing orderId or status');
    }

    try {
        const orderRef = db.collection('stores').doc(storeId).collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();

        if (!orderSnap.exists) {
            throw new require("firebase-functions/v2/https").HttpsError('not-found', 'Order not found');
        }

        // Optional: Check permissions (e.g., only admin or staff can update status)
        // if (request.auth.token.role !== 'admin') ...

        await orderRef.update({
            status,
            updatedAt: new Date().toISOString()
        });

        return { success: true, message: "Order updated" };

    } catch (error) {
        console.error("Error updating order:", error);
        throw new require("firebase-functions/v2/https").HttpsError('internal', 'Unable to update order');
    }
});
