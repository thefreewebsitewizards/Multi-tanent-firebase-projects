const { onCall } = require("firebase-functions/v2/https");
const { db } = require("../utils/firebase");
const { validateStore } = require("../utils/helpers");

exports.createOrder = onCall(async (request) => {
    const { data } = request;
    
    // Validate storeId and authentication
    const storeId = validateStore(data, request);

    const { items, customer } = data;

    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new require("firebase-functions/v2/https").HttpsError(
            'invalid-argument', 
            'Order must contain items.'
        );
    }

    try {
        const orderRef = db.collection('stores').doc(storeId).collection('orders').doc();
        
        const orderData = {
            id: orderRef.id,
            storeId,
            userId: request.auth.uid,
            customer: customer || {},
            items,
            status: 'pending',
            createdAt: new Date().toISOString(),
            // Calculate total, etc. here
        };

        await orderRef.set(orderData);

        return {
            success: true,
            orderId: orderRef.id,
            message: "Order created successfully"
        };
    } catch (error) {
        console.error("Error creating order:", error);
        throw new require("firebase-functions/v2/https").HttpsError(
            'internal', 
            'Unable to create order.'
        );
    }
});
