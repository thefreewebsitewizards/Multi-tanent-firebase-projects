const { onCall, HttpsError } = require("firebase-functions/v1/https");
const { db } = require("../utils/firebase");
const { validateStore, requireAdminForStore } = require("../utils/helpers");

exports.deletePost = onCall(async (data, context) => {
    const storeId = validateStore(data, context);
    requireAdminForStore(context, storeId);

    const { postId } = data;

    if (!postId) {
        throw new HttpsError('invalid-argument', 'postId is required');
    }

    try {
        const postRef = db.collection('stores').doc(storeId).collection('posts').doc(postId);
        const postSnap = await postRef.get();

        if (!postSnap.exists) {
            throw new HttpsError('not-found', 'Post not found');
        }

        // Also delete associated comments
        const commentsSnap = await db.collection('stores').doc(storeId)
            .collection('comments')
            .where('postId', '==', postId)
            .get();

        const batch = db.batch();
        batch.delete(postRef);
        commentsSnap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        return {
            success: true,
            message: "Post and associated comments deleted successfully"
        };

    } catch (error) {
        console.error("Error deleting post:", error);
        throw new HttpsError('internal', 'Unable to delete post');
    }
});
