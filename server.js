"use strict";

require("dotenv").config({ quiet: true });

const path = require("path");
const express = require("express");
const mono = require("./server/mono");

const app = express();
const ROOT = __dirname;
const PUBLIC_ROOT = path.join(ROOT, "public");
const PORT = Number(process.env.PORT) || 3000;
const HOST = "127.0.0.1";

const PUBLIC_FILES = new Set([
    "index.html",
    "auth.html",
    "style.css",
    "auth.css",
    "mono.css",
    "calendar.js",
    "transactions.js",
    "dashboard.js",
    "charts.js",
    "main.js",
    "records-page.js",
    "analytics-page.js",
    "settings-page.js",
    "accounts-page.js",
    "mono-connect.js",
    "auth.js",
    "qionix-q.svg"
]);

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(function (req, res, next) {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "same-origin");
    if (req.path.indexOf("/api/") === 0) res.set("Cache-Control", "no-store");
    next();
});

function asyncRoute(handler) {
    return function (req, res, next) {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}

function validAccountId(value) {
    return typeof value === "string" && /^[A-Za-z0-9_-]{6,80}$/.test(value);
}

app.get("/api/mono/config", function (req, res) {
    res.json(mono.config());
});

app.post("/api/mono/exchange", asyncRoute(async function (req, res) {
    const code = req.body && typeof req.body.code === "string" ? req.body.code.trim() : "";
    if (code.length < 4 || code.length > 1024) {
        res.status(400).json({ error: "A valid Mono authorization code is required." });
        return;
    }
    res.json(await mono.exchangeToken(code));
}));

app.get("/api/mono/accounts/:id", asyncRoute(async function (req, res) {
    if (!validAccountId(req.params.id)) {
        res.status(400).json({ error: "Invalid Mono account id." });
        return;
    }
    res.json({ account: await mono.getAccount(req.params.id) });
}));

app.get("/api/mono/accounts/:id/transactions", asyncRoute(async function (req, res) {
    if (!validAccountId(req.params.id)) {
        res.status(400).json({ error: "Invalid Mono account id." });
        return;
    }
    res.json(await mono.getTransactions(req.params.id));
}));

app.get("/", function (req, res) {
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(PUBLIC_ROOT, "index.html"));
});

app.get("/:file", function (req, res, next) {
    if (!PUBLIC_FILES.has(req.params.file)) {
        next();
        return;
    }
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(PUBLIC_ROOT, req.params.file));
});

app.use("/fonts", express.static(path.join(PUBLIC_ROOT, "fonts"), {
    dotfiles: "deny",
    fallthrough: false,
    setHeaders: function (res) { res.set("Cache-Control", "no-cache"); }
}));

app.use("/vendor", express.static(path.join(PUBLIC_ROOT, "vendor"), {
    dotfiles: "deny",
    fallthrough: false,
    setHeaders: function (res) { res.set("Cache-Control", "no-cache"); }
}));

app.use(function (req, res) {
    if (req.path.indexOf("/api/") === 0) {
        res.status(404).json({ error: "Not found." });
        return;
    }
    res.status(404).type("text/plain").send("Not found.");
});

app.use(function (err, req, res, next) {
    if (res.headersSent) {
        next(err);
        return;
    }
    if (err && err.type === "entity.parse.failed") {
        res.status(400).json({ error: "Invalid JSON body." });
        return;
    }
    const status = err && Number.isInteger(err.status) ? err.status : 500;
    const message = err && err.name === "MonoError" ? err.message : "Something went wrong on the server.";
    if (status >= 500) console.error("Mono API error:", err && err.name === "MonoError" ? err.message : "internal error");
    res.status(status).json({ error: message });
});

module.exports = app;

if (require.main === module) {
    const server = app.listen(PORT, HOST, function () {
        const state = mono.config();
        console.log("Qionix running at http://localhost:" + PORT);
        if (!state.configured) {
            console.log("Mono keys missing: add MONO_PUBLIC_KEY and MONO_SECRET_KEY to .env, then restart.");
        } else if (!state.testMode) {
            console.log("Mono is locked to test mode. Replace live keys with test_pk_ and test_sk_ keys.");
        } else {
            console.log("Mono test mode ready.");
        }
    });

    server.on("error", function (err) {
        if (err && err.code === "EADDRINUSE") {
            console.error("Port " + PORT + " is already in use. Stop the other server or change PORT in .env.");
        } else {
            console.error("Server could not start:", err && err.message ? err.message : err);
        }
        process.exitCode = 1;
    });
}
