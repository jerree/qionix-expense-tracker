(function () {
    "use strict";

    const MODAL_ID = "mono-modal";
    const PREVIEW_LIMIT = 12;
    const CATEGORY_RULES = [
        ["salary", ["salary", "payroll", "wages", "stipend"]],
        ["groceries", ["grocer", "supermarket", "shoprite", "spar", "justrite", "ebeano", "foodstuff", "market"]],
        ["data", ["mtn", "glo", "airtel", "9mobile", "etisalat", "airtime", "data plan", "internet", "broadband", "spectranet", "smile"]],
        ["transport", ["uber", "bolt", "taxi", "transport", "bus ", "train", "airline", "flight", "fuel", "petrol", "filling", "nnpc", "total ", "ride"]],
        ["entertainment", ["netflix", "spotify", "showmax", "cinema", "movie", "dstv", "gotv", "betting", "game", "event"]],
        ["food", ["restaurant", "food", "cafe", "eatery", "kitchen", "chicken", "pizza", "suya", "mcdonald", "kfc", "domino", "cold stone", "bakery"]],
        ["shopping", ["amazon", "jumia", "konga", "shop", "store", "mall", "boutique", "clothing", "electronics"]]
    ];
    const MONO_CATEGORY_MAP = {
        salary: "salary",
        food: "food",
        food_and_drink: "food",
        food_and_drinks: "food",
        restaurant: "food",
        groceries: "groceries",
        grocery: "groceries",
        transportation: "transport",
        transport: "transport",
        airtime: "data",
        data: "data",
        internet: "data",
        entertainment: "entertainment",
        shopping: "shopping"
    };

    let modal = null;
    let currentView = null;
    let connectWidget = null;
    let widgetSucceeded = false;
    let busy = false;
    let importing = false;
    let lastFocus = null;

    function esc(value) {
        return String(value).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    function money(value) {
        return "NGN " + Number(value).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function roundMoney(value) {
        return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    }

    function icon(name) {
        return '<span class="material-icons" aria-hidden="true">' + name + "</span>";
    }

    function api(path, options) {
        const settings = options || {};
        return fetch(path, {
            method: settings.method || "GET",
            headers: settings.body ? { "Content-Type": "application/json", accept: "application/json" } : { accept: "application/json" },
            body: settings.body ? JSON.stringify(settings.body) : undefined
        }).then(function (response) {
            return response.json().catch(function () { return null; }).then(function (data) {
                if (!response.ok) {
                    throw new Error((data && data.error) || "The server could not complete that request.");
                }
                return data;
            });
        });
    }

    function profile() {
        let name = "Qionix Demo";
        let email = "";
        try {
            const saved = JSON.parse(localStorage.getItem("qionix.profile") || "null");
            if (saved && typeof saved.name === "string" && saved.name.trim()) name = saved.name.trim();
            const session = JSON.parse(localStorage.getItem("qionix.session") || "null");
            if (session && typeof session.email === "string") email = session.email.trim();
            if (!email) {
                const users = JSON.parse(localStorage.getItem("qionix.users") || "[]");
                if (Array.isArray(users) && session && session.userId) {
                    const user = users.find(function (u) { return u && u.id === session.userId; });
                    if (user && typeof user.email === "string") email = user.email.trim();
                }
            }
        } catch (err) {
            email = "";
        }
        return { name: name, email: email };
    }

    function categoryFor(transaction) {
        const text = (String(transaction.narration || "") + " " + String(transaction.category || "")).toLowerCase();
        const monoCategory = MONO_CATEGORY_MAP[String(transaction.category || "").toLowerCase()];
        if (monoCategory) return monoCategory;
        for (let i = 0; i < CATEGORY_RULES.length; i++) {
            const words = CATEGORY_RULES[i][1];
            for (let j = 0; j < words.length; j++) {
                if (text.indexOf(words[j]) !== -1) return CATEGORY_RULES[i][0];
            }
        }
        return "other";
    }

    function localDateTime(value) {
        const date = new Date(value);
        if (isNaN(date.getTime())) return "";
        const pad = function (number) { return String(number).padStart(2, "0"); };
        return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) +
            "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
    }

    function shortDate(value) {
        const date = new Date(value);
        if (isNaN(date.getTime())) return "";
        return date.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " · " +
            date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    }

    function findAccountByName(name) {
        return accounts.find(function (acc) { return acc.name === name; }) || null;
    }

    function findLinkedAccount(monoAccountId) {
        return accounts.find(function (acc) { return acc.monoAccountId === monoAccountId; }) || null;
    }

    function isLinked(account) {
        return !!(account && account.monoAccountId);
    }

    function knownMonoIds() {
        const known = new Set();
        transactions.forEach(function (t) {
            if (t && t.monoId) known.add(String(t.monoId));
        });
        return known;
    }

    function uniqueAccountName(institutionName, accountNumber) {
        const base = String(institutionName || "Mono bank").replace(/\s+/g, " ").trim().slice(0, 28) || "Mono bank";
        let name = base + " (test)";
        const lower = function (value) { return value.toLowerCase(); };
        const taken = function (value) {
            return accounts.some(function (acc) { return lower(acc.name) === lower(value); });
        };
        if (!taken(name)) return name;
        const digits = String(accountNumber || "").replace(/\D/g, "").slice(-4);
        name = base + (digits ? " " + digits : "") + " (test)";
        let suffix = 2;
        while (taken(name)) {
            name = base + " " + (digits ? digits + " " : "") + suffix + " (test)";
            suffix++;
        }
        return name;
    }

    function nextRecordId() {
        let id = Date.now();
        const used = new Set(transactions.map(function (t) { return t.id; }));
        while (used.has(id)) id++;
        return id;
    }

    function addMonoRecords(account, items) {
        const known = knownMonoIds();
        let added = 0;
        items.forEach(function (item) {
            if (!item || !item.id || known.has(item.id)) return;
            const direction = item.direction === "credit" ? "income" : "expense";
            transactions.push({
                id: nextRecordId(),
                amount: roundMoney(item.amount),
                type: direction,
                category: categoryFor(item),
                account: account.name,
                date: localDateTime(item.date),
                monoId: String(item.id)
            });
            known.add(item.id);
            added++;
        });
        return added;
    }

    function setBusy(value) {
        busy = value;
        document.querySelectorAll('[data-act="mono-connect"]').forEach(function (button) {
            button.disabled = value;
            button.classList.toggle("is-busy", value);
            button.setAttribute("aria-busy", value ? "true" : "false");
        });
    }

    function ensureModal() {
        if (modal) return modal;
        modal = document.createElement("div");
        modal.id = MODAL_ID;
        modal.className = "mn-modal";
        modal.hidden = true;
        modal.innerHTML = '' +
            '<div class="mn-backdrop" data-mn-close></div>' +
            '<section class="mn-dialog" role="dialog" aria-modal="true" aria-labelledby="mn-title" tabindex="-1">' +
            '  <div id="mn-content"></div>' +
            "</section>";
        document.body.appendChild(modal);

        modal.addEventListener("click", function (event) {
            const close = event.target.closest("[data-mn-close]");
            const importer = event.target.closest("[data-mn-import]");
            const retry = event.target.closest("[data-mn-retry]");
            if (importer) {
                event.preventDefault();
                importPreview();
                return;
            }
            if (retry) {
                event.preventDefault();
                hideModal();
                setBusy(false);
                connect();
                return;
            }
            if (close) {
                event.preventDefault();
                if (modal.dataset.locked === "true" || importing) return;
                hideModal();
                setBusy(false);
            }
        });

        document.addEventListener("keydown", function (event) {
            if (event.key !== "Escape" || modal.hidden) return;
            if (modal.dataset.locked === "true" || importing) return;
            hideModal();
            setBusy(false);
        });
        return modal;
    }

    function showModal(html, locked) {
        const box = ensureModal();
        lastFocus = document.activeElement;
        box.dataset.locked = locked ? "true" : "false";
        document.getElementById("mn-content").innerHTML = html;
        box.hidden = false;
        document.body.classList.add("mn-open");
        const dialog = box.querySelector(".mn-dialog");
        if (dialog) dialog.focus();
    }

    function hideModal() {
        if (!modal) return;
        modal.hidden = true;
        modal.dataset.locked = "false";
        document.getElementById("mn-content").innerHTML = "";
        document.body.classList.remove("mn-open");
        if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
        lastFocus = null;
    }

    function loadingHTML(title, message) {
        return '' +
            '<div class="mn-loading">' +
            '  <span class="mn-spinner" aria-hidden="true"></span>' +
            '  <h2 id="mn-title">' + esc(title) + "</h2>" +
            "  <p>" + esc(message) + "</p>" +
            "</div>";
    }

    function errorHTML(title, message) {
        return '' +
            '<div class="mn-error">' +
            '  <span class="mn-error-icon">' + icon("error_outline") + "</span>" +
            '  <h2 id="mn-title">' + esc(title) + "</h2>" +
            "  <p>" + esc(message) + "</p>" +
            '  <div class="mn-footer">' +
            '    <button type="button" class="mn-btn ghost" data-mn-close>Close</button>' +
            '    <button type="button" class="mn-btn primary" data-mn-retry>Try again</button>' +
            "  </div>" +
            "</div>";
    }

    function showError(title, message) {
        importing = false;
        showModal(errorHTML(title, message), false);
        setBusy(false);
    }

    function configError(message) {
        showModal('' +
            '<div class="mn-error">' +
            '  <span class="mn-error-icon">' + icon("key_off") + "</span>" +
            '  <h2 id="mn-title">Mono test mode is not ready</h2>' +
            "  <p>" + esc(message) + "</p>" +
            '  <div class="mn-setup">' +
            "    <code>MONO_PUBLIC_KEY=test_pk_...</code>" +
            "    <code>MONO_SECRET_KEY=test_sk_...</code>" +
            "  </div>" +
            "  <p>Create <strong>.env</strong> in the project folder with those lines, then restart the server.</p>" +
            '  <div class="mn-footer">' +
            '    <button type="button" class="mn-btn primary" data-mn-close>Got it</button>' +
            "  </div>" +
            "</div>", false);
        setBusy(false);
    }

    function blockBadStatus(account) {
        const status = String(account.dataStatus || "").toUpperCase();
        if (status === "PROCESSING" || status === "FAILED" || status === "UNAVAILABLE") {
            throw new Error("Mono says this account is " + status + ". Wait a moment, then try Sync now again.");
        }
    }

    function wait(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function loadTransactions(accountId, account, attemptsLeft) {
        return api("/api/mono/accounts/" + encodeURIComponent(accountId) + "/transactions").then(function (transactionData) {
            const list = transactionData && Array.isArray(transactionData.transactions) ? transactionData.transactions : [];
            const status = String(account.dataStatus || "").toUpperCase();
            const stillLoading = list.length === 0 && (status === "AVAILABLE" || status === "PARTIAL");
            if (stillLoading && attemptsLeft > 1) {
                return wait(1800).then(function () {
                    return loadTransactions(accountId, account, attemptsLeft - 1);
                });
            }
            return list;
        });
    }

    function previewData(accountId) {
        let account = null;
        return api("/api/mono/accounts/" + encodeURIComponent(accountId)).then(function (result) {
            account = result && result.account;
            if (!account || !account.id) throw new Error("Mono did not return account details.");
            blockBadStatus(account);
            if (String(account.currency || "NGN").toUpperCase() !== "NGN") {
                throw new Error("This demo supports NGN accounts only. The linked account is in " + account.currency + ".");
            }
            return loadTransactions(accountId, account, 5);
        }).then(function (transactions) {
            return {
                account: account,
                transactions: transactions
            };
        });
    }

    function prepareLink(accountId) {
        return previewData(accountId).then(function (data) {
            const existing = findLinkedAccount(data.account.id);
            const known = knownMonoIds();
            const fresh = data.transactions.filter(function (t) { return t && t.id && !known.has(t.id); });
            const delta = data.transactions.reduce(function (sum, t) {
                return sum + (t.direction === "credit" ? Number(t.amount) : -Number(t.amount));
            }, 0);
            const opening = existing ? Number(existing.opening) || 0 : roundMoney(data.account.balance - delta);
            const openingAdjusted = !existing && opening < 0;
            const accountName = existing
                ? existing.name
                : uniqueAccountName(data.account.institution && data.account.institution.name, data.account.accountNumber);

            currentView = {
                account: data.account,
                allTransactions: data.transactions,
                newTransactions: existing ? fresh : data.transactions,
                existing: existing,
                accountName: accountName,
                opening: existing ? Number(existing.opening) || 0 : Math.max(0, opening),
                openingAdjusted: openingAdjusted,
                bankBalance: data.account.balance,
                isNew: !existing
            };
            importing = false;
            renderPreview();
            setBusy(false);
        });
    }

    function previewListHTML(view) {
        if (view.allTransactions.length === 0) {
            return '<div class="mn-empty">' + icon("receipt_long") +
                "<strong>No transactions returned</strong><p>The account can still be linked with its current balance.</p></div>";
        }
        const items = view.allTransactions.slice(0, PREVIEW_LIMIT);
        let rows = "";
        items.forEach(function (t) {
            const incoming = t.direction === "credit";
            const category = categoryFor(t);
            const categoryName = (typeof CATEGORY_NAMES !== "undefined" && CATEGORY_NAMES[category]) || "Other";
            const categoryIcon = typeof getCategoryIcon === "function" ? getCategoryIcon(category) : "category";
            rows += '' +
                '<li class="mn-tx">' +
                '  <span class="mn-tx-ico ' + (incoming ? "in" : "out") + '">' + icon(categoryIcon) + "</span>" +
                '  <div class="mn-tx-info"><strong>' + esc(t.narration || "Bank transaction") + "</strong>" +
                "    <small>" + esc(shortDate(t.date)) + '<span class="mn-cat">' + esc(categoryName) + "</span></small>" +
                "  </div>" +
                '  <span class="mn-tx-amount ' + (incoming ? "in" : "out") + '">' +
                (incoming ? "+" : "-") + money(Math.abs(Number(t.amount))) + "</span>" +
                "</li>";
        });
        let more = "";
        if (view.allTransactions.length > PREVIEW_LIMIT) {
            more = '<p class="mn-more">Showing the latest ' + PREVIEW_LIMIT + " of " + view.allTransactions.length +
                ". All " + view.newTransactions.length + " new record" + (view.newTransactions.length === 1 ? "" : "s") + " will be imported.</p>";
        }
        return '<ul class="mn-tx-list">' + rows + "</ul>" + more;
    }

    function renderPreview() {
        const view = currentView;
        if (!view) return;
        const newCount = view.newTransactions.length;
        const bankName = (view.account.institution && view.account.institution.name) || "Mono bank";
        const number = view.account.accountNumber || "No account number";
        const status = view.account.dataStatus || "UNKNOWN";
        const title = view.isNew ? "Review bank transactions" : "Mono account already linked";
        const buttonLabel = newCount === 0
            ? (view.isNew ? "Link this account" : "Close")
            : "Import " + newCount + " record" + (newCount === 1 ? "" : "s");

        let note = "";
        if (view.openingAdjusted) {
            note = '<div class="mn-note">' + icon("info") +
                "<p>Mono's transaction history did not reconcile with the bank balance. The opening balance is set to " +
                money(0) + ", so this account's balance may not match the bank.</p></div>";
        } else if (view.isNew) {
            note = '<div class="mn-note soft">' + icon("verified") +
                "<p>The opening balance is calculated so this account matches the bank balance shown by Mono.</p></div>";
        }

        const summary = '' +
            '<div class="mn-summary">' +
            '  <div><span>Bank balance</span><strong>' + money(view.bankBalance) + "</strong></div>" +
            '  <div><span>Transactions</span><strong>' + view.allTransactions.length + "</strong></div>" +
            "  <div><span>" + (view.isNew ? "Opening balance" : "New records") + "</span><strong>" +
            (view.isNew ? money(view.opening) : newCount) + "</strong></div>" +
            "</div>";

        const duplicateNote = !view.isNew
            ? '<p class="mn-duplicate">Existing records are kept. Only transactions with new Mono IDs are added.</p>'
            : "";

        showModal('' +
            '<div class="mn-head">' +
            '  <span class="mn-bank-icon">' + icon("account_balance") + "</span>" +
            '  <div class="mn-head-text">' +
            '    <span class="mn-eyebrow">Mono sandbox</span>' +
            '    <h2 id="mn-title">' + esc(title) + "</h2>" +
            "    <p>" + esc(bankName) + " · " + esc(number) + ' <span class="mn-status">' + esc(status) + "</span></p>" +
            "  </div>" +
            '  <button type="button" class="mn-close" data-mn-close aria-label="Close">' + icon("close") + "</button>" +
            "</div>" +
            summary +
            note +
            duplicateNote +
            '<div class="mn-list-head"><h3>Latest transactions</h3><span>' + newCount + " new</span></div>" +
            previewListHTML(view) +
            '<div class="mn-footer">' +
            '  <button type="button" class="mn-btn ghost" data-mn-close>Cancel</button>' +
            '  <button type="button" class="mn-btn primary" data-mn-import>' + esc(buttonLabel) + "</button>" +
            "</div>", false);
    }

    function importPreview() {
        const view = currentView;
        if (!view || importing) return;
        importing = true;
        const button = modal && modal.querySelector("[data-mn-import]");
        if (button) {
            button.disabled = true;
            button.classList.add("is-busy");
            button.textContent = "Importing...";
        }

        let account = view.existing;
        if (!account) {
            account = {
                name: view.accountName,
                type: "bank",
                icon: "account_balance",
                color: "#2563eb",
                currency: "NGN",
                rate: 1,
                opening: view.opening,
                excluded: false
            };
            accounts.push(account);
        }

        account.monoAccountId = view.account.id;
        account.monoInstitution = (view.account.institution && view.account.institution.name) || "Mono bank";
        account.monoNumber = view.account.accountNumber || "";
        account.monoLastSync = new Date().toISOString();
        if (view.isNew) {
            account.monoLinkedAt = new Date().toISOString();
            account.monoOpeningNote = view.openingAdjusted;
        }

        const added = addMonoRecords(account, view.newTransactions);
        saveData();
        hideModal();
        importing = false;
        currentView = null;
        setBusy(false);
        renderAccounts();
        displayTransactions();

        if (added > 0) {
            showToast("Imported " + added + " bank record" + (added === 1 ? "" : "s") + " from Mono", "success");
        } else {
            showToast("Bank account linked. No new records were added", "success");
        }
        location.hash = "#account/" + encodeURIComponent(account.name);
    }

    function exchangeCode(code) {
        return api("/api/mono/exchange", {
            method: "POST",
            body: { code: code }
        }).then(function (result) {
            if (!result || !result.accountId) throw new Error("Mono did not return an account ID.");
            return result.accountId;
        });
    }

    function beginLink(code) {
        if (!code) {
            showError("Could not link this bank", "Mono did not return an authorization code. Please try again.");
            return;
        }
        importing = false;
        showModal(loadingHTML("Linking your bank", "Mono is confirming the connection and loading your transactions."), true);
        exchangeCode(code)
            .then(prepareLink)
            .catch(function (err) {
                showError("Could not finish linking", err && err.message ? err.message : "Mono could not complete the connection.");
            });
    }

    function connect() {
        if (busy || importing) return;
        const Connect = window["@mono.co/connect.js"];
        if (typeof Connect !== "function") {
            showError("Mono widget unavailable", "The Mono Connect widget did not load. Check that vendor/mono-connect.js exists and reload the page.");
            return;
        }
        const customer = profile();
        if (!customer.email) {
            showError("Email needed", "Sign in again so Mono can identify the bank account owner.");
            return;
        }

        setBusy(true);
        widgetSucceeded = false;
        api("/api/mono/config").then(function (settings) {
            if (!settings || !settings.configured) {
                configError("Mono test keys were not found on the server.");
                return;
            }
            if (!settings.testMode || !settings.publicKey) {
                configError("Live keys are blocked. This presentation only runs with Mono test keys.");
                return;
            }
            try {
                connectWidget = new Connect({
                    key: settings.publicKey,
                    scope: "auth",
                    data: { customer: { name: customer.name, email: customer.email } },
                    reference: "qionix-" + Date.now(),
                    onSuccess: function (result) {
                        widgetSucceeded = true;
                        const code = result && result.code ? result.code : result;
                        beginLink(code);
                    },
                    onClose: function () {
                        connectWidget = null;
                        if (!widgetSucceeded && !importing) {
                            setBusy(false);
                            if (modal && !modal.hidden && modal.dataset.locked === "true") hideModal();
                        }
                    }
                });
                connectWidget.setup();
                connectWidget.open();
            } catch (err) {
                showError("Mono widget could not open", err && err.message ? err.message : "Check the public key and try again.");
            }
        }).catch(function () {
            const openedFromFile = location.protocol === "file:";
            showError(
                "Qionix server is not reachable",
                (openedFromFile ? "This page was opened directly from a file. " : "") +
                "Start the app with npm start, then open http://localhost:3000. Bank linking cannot work from a file or a different web server."
            );
        });
    }

    function sync(accountName) {
        if (busy || importing) return;
        const account = findAccountByName(accountName);
        if (!account || !account.monoAccountId) {
            showToast("This account is not linked to Mono", "error");
            return;
        }
        setBusy(true);
        showModal(loadingHTML("Syncing " + account.name, "Mono is fetching the latest transactions."), true);
        previewData(account.monoAccountId).then(function (data) {
            const added = addMonoRecords(account, data.transactions);
            account.monoLastSync = new Date().toISOString();
            account.monoInstitution = (data.account.institution && data.account.institution.name) || account.monoInstitution || "Mono bank";
            account.monoNumber = data.account.accountNumber || account.monoNumber || "";
            saveData();
            hideModal();
            setBusy(false);
            renderAccounts();
            displayTransactions();
            showToast(added > 0
                ? "Synced " + added + " new bank record" + (added === 1 ? "" : "s")
                : "Mono is already up to date", "success");
        }).catch(function (err) {
            showError("Sync failed", err && err.message ? err.message : "Mono could not sync this account.");
        });
    }

    window.QionixMono = {
        connect: connect,
        sync: sync,
        isLinked: isLinked
    };
})();
