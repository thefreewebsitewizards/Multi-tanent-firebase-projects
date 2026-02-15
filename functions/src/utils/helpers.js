const { HttpsError } = require("firebase-functions/v1/https");

const getAuthFromContext = (context) => {
    if (context && context.auth) {
        return context.auth;
    }
    return null;
};

const validateStore = (data, context) => {
    const auth = getAuthFromContext(context);
    if (!auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const storeId = data.storeId;

    if (!storeId) {
        throw new HttpsError('invalid-argument', 'The function must be called with a "storeId".');
    }

    if (!auth.token || auth.token.storeId !== storeId) {
        throw new HttpsError('permission-denied', 'User does not belong to this store.');
    }

    return storeId;
};

const requireAdminForStore = (context, storeId) => {
    const auth = getAuthFromContext(context);
    if (!auth || !auth.token) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    if (auth.token.storeId !== storeId) {
        throw new HttpsError('permission-denied', 'User does not belong to this store.');
    }

    if (auth.token.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Admin access required.');
    }
};

module.exports = { validateStore, requireAdminForStore };
