const functions = require("firebase-functions/v1");
const { HttpsError } = require("firebase-functions/v1/https");
const Stripe = require("stripe");
const { db, admin } = require("../utils/firebase");
const { callShippo } = require("../utils/shippo");

const secretNames = ["STRIPE_SECRET_KEY", "SHIPPO_API_KEY"];
const PLATFORM_FEE_PERCENT = 7.1;
const MAX_URL_LENGTH = 2048;

const toCents = (value) => {
    if (typeof value === "number") {
        if (!Number.isFinite(value)) return null;
        return Math.round(value * 100);
    }
    if (typeof value === "string") {
        const cleaned = value.replace(/[^0-9.]/g, "");
        if (!cleaned) return null;
        const parsed = Number(cleaned);
        if (!Number.isFinite(parsed)) return null;
        return Math.round(parsed * 100);
    }
    return null;
};

const clampQuantity = (value) => {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) return null;
    const floored = Math.floor(parsed);
    if (floored < 1) return null;
    return Math.min(99, floored);
};

const normalizeCheckoutUrl = (rawUrl, fallbackPath) => {
    if (typeof rawUrl !== "string") return "";
    const trimmed = rawUrl.trim();
    if (!trimmed) return "";
    try {
        const parsed = new URL(trimmed);
        const origin = `${parsed.protocol}//${parsed.host}`;
        if (trimmed.length <= MAX_URL_LENGTH) return trimmed;
        const fallback = `${origin}${fallbackPath}`;
        if (fallback.length <= MAX_URL_LENGTH) return fallback;
        return origin;
    } catch {
        return "";
    }
};

const normalizeImageUrl = (rawUrl) => {
    if (typeof rawUrl !== "string") return "";
    const trimmed = rawUrl.trim();
    if (!trimmed || trimmed.length > MAX_URL_LENGTH) return "";
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
        return trimmed;
    } catch {
        return "";
    }
};

exports.createCheckoutSessionForFrederick = functions
    .runWith({ secrets: secretNames })
    .https.onCall(async (data, context) => {
        const { storeId, successUrl, cancelUrl, items, orderId } = data || {};
        const validatedStoreId = typeof storeId === "string" ? storeId.trim() : "";
        if (!validatedStoreId) {
            throw new HttpsError("invalid-argument", "Missing storeId.");
        }

        const normalizedSuccessUrl = normalizeCheckoutUrl(successUrl, "/cart?checkout=success");
        const normalizedCancelUrl = normalizeCheckoutUrl(cancelUrl, "/cart?checkout=cancel");
        if (!normalizedSuccessUrl || !normalizedCancelUrl) {
            throw new HttpsError("invalid-argument", "Missing successUrl or cancelUrl.");
        }

        if (!Array.isArray(items) || items.length === 0) {
            throw new HttpsError("invalid-argument", "Cart items are required.");
        }

        const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeSecretKey) {
            throw new HttpsError("failed-precondition", "Missing STRIPE_SECRET_KEY.");
        }

        const storeSnap = await db.collection("stores").doc(validatedStoreId).get();
        if (!storeSnap.exists) {
            throw new HttpsError("not-found", "Store not found.");
        }
        const stripeAccountIdRaw = storeSnap.get("stripe.connectedAccountId");
        const stripeAccountId = typeof stripeAccountIdRaw === "string" ? stripeAccountIdRaw.trim() : "";
        if (!stripeAccountId) {
            throw new HttpsError("failed-precondition", "Missing connected account configuration.");
        }
        if (!stripeAccountId.startsWith("acct_")) {
            throw new HttpsError("invalid-argument", "Invalid connected account ID.");
        }

        const currencyRaw = storeSnap.get("shipping.currency") || storeSnap.get("stripe.currency");
        const currencyFromStore =
            typeof currencyRaw === "string" && /^[a-zA-Z]{3}$/.test(currencyRaw.trim())
                ? currencyRaw.trim().toLowerCase()
                : "";
        const currency = currencyFromStore || "usd";

        const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });

        try {
            await stripe.accounts.retrieve(stripeAccountId);
        } catch (error) {
            const statusCode = typeof error === "object" && error !== null && "statusCode" in error ? error.statusCode : undefined;
            const stripeMessage = typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";

            if (statusCode === 404) {
                throw new HttpsError("failed-precondition", "Connected account not found for this Stripe key.", {
                    stripeAccountId,
                    statusCode,
                    stripeMessage
                });
            }

            throw new HttpsError("internal", "Unable to validate connected account.", {
                stripeAccountId,
                statusCode,
                stripeMessage
            });
        }

        const normalizedItems = items
            .map((raw) => {
                if (!raw || typeof raw !== "object") return null;
                const record = raw;
                const name = typeof record.name === "string" ? record.name.trim() : "";
                const quantity = clampQuantity(record.quantity);
                const unitAmount = toCents(record.price);
                const imageUrl = normalizeImageUrl(record.imageUrl);
                if (!name || !quantity || unitAmount === null || unitAmount < 0) return null;
                return {
                    name,
                    quantity,
                    unitAmount,
                    imageUrl
                };
            })
            .filter(Boolean);

        if (normalizedItems.length === 0) {
            throw new HttpsError("invalid-argument", "No valid cart items provided.");
        }

        const lineItems = normalizedItems.map((item) => ({
            quantity: item.quantity,
            price_data: {
                currency,
                unit_amount: item.unitAmount,
                product_data: {
                    name: item.name,
                    ...(item.imageUrl ? { images: [item.imageUrl] } : {})
                }
            }
        }));

        const normalizedOrderId = typeof orderId === "string" ? orderId.trim() : "";
        let shippingRateId = "";
        if (normalizedOrderId) {
            const orderSnap = await db.collection("stores").doc(validatedStoreId).collection("orders").doc(normalizedOrderId).get();
            if (!orderSnap.exists) throw new HttpsError("not-found", "Order not found.");
            const storedRateId = orderSnap.get("shipping.selectedRateId");
            shippingRateId = typeof storedRateId === "string" ? storedRateId.trim() : "";
        }

        if (shippingRateId) {
            const rate = await callShippo({ method: "GET", path: `/rates/${shippingRateId}/` });
            const rateAmountCents = toCents(rate && rate.amount);
            const rateCurrency = rate && rate.currency ? String(rate.currency).toLowerCase() : "";
            if (rateAmountCents === null || rateAmountCents < 0) {
                throw new HttpsError("failed-precondition", "Invalid shipping rate amount.");
            }
            if (!rateCurrency || rateCurrency !== currency) {
                throw new HttpsError("failed-precondition", "Shipping currency does not match store currency.", {
                    rateCurrency,
                    storeCurrency: currency
                });
            }
            if (rateAmountCents > 0) {
                lineItems.push({
                    quantity: 1,
                    price_data: {
                        currency,
                        unit_amount: rateAmountCents,
                        product_data: {
                            name: "Shipping"
                        }
                    }
                });
            }
        }

        const subtotalCents = lineItems.reduce((sum, li) => sum + li.price_data.unit_amount * li.quantity, 0);
        const applicationFeeAmount = Math.max(0, Math.round(subtotalCents * (PLATFORM_FEE_PERCENT / 100)));

        const userId = context.auth && context.auth.uid ? context.auth.uid : null;
        const userEmail = context.auth && context.auth.token ? context.auth.token.email : null;

        const sessionPayload = {
            mode: "payment",
            line_items: lineItems,
            success_url: normalizedSuccessUrl,
            cancel_url: normalizedCancelUrl,
            client_reference_id: userId || undefined,
            customer_email: userEmail || undefined,
            metadata: {
                storeId: validatedStoreId,
                userId: userId || "",
                orderId: normalizedOrderId || ""
            },
            payment_intent_data: {
                application_fee_amount: applicationFeeAmount,
                metadata: {
                    storeId: validatedStoreId,
                    userId: userId || "",
                    orderId: normalizedOrderId || ""
                }
            }
        };

        try {
            const session = await stripe.checkout.sessions.create(sessionPayload, { stripeAccount: stripeAccountId });
            if (normalizedOrderId) {
                await db
                    .collection("stores")
                    .doc(validatedStoreId)
                    .collection("orders")
                    .doc(normalizedOrderId)
                    .set(
                        {
                            stripe: {
                                checkoutSessionId: session.id
                            },
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        },
                        { merge: true }
                    );
            }
            return { url: session.url, sessionId: session.id };
        } catch (error) {
            const statusCode = typeof error === "object" && error !== null && "statusCode" in error ? error.statusCode : undefined;
            const stripeType = typeof error === "object" && error !== null && "type" in error ? String(error.type) : "";
            const stripeCode = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
            const stripeMessage = typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";

            if (statusCode === 404) {
                throw new HttpsError("failed-precondition", "Stripe returned 404 while creating checkout session.", {
                    stripeAccountId,
                    statusCode,
                    stripeType,
                    stripeCode,
                    stripeMessage
                });
            }

            throw new HttpsError("internal", "Stripe error while creating checkout session.", {
                stripeAccountId,
                statusCode,
                stripeType,
                stripeCode,
                stripeMessage
            });
        }
    });
