const { onCall, HttpsError } = require("firebase-functions/v1/https");
const { auth, db } = require("../utils/firebase");
const { validateStore, requireAdminForStore } = require("../utils/helpers");

exports.addAdmin = onCall(async (data, context) => {
    const requesterStoreId = validateStore(data, context);
    // Security: only admins can create another admin in the same store
    requireAdminForStore(context, requesterStoreId);

    const { email, password } = data;

    if (!email || !password) {
        throw new HttpsError('invalid-argument', 'Email and password are required');
    }

    try {
        const userRecord = await auth.createUser({
            email,
            password,
        });

        await auth.setCustomUserClaims(userRecord.uid, {
            storeId: requesterStoreId,
            role: 'admin'
        });

        await db.collection('stores').doc(requesterStoreId).collection('staff').doc(userRecord.uid).set({
            email,
            role: 'admin',
            createdAt: new Date().toISOString(),
            uid: userRecord.uid
        });

        return {
            success: true,
            message: `Admin created for store ${requesterStoreId}`,
            uid: userRecord.uid
        };
    } catch (error) {
        console.error("Error adding admin:", error);
        throw new HttpsError('internal', error.message);
    }
});
