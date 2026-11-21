// QIONIX - main.js | Data (transactions, accounts, categories) + modals/nav + helpers + init
// Loaded LAST so init can call everything above.

// =========================================================
// QIONIX - Expense Tracker
// Stage 1: Modal + Period Calendar logic
// =========================================================

// ------------------- MODAL LOGIC -------------------
const modal = document.getElementById("record-modal");
const openBtn = document.getElementById("open-modal-btn");
const closeBtn = document.getElementById("close-modal-btn");
const overlay = document.getElementById("modal-overlay");
const cancelBtn = document.getElementById("cancel-btn");

function openModal() {
    modal.classList.add("active");
}

function closeModal() {
    modal.classList.remove("active");
}

openBtn.addEventListener("click", openModal);
closeBtn.addEventListener("click", closeModal);
cancelBtn.addEventListener("click", closeModal);
overlay.addEventListener("click", closeModal);

document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal.classList.contains("active")) {
        closeModal();
    }
});

// ------------------- NAV ACTIVE -------------------
const navLinks = document.querySelectorAll(".nav-links li");

navLinks.forEach(function (li) {
    li.addEventListener("click", function (e) {
        e.preventDefault();
        navLinks.forEach(function (item) {
            item.classList.remove("active");
        });
        li.classList.add("active");
    });
});

const transactions = []; // Our storage - starts empty

// Helper: format amount as NGN with commas
function formatAmount(amount) {
    return "NGN " + Number(amount).toLocaleString();
}

// Helper: create Material Icon name based on category (replaces emojis)
function getCategoryIcon(category) {
    if (category === "food") return "restaurant";
    if (category === "transport") return "directions_bus";
    if (category === "data") return "wifi";
    if (category === "entertainment") return "movie";
    if (category === "shopping") return "shopping_bag";
    if (category === "groceries") return "shopping_cart";
    if (category === "salary") return "work";
    if (category === "transfer") return "swap_horiz";
    return "category";
}

// Click-to-filter: null = All accounts, else account name
let selectedAccount = null;

// Dot color matches sidebar color for any account (incl. custom ones)
function getAccountColor(accountName) {
    if (typeof accounts === "undefined") return DEFAULT_ACCOUNT_COLOR;
    for (let i = 0; i < accounts.length; i++) {
        if (accounts[i].name === accountName) return accounts[i].color || DEFAULT_ACCOUNT_COLOR;
    }
    return DEFAULT_ACCOUNT_COLOR;
}

// White text on dark colours, dark text on light ones (keeps cards readable for any picked colour)
function readableTextColor(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.62 ? "#1f2d3a" : "#ffffff";
}

// Display transactions on page (only last 2 like design)

// Visible transactions = within selected range + selected account (or all)
function inSelectedAccount(t) {
    if (!selectedAccount) return true;
    if (t.type === "transfer") return (t.from === selectedAccount || t.to === selectedAccount);
    return t.account === selectedAccount;
}

// "Exclude from statistics": hidden from totals/charts in the All-accounts view.
// Picking that account in the sidebar still shows its own numbers.
function isAccountExcluded(name) {
    for (let i = 0; i < accounts.length; i++) {
        if (accounts[i].name === name) return !!accounts[i].excluded;
    }
    return false;
}
function inStatistics(t) {
    if (selectedAccount) return true;
    if (t.type === "transfer") return !(isAccountExcluded(t.from) && isAccountExcluded(t.to));
    return !isAccountExcluded(t.account);
}

// Visible transactions = within selected range (or all) + account filter + statistics exclusion.
// allAccounts=true skips both account rules (used for real per-account balances in the sidebar).
function getVisibleTransactions(allAccounts) {
    const range = getActiveRange();
    const out = [];
    for (let i = 0; i < transactions.length; i++) {
        const t = transactions[i];
        if (!allAccounts && (!inSelectedAccount(t) || !inStatistics(t))) continue;
        if (!range) {
            out.push(t);
            continue;
        }
        const d = new Date(t.date);
        if (d >= range.start && d <= range.end) out.push(t);
    }
    return out;
}

// Sum of opening balances in scope (selected account or all)
function openingsInScope() {
    let sum = 0;
    for (let i = 0; i < accounts.length; i++) {
        const inScope = selectedAccount ? accounts[i].name === selectedAccount : !accounts[i].excluded;
        if (inScope) {
            sum = sum + openingNGN(accounts[i]);
        }
    }
    return sum;
}

// Any change of period refreshes the whole dashboard
function refreshForPeriod() {
    updatePeriodDisplay();
    displayTransactions();
}

// A brand-new profile starts with ONE account. Users add more with "+ Add Account".
// Each account stores its own colour as a hex code (picked in the Add Account modal).
const DEFAULT_ACCOUNT_COLOR = "#2ec4b6";
let accounts = [
    { name: "Cash", type: "cash", icon: "payments", color: DEFAULT_ACCOUNT_COLOR, currency: "NGN", rate: 1, opening: 0, excluded: false }
];

// NGN is the main currency. An account opened in another currency stores its opening money
// in that currency plus the exchange rate (NGN per 1 unit); everything on the site shows NGN.
function openingNGN(acc) {
    return (Number(acc.opening) || 0) * (Number(acc.rate) || 1);
}

// How one record moves a specific account's balance (+ in, - out)
function accountDeltaFor(acc, t) {
    if (t.type === "transfer") {
        let delta = 0;
        if (t.from === acc.name) delta -= t.amount;
        if (t.to === acc.name) delta += t.amount;
        return delta;
    }
    if (t.account !== acc.name) return 0;
    if (t.type === "income") return t.amount;
    if (t.type === "expense") return -t.amount;
    return 0;
}

// Current account balance, independent of the dashboard's period filter.
// cutoff is a timestamp; omit it to count everything up to the end of today.
function accountBalanceAt(acc, cutoff) {
    const end = typeof cutoff === "number" ? cutoff : endOfDay(new Date()).getTime();
    let balance = openingNGN(acc);
    for (let i = 0; i < transactions.length; i++) {
        const t = transactions[i];
        const time = new Date(t.date).getTime();
        if (!isFinite(time) || time > end) continue;
        balance += accountDeltaFor(acc, t);
    }
    return balance;
}

// Total of the accounts currently in scope (one selected account, or all non-excluded accounts).
function balanceInScopeAt(cutoff) {
    let total = 0;
    for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        const inScope = selectedAccount ? acc.name === selectedAccount : !acc.excluded;
        if (inScope) total += accountBalanceAt(acc, cutoff);
    }
    return total;
}

// How one record changes the balance of the current scope (used by the trend chart).
function balanceDeltaInScope(t) {
    if (selectedAccount) {
        if (t.type === "transfer") {
            if (t.from === selectedAccount) return -t.amount;
            if (t.to === selectedAccount) return t.amount;
            return 0;
        }
        if (t.account !== selectedAccount) return 0;
        return t.type === "income" ? t.amount : (t.type === "expense" ? -t.amount : 0);
    }
    if (t.type === "transfer") {
        const fromCounts = !isAccountExcluded(t.from);
        const toCounts = !isAccountExcluded(t.to);
        return (toCounts ? t.amount : 0) - (fromCounts ? t.amount : 0);
    }
    if (isAccountExcluded(t.account)) return 0;
    return t.type === "income" ? t.amount : (t.type === "expense" ? -t.amount : 0);
}
// Starting suggestions only - the user edits the rate in the form
const DEFAULT_RATES = { USD: 1500, EUR: 1650, GBP: 1950, GHS: 100, KES: 11.6 };

// Rates used by the Balance by Currencies card (NGN per 1 unit) + which 2 currencies it shows.
// Remembered in the browser so the choice survives a refresh.
const exchangeRates = Object.assign({}, DEFAULT_RATES);
let displayCurrencies = ["USD", "EUR"];
try {
    const saved = JSON.parse(localStorage.getItem(prefKey("qionix.currencyCard")) || "null");
    if (saved) {
        if (Array.isArray(saved.shown) && saved.shown.length === 2 &&
            saved.shown[0] !== saved.shown[1] && saved.shown.every(function (c) { return DEFAULT_RATES[c]; })) {
            displayCurrencies = saved.shown;
        }
        if (saved.rates) {
            Object.keys(saved.rates).forEach(function (k) {
                if (DEFAULT_RATES[k] && Number(saved.rates[k]) > 0) exchangeRates[k] = Number(saved.rates[k]);
            });
        }
    }
} catch (err) { /* storage unavailable - defaults are fine */ }
function saveCurrencyPrefs() {
    try {
        localStorage.setItem(prefKey("qionix.currencyCard"), JSON.stringify({ shown: displayCurrencies, rates: exchangeRates }));
    } catch (err) {}
}

// =========================================================
// SAVING - accounts + transactions are kept in the browser (localStorage)
// so they are still here after a refresh. saveData() runs after every change;
// loadSavedData() runs once at start-up.
//
// Every signed-in account gets its own dataset:
//   qionix.data.v1.<userId>
// Older versions shared one qionix.data.v1 for the whole browser - the first
// signed-in visitor after the update takes that dataset over (see below).
// =========================================================
function loggedInUserId() {
    try {
        const session = JSON.parse(localStorage.getItem("qionix.session") || "null");
        return session && session.userId ? String(session.userId) : "";
    } catch (err) {
        return "";
    }
}

// Preferences are saved per login (theme, startup page, currency card, sidebar state)
function prefKey(base) {
    const id = loggedInUserId();
    return id ? base + "." + id : base;
}

const LEGACY_DATA_KEY = "qionix.data.v1";
const DATA_KEY = loggedInUserId() ? LEGACY_DATA_KEY + "." + loggedInUserId() : LEGACY_DATA_KEY;

// One-time move: hand the old shared dataset to the current user.
function migrateLegacyData() {
    if (!loggedInUserId()) return;
    try {
        if (localStorage.getItem(DATA_KEY)) return; // this user already has data
        const legacy = localStorage.getItem(LEGACY_DATA_KEY);
        if (!legacy) return;
        localStorage.setItem(DATA_KEY, legacy);
        localStorage.removeItem(LEGACY_DATA_KEY);
    } catch (err) {
        // storage blocked - the app still works for this visit
    }
}

function saveData() {
    try {
        localStorage.setItem(DATA_KEY, JSON.stringify({ accounts: accounts, transactions: transactions }));
    } catch (err) {
        console.warn("Could not save (storage unavailable or full):", err);
    }
}

function loadSavedData() {
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem(DATA_KEY) || "null");
    } catch (err) {
        return; // unreadable or storage blocked - start fresh
    }
    if (!saved || !Array.isArray(saved.accounts) || !Array.isArray(saved.transactions)) return;

    // Accounts: keep only valid ones and fill any missing fields
    const cleanAccounts = [];
    saved.accounts.forEach(function (a) {
        if (!a || typeof a.name !== "string" || a.name === "") return;
        const clean = {
            name: a.name,
            type: a.type || "general",
            icon: a.icon || "wallet",
            color: /^#[0-9a-fA-F]{6}$/.test(a.color || "") ? a.color : DEFAULT_ACCOUNT_COLOR,
            currency: a.currency || "NGN",
            rate: Number(a.rate) > 0 ? Number(a.rate) : 1,
            opening: Number(a.opening) || 0,
            excluded: !!a.excluded
        };
        if (typeof a.monoAccountId === "string" && a.monoAccountId !== "") {
            clean.monoAccountId = a.monoAccountId;
            clean.monoInstitution = typeof a.monoInstitution === "string" ? a.monoInstitution : "Mono bank";
            clean.monoNumber = typeof a.monoNumber === "string" ? a.monoNumber : "";
            clean.monoLinkedAt = typeof a.monoLinkedAt === "string" ? a.monoLinkedAt : "";
            clean.monoLastSync = typeof a.monoLastSync === "string" ? a.monoLastSync : "";
            clean.monoOpeningNote = !!a.monoOpeningNote;
        }
        cleanAccounts.push(clean);
    });
    if (cleanAccounts.length > 0) accounts = cleanAccounts;

    // Transactions: must have a number amount and a type
    saved.transactions.forEach(function (t) {
        if (t && typeof t.amount === "number" && (t.type === "income" || t.type === "expense" || t.type === "transfer")) {
            transactions.push(t);
        }
    });
}

// Account types (icon shown on the sidebar card) and supported currencies
const ACCOUNT_TYPES = [
    { value: "general",    label: "General",     icon: "wallet" },
    { value: "cash",       label: "Cash",        icon: "payments" },
    { value: "bank",       label: "Bank account", icon: "account_balance" },
    { value: "savings",    label: "Savings",     icon: "savings" },
    { value: "card",       label: "Credit card", icon: "credit_card" },
    { value: "mobile",     label: "Mobile money", icon: "smartphone" },
    { value: "investment", label: "Investment",  icon: "trending_up" }
];
const CURRENCY_OPTIONS = [
    { value: "NGN", label: "NGN", sub: "Nigerian Naira" },
    { value: "USD", label: "USD", sub: "US Dollar" },
    { value: "EUR", label: "EUR", sub: "Euro" },
    { value: "GBP", label: "GBP", sub: "British Pound" },
    { value: "GHS", label: "GHS", sub: "Ghanaian Cedi" },
    { value: "KES", label: "KES", sub: "Kenyan Shilling" }
];


migrateLegacyData(); // move the old shared dataset to this user (first run after the update)
loadSavedData(); // restore accounts + transactions from the last visit

// Add new account via modal (replaces prompt)
const accountModal = document.getElementById("account-modal");
const closeAccountModalBtn = document.getElementById("close-account-modal-btn");
const accountModalOverlay = document.getElementById("account-modal-overlay");
const cancelAccountBtn = document.getElementById("cancel-account-btn");
const accountForm = document.getElementById("account-form");
const newAccountNameInput = document.getElementById("new-account-name");

// =========================================================
// COLOUR PICKER (Add Account modal)
// Square = saturation (left->right) + brightness (bottom->top). Bar = hue.
// Drag the small circles; the hex code updates live, and typing a hex moves them.
// =========================================================
const NEW_ACCOUNT_COLOR = "#43a047";
const ACCOUNT_PRESETS = ["#2ec4b6", "#ef4444", "#43a047", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#64748b"];
const colorPicker = (function () {
    const sv = document.getElementById("cp-sv");
    const svHandle = document.getElementById("cp-sv-handle");
    const hue = document.getElementById("cp-hue");
    const hueHandle = document.getElementById("cp-hue-handle");
    const swatch = document.getElementById("cp-swatch");
    const hexInput = document.getElementById("cp-hex");
    const presetsEl = document.getElementById("cp-presets");
    if (!sv || !hue || !hexInput) return null;

    let h = 0, s = 1, v = 1; // hue 0-360, saturation 0-1, value 0-1
    let exactHex = null;     // a typed / preset code is kept exactly (HSV round-trips can drift by 1)

    function hsvToHex(h, s, v) {
        const f = function (n) {
            const k = (n + h / 60) % 6;
            return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
        };
        const to = function (x) { return Math.round(x * 255).toString(16).padStart(2, "0"); };
        return "#" + to(f(5)) + to(f(3)) + to(f(1));
    }
    function hexToHsv(hex) {
        const n = parseInt(hex.slice(1), 16);
        const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        let hh = 0;
        if (d !== 0) {
            if (max === r) hh = ((g - b) / d) % 6;
            else if (max === g) hh = (b - r) / d + 2;
            else hh = (r - g) / d + 4;
            hh = Math.round(hh * 60);
            if (hh < 0) hh += 360;
        }
        return { h: hh, s: max === 0 ? 0 : d / max, v: max };
    }

    function paint(updateInput) {
        const hex = hsvToHex(h, s, v);
        sv.style.backgroundColor = hsvToHex(h, 1, 1);
        svHandle.style.left = (s * 100) + "%";
        svHandle.style.top = ((1 - v) * 100) + "%";
        hueHandle.style.left = (h / 360 * 100) + "%";
        swatch.style.background = hex;
        const label = document.getElementById("cp-label");
        if (label) label.textContent = hex.toUpperCase();
        if (updateInput) hexInput.value = hex.toUpperCase();
    }

    // Generic drag helper: calls fn(xRatio, yRatio) while the pointer is down
    function drag(el, fn) {
        const move = function (e) {
            const r = el.getBoundingClientRect();
            fn(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
               Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
        };
        el.addEventListener("pointerdown", function (e) {
            el.setPointerCapture(e.pointerId);
            move(e);
            el.addEventListener("pointermove", move);
            const stop = function () {
                el.removeEventListener("pointermove", move);
                el.removeEventListener("pointerup", stop);
                el.removeEventListener("pointercancel", stop);
            };
            el.addEventListener("pointerup", stop);
            el.addEventListener("pointercancel", stop);
        });
    }
    drag(sv, function (x, y) { exactHex = null; s = x; v = 1 - y; paint(true); });
    drag(hue, function (x) { exactHex = null; h = x * 360; paint(true); });

    hexInput.addEventListener("input", function () {
        let val = hexInput.value.trim();
        if (val[0] !== "#") val = "#" + val;
        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
            const c = hexToHsv(val);
            h = c.h; s = c.s; v = c.v;
            exactHex = val.toLowerCase();
            paint(false);
        }
    });
    hexInput.addEventListener("blur", function () { paint(true); }); // snap back to a valid code

    ACCOUNT_PRESETS.forEach(function (hex) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "cp-preset";
        b.style.background = hex;
        b.title = hex;
        b.addEventListener("click", function () { api.set(hex); });
        presetsEl.appendChild(b);
    });

    const api = {
        set: function (hex) { const c = hexToHsv(hex); h = c.h; s = c.s; v = c.v; exactHex = hex.toLowerCase(); paint(true); },
        get: function () { return exactHex || hsvToHex(h, s, v); }
    };
    api.set(DEFAULT_ACCOUNT_COLOR);
    return api;
})();

function getPickedAccountColor() {
    return colorPicker ? colorPicker.get() : DEFAULT_ACCOUNT_COLOR;
}

// ---- Popovers (colour panel + custom selects): one open at a time, close on outside click / Esc
const openPopovers = [];
function closePopovers(except) {
    openPopovers.forEach(function (p) {
        if (p !== except && !(except && p.root.contains(except.root))) p.close();
    });
}
document.addEventListener("click", function (e) {
    openPopovers.forEach(function (p) { if (!p.root.contains(e.target)) p.close(); });
});
document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    let any = false;
    openPopovers.forEach(function (p) { if (p.isOpen()) { p.close(); any = true; } });
    if (any) e.stopImmediatePropagation(); // close the popover first, not the whole modal
});

(function () {
    const field = document.getElementById("cp-field");
    const pop = document.getElementById("cp-pop");
    if (!field || !pop) return;
    const p = {
        root: field.parentElement,
        isOpen: function () { return !pop.hidden; },
        close: function () { pop.hidden = true; field.setAttribute("aria-expanded", "false"); }
    };
    openPopovers.push(p);
    field.addEventListener("click", function () {
        const willOpen = pop.hidden;
        closePopovers(p);
        pop.hidden = !willOpen;
        field.setAttribute("aria-expanded", String(willOpen));
    });
})();

// ---- Custom select with optional icons. Writes its value into a hidden input.
function makeSelect(root, options, hiddenInput, onChange) {
    root.classList.add("sel");
    root.innerHTML =
        '<button type="button" class="sel-btn" aria-haspopup="listbox" aria-expanded="false">' +
        '<span class="material-icons sel-icon" hidden></span><span class="sel-label"></span>' +
        '<span class="material-icons sel-chev">unfold_more</span></button>' +
        '<ul class="sel-menu" role="listbox" hidden></ul>';
    const btn = root.querySelector(".sel-btn");
    const icon = root.querySelector(".sel-icon");
    const label = root.querySelector(".sel-label");
    const menu = root.querySelector(".sel-menu");
    let current = options[0].value;

    function set(value) {
        const o = options.find(function (x) { return x.value === value; }) || options[0];
        current = o.value;
        hiddenInput.value = o.value;
        label.textContent = o.label;
        icon.hidden = !o.icon;
        icon.textContent = o.icon || "";
        menu.querySelectorAll(".sel-opt").forEach(function (li) {
            li.classList.toggle("selected", li.dataset.value === current);
        });
        if (onChange) onChange(current);
    }
    options.forEach(function (o) {
        const li = document.createElement("li");
        li.className = "sel-opt";
        li.setAttribute("role", "option");
        li.dataset.value = o.value;
        li.innerHTML = (o.icon ? '<span class="material-icons">' + o.icon + '</span>' : '') +
            '<span>' + o.label + '</span>' + (o.sub ? '<small>' + o.sub + '</small>' : '');
        li.addEventListener("click", function () { set(o.value); p.close(); btn.focus(); });
        menu.appendChild(li);
    });

    const p = {
        root: root,
        isOpen: function () { return !menu.hidden; },
        close: function () { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); }
    };
    openPopovers.push(p);
    btn.addEventListener("click", function () {
        const willOpen = menu.hidden;
        closePopovers(p);
        menu.hidden = !willOpen;
        btn.setAttribute("aria-expanded", String(willOpen));
    });
    // Up/Down arrows change the value without opening the list
    btn.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const idx = options.findIndex(function (x) { return x.value === current; });
        const next = Math.min(options.length - 1, Math.max(0, idx + (e.key === "ArrowDown" ? 1 : -1)));
        set(options[next].value);
    });
    set(current);
    return { set: set, get: function () { return current; } };
}

const accountTypeSelect = makeSelect(document.getElementById("type-select"), ACCOUNT_TYPES, document.getElementById("new-account-type"));
const accountCurrencySelect = makeSelect(document.getElementById("currency-select"), CURRENCY_OPTIONS, document.getElementById("new-account-currency"), syncRateField);

// Rate row: hidden for NGN, otherwise "1 USD = [rate] NGN" with a live NGN preview
function syncRateField() {
    const code = document.getElementById("new-account-currency").value;
    const group = document.getElementById("rate-group");
    const rateInput = document.getElementById("new-account-rate");
    document.getElementById("opening-label").textContent = "Initial Amount" + (code === "NGN" ? "" : " (" + code + ")");
    if (!group) return;
    group.hidden = (code === "NGN");
    if (code !== "NGN") {
        document.getElementById("rate-prefix").textContent = "1 " + code + " =";
        rateInput.value = exchangeRates[code] || DEFAULT_RATES[code] || "";
    }
    updateRatePreview();
}
function updateRatePreview() {
    const code = document.getElementById("new-account-currency").value;
    const prev = document.getElementById("rate-preview");
    if (!prev || code === "NGN") return;
    const amt = Number(document.getElementById("new-account-opening").value) || 0;
    const rate = Number(document.getElementById("new-account-rate").value) || 0;
    prev.textContent = "Naira is your main currency, so this account shows in NGN. " +
        (amt > 0 && rate > 0 ? "Opening balance = NGN " + (amt * rate).toLocaleString() : "");
}
document.getElementById("new-account-opening").addEventListener("input", updateRatePreview);
document.getElementById("new-account-rate").addEventListener("input", updateRatePreview);

// ---- Balance by Currencies: choose the 2 currencies shown (+ edit their rates)
(function () {
    const gear = document.getElementById("cur-gear");
    const pop = document.getElementById("cur-pop");
    const anchor = document.getElementById("cur-anchor");
    if (!gear || !pop) return;
    const options = CURRENCY_OPTIONS.filter(function (o) { return o.value !== "NGN"; });
    const slots = [1, 2].map(function (n) {
        return {
            hidden: document.getElementById("cur-val-" + n),
            rate: document.getElementById("cur-rate-" + n),
            prefix: document.getElementById("cur-prefix-" + n),
            sel: null
        };
    });
    let busy = false;

    function syncRates() {
        slots.forEach(function (s, i) {
            const code = displayCurrencies[i];
            s.prefix.textContent = "1 " + code + " =";
            s.rate.value = exchangeRates[code];
        });
    }

    slots.forEach(function (slot, idx) {
        slot.sel = makeSelect(document.getElementById("cur-sel-" + (idx + 1)), options, slot.hidden, function (code) {
            if (busy || !slots[0].sel || !slots[1].sel) return;
            busy = true;
            const other = slots[1 - idx];
            // Picking the currency already used in the other slot swaps them (no duplicates)
            if (other.sel.get() === code) other.sel.set(displayCurrencies[idx]);
            busy = false;
            displayCurrencies = [slots[0].sel.get(), slots[1].sel.get()];
            syncRates();
            saveCurrencyPrefs();
            updateDashboard();
        });
        slot.rate.addEventListener("input", function () {
            const v = Number(slot.rate.value);
            if (v > 0) {
                exchangeRates[displayCurrencies[idx]] = v;
                saveCurrencyPrefs();
                updateDashboard();
            }
        });
    });
    busy = true;
    slots[0].sel.set(displayCurrencies[0]);
    slots[1].sel.set(displayCurrencies[1]);
    busy = false;
    syncRates();

    const p = {
        root: anchor,
        isOpen: function () { return !pop.hidden; },
        close: function () { pop.hidden = true; gear.setAttribute("aria-expanded", "false"); }
    };
    openPopovers.push(p);
    gear.addEventListener("click", function () {
        const willOpen = pop.hidden;
        closePopovers(p);
        if (willOpen) syncRates();
        pop.hidden = !willOpen;
        gear.setAttribute("aria-expanded", String(willOpen));
    });
})();

// Create button stays disabled until the account has a name
const createAccountBtn = document.getElementById("create-account-btn");
function syncCreateButton() {
    if (createAccountBtn) createAccountBtn.disabled = newAccountNameInput.value.trim() === "";
}
newAccountNameInput.addEventListener("input", syncCreateButton);

function openAccountModal() {
    if (accountModal) {
        // New accounts start green (the user can pick any colour)
        if (colorPicker) colorPicker.set(NEW_ACCOUNT_COLOR);
        accountModal.classList.add("active");
        closePopovers();
        accountTypeSelect.set("general");
        accountCurrencySelect.set("NGN");
        const ex = document.getElementById("new-account-exclude");
        if (ex) ex.checked = false;
        if (newAccountNameInput) {
            newAccountNameInput.value = "";
            syncCreateButton();
            setTimeout(function () { newAccountNameInput.focus(); }, 50);
        }
    }
}

function closeAccountModal() {
    if (accountModal) {
        accountModal.classList.remove("active");
        if (accountForm) accountForm.reset();
    }
}

if (addAccountBtn) {
    addAccountBtn.addEventListener("click", openAccountModal);
}
if (closeAccountModalBtn) closeAccountModalBtn.addEventListener("click", closeAccountModal);
if (cancelAccountBtn) cancelAccountBtn.addEventListener("click", closeAccountModal);
if (accountModalOverlay) accountModalOverlay.addEventListener("click", closeAccountModal);

// Also close account modal on Escape
document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && accountModal && accountModal.classList.contains("active")) {
        closeAccountModal();
    }
});


// =========================================================
// TOAST - small popup replacing native alert()
// Why? alert() blocks the page with an ugly system box. Toast slides up and fades.
// How? Set text + type, add .show, remove after 3 seconds.
// =========================================================
const toast = document.getElementById("toast");
let toastTimer = null;

function showToast(message, type) {
    if (!toast) return;
    toast.textContent = message;
    toast.className = "toast show" + (type ? " " + type : "");
    // Clear old timer so quick messages don't hide early
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
        toast.classList.remove("show");
    }, 3000);
}

// =========================================================
// CONFIRM MODAL - popup replacing native confirm()
// Why? Same reason as toast: native boxes look off-brand.
// How? Store the yes-action in a variable, run it on Delete click.
// =========================================================
const confirmModal = document.getElementById("confirm-modal");
const confirmTitle = document.getElementById("confirm-title");
const confirmMessage = document.getElementById("confirm-message");
const confirmCancelBtn = document.getElementById("confirm-cancel-btn");
const confirmYesBtn = document.getElementById("confirm-yes-btn");
const confirmOverlay = document.getElementById("confirm-modal-overlay");
let confirmAction = null;

function askConfirm(title, message, yesLabel, onYes) {
    if (confirmTitle) confirmTitle.textContent = title;
    if (confirmMessage) confirmMessage.textContent = message;
    if (confirmYesBtn) confirmYesBtn.textContent = yesLabel || "Delete";
    confirmAction = onYes;
    if (confirmModal) confirmModal.classList.add("active");
}

function closeConfirm() {
    if (confirmModal) confirmModal.classList.remove("active");
    confirmAction = null;
}

if (confirmCancelBtn) confirmCancelBtn.addEventListener("click", closeConfirm);
if (confirmOverlay) confirmOverlay.addEventListener("click", closeConfirm);

if (confirmYesBtn) {
    confirmYesBtn.addEventListener("click", function () {
        // Keep a copy, closeConfirm clears the variable
        const action = confirmAction;
        closeConfirm();
        if (action) action();
    });
}

document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && confirmModal && confirmModal.classList.contains("active")) {
        closeConfirm();
    }
});


// NOTE: Duplicate displayTransactions removed - we now use the single version above (line 532)
// which already calls updateDashboard(). This keeps Stage 3 working.

// Initial setup
renderAccounts();
setDateTimeDefaults();
// + Record always opens in add mode (fresh form, add text) + fresh datetime
if (openBtn) {
    openBtn.addEventListener("click", function () {
        enterAddMode();
        setDateTimeDefaults();
    });
}
// Closing without saving leaves edit mode (closeModal hides, this resets)
if (closeBtn) {
    closeBtn.addEventListener("click", function () {
        exitEditMode();
    });
}
if (cancelBtn) {
    cancelBtn.addEventListener("click", function () {
        exitEditMode();
    });
}
if (overlay) {
    overlay.addEventListener("click", function () {
        exitEditMode();
    });
}

// Show initial empty state
displayTransactions();

console.log("Qionix - Stage 2 Ready! Accounts dynamic + datetime with now default.");


// ============================================================
// Hamburger: slide the Accounts sidebar in / out
// (remembers the choice for next time)
// ============================================================
(function () {
    const menuToggle = document.getElementById("menu-toggle");
    const layout = document.querySelector(".layout");
    if (!menuToggle || !layout) return;

    const STORAGE_KEY = prefKey("qionix.sidebarCollapsed");

    function setCollapsed(collapsed) {
        layout.classList.toggle("sidebar-collapsed", collapsed);
        menuToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
        try {
            localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
        } catch (err) {
            // storage unavailable - toggle still works for this visit
        }
    }

    // Restore saved state (default = open)
    let startCollapsed = false;
    try {
        startCollapsed = localStorage.getItem(STORAGE_KEY) === "1";
    } catch (err) {}
    if (startCollapsed) {
        // apply without animating on page load
        layout.classList.add("no-transition", "sidebar-collapsed");
        menuToggle.setAttribute("aria-expanded", "false");
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                layout.classList.remove("no-transition");
            });
        });
    }

    menuToggle.addEventListener("click", function () {
        setCollapsed(!layout.classList.contains("sidebar-collapsed"));
    });
})();

// ============================================================
// Mobile menu: the nav links collapse into a dropdown under the
// header (the same <ul> the router already listens to).
// ============================================================
(function () {
    const nav = document.querySelector(".top-nav");
    const burger = document.getElementById("nav-burger");
    const menu = document.getElementById("nav-menu");
    if (!nav || !burger || !menu) return;

    function setOpen(open) {
        nav.classList.toggle("menu-open", open);
        burger.setAttribute("aria-expanded", String(open));
        burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }

    burger.addEventListener("click", function () {
        setOpen(!nav.classList.contains("menu-open"));
    });

    menu.addEventListener("click", function (e) {
        if (e.target.closest("li")) setOpen(false);
    });

    document.addEventListener("click", function (e) {
        if (!nav.classList.contains("menu-open")) return;
        if (nav.contains(e.target)) return;
        setOpen(false);
    });

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") setOpen(false);
    });

    window.addEventListener("hashchange", function () {
        setOpen(false);
    });

    window.addEventListener("resize", function () {
        if (window.innerWidth > 1100) setOpen(false);
    });
})();
