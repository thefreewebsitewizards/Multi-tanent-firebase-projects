import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getAuth } from "firebase/auth";

// Configuration from your shared Firebase project
const firebaseConfig = {
  apiKey: "AIzaSyCqAoxETs_gyv_HWVa6O1jx0nCFZfRBdQA",
  authDomain: "multi-tanent-projects.firebaseapp.com",
  projectId: "multi-tanent-projects",
  storageBucket: "multi-tanent-projects.firebasestorage.app",
  messagingSenderId: "994746165516",
  appId: "1:994746165516:web:7a2422e6ad6b0d3c41c129"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const auth = getAuth(app);

/**
 * Helper to call a Cloud Function with the current storeId.
 * @param {string} functionName - Name of the cloud function to call.
 * @param {string} storeId - The ID of the current store.
 * @param {object} data - The data to pass to the function.
 */
export const callFunction = async (functionName, storeId, data = {}) => {
  const fn = httpsCallable(functions, functionName);
  return fn({ ...data, storeId });
};
