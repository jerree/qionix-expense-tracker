"use strict";

const MONO_BASE_URL = "https://api.withmono.com";
const REQUEST_TIMEOUT_MS = 20000;

class MonoError extends Error {
    constructor(message, status) {
        super(message);
        this.name = "MonoError";
        this.status = status || 502;
    }
}

function publicKey() {
    return String(process.env.MONO_PUBLIC_KEY || "").trim();
}

function secretKey() {
    return String(process.env.MONO_SECRET_KEY || "").trim();
}

function isTestKey(key) {
    return key.indexOf("test_") === 0;
}

function config() {
    const pub = publicKey();
    const secret = secretKey();
    const configured = Boolean(pub && secret);
    const testMode = configured && isTestKey(pub) && isTestKey(secret);
    return {
        configured: configured,
        testMode: testMode,
        publicKey: testMode ? pub : ""
    };
}

function assertReady() {
    const pub = publicKey();
    const secret = secretKey();
    if (!pub || !secret) {
        throw new MonoError("Mono test keys are not configured. Add MONO_PUBLIC_KEY and MONO_SECRET_KEY to .env, then restart the server.", 503);
    }
    if (!isTestKey(pub) || !isTestKey(secret)) {
        throw new MonoError("Only Mono test keys are allowed in this demo. Replace the live keys with test_pk_ and test_sk_ keys.", 403);
    }
}

function safeMessage(value) {
    let text = String(value || "Mono request failed").replace(/\s+/g, " ").trim();
    const secret = secretKey();
    if (secret) text = text.split(secret).join("[redacted]");
    return text.slice(0, 220);
}

async function monoRequest(path, options) {
    assertReady();
    const settings = options || {};
    const headers = {
        accept: "application/json",
        "content-type": "application/json",
        "mono-sec-key": secretKey()
    };
    if (settings.headers) {
        Object.keys(settings.headers).forEach(function (key) {
            headers[key] = settings.headers[key];
        });
    }

    let response;
    try {
        response = await fetch(MONO_BASE_URL + path, {
            method: settings.method || "GET",
            headers: headers,
            body: settings.body,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
    } catch (err) {
        if (err && err.name === "TimeoutError") {
            throw new MonoError("Mono took too long to respond. Please try again.", 504);
        }
        throw new MonoError("Could not reach Mono. Check the internet connection and try again.", 502);
    }

    const raw = await response.text();
    let data = null;
    try {
        data = raw ? JSON.parse(raw) : null;
    } catch (err) {
        data = null;
    }

    if (!response.ok) {
        const detail = data && (data.message || data.error);
        throw new MonoError("Mono request failed (" + response.status + ")" + (detail ? ": " + safeMessage(detail) : "."), 502);
    }
    if (!data || typeof data !== "object") {
        throw new MonoError("Mono returned an unreadable response. Please try again.", 502);
    }
    return data;
}

function numberValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function toNaira(minorAmount) {
    return Math.round(numberValue(minorAmount)) / 100;
}

function stableId(transaction) {
    const seed = [
        transaction.narration || "",
        transaction.date || "",
        transaction.amount || "",
        transaction.balance || "",
        transaction.type || ""
    ].join("|");
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++) {
        hash ^= seed.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return "mono-" + (hash >>> 0).toString(16);
}

function normalizeAccount(body) {
    const payload = body.data && typeof body.data === "object" ? body.data : {};
    const account = payload.account && typeof payload.account === "object" ? payload.account : payload;
    const id = account.id || account._id;
    if (!id) throw new MonoError("Mono did not return an account id.", 502);

    const institution = account.institution && typeof account.institution === "object" ? account.institution : {};
    const meta = payload.meta && typeof payload.meta === "object" ? payload.meta : (body.meta && typeof body.meta === "object" ? body.meta : {});
    const balanceKobo = numberValue(account.balance);

    return {
        id: String(id),
        name: account.name || "Mono account",
        accountNumber: String(account.account_number || account.accountNumber || ""),
        currency: String(account.currency || "NGN"),
        type: account.type || "Bank account",
        institution: {
            name: String(institution.name || "Mono bank"),
            bankCode: String(institution.bank_code || institution.bankCode || ""),
            type: String(institution.type || "")
        },
        balanceKobo: balanceKobo,
        balance: toNaira(balanceKobo),
        dataStatus: String(meta.data_status || meta.dataStatus || account.data_status || "UNKNOWN").toUpperCase(),
        retrievedData: Array.isArray(meta.retrieved_data) ? meta.retrieved_data.map(String) : [],
        authMethod: String(meta.auth_method || meta.authMethod || account.auth_method || account.authMethod || "")
    };
}

function normalizeTransactions(body) {
    const payload = body.data && typeof body.data === "object" ? body.data : {};
    let items = [];
    if (Array.isArray(body.data)) items = body.data;
    else if (Array.isArray(payload.transactions)) items = payload.transactions;
    else if (Array.isArray(body.transactions)) items = body.transactions;

    const transactions = [];
    items.forEach(function (item) {
        if (!item || typeof item !== "object") return;
        const direction = String(item.type || "").toLowerCase();
        if (direction !== "debit" && direction !== "credit") return;
        const date = new Date(item.date);
        if (isNaN(date.getTime())) return;
        const amountKobo = numberValue(item.amount);
        if (amountKobo <= 0) return;
        const monoId = String(item._id || item.id || stableId(item));
        const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};

        transactions.push({
            id: monoId,
            narration: String(item.narration || "Bank transaction").slice(0, 220),
            direction: direction,
            amountKobo: amountKobo,
            amount: toNaira(amountKobo),
            balanceKobo: numberValue(item.balance),
            balance: toNaira(item.balance),
            date: date.toISOString(),
            category: String(item.category || metadata.category || "unknown").toLowerCase(),
            currency: String(item.currency || "NGN")
        });
    });

    transactions.sort(function (a, b) {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    const meta = body.meta && typeof body.meta === "object" ? body.meta : (payload.paging && typeof payload.paging === "object" ? payload.paging : {});
    return {
        transactions: transactions,
        meta: {
            total: numberValue(meta.total) || transactions.length,
            page: numberValue(meta.page) || 1
        }
    };
}

async function exchangeToken(code) {
    const body = await monoRequest("/v2/accounts/auth", {
        method: "POST",
        body: JSON.stringify({ code: code })
    });
    const payload = body.data && typeof body.data === "object" ? body.data : {};
    const accountId = payload.id || payload._id || body.id || (payload.account && (payload.account.id || payload.account._id));
    if (!accountId) throw new MonoError("Mono linked the bank but did not return an account id.", 502);
    return { accountId: String(accountId) };
}

async function getAccount(accountId) {
    const body = await monoRequest("/v2/accounts/" + encodeURIComponent(accountId));
    return normalizeAccount(body);
}

async function getTransactions(accountId) {
    const body = await monoRequest("/v2/accounts/" + encodeURIComponent(accountId) + "/transactions?paginate=false");
    return normalizeTransactions(body);
}

module.exports = {
    MonoError: MonoError,
    config: config,
    exchangeToken: exchangeToken,
    getAccount: getAccount,
    getTransactions: getTransactions
};
