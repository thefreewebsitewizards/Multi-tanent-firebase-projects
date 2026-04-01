const { onCall, HttpsError } = require("firebase-functions/v1/https");
const { db } = require("../utils/firebase");
const { validateStore, requireAdminForStore } = require("../utils/helpers");

exports.updatePost = onCall(async (data, context) => {
    const storeId = validateStore(data, context);
    requireAdminForStore(context, storeId);

    const { postId, updates } = data;

    if (!postId) {
        throw new HttpsError('invalid-argument', 'postId is required');
    }

    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
        throw new HttpsError('invalid-argument', 'updates object is required and cannot be empty');
    }

    try {
        const postRef = db.collection('stores').doc(storeId).collection('posts').doc(postId);
        const postSnap = await postRef.get();

        if (!postSnap.exists) {
            throw new HttpsError('not-found', 'Post not found');
        }

        // Prevent updating immutable fields
        delete updates.id;
        delete updates.storeId;
        delete updates.createdAt;

        await postRef.update({
            ...updates,
            updatedAt: new Date().toISOString()
        });

        return {
            success: true,
            message: "Post updated successfully"
        };

    } catch (error) {
        console.error("Error updating post:", error);
        throw new HttpsError('internal', 'Unable to update post');
    }
});
