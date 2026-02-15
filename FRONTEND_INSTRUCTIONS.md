# Frontend Implementation Guide for Multi-Tenant Firebase App

**Prompt for AI Model:**
"I have a React application that needs to connect to a multi-tenant Firebase backend. The backend uses Cloud Functions for all writes to enforce security. Please implement the frontend connection following these specific steps and constraints."

---

## Step 1: Install Dependencies
The React app needs the Firebase SDK.
```bash
npm install firebase
```

## Step 2: Setup Firebase Configuration
Create a file named `src/firebaseConfig.js` and paste the following code. This initializes the app and provides a helper function `callFunction` that automatically handles the `storeId` injection.

```javascript
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getAuth } from "firebase/auth";

// Shared Firebase Configuration
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
 * Wrapper for Cloud Functions to ensure storeId is always passed.
 */
export const callFunction = async (functionName, storeId, data = {}) => {
  try {
    const fn = httpsCallable(functions, functionName);
    // data.productData is used for addProduct specifically
    const response = await fn({ ...data, storeId });
    return response.data;
  } catch (error) {
    console.error(`Error calling ${functionName}:`, error);
    throw error;
  }
};
```

## Step 3: Define the Store Context
Every React app represents *one* store. You should define the `STORE_ID` constant globally or in an environment variable.

```javascript
// src/constants.js
export const STORE_ID = "my_clothing_store_01"; // Change this for each client app
```

## Step 4: Implement Authentication (Required)
The backend rejects any request that is not authenticated. You must implement a login flow.

**Code Requirement:**
- Use `signInWithEmailAndPassword` from `firebase/auth`.
- Users must be created via the backend `addStaff` function first (or manually seeded), as the backend checks for custom claims.

## Step 5: Create the Product Manager Component
Create a component `ProductManager.jsx` that handles adding, updating, and deleting products.

**Key Requirements for the AI:**
1.  **Add Product**: Call `addProduct`. Pass flexible data inside a `productData` object.
    ```javascript
    await callFunction("addProduct", STORE_ID, {
      productData: {
        name: "New Item",
        price: 100,
        // Add any other fields specific to this store (size, color, weight, etc.)
        size: "M" 
      }
    });
    ```
2.  **Update Product**: Call `updateProduct`.
    ```javascript
    await callFunction("updateProduct", STORE_ID, {
      productId: "existing_id",
      updates: { price: 120 }
    });
    ```
3.  **Delete Product**: Call `deleteProduct`.
    ```javascript
    await callFunction("deleteProduct", STORE_ID, {
      productId: "existing_id"
    });
    ```
4.  **Fetch Products**: Read directly from Firestore using the `db` instance.
    -   Path: `stores/{STORE_ID}/products`
    -   Use `onSnapshot` for real-time updates.

## Step 6: Example Component Structure
Ask the AI to generate a component that:
-   Lists products from `stores/${STORE_ID}/products`.
-   Has a form to add a new product (with dynamic fields based on store type).
-   Has "Delete" and "Edit" buttons for each item.
