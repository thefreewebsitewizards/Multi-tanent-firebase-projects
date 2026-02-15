const functions = require("firebase-functions/v1");
const { HttpsError } = require("firebase-functions/v1/https");
const Stripe = require("stripe");
const { db } = require("../utils/firebase");
const { validateStore } = require("../utils/helpers");

const secretNames = ["STRIPE_SECRET_KEY"];
const PLATFORM_FEE_PERCENT = 7.1;

exports.createCheckoutSession = functions
    .runWith({ secrets: secretNames })
    .https.onCall(async (data, context) => {
    const { storeId, planType, successUrl, cancelUrl, priceIds } = data || {};
    const validatedStoreId = validateStore({ storeId }, context);
    const userId = context.auth && context.auth.uid ? context.auth.uid : null;
    const userEmail = context.auth && context.auth.token ? context.auth.token.email : null;

    if (!validatedStoreId || !planType || !successUrl || !cancelUrl) {
        throw new HttpsError("invalid-argument", "Missing required fields.");
    }

    if (!userId) {
        throw new HttpsError("unauthenticated", "Authentication required.");
    }

    if (!priceIds || typeof priceIds !== "object") {
        throw new HttpsError("invalid-argument", "Missing price IDs.");
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeSecretKey) {
        throw new HttpsError("failed-precondition", "Missing STRIPE_SECRET_KEY.");
    }

    const storeSnap = await db.collection("stores").doc(validatedStoreId).get();
    const stripeAccountId = storeSnap.get("stripe.connectedAccountId");

    if (!stripeAccountId) {
        throw new HttpsError("failed-precondition", "Missing connected account configuration.");
    }

    const parseAmount = (value) => {
        if (typeof value === "number") {
            return Math.round(value * 100);
        }
        if (typeof value === "string") {
            const cleaned = value.replace(/[^0-9.]/g, "");
            if (!cleaned) return null;
            const numberValue = Number(cleaned);
            if (!Number.isFinite(numberValue)) return null;
            return Math.round(numberValue * 100);
        }
        return null;
    };

    const planMap = {
        fan_monthly: {
            priceId: priceIds.fanMonthly,
            mode: "subscription",
            name: "Fan Access",
            interval: "month"
        },
        vip_yearly: {
            priceId: priceIds.vipYearly,
            mode: "subscription",
            name: "VIP Status",
            interval: "year"
        },
        lifetime_once: {
            priceId: priceIds.lifetimeOnce,
            mode: "payment",
            name: "Lifetime Fan"
        }
    };

    const plan = planMap[planType];
    if (!plan) {
        throw new HttpsError("invalid-argument", "Invalid plan.");
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });

    const amountCents = parseAmount(plan.priceId);
    const isPriceId = typeof plan.priceId === "string" && plan.priceId.startsWith("price_");
    if (!isPriceId && amountCents === null) {
        throw new HttpsError("invalid-argument", "Invalid price value.");
    }

    const lineItem = isPriceId
        ? { price: plan.priceId, quantity: 1 }
        : {
            price_data: {
                currency: "usd",
                unit_amount: amountCents,
                product_data: { name: plan.name },
                ...(plan.mode === "subscription" ? { recurring: { interval: plan.interval } } : {})
            },
            quantity: 1
        };

    const sessionPayload = {
        mode: plan.mode,
        line_items: [lineItem],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: userId,
        customer_email: userEmail || undefined,
        metadata: { storeId: validatedStoreId, planType, userId }
    };

    if (plan.mode === "subscription") {
        sessionPayload.subscription_data = {
            metadata: { storeId: validatedStoreId, planType, userId },
            application_fee_percent: PLATFORM_FEE_PERCENT
        };
    }

    if (plan.mode === "payment") {
        let unitAmount = amountCents;
        if (isPriceId) {
            const price = await stripe.prices.retrieve(
                plan.priceId,
                { stripeAccount: stripeAccountId }
            );
            if (!price || typeof price.unit_amount !== "number") {
                throw new HttpsError("failed-precondition", "Missing price amount.");
            }
            unitAmount = price.unit_amount;
        }
        const applicationFeeAmount = Math.max(0, Math.round(unitAmount * (PLATFORM_FEE_PERCENT / 100)));
        sessionPayload.payment_intent_data = {
            application_fee_amount: applicationFeeAmount
        };
    }

    const session = await stripe.checkout.sessions.create(
        sessionPayload,
        { stripeAccount: stripeAccountId }
    );

    return { url: session.url };
    });
