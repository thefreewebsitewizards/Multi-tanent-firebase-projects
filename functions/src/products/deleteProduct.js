const { onCall, HttpsError } = require("firebase-functions/v1/https");
const { db } = require("../utils/firebase");
const { validateStore, requireAdminForStore } = require("../utils/helpers");

exports.deleteProduct = onCall(async (data, context) => {
    const storeId = validateStore(data, context);
    // Security: only admins of the same store can manage inventory
    requireAdminForStore(context, storeId);
    
    const { productId } = data;

    if (!productId) {
        throw new HttpsError('invalid-argument', 'productId is required');
    }

    try {
        const productRef = db.collection('stores').doc(storeId).collection('products').doc(productId);
        const productSnap = await productRef.get();

        if (!productSnap.exists) {
            throw new HttpsError('not-found', 'Product not found');
        }

        await productRef.delete();

        return {
            success: true,
            message: "Product deleted successfully"
        };

    } catch (error) {
        console.error("Error deleting product:", error);
        throw new HttpsError('internal', 'Unable to delete product');
    }
});
