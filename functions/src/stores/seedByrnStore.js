const { onCall, HttpsError } = require("firebase-functions/v1/https");
const { auth, db } = require("../utils/firebase");

const PLATFORM_ADMIN_EMAIL = "byrnactive@admin.com";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const normalizeStoreId = (value) => String(value || "").trim().toLowerCase();

exports.createTenantStore = onCall(async (data, context) => {
  try {
    if (!context || !context.auth || !context.auth.token) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const requesterEmail = normalizeEmail(context.auth.token.email);
    if (requesterEmail !== PLATFORM_ADMIN_EMAIL) {
      throw new HttpsError("permission-denied", "Not allowed.");
    }

    const targetStoreId = normalizeStoreId(data && data.targetStoreId);
    const adminEmail = normalizeEmail(data && data.adminEmail);
    const password = String((data && data.password) || "");

    if (!targetStoreId || !adminEmail || !password) {
      throw new HttpsError("invalid-argument", "targetStoreId, adminEmail, and password are required.");
    }

    if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(targetStoreId)) {
      throw new HttpsError("invalid-argument", "Invalid targetStoreId format.");
    }

    if (password.length < 8) {
      throw new HttpsError("invalid-argument", "Password must be at least 8 characters.");
    }

    const storeRef = db.collection("stores").doc(targetStoreId);
    const storeSnap = await storeRef.get();
    if (!storeSnap.exists) {
      await storeRef.set({
        adminEmail,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } else {
      const existingAdminEmail = normalizeEmail(storeSnap.get("adminEmail"));
      if (existingAdminEmail && existingAdminEmail !== adminEmail) {
        throw new HttpsError("already-exists", "Store already exists with a different adminEmail.");
      }
    }

    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(adminEmail);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code !== "auth/user-not-found") {
        throw error;
      }
    }

    if (!userRecord) {
      userRecord = await auth.createUser({
        email: adminEmail,
        password,
      });
    }

    await auth.setCustomUserClaims(userRecord.uid, {
      storeId: targetStoreId,
      role: "admin",
    });

    await storeRef.collection("staff").doc(userRecord.uid).set(
      {
        email: adminEmail,
        role: "admin",
        createdAt: new Date().toISOString(),
        uid: userRecord.uid,
      },
      { merge: true }
    );

    return {
      success: true,
      storeId: targetStoreId,
      adminEmail,
      uid: userRecord.uid,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const message = error instanceof Error ? error.message : "createTenantStore failed.";
    throw new HttpsError("internal", message);
  }
});
