const { onCall, HttpsError } = require("firebase-functions/v1/https");
const { db } = require("../utils/firebase");
const { validateStore, requireAdminForStore } = require("../utils/helpers");

exports.updateProduct = onCall(async (data, context) => {
    const storeId = validateStore(data, context);
    // Security: only admins of the same store can manage inventory
    requireAdminForStore(context, storeId);
    
    const { productId, updates } = data;

    if (!productId) {
        throw new HttpsError('invalid-argument', 'productId is required');
    }

    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
        throw new HttpsError('invalid-argument', 'updates object is required and cannot be empty');
    }

    try {
        const productRef = db.collection('stores').doc(storeId).collection('products').doc(productId);
        const productSnap = await productRef.get();

        if (!productSnap.exists) {
            throw new HttpsError('not-found', 'Product not found');
        }

        // Prevent updating immutable fields if necessary (e.g., id, storeId)
        delete updates.id;
        delete updates.storeId;
        delete updates.createdAt;

        await productRef.update({
            ...updates,
            updatedAt: new Date().toISOString()
        });

        return {
            success: true,
            message: "Product updated successfully"
        };

    } catch (error) {
        console.error("Error updating product:", error);
        throw new HttpsError('internal', 'Unable to update product');
    }
});
