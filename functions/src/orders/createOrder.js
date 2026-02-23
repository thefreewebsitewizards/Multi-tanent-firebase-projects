const functions = require("firebase-functions/v1");
const { HttpsError } = require("firebase-functions/v1/https");
const { onCall } = require("firebase-functions/v2/https");
const { db, admin } = require("../utils/firebase");
const { validateStore } = require("../utils/helpers");

const normalizeString = (value) => (typeof value === "string" ? value.trim() : "");

const normalizeOrderItem = (value) => {
    if (!value || typeof value !== "object") return null;
    const record = value;
    const name = normalizeString(record.name);
    const productId = normalizeString(record.productId);
    const option = normalizeString(record.option);
    const note = normalizeString(record.note);
    const imageUrl = normalizeString(record.imageUrl);
    const price = Number(record.price);
    const quantity = Number(record.quantity);
    if (!name || !Number.isFinite(price) || price < 0) return null;
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    return {
        productId: productId || undefined,
        name,
        price,
        quantity,
        imageUrl: imageUrl || undefined,
        option: option || undefined,
        note: note || undefined
    };
};

const normalizeAddress = (value) => {
    if (!value || typeof value !== "object") return null;
    const record = value;
    const name = normalizeString(record.name);
    const email = normalizeString(record.email);
    const phone = normalizeString(record.phone);
    const street1 = normalizeString(record.street1);
    const street2 = normalizeString(record.street2);
    const city = normalizeString(record.city);
    const state = normalizeString(record.state);
    const zip = normalizeString(record.zip);
    const country = normalizeString(record.country).toUpperCase();
    const company = normalizeString(record.company);
    if (!name || !email || !phone || !street1 || !city || !state || !zip || !country) return null;
    return {
        name,
        email,
        phone,
        street1,
        street2,
        city,
        state,
        zip,
        country,
        company: company || undefined
    };
};

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

exports.createOrderForFrederick = functions.https.onCall(async (data, context) => {
    const requestedStoreId = normalizeString(data?.storeId);
    if (requestedStoreId && requestedStoreId !== "frederick") {
        throw new HttpsError("permission-denied", "Store not allowed for this function.");
    }

    const items = Array.isArray(data?.items) ? data.items.map(normalizeOrderItem).filter(Boolean) : [];
    if (items.length === 0) {
        throw new HttpsError("invalid-argument", "Order must contain items.");
    }

    const customer = normalizeAddress(data?.customer);
    if (!customer) {
        throw new HttpsError("invalid-argument", "Invalid shipping address.");
    }

    const shippingRaw = data?.shipping && typeof data.shipping === "object" ? data.shipping : null;
    const selectedRateId = normalizeString(shippingRaw && shippingRaw.selectedRateId);
    const shipmentId = normalizeString(shippingRaw && shippingRaw.shipmentId);
    if (!selectedRateId) {
        throw new HttpsError("invalid-argument", "Missing selected shipping rate.");
    }

    const orderRef = db.collection("stores").doc("frederick").collection("orders").doc();
    const orderData = {
        id: orderRef.id,
        storeId: "frederick",
        userId: context?.auth?.uid || null,
        items,
        customer,
        shipping: {
            selectedRateId,
            shipmentId: shipmentId || null,
            address: customer
        },
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await orderRef.set(orderData);

    return {
        orderId: orderRef.id
    };
});
