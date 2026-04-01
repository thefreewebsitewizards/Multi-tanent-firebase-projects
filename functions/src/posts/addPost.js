const { onCall, HttpsError } = require("firebase-functions/v1/https");
const { db } = require("../utils/firebase");
const { validateStore, requireAdminForStore } = require("../utils/helpers");

exports.addPost = onCall(async (data, context) => {
    // 1. Validate Store & Auth
    const storeId = validateStore(data, context);
    requireAdminForStore(context, storeId);

    // 2. Validate Input
    const { postData } = data;

    if (!postData || typeof postData !== 'object') {
        throw new HttpsError('invalid-argument', 'postData object is required');
    }

    if (!postData.title) {
        throw new HttpsError('invalid-argument', 'Post title is required');
    }

    if (!postData.content) {
        throw new HttpsError('invalid-argument', 'Post content is required');
    }

    try {
        const postRef = db.collection('stores').doc(storeId).collection('posts').doc();

        const finalPost = {
            ...postData,
            id: postRef.id,
            storeId: storeId,
            status: postData.status || 'draft',
            category: postData.category || 'Devotional',
            commentCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await postRef.set(finalPost);

        return {
            success: true,
            postId: postRef.id,
            message: "Post added successfully"
        };

    } catch (error) {
        console.error("Error adding post:", error);
        throw new HttpsError('internal', 'Unable to add post');
    }
});
