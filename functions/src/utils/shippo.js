const { HttpsError } = require("firebase-functions/v1/https");

const getShippoApiKey = () => {
    const key = process.env.SHIPPO_API_KEY;
    if (!key) throw new HttpsError("failed-precondition", "Missing SHIPPO_API_KEY.");
    return key;
};

const normalizeCarrierKey = (value) =>
    String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");

const callShippo = async ({ method, path, body }) => {
    const apiKey = getShippoApiKey();
    const url = `https://api.goshippo.com${path}`;
    const response = await fetch(url, {
        method,
        headers: {
            Authorization: `ShippoToken ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: body ? JSON.stringify(body) : undefined
    });

    const text = await response.text();
    let parsed = null;
    try {
        parsed = text ? JSON.parse(text) : null;
    } catch {
        parsed = null;
    }

    if (!response.ok) {
        const message =
            parsed && typeof parsed === "object" && "detail" in parsed
                ? String(parsed.detail)
                : `Shippo request failed with HTTP ${response.status}.`;
        throw new HttpsError("internal", message, {
            status: response.status,
            path,
            shippo: parsed
        });
    }

    return parsed;
};

module.exports = { callShippo, normalizeCarrierKey };
