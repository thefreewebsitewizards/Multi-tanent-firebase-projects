const { onCall, HttpsError } = require("firebase-functions/v1/https");
const { auth, db } = require("../utils/firebase");

exports.bootstrapAdminClaims = onCall(async (data, context) => {
    if (!context.auth || !context.auth.token || !context.auth.token.email) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const storeId = data.storeId;
    if (!storeId) {
        throw new HttpsError('invalid-argument', 'The function must be called with a "storeId".');
    }

    const storeSnap = await db.collection('stores').doc(storeId).get();
    if (!storeSnap.exists) {
        throw new HttpsError('not-found', 'Store not found.');
    }
    const adminEmail = storeSnap.get('adminEmail');
    if (!adminEmail) {
        throw new HttpsError('failed-precondition', 'Missing adminEmail for store.');
    }
    if (context.auth.token.email !== adminEmail) {
        throw new HttpsError('permission-denied', 'Not allowed to bootstrap admin claims.');
    }

    const existingAdmins = await db.collection('stores').doc(storeId).collection('staff')
        .where('role', '==', 'admin')
        .limit(1)
        .get();

    if (!existingAdmins.empty) {
        throw new HttpsError('failed-precondition', 'Admin already exists for this store.');
    }

    await auth.setCustomUserClaims(context.auth.uid, {
        storeId,
        role: 'admin'
    });

    await db.collection('stores').doc(storeId).collection('staff').doc(context.auth.uid).set({
        email: context.auth.token.email,
        role: 'admin',
        createdAt: new Date().toISOString(),
        uid: context.auth.uid
    });

    return { success: true };
});
