const { onCall, HttpsError } = require("firebase-functions/v1/https");
const { db } = require("../utils/firebase");
const { validateStore, requireAdminForStore } = require("../utils/helpers");

exports.addProduct = onCall(async (data, context) => {
    
    // 1. Validate Store & Auth
    const storeId = validateStore(data, context);
    // Security: only admins of the same store can manage inventory
    requireAdminForStore(context, storeId);

    // 2. Validate Basic Input
    // We expect 'productData' to contain the flexible fields
    const { productData } = data;

    if (!productData || typeof productData !== 'object') {
        throw new HttpsError(
            'invalid-argument', 
            'productData object is required'
        );
    }

    // Basic validation: Name is usually mandatory for any store
    if (!productData.name) {
        throw new HttpsError(
            'invalid-argument', 
            'Product name is required'
        );
    }

    try {
        // 3. Add to Firestore
        // We use .add() to auto-generate an ID, or you can specify one in productData if needed
        const productRef = db.collection('stores').doc(storeId).collection('products').doc();
        
        // Prepare final data with metadata
        const finalProduct = {
            ...productData,          // Spread all dynamic fields (size, color, quantity, etc.)
            id: productRef.id,       // Ensure ID is part of the document
            storeId: storeId,        // Redundant but useful for queries
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await productRef.set(finalProduct);

        return {
            success: true,
            productId: productRef.id,
            message: "Product added successfully"
        };

    } catch (error) {
        console.error("Error adding product:", error);
        throw new HttpsError(
            'internal', 
            'Unable to add product'
        );
    }
});
