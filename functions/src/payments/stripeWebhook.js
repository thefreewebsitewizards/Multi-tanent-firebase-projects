const functions = require("firebase-functions/v1");
const Stripe = require("stripe");
const { db, admin } = require("../utils/firebase");

const secretNames = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"];

const upsertMembership = async ({
    storeId,
    userId,
    accessType,
    accessEnd,
    planType,
    status,
    stripeCustomerId,
    stripeSubscriptionId
}) => {
    const membershipRef = db.collection("stores").doc(storeId).collection("memberships").doc(userId);
    const accessEndTimestamp = accessEnd ? admin.firestore.Timestamp.fromMillis(accessEnd) : null;
    await membershipRef.set(
        {
            storeId,
            userId,
            accessType,
            accessEnd: accessEndTimestamp,
            planType,
            status,
            stripeCustomerId: stripeCustomerId || null,
            stripeSubscriptionId: stripeSubscriptionId || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
    );
};

exports.stripeWebhook = functions
    .runWith({ secrets: secretNames })
    .https.onRequest(async (req, res) => {
        const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        const signature = req.headers["stripe-signature"];

        if (!stripeSecretKey || !webhookSecret || !signature) {
            res.status(400).send("Missing Stripe configuration.");
            return;
        }

        const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });
        let event;
        try {
            event = stripe.webhooks.constructEvent(req.rawBody, signature, webhookSecret);
        } catch (error) {
            res.status(400).send(`Webhook Error: ${error.message}`);
            return;
        }

        try {
            if (event.type === "checkout.session.completed") {
                const session = event.data.object;
                const storeId = session.metadata && session.metadata.storeId;
                const userId = (session.metadata && session.metadata.userId) || session.client_reference_id;
                const planType = session.metadata && session.metadata.planType;

                if (storeId && userId && planType) {
                    if (session.mode === "subscription" && session.subscription) {
                        const subscription = await stripe.subscriptions.retrieve(
                            session.subscription,
                            event.account ? { stripeAccount: event.account } : undefined
                        );
                        const accessEnd = subscription.current_period_end
                            ? subscription.current_period_end * 1000
                            : null;
                        await upsertMembership({
                            storeId,
                            userId,
                            accessType: "subscription",
                            accessEnd,
                            planType,
                            status: "active",
                            stripeCustomerId: session.customer || null,
                            stripeSubscriptionId: subscription.id
                        });
                    }

                    if (session.mode === "payment") {
                        await upsertMembership({
                            storeId,
                            userId,
                            accessType: "lifetime",
                            accessEnd: null,
                            planType,
                            status: "active",
                            stripeCustomerId: session.customer || null,
                            stripeSubscriptionId: null
                        });
                    }
                }
            }

            if (event.type === "invoice.paid") {
                const invoice = event.data.object;
                if (invoice.subscription) {
                    const subscription = await stripe.subscriptions.retrieve(
                        invoice.subscription,
                        event.account ? { stripeAccount: event.account } : undefined
                    );
                    const storeId = subscription.metadata && subscription.metadata.storeId;
                    const userId = subscription.metadata && subscription.metadata.userId;
                    const planType = subscription.metadata && subscription.metadata.planType;
                    if (storeId && userId) {
                        const accessEnd = subscription.current_period_end
                            ? subscription.current_period_end * 1000
                            : null;
                        await upsertMembership({
                            storeId,
                            userId,
                            accessType: "subscription",
                            accessEnd,
                            planType: planType || "subscription",
                            status: "active",
                            stripeCustomerId: subscription.customer || null,
                            stripeSubscriptionId: subscription.id
                        });
                    }
                }
            }

            if (event.type === "invoice.payment_failed") {
                const invoice = event.data.object;
                if (invoice.subscription) {
                    const subscription = await stripe.subscriptions.retrieve(
                        invoice.subscription,
                        event.account ? { stripeAccount: event.account } : undefined
                    );
                    const storeId = subscription.metadata && subscription.metadata.storeId;
                    const userId = subscription.metadata && subscription.metadata.userId;
                    const planType = subscription.metadata && subscription.metadata.planType;
                    if (storeId && userId) {
                        const accessEnd = subscription.current_period_end
                            ? subscription.current_period_end * 1000
                            : Date.now();
                        await upsertMembership({
                            storeId,
                            userId,
                            accessType: "subscription",
                            accessEnd,
                            planType: planType || "subscription",
                            status: "past_due",
                            stripeCustomerId: subscription.customer || null,
                            stripeSubscriptionId: subscription.id
                        });
                    }
                }
            }

            if (event.type === "customer.subscription.deleted") {
                const subscription = event.data.object;
                const storeId = subscription.metadata && subscription.metadata.storeId;
                const userId = subscription.metadata && subscription.metadata.userId;
                const planType = subscription.metadata && subscription.metadata.planType;
                if (storeId && userId) {
                    await upsertMembership({
                        storeId,
                        userId,
                        accessType: "subscription",
                        accessEnd: Date.now(),
                        planType: planType || "subscription",
                        status: "canceled",
                        stripeCustomerId: subscription.customer || null,
                        stripeSubscriptionId: subscription.id
                    });
                }
            }

            res.json({ received: true });
        } catch (error) {
            res.status(500).send(`Webhook handler failed: ${error.message}`);
        }
    });
