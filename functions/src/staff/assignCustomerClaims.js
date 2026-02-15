const { onCall, HttpsError } = require("firebase-functions/v1/https");
const { auth } = require("../utils/firebase");

exports.assignCustomerClaims = onCall(async (data, context) => {
    if (!context.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const { storeId } = data;
    if (!storeId) {
        throw new HttpsError('invalid-argument', 'The function must be called with a "storeId".');
    }

    const currentRole = context.auth.token ? context.auth.token.role : null;
    const currentStoreId = context.auth.token ? context.auth.token.storeId : null;

    // Security: prevent privilege escalation or cross-store claim changes
    if (currentRole && currentRole !== 'customer') {
        throw new HttpsError('permission-denied', 'Only customers can be assigned with this function.');
    }
    if (currentStoreId && currentStoreId !== storeId) {
        throw new HttpsError('permission-denied', 'User does not belong to this store.');
    }

    await auth.setCustomUserClaims(context.auth.uid, {
        storeId,
        role: 'customer'
    });

    return { success: true };
});
