const functions = require("firebase-functions/v1");
const { HttpsError } = require("firebase-functions/v1/https");
const { db, admin } = require("../utils/firebase");
const { callShippo } = require("../utils/shippo");

const secretNames = ["SHIPPO_API_KEY"];

exports.purchaseLabelForTenant = functions
    .runWith({ secrets: secretNames })
    .https.onCall(async (data) => {
        const storeId = typeof data?.storeId === "string" ? data.storeId.trim() : "";
        const orderId = typeof data?.orderId === "string" ? data.orderId.trim() : "";
        const rateId = typeof data?.rateId === "string" ? data.rateId.trim() : "";
        const labelFileType = typeof data?.labelFileType === "string" ? data.labelFileType.trim().toUpperCase() : "PDF";

        if (!storeId || !orderId || !rateId) {
            throw new HttpsError("invalid-argument", "Missing storeId, orderId, or rateId.");
        }

        const orderRef = db.collection("stores").doc(storeId).collection("orders").doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) throw new HttpsError("not-found", "Order not found.");

        const transaction = await callShippo({
            method: "POST",
            path: "/transactions/",
            body: {
                rate: rateId,
                label_file_type: labelFileType,
                async: false
            }
        });

        const status = transaction && transaction.status ? String(transaction.status) : "";
        if (status !== "SUCCESS") {
            throw new HttpsError("failed-precondition", "Shippo label purchase failed.", { transaction });
        }

        const trackingNumber = transaction.tracking_number ? String(transaction.tracking_number) : "";
        const labelUrl = transaction.label_url ? String(transaction.label_url) : "";
        const trackingUrl = transaction.tracking_url_provider ? String(transaction.tracking_url_provider) : "";
        const transactionId = transaction.object_id ? String(transaction.object_id) : "";

        await orderRef.set(
            {
                shipping: {
                    shippo: {
                        rateId,
                        transactionId,
                        labelUrl,
                        trackingNumber,
                        trackingUrl,
                        purchasedAt: admin.firestore.FieldValue.serverTimestamp()
                    }
                },
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            },
            { merge: true }
        );

        return {
            transactionId,
            trackingNumber,
            trackingUrl,
            labelUrl
        };
    });
