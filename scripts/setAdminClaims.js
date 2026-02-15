const path = require("path");
const admin = require("firebase-admin");

// Security: use a service account key stored outside source control
const serviceAccountPath = process.env.SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) {
  console.error("Missing SERVICE_ACCOUNT_PATH environment variable.");
  process.exit(1);
}

const serviceAccount = require(path.resolve(serviceAccountPath));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const adminEmail = process.env.ADMIN_EMAIL;
const storeId = process.env.STORE_ID;
if (!adminEmail || !storeId) {
  console.error("Missing ADMIN_EMAIL or STORE_ID environment variable.");
  process.exit(1);
}
const adminClaims = {
  storeId,
  role: "admin",
};

const run = async () => {
  try {
    const user = await admin.auth().getUserByEmail(adminEmail);

    // Security: tenant-scoped admin claims prevent cross-store access
    await admin.auth().setCustomUserClaims(user.uid, adminClaims);

    console.log(`Claims set for ${adminEmail}:`, adminClaims);
    process.exit(0);
  } catch (error) {
    console.error("Failed to set admin claims:", error);
    process.exit(1);
  }
};

run();
