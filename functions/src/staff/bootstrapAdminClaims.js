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
    const adminEmailRaw = storeSnap.get('adminEmail');
    const adminEmail = typeof adminEmailRaw === 'string' ? adminEmailRaw.trim().toLowerCase() : '';
    if (!adminEmail) {
        throw new HttpsError('failed-precondition', 'Missing adminEmail for store.');
    }
    const requesterEmail = typeof context.auth.token.email === 'string' ? context.auth.token.email.trim().toLowerCase() : '';
    if (requesterEmail !== adminEmail) {
        throw new HttpsError('permission-denied', 'Not allowed to bootstrap admin claims.');
    }

    const existingAdmins = await db.collection('stores').doc(storeId).collection('staff')
        .where('role', '==', 'admin')
        .limit(1)
        .get();

    await auth.setCustomUserClaims(context.auth.uid, {
        storeId,
        role: 'admin'
    });

    await db.collection('stores').doc(storeId).collection('staff').doc(context.auth.uid).set({
        email: context.auth.token.email,
        role: 'admin',
        createdAt: new Date().toISOString(),
        uid: context.auth.uid
    }, { merge: true });

    return { success: true, bootstrapped: existingAdmins.empty };
});
