const { onCall, HttpsError } = require("firebase-functions/v1/https");
const { auth, db } = require("../utils/firebase");
const { validateStore, requireAdminForStore } = require("../utils/helpers");

exports.addStaff = onCall(async (data, context) => {
    
    const requesterStoreId = validateStore(data, context);
    // Security: only admins can create customer accounts for their own store
    requireAdminForStore(context, requesterStoreId);
    
    const { email, password } = data;

    if (!email || !password) {
         throw new HttpsError('invalid-argument', 'Email and password are required');
    }

    try {
        // 1. Create user in Firebase Auth
        const userRecord = await auth.createUser({
            email,
            password,
        });

        // 2. Set Custom Claims (CRITICAL for Multi-tenancy security)
        // This binds the user to the specific storeId
        const finalRole = 'customer';
        await auth.setCustomUserClaims(userRecord.uid, {
            storeId: requesterStoreId,
            role: finalRole
        });

        // 3. Store user metadata in Firestore
        await db.collection('stores').doc(requesterStoreId).collection('staff').doc(userRecord.uid).set({
            email,
            role: finalRole,
            createdAt: new Date().toISOString(),
            uid: userRecord.uid
        });

        return { 
            success: true, 
            message: `Staff member created for store ${requesterStoreId}`,
            uid: userRecord.uid 
        };

    } catch (error) {
        console.error("Error adding staff:", error);
        throw new HttpsError('internal', error.message);
    }
});
