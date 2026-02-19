const functions = require("firebase-functions/v1");
const { HttpsError } = require("firebase-functions/v1/https");
const { db } = require("../utils/firebase");
const { callShippo, normalizeCarrierKey } = require("../utils/shippo");

const secretNames = ["SHIPPO_API_KEY"];

const normalizeCountry = (value) => String(value || "").trim().toUpperCase();

const fallbackPhoneForCountry = (country) => {
    const c = normalizeCountry(country);
    if (c === "AU") return "+61111111111";
    if (c === "US") return "+15555555555";
    if (c === "CA") return "+15555555555";
    return "+10000000000";
};

const withRequiredCompany = (address, fallbackCompany) => {
    if (!address) return address;
    const company = typeof address.company === "string" ? address.company.trim() : "";
    if (company) return address;
    const name = typeof address.name === "string" ? address.name.trim() : "";
    const computed = name || (typeof fallbackCompany === "string" ? fallbackCompany.trim() : "");
    if (!computed) return address;
    return { ...address, company: computed };
};

const defaultShippingConfigForStore = (storeId) => {
    if (storeId === "byrn_active") {
        return {
            currency: "AUD",
            enabledCarriers: [],
            originAddress: {
                name: "BYRN ACTIVE",
                company: "BYRN ACTIVE",
                street1: "100 Collins Street",
                city: "Melbourne",
                state: "VIC",
                zip: "3000",
                country: "AU",
                phone: "+61111111111",
                email: "hello@byrnactive.com"
            },
            defaultParcel: {
                length: 20,
                width: 15,
                height: 5,
                distance_unit: "cm",
                weight: 0.5,
                mass_unit: "kg"
            }
        };
    }
    return null;
};

const loadShippingConfig = async (storeId, storeSnap) => {
    const inline = storeSnap.get("shipping");
    if (inline && typeof inline === "object") return inline;

    const configRef = db.collection("stores").doc(storeId).collection("shipping").doc("config");
    const configSnap = await configRef.get();
    if (configSnap.exists) return configSnap.data() || null;

    return defaultShippingConfigForStore(storeId);
};

const withRequiredPhone = (address) => {
    if (!address) return address;
    const phone = typeof address.phone === "string" ? address.phone.trim() : "";
    if (phone) return address;
    return { ...address, phone: fallbackPhoneForCountry(address.country) };
};

const listCarrierAccounts = async () => {
    const response = await callShippo({ method: "GET", path: "/carrier_accounts/" });
    if (Array.isArray(response)) return response;
    if (response && typeof response === "object") {
        if (Array.isArray(response.results)) return response.results;
        if (Array.isArray(response.carrier_accounts)) return response.carrier_accounts;
    }
    return [];
};

const toCarrierAccountSummary = (accounts) =>
    accounts
        .filter((account) => account && typeof account === "object" && account.active)
        .map((account) => ({
            id: account.object_id ? String(account.object_id) : "",
            carrier: account.carrier ? String(account.carrier) : "",
            carrierName: account.carrier_name ? String(account.carrier_name) : ""
        }))
        .filter((account) => account.id);

const normalizeAddress = (value) => {
    if (!value || typeof value !== "object") return null;
    const record = value;
    const country = normalizeCountry(record.country);
    if (!country) return null;

    const street1 = typeof record.street1 === "string" ? record.street1.trim() : "";
    const city = typeof record.city === "string" ? record.city.trim() : "";
    const zip = typeof record.zip === "string" ? record.zip.trim() : "";
    if (!street1 || !city || !zip) return null;

    return {
        name: typeof record.name === "string" ? record.name.trim() : "",
        company: typeof record.company === "string" ? record.company.trim() : "",
        street1,
        street2: typeof record.street2 === "string" ? record.street2.trim() : "",
        city,
        state: typeof record.state === "string" ? record.state.trim() : "",
        zip,
        country,
        phone: typeof record.phone === "string" ? record.phone.trim() : "",
        email: typeof record.email === "string" ? record.email.trim() : ""
    };
};

const normalizeParcel = (value) => {
    if (!value || typeof value !== "object") return null;
    const record = value;
    const distanceUnit = typeof record.distance_unit === "string" ? record.distance_unit.trim().toLowerCase() : "";
    const massUnit = typeof record.mass_unit === "string" ? record.mass_unit.trim().toLowerCase() : "";
    const length = Number(record.length);
    const width = Number(record.width);
    const height = Number(record.height);
    const weight = Number(record.weight);
    if (!Number.isFinite(length) || !Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(weight)) return null;
    if (length <= 0 || width <= 0 || height <= 0 || weight <= 0) return null;
    if (!distanceUnit || !massUnit) return null;

    return {
        length: String(length),
        width: String(width),
        height: String(height),
        distance_unit: distanceUnit,
        weight: String(weight),
        mass_unit: massUnit
    };
};

exports.getShippingRatesForTenant = functions
    .runWith({ secrets: secretNames })
    .https.onCall(async (data) => {
        const storeId = typeof data?.storeId === "string" ? data.storeId.trim() : "";
        if (!storeId) throw new HttpsError("invalid-argument", "Missing storeId.");

        const toAddress = normalizeAddress(data?.toAddress);
        if (!toAddress) throw new HttpsError("invalid-argument", "Invalid toAddress.");

        const storeSnap = await db.collection("stores").doc(storeId).get();
        if (!storeSnap.exists) throw new HttpsError("not-found", "Store not found.");

        const shippingConfig = await loadShippingConfig(storeId, storeSnap);
        const originAddress = normalizeAddress(shippingConfig && shippingConfig.originAddress);
        if (!originAddress) {
            throw new HttpsError("failed-precondition", "Missing shipping.originAddress for store.", {
                expectedPaths: [`stores/${storeId}.shipping.originAddress`, `stores/${storeId}/shipping/config.originAddress`]
            });
        }

        const enabledCarriersRaw = shippingConfig && shippingConfig.enabledCarriers;
        const enabledCarrierKeys = Array.isArray(enabledCarriersRaw)
            ? enabledCarriersRaw.map(normalizeCarrierKey).filter(Boolean)
            : [];

        const carrierAccountIdsRaw = shippingConfig && (shippingConfig.carrierAccountIds || shippingConfig.carrierAccounts);
        const carrierAccountIdsFromConfig = Array.isArray(carrierAccountIdsRaw)
            ? carrierAccountIdsRaw.map((v) => String(v || "").trim()).filter(Boolean)
            : [];

        const parcel =
            normalizeParcel(data?.parcel) ||
            normalizeParcel(shippingConfig && shippingConfig.defaultParcel) ||
            normalizeParcel(defaultShippingConfigForStore(storeId) && defaultShippingConfigForStore(storeId).defaultParcel);
        if (!parcel) throw new HttpsError("failed-precondition", "Missing parcel configuration.");

        const originCountry = normalizeCountry(originAddress.country);
        const destinationCountry = normalizeCountry(toAddress.country);

        let carrierAccountsForRequest = carrierAccountIdsFromConfig.length > 0 ? carrierAccountIdsFromConfig : null;
        let carrierAccountsSnapshot = null;
        if (!carrierAccountsForRequest && enabledCarrierKeys.length > 0) {
            const accounts = await listCarrierAccounts();
            carrierAccountsSnapshot = accounts;
            const ids = accounts
                .filter((account) => account && typeof account === "object")
                .filter((account) => Boolean(account.active))
                .filter((account) => {
                    const carrier = normalizeCarrierKey(account.carrier);
                    const carrierName = normalizeCarrierKey(account.carrier_name);
                    return enabledCarrierKeys.includes(carrier) || enabledCarrierKeys.includes(carrierName);
                })
                .map((account) => (account.object_id ? String(account.object_id) : ""))
                .filter(Boolean);
            if (ids.length > 0) carrierAccountsForRequest = ids;
        }

        const normalizedFrom = withRequiredPhone(withRequiredCompany(originAddress, "BYRN ACTIVE"));
        const normalizedTo = withRequiredPhone(toAddress);

        if (!carrierAccountsForRequest && originCountry === "AU" && destinationCountry === "AU") {
            const accounts = carrierAccountsSnapshot || (await listCarrierAccounts());
            carrierAccountsSnapshot = accounts;
            const ids = accounts
                .filter((account) => account && typeof account === "object")
                .filter((account) => Boolean(account.active))
                .filter((account) => normalizeCarrierKey(account.carrier) === "couriersplease")
                .map((account) => (account.object_id ? String(account.object_id) : ""))
                .filter(Boolean);
            if (ids.length > 0) carrierAccountsForRequest = ids;
        }

        const shipment = await callShippo({
            method: "POST",
            path: "/shipments/",
            body: {
                address_from: normalizedFrom,
                address_return: normalizedFrom,
                address_to: normalizedTo,
                parcels: [parcel],
                ...(carrierAccountsForRequest ? { carrier_accounts: carrierAccountsForRequest } : {}),
                async: false
            }
        });

        const shipmentId = shipment && shipment.object_id ? String(shipment.object_id) : "";
        const rates = Array.isArray(shipment && shipment.rates) ? shipment.rates : [];
        const availableProviders = Array.from(
            new Set(
                rates
                    .map((rate) => (rate && typeof rate === "object" && rate.provider ? String(rate.provider) : ""))
                    .filter(Boolean)
            )
        );

        const filtered = rates
            .map((rate) => {
                if (!rate || typeof rate !== "object") return null;
                const rateId = rate.object_id ? String(rate.object_id) : "";
                const provider = rate.provider ? String(rate.provider) : "";
                const serviceName = rate.servicelevel && rate.servicelevel.name ? String(rate.servicelevel.name) : "";
                const amount = rate.amount ? String(rate.amount) : "";
                const currency = rate.currency ? String(rate.currency) : "";
                const estimatedDays =
                    typeof rate.estimated_days === "number" ? rate.estimated_days : Number(rate.estimated_days);
                const durationTerms = rate.duration_terms ? String(rate.duration_terms) : "";
                const carrierKey = normalizeCarrierKey(provider);
                if (!rateId || !provider || !serviceName || !amount || !currency) return null;
                if (enabledCarrierKeys.length > 0 && !enabledCarrierKeys.includes(carrierKey)) return null;
                return {
                    rateId,
                    provider,
                    carrierKey,
                    serviceName,
                    amount,
                    currency: currency.toUpperCase(),
                    estimatedDays: Number.isFinite(estimatedDays) ? estimatedDays : null,
                    durationTerms
                };
            })
            .filter(Boolean);

        if (!shipmentId) throw new HttpsError("internal", "Shippo shipment did not return an ID.");
        if (filtered.length === 0) {
            const enabledCarrierKeys = Array.isArray(enabledCarriersRaw)
                ? enabledCarriersRaw.map(normalizeCarrierKey).filter(Boolean)
                : [];

            if (rates.length > 0 && enabledCarrierKeys.length > 0) {
                const availableCarrierKeys = Array.from(new Set(availableProviders.map(normalizeCarrierKey).filter(Boolean)));
                throw new HttpsError("failed-precondition", "No shipping rates matched the enabledCarriers for this store.", {
                    shipmentId,
                    enabledCarriers: enabledCarriersRaw,
                    availableProviders,
                    availableCarrierKeys
                });
            }

            const messages = Array.isArray(shipment && shipment.messages) ? shipment.messages : [];
            const accounts = carrierAccountsSnapshot || (await listCarrierAccounts());
            const activeCarrierAccounts = toCarrierAccountSummary(accounts);
            throw new HttpsError("failed-precondition", "No shipping rates available for this address.", {
                shipmentId,
                messages,
                availableProviders,
                carrierAccountsProvided: carrierAccountsForRequest || [],
                activeCarrierAccounts,
                originCountry,
                destinationCountry
            });
        }

        return {
            shipmentId,
            rates: filtered
        };
    });
