// QIONIX - accounts-page.js | Accounts page: list of accounts + account detail (Balance / Records)
// Loaded AFTER main.js, so it can use accounts, transactions, saveData(), showToast() and friends.
//
// Pages are switched with the URL hash, so refresh and the browser Back button both work:
//   (nothing) or #dashboard  -> dashboard
//   #accounts                -> accounts list
//   #account/<name>          -> one account (Balance + Records tabs)
//   #records                 -> records page (drawn by records-page.js)
//   #analytics               -> analytics page (drawn by analytics-page.js)

(function () {
    "use strict";

    const layout = document.querySelector(".layout");
    const page = document.getElementById("view-accounts");

    // Pages drawn by their own script. Each one exposes window.<render>() and window.<refresh>().
    // nav = position of its link in the navbar (0 = Dashboard, 1 = Accounts, 2 = Records, 3 = Analytics)
    // Settings has no link anymore: the profile button in the header opens it.
    const extViews = {
        records:   { el: document.getElementById("view-records"),   render: "renderRecordsPage",   refresh: "refreshRecordsPage",   nav: 2 },
        analytics: { el: document.getElementById("view-analytics"), render: "renderAnalyticsPage", refresh: "refreshAnalyticsPage", nav: 3 },
        settings:  { el: document.getElementById("view-settings"),  render: "renderSettingsPage",  refresh: "refreshSettingsPage" }
    };
    const navItems = document.querySelectorAll(".nav-links li");
    if (!layout || !page) return;

    // ---------------------------------------------------------
    // State
    // ---------------------------------------------------------
    const state = {
        view: "dashboard", // dashboard | list | detail | records | analytics
        name: null,        // account shown on the detail page
        tab: "balance",    // balance | records
        range: "30d",      // 7d | 30d | 90d | 1y | all
        filter: "all"      // all | income | expense | transfer (Records tab)
    };

    // Matches .trend-path on the dashboard (style.css) so both balance charts look the same
    const CHART_COLOR = "#2563eb";

    const RANGES = [
        { key: "7d", label: "7D", days: 7 },
        { key: "30d", label: "30D", days: 30 },
        { key: "90d", label: "3M", days: 90 },
        { key: "1y", label: "1Y", days: 365 },
        { key: "all", label: "All", days: 0 }
    ];

    // ---------------------------------------------------------
    // Small helpers
    // ---------------------------------------------------------
    function esc(value) {
        return String(value).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    function money(n) {
        const abs = Math.abs(n);
        return (n < 0 ? "-" : "") + "NGN " + abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // 1250000 -> 1.25M (axis labels)
    function short(n) {
        const abs = Math.abs(n);
        const sign = n < 0 ? "-" : "";
        function fmt(x) { return String(parseFloat(x.toFixed(2))); }
        if (abs >= 1e9) return sign + fmt(abs / 1e9) + "B";
        if (abs >= 1e6) return sign + fmt(abs / 1e6) + "M";
        if (abs >= 1e3) return sign + fmt(abs / 1e3) + "K";
        return sign + fmt(abs);
    }

    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    function dayStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0); }
    function dayEnd(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999); }
    function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
    function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

    function fmtDay(d, withYear) {
        return d.getDate() + " " + MONTHS[d.getMonth()] + (withYear ? " " + d.getFullYear() : "");
    }
    function fmtLongDay(d) {
        return WEEKDAYS[d.getDay()] + ", " + fmtDay(d, true);
    }
    function fmtTime(d) {
        let h = d.getHours();
        const ampm = h >= 12 ? "PM" : "AM";
        h = h % 12; if (h === 0) h = 12;
        const m = d.getMinutes();
        return (h < 10 ? "0" + h : h) + ":" + (m < 10 ? "0" + m : m) + " " + ampm;
    }
    function dayHeading(d) {
        const today = new Date();
        if (sameDay(d, today)) return "Today";
        if (sameDay(d, addDays(today, -1))) return "Yesterday";
        return fmtLongDay(d);
    }

    function typeInfo(value) {
        return ACCOUNT_TYPES.find(function (t) { return t.value === value; }) || ACCOUNT_TYPES[0];
    }

    function findAccount(name) {
        return accounts.find(function (a) { return a.name === name; }) || null;
    }

    function materialIcon(name) {
        return '<span class="material-icons" aria-hidden="true">' + name + "</span>";
    }

    // ---------------------------------------------------------
    // Money maths for one account (all in NGN)
    // ---------------------------------------------------------
    function involves(acc, t) {
        if (t.type === "transfer") return t.from === acc.name || t.to === acc.name;
        return t.account === acc.name;
    }

    // How much a record moves THIS account's balance (+ in, - out)
    function delta(acc, t) {
        if (t.type === "transfer") {
            let d = 0;
            if (t.from === acc.name) d -= t.amount;
            if (t.to === acc.name) d += t.amount;
            return d;
        }
        if (t.account !== acc.name) return 0;
        if (t.type === "income") return t.amount;
        if (t.type === "expense") return -t.amount;
        return 0;
    }

    // Records of one account, oldest first, each with its time and balance effect
    function recordsOf(acc) {
        const list = [];
        for (let i = 0; i < transactions.length; i++) {
            const t = transactions[i];
            if (!involves(acc, t)) continue;
            list.push({ t: t, time: new Date(t.date).getTime(), d: delta(acc, t) });
        }
        list.sort(function (a, b) { return a.time - b.time; });
        return list;
    }

    // Summary as of the end of today (future-dated records are not counted yet)
    function summary(acc) {
        const recs = recordsOf(acc);
        const cutoff = dayEnd(new Date()).getTime();
        let balance = openingNGN(acc);
        let moneyIn = 0;
        let moneyOut = 0;
        let last = null;
        for (let i = 0; i < recs.length; i++) {
            if (recs[i].time > cutoff) continue;
            balance += recs[i].d;
            if (recs[i].d > 0) moneyIn += recs[i].d;
            else moneyOut += -recs[i].d;
            last = recs[i].time;
        }
        return { balance: balance, moneyIn: moneyIn, moneyOut: moneyOut, count: recs.length, last: last, recs: recs };
    }

    // ---------------------------------------------------------
    // Routing (hash based)
    // ---------------------------------------------------------
    function parseHash() {
        const h = location.hash.replace(/^#/, "");
        if (h === "accounts") return { view: "list" };
        if (extViews[h]) return { view: h };
        if (h.indexOf("account/") === 0) {
            let name = h.slice(8);
            try { name = decodeURIComponent(name); } catch (err) { /* keep raw */ }
            return { view: "detail", name: name };
        }
        return { view: "dashboard" };
    }

    function go(hash) {
        if (location.hash === hash || (hash === "" && !location.hash)) { route(); return; }
        location.hash = hash;
    }

    function goDetail(name) { go("#account/" + encodeURIComponent(name)); }

    function setNavActive() {
        navItems.forEach(function (li, i) {
            const ext = extViews[state.view];
            // !! makes it a real true/false. Without it, "undefined" made classList.toggle() FLIP
            // the class instead of setting it, which lit up every link on the dashboard.
            const on = !!((state.view === "dashboard" && i === 0) ||
                          ((state.view === "list" || state.view === "detail") && i === 1) ||
                          (ext && ext.nav === i));
            li.classList.toggle("active", on);
        });
    }

    function route() {
        const r = parseHash();
        const changedView = r.view !== state.view || r.name !== state.name;
        closeMenu();

        if (r.view === "detail" && !findAccount(r.name)) {
            // Unknown account (renamed or deleted) - fall back to the list
            history.replaceState(null, "", "#accounts");
            r.view = "list";
            r.name = null;
        }

        if (changedView) {
            if (r.view === "detail") {
                state.tab = "balance";
                state.range = "30d";
                state.filter = "all";
            }
        }
        state.view = r.view;
        state.name = r.name || null;

        Object.keys(extViews).forEach(function (k) {
            if (extViews[k].el) extViews[k].el.style.display = "none";
        });

        if (r.view === "dashboard") {
            page.style.display = "none";
            layout.style.display = "";
        } else if (extViews[r.view]) {
            const ext = extViews[r.view];
            layout.style.display = "none";
            page.style.display = "none";
            if (ext.el) {
                ext.el.style.display = "block";
                if (typeof window[ext.render] === "function") window[ext.render]();
            }
        } else {
            layout.style.display = "none";
            page.style.display = "block";
            render();
        }
        setNavActive();
        if (changedView) window.scrollTo(0, 0);
    }

    window.addEventListener("hashchange", route);

    // Nav links: every link switches a page (route() sets the highlight afterwards)
    const NAV_HASHES = ["#dashboard", "#accounts", "#records", "#analytics"];
    navItems.forEach(function (li, i) {
        li.addEventListener("click", function (e) {
            e.preventDefault();
            if (NAV_HASHES[i]) go(NAV_HASHES[i]);
        });
    });

    // Settings lives behind the profile button in the header now
    const profileBtn = document.getElementById("profile-btn");
    if (profileBtn) {
        profileBtn.addEventListener("click", function () {
            go("#settings");
        });
    }

    // ---------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------
    function render() {
        if (state.view === "list") page.innerHTML = listHTML();
        else if (state.view === "detail") renderDetail();
        if (state.view === "detail") attachChart();
    }

    // Called whenever accounts / records change anywhere else in the app
    function refresh() {
        if (state.view === "dashboard") return;
        if (extViews[state.view]) {
            const fn = window[extViews[state.view].refresh];
            if (typeof fn === "function") fn();
            return;
        }
        if (state.view === "detail" && !findAccount(state.name)) { go("#accounts"); return; }
        render();
    }

    // ---- LIST --------------------------------------------------
    function listHTML() {
        const rows = accounts.map(function (acc) { return { acc: acc, s: summary(acc) }; });

        let total = 0;
        let positiveTotal = 0;
        let excludedCount = 0;
        rows.forEach(function (r) {
            if (r.acc.excluded) { excludedCount++; return; }
            total += r.s.balance;
            if (r.s.balance > 0) positiveTotal += r.s.balance;
        });

        const countedAccounts = accounts.length - excludedCount;
        let sub = "across " + countedAccounts + " account" + (countedAccounts === 1 ? "" : "s");
        if (excludedCount > 0) sub += " · " + excludedCount + " excluded from statistics";

        let cards = "";
        rows.forEach(function (r) {
            cards += cardHTML(r.acc, r.s, positiveTotal);
        });

        // Split bar: one colored segment per account with a positive balance,
        // width = its share of the money you have. The legend mirrors it.
        let splitBar = "";
        let splitLegend = "";
        let splitItems = 0;
        rows.forEach(function (r) {
            if (r.acc.excluded || r.s.balance <= 0) return;
            const color = r.acc.color || DEFAULT_ACCOUNT_COLOR;
            const share = positiveTotal > 0 ? (r.s.balance / positiveTotal) * 100 : 0;
            splitBar += '<i style="width:' + share + '%;background:' + esc(color) + '" title="' + esc(r.acc.name) + '"></i>';
            splitLegend += '<li><span class="ap-dot" style="background:' + esc(color) + '"></span>' +
                '<span class="ap-split-name">' + esc(r.acc.name) + "</span><strong>" + share.toFixed(0) + "%</strong></li>";
            splitItems++;
        });

        const splitHTML = splitItems > 0
            ? '<div class="ap-split">' +
              '  <div class="ap-split-bar">' + splitBar + "</div>" +
              '  <ul class="ap-split-legend">' + splitLegend + "</ul>" +
              "</div>"
            : '<p class="ap-muted">The split by account appears once a balance goes above zero.</p>';

        return '' +
            '<div class="ap-wrap">' +
            '  <header class="ap-head">' +
            '    <div><h1>Accounts</h1><p>Your wallets, banks and cards in one place</p></div>' +
            '    <div class="ap-head-actions">' +
            '      <span class="mn-test-badge">Test mode</span>' +
            '      <button type="button" class="ap-btn mn-connect-btn" data-act="mono-connect">' + materialIcon("account_balance") + "Connect bank</button>" +
            '      <button type="button" class="ap-btn primary" data-act="add-account">' + materialIcon("add") + "Add account</button>" +
            "    </div>" +
            "  </header>" +
            '  <section class="ap-summary">' +
            '    <div class="ap-summary-main">' +
            '      <span class="ap-eyebrow">Total balance</span>' +
            '      <div class="ap-total' + (total < 0 ? " neg" : "") + '">' + money(total) + "</div>" +
            '      <p class="ap-muted">' + sub + "</p>" +
            "    </div>" +
            '    <div class="ap-summary-side">' + splitHTML + "</div>" +
            "  </section>" +
            '  <div class="ap-grid">' + cards +
            '    <button type="button" class="ap-card ap-card-add" data-act="add-account">' + materialIcon("add_circle_outline") + "<span>Add account</span></button>" +
            "  </div>" +
            "</div>";
    }

    function cardHTML(acc, s, positiveTotal) {
        const color = acc.color || DEFAULT_ACCOUNT_COLOR;
        const ink = readableTextColor(color);
        const type = typeInfo(acc.type);
        const cur = acc.currency || "NGN";

        let chips = '<span class="ap-chip">' + esc(type.label) + "</span>";
        if (cur !== "NGN") chips += '<span class="ap-chip">Opened in ' + esc(cur) + "</span>";
        if (acc.monoAccountId) chips += '<span class="ap-chip mn-chip">' + materialIcon("link") + "Linked via Mono (test)</span>";
        if (acc.excluded) chips += '<span class="ap-chip muted">' + materialIcon("visibility_off") + "Excluded</span>";

        let share = 0;
        if (!acc.excluded && s.balance > 0 && positiveTotal > 0) share = (s.balance / positiveTotal) * 100;

        const shareHTML = share > 0 ? '<span class="ap-card-share">' + share.toFixed(0) + "%</span>" : "";

        let recordsText = s.count + " record" + (s.count === 1 ? "" : "s");
        let lastText = s.last ? "last " + fmtDay(new Date(s.last), new Date(s.last).getFullYear() !== new Date().getFullYear()) : "no activity";

        return '' +
            '<article class="ap-card" tabindex="0" data-act="open" data-name="' + esc(acc.name) + '" style="--acc:' + esc(color) + '">' +
            '  <div class="ap-card-top">' +
            '    <span class="ap-ico" style="background:' + esc(color) + ";color:" + ink + '">' + materialIcon(esc(acc.icon || type.icon)) + "</span>" +
            '    <div class="ap-card-title"><strong>' + esc(acc.name) + '</strong><div class="ap-chips">' + chips + "</div></div>" +
            '    <button type="button" class="ap-more" data-act="menu" data-name="' + esc(acc.name) + '" aria-label="Options for ' + esc(acc.name) + '">' + materialIcon("more_vert") + "</button>" +
            "  </div>" +
            '  <div class="ap-card-balrow">' +
            '    <div class="ap-card-balance' + (s.balance < 0 ? " neg" : "") + '">' + money(s.balance) + "</div>" + shareHTML +
            "  </div>" +
            '  <div class="ap-bar"><i style="width:' + share + '%"></i></div>' +
            '  <div class="ap-card-foot"><span>' + recordsText + "</span><span>" + lastText + "</span></div>" +
            "</article>";
    }

    // ---- DETAIL ------------------------------------------------
    let chartCtx = null; // data needed by the hover code

    function renderDetail() {
        const acc = findAccount(state.name);
        if (!acc) return;
        const s = summary(acc);
        const color = acc.color || DEFAULT_ACCOUNT_COLOR;
        const ink = readableTextColor(color);
        const type = typeInfo(acc.type);
        const cur = acc.currency || "NGN";

        let chips = '<span class="ap-chip">' + esc(type.label) + "</span>";
        chips += '<span class="ap-chip">' + esc(cur) + "</span>";
        if (acc.monoAccountId) chips += '<span class="ap-chip mn-chip">' + materialIcon("link") + "Linked via Mono (test)</span>";
        if (acc.excluded) chips += '<span class="ap-chip muted">' + materialIcon("visibility_off") + "Excluded from statistics</span>";

        let openingNote = "";
        if (cur !== "NGN") {
            openingNote = "<small>" + esc(cur) + " " + Number(acc.opening || 0).toLocaleString() + " @ " + Number(acc.rate).toLocaleString() + "</small>";
        }

        const monoNote = acc.monoOpeningNote
            ? '<div class="mn-account-note">' + materialIcon("info") +
              "<span>Mono's transaction history did not reconcile with the bank balance. This account starts from NGN 0.00, so its balance may not match the bank.</span></div>"
            : "";
        const syncButton = acc.monoAccountId
            ? '<button type="button" class="ap-btn mn-connect-btn" data-act="mono-sync">' + materialIcon("sync") + "Sync now</button>"
            : "";

        const panel = state.tab === "balance" ? balancePanelHTML(acc, s) : recordsPanelHTML(acc, s);

        page.innerHTML = '' +
            '<div class="ap-wrap" data-account="' + esc(acc.name) + '">' +
            '  <div class="ap-topbar">' +
            '    <button type="button" class="ap-back" data-act="back">' + materialIcon("arrow_back") + "<span>Accounts</span></button>" +
            '    <div class="ap-topbar-actions">' +
            syncButton +
            '      <button type="button" class="ap-btn ghost" data-act="edit">' + materialIcon("edit") + "Edit</button>" +
            '      <button type="button" class="ap-btn danger" data-act="delete">' + materialIcon("delete_outline") + "Delete</button>" +
            "    </div>" +
            "  </div>" +
            '  <section class="ap-hero" style="--acc:' + esc(color) + '">' +
            '    <div class="ap-hero-main">' +
            '      <span class="ap-ico lg" style="background:' + esc(color) + ";color:" + ink + '">' + materialIcon(esc(acc.icon || type.icon)) + "</span>" +
            '      <div class="ap-hero-title"><h1>' + esc(acc.name) + '</h1><div class="ap-chips">' + chips + "</div></div>" +
            '      <div class="ap-hero-balance"><span class="ap-eyebrow">Balance today</span><strong class="' + (s.balance < 0 ? "neg" : "") + '">' + money(s.balance) + "</strong></div>" +
            "    </div>" +
            '    <dl class="ap-facts">' +
            "      <div><dt>Opening balance</dt><dd>" + money(openingNGN(acc)) + openingNote + "</dd></div>" +
            "      <div><dt>Money in</dt><dd class=\"pos\">" + money(s.moneyIn) + "</dd></div>" +
            "      <div><dt>Money out</dt><dd class=\"neg\">" + money(-s.moneyOut) + "</dd></div>" +
            "      <div><dt>Records</dt><dd>" + s.count + "</dd></div>" +
            "    </dl>" +
            "  </section>" +
            monoNote +
            '  <div class="ap-tabs" role="tablist">' +
            '    <button type="button" role="tab" class="' + (state.tab === "balance" ? "on" : "") + '" data-act="tab" data-tab="balance" aria-selected="' + (state.tab === "balance") + '">' + materialIcon("show_chart") + "Balance</button>" +
            '    <button type="button" role="tab" class="' + (state.tab === "records" ? "on" : "") + '" data-act="tab" data-tab="records" aria-selected="' + (state.tab === "records") + '">' + materialIcon("receipt_long") + "Records <span class=\"ap-count\">" + s.count + "</span></button>" +
            "  </div>" +
            '  <section class="ap-panel" id="ap-panel">' + panel + "</section>" +
            "</div>";
    }

    // Re-draw just the tab content (keeps the hero + scroll position)
    function renderPanelOnly() {
        const acc = findAccount(state.name);
        const panel = document.getElementById("ap-panel");
        if (!acc || !panel) { render(); return; }
        const s = summary(acc);
        panel.innerHTML = state.tab === "balance" ? balancePanelHTML(acc, s) : recordsPanelHTML(acc, s);
        document.querySelectorAll(".ap-tabs button").forEach(function (b) {
            const on = b.getAttribute("data-tab") === state.tab;
            b.classList.toggle("on", on);
            b.setAttribute("aria-selected", String(on));
        });
        attachChart();
    }

    // ---- Balance tab ----------------------------------------------
    function buildSeries(acc, s) {
        const today = new Date();
        const endDay = dayStart(today);
        const cutoff = dayEnd(today).getTime();
        const recs = s.recs.filter(function (r) { return r.time <= cutoff; });

        let startDay;
        if (state.range === "all") {
            startDay = recs.length ? dayStart(new Date(recs[0].time)) : addDays(endDay, -29);
            if (startDay.getTime() > addDays(endDay, -13).getTime()) startDay = addDays(endDay, -13); // never a single column
        } else {
            const days = RANGES.find(function (r) { return r.key === state.range; }).days;
            startDay = addDays(endDay, -(days - 1));
        }

        const span = Math.round((endDay.getTime() - startDay.getTime()) / 864e5);
        const step = Math.max(1, Math.ceil(span / 60));

        const days = [];
        for (let d = new Date(startDay); d.getTime() < endDay.getTime(); d = addDays(d, step)) days.push(new Date(d));
        days.push(new Date(endDay));

        // Balance before the range starts
        let running = openingNGN(acc);
        let p = 0;
        while (p < recs.length && recs[p].time < startDay.getTime()) { running += recs[p].d; p++; }
        const startBal = running;

        const points = [];
        for (let i = 0; i < days.length; i++) {
            const limit = dayEnd(days[i]).getTime();
            while (p < recs.length && recs[p].time <= limit) { running += recs[p].d; p++; }
            points.push({ date: days[i], value: running });
        }
        return { points: points, startBal: startBal, endBal: running, startDay: startDay, span: span };
    }

    function niceScale(lo, hi) {
        if (hi === lo) hi = lo + 1000;
        const raw = (hi - lo) / 4;
        const mag = Math.pow(10, Math.floor(Math.log10(raw)));
        const norm = raw / mag;
        const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
        return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step: step };
    }

    function balancePanelHTML(acc, s) {
        const series = buildSeries(acc, s);
        const color = CHART_COLOR; // same blue as the dashboard's Balance Trend, whatever the account colour is
        const pts = series.points;
        const n = pts.length;

        let lo = 0, hi = 0;
        pts.forEach(function (p) { if (p.value < lo) lo = p.value; if (p.value > hi) hi = p.value; });
        const scale = niceScale(lo, hi);
        const yPct = function (v) { return ((scale.max - v) / (scale.max - scale.min)) * 100; };
        const xPct = function (i) { return n === 1 ? 50 : (i / (n - 1)) * 100; };

        // SVG line + area (viewBox 1000 x 100, stretched to the plot)
        let line = "";
        pts.forEach(function (p, i) {
            line += (i === 0 ? "M" : "L") + (xPct(i) * 10).toFixed(2) + "," + yPct(p.value).toFixed(2) + " ";
        });
        const area = line + "L1000,100 L0,100 Z";

        // Grid + y labels
        let grid = "";
        for (let v = scale.min; v <= scale.max + scale.step / 2; v += scale.step) {
            const y = yPct(v);
            grid += '<div class="ap-gl' + (v === 0 ? " zero" : "") + '" style="top:' + y + '%"><span>' + short(v) + "</span></div>";
        }

        // x labels
        const labelCount = Math.min(6, n);
        const withYear = series.span > 200;
        let xl = "";
        for (let k = 0; k < labelCount; k++) {
            const idx = labelCount === 1 ? 0 : Math.round((k * (n - 1)) / (labelCount - 1));
            const d = pts[idx].date;
            const text = withYear ? MONTHS[d.getMonth()] + " " + d.getFullYear() : fmtDay(d, false);
            xl += '<span style="left:' + xPct(idx) + '%">' + text + "</span>";
        }

        // Change over the range
        const change = series.endBal - series.startBal;
        let pctText = "New";
        let tone = "flat";
        if (series.startBal !== 0) {
            const pct = (change / Math.abs(series.startBal)) * 100;
            pctText = (pct > 0 ? "+" : "") + (Math.abs(pct) >= 100 ? pct.toFixed(0) : pct.toFixed(1)) + "%";
            tone = pct > 0.05 ? "up" : pct < -0.05 ? "down" : "flat";
        } else if (change !== 0) {
            pctText = "New";
            tone = change > 0 ? "up" : "down";
        } else {
            pctText = "0%";
        }
        const arrow = tone === "up" ? "arrow_upward" : tone === "down" ? "arrow_downward" : "remove";
        const since = "since " + fmtDay(series.startDay, series.startDay.getFullYear() !== new Date().getFullYear());

        let rangeChips = "";
        RANGES.forEach(function (r) {
            rangeChips += '<button type="button" class="' + (state.range === r.key ? "on" : "") + '" data-act="range" data-range="' + r.key + '">' + r.label + "</button>";
        });

        chartCtx = { points: pts, color: color, yPct: yPct, xPct: xPct, n: n };

        const flat = (hi === 0 && lo === 0 && s.count === 0 && openingNGN(acc) === 0)
            ? '<p class="ap-empty-note">No money here yet. The line will start moving once you add records.</p>' : "";

        return '' +
            '<div class="ap-bal-head">' +
            '  <div>' +
            '    <span class="ap-eyebrow">Change ' + since + "</span>" +
            '    <div class="ap-bal-value ' + tone + '">' + (change > 0 ? "+" : "") + money(change) + "</div>" +
            '    <div class="ap-bal-change"><span class="ap-pill ' + tone + '">' + materialIcon(arrow) + pctText + "</span>" +
            "      <span>from " + money(series.startBal) + " to " + money(series.endBal) + "</span></div>" +
            "  </div>" +
            '  <div class="ap-ranges" role="group" aria-label="Time range">' + rangeChips + "</div>" +
            "</div>" +
            '<div class="ap-chart" style="--acc:' + esc(color) + '">' +
            '  <div class="ap-plot" id="ap-plot">' +
            grid +
            '    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">' +
            '      <defs><linearGradient id="ap-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + esc(color) + '" stop-opacity="0.28"/><stop offset="1" stop-color="' + esc(color) + '" stop-opacity="0.02"/></linearGradient></defs>' +
            '      <path d="' + area + '" fill="url(#ap-fill)"/>' +
            '      <path d="' + line + '" fill="none" stroke="' + esc(color) + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
            "    </svg>" +
            '    <span class="ap-end-dot" style="left:' + xPct(n - 1) + "%;top:" + yPct(pts[n - 1].value) + '%"></span>' +
            '    <div class="ap-hover-line" id="ap-hover-line"></div>' +
            '    <span class="ap-hover-dot" id="ap-hover-dot"></span>' +
            '    <div class="ap-tip" id="ap-tip"></div>' +
            '    <div class="ap-hit" id="ap-hit"></div>' +
            "  </div>" +
            '  <div class="ap-xlabels">' + xl + "</div>" +
            "</div>" +
            flat;
    }

    function attachChart() {
        const hit = document.getElementById("ap-hit");
        if (!hit || !chartCtx) return;
        const plot = document.getElementById("ap-plot");
        const line = document.getElementById("ap-hover-line");
        const dot = document.getElementById("ap-hover-dot");
        const tip = document.getElementById("ap-tip");
        const ctx = chartCtx;

        function show(clientX) {
            const rect = plot.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            const idx = ctx.n === 1 ? 0 : Math.round(ratio * (ctx.n - 1));
            const p = ctx.points[idx];
            const x = ctx.xPct(idx);
            const y = ctx.yPct(p.value);
            line.style.left = x + "%";
            dot.style.left = x + "%";
            dot.style.top = y + "%";
            tip.innerHTML = "<small>" + fmtLongDay(p.date) + "</small><strong>" + money(p.value) + "</strong>";
            tip.style.left = x + "%";
            tip.style.top = Math.max(0, y) + "%";
            tip.classList.toggle("flip", x > 62);
            plot.classList.add("hovering");
        }
        function hide() { plot.classList.remove("hovering"); }

        hit.addEventListener("mousemove", function (e) { show(e.clientX); });
        hit.addEventListener("mouseleave", hide);
        hit.addEventListener("touchstart", function (e) { if (e.touches[0]) show(e.touches[0].clientX); }, { passive: true });
        hit.addEventListener("touchmove", function (e) { if (e.touches[0]) show(e.touches[0].clientX); }, { passive: true });
        hit.addEventListener("touchend", hide);
    }

    // ---- Records tab ---------------------------------------------
    function recordsPanelHTML(acc, s) {
        const all = s.recs.slice().sort(function (a, b) { return b.time - a.time; }); // newest first

        const counts = { all: all.length, income: 0, expense: 0, transfer: 0 };
        all.forEach(function (r) { counts[r.t.type]++; });

        const filters = [
            { key: "all", label: "All" },
            { key: "income", label: "Income" },
            { key: "expense", label: "Expenses" },
            { key: "transfer", label: "Transfers" }
        ];
        let chips = "";
        filters.forEach(function (f) {
            chips += '<button type="button" class="' + (state.filter === f.key ? "on" : "") + '" data-act="filter" data-filter="' + f.key + '">' + f.label + " <span>" + counts[f.key] + "</span></button>";
        });

        const shown = all.filter(function (r) { return state.filter === "all" || r.t.type === state.filter; });

        let body = "";
        if (all.length === 0) {
            body = '<div class="ap-empty">' + materialIcon("receipt_long") +
                "<strong>No records yet</strong><p>Income, expenses and transfers for this account will show up here.</p>" +
                '<button type="button" class="ap-btn primary" data-act="add-record">' + materialIcon("add") + "Add record</button></div>";
        } else if (shown.length === 0) {
            body = '<div class="ap-empty">' + materialIcon("filter_list") + "<strong>Nothing in this filter</strong><p>Try another one above.</p></div>";
        } else {
            let lastHeading = "";
            let open = false;
            shown.forEach(function (r) {
                const d = new Date(r.time);
                const heading = dayHeading(d);
                if (heading !== lastHeading) {
                    if (open) body += "</ul>";
                    body += '<h3 class="ap-day">' + heading + '</h3><ul class="ap-recs">';
                    lastHeading = heading;
                    open = true;
                }
                body += recordHTML(acc, r, d);
            });
            if (open) body += "</ul>";
        }

        return '<div class="ap-filters" role="group" aria-label="Filter records">' + chips + "</div>" + body;
    }

    function recordHTML(acc, r, d) {
        const t = r.t;
        const incoming = r.d > 0;
        const tone = t.type === "transfer" ? (incoming ? "in" : "out") : (t.type === "income" ? "in" : "out");

        let title;
        let sub;
        let icon;
        if (t.type === "transfer") {
            icon = "swap_horiz";
            title = incoming ? "Transfer in" : "Transfer out";
            sub = incoming ? "from " + esc(t.from) : "to " + esc(t.to);
        } else {
            icon = getCategoryIcon(t.category);
            title = esc((typeof CATEGORY_NAMES !== "undefined" && CATEGORY_NAMES[t.category]) || t.category);
            sub = "";
        }
        sub = (sub ? sub + " · " : "") + fmtTime(d);

        const future = r.time > dayEnd(new Date()).getTime();
        if (future) sub += " · upcoming";

        return '' +
            '<li class="ap-rec">' +
            '  <span class="ap-rec-ico ' + tone + '">' + materialIcon(icon) + "</span>" +
            '  <div class="ap-rec-info"><strong>' + title + "</strong><small>" + sub + "</small></div>" +
            '  <div class="ap-rec-actions">' +
            '    <button type="button" data-act="edit-record" data-id="' + t.id + '" title="Edit" aria-label="Edit record">' + materialIcon("edit") + "</button>" +
            '    <button type="button" data-act="delete-record" data-id="' + t.id + '" data-transfer="' + (t.type === "transfer") + '" title="Delete" aria-label="Delete record">' + materialIcon("delete_outline") + "</button>" +
            "  </div>" +
            '  <div class="ap-rec-amt ' + tone + '">' + (incoming ? "+" : "-") + money(Math.abs(r.d)) + "</div>" +
            "</li>";
    }

    // ---------------------------------------------------------
    // Card menu (three dots)
    // ---------------------------------------------------------
    const menu = document.createElement("div");
    menu.className = "ap-menu";
    menu.hidden = true;
    document.body.appendChild(menu);
    let menuFor = null;

    function openMenu(btn, name) {
        const acc = findAccount(name);
        if (!acc) return;
        menuFor = name;
        const syncItem = acc.monoAccountId
            ? '<button type="button" data-m="sync">' + materialIcon("sync") + "Sync now</button>"
            : "";
        menu.innerHTML = '' +
            '<button type="button" data-m="edit">' + materialIcon("edit") + "Edit account</button>" +
            syncItem +
            '<button type="button" data-m="exclude">' + materialIcon(acc.excluded ? "visibility" : "visibility_off") + (acc.excluded ? "Include in statistics" : "Exclude from statistics") + "</button>" +
            '<button type="button" class="danger" data-m="delete">' + materialIcon("delete_outline") + "Delete account</button>";
        menu.hidden = false;
        const r = btn.getBoundingClientRect();
        const w = menu.offsetWidth;
        menu.style.top = Math.min(window.innerHeight - menu.offsetHeight - 8, r.bottom + 6) + "px";
        menu.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + "px";
    }
    function closeMenu() { menu.hidden = true; menuFor = null; }

    menu.addEventListener("click", function (e) {
        const b = e.target.closest("button[data-m]");
        if (!b || !menuFor) return;
        const name = menuFor;
        closeMenu();
        const act = b.getAttribute("data-m");
        if (act === "edit") openEditor(name);
        else if (act === "delete") deleteAccount(name);
        else if (act === "sync") runMonoSync(name);
        else if (act === "exclude") {
            const acc = findAccount(name);
            if (!acc) return;
            acc.excluded = !acc.excluded;
            saveData();
            renderAccounts();
            showToast(acc.excluded ? "Excluded from statistics" : "Included in statistics", "success");
        }
    });
    document.addEventListener("click", function (e) {
        if (!menu.hidden && !menu.contains(e.target) && !e.target.closest(".ap-more")) closeMenu();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
    window.addEventListener("scroll", closeMenu, { passive: true });
    window.addEventListener("resize", closeMenu);

    // ---------------------------------------------------------
    // Clicks on the page (event delegation)
    // ---------------------------------------------------------
    function runMonoConnect() {
        if (window.QionixMono && typeof window.QionixMono.connect === "function") {
            window.QionixMono.connect();
            return;
        }
        showToast("Mono is not loaded. Reload the page and try again.", "error");
    }

    function runMonoSync(name) {
        if (window.QionixMono && typeof window.QionixMono.sync === "function") {
            window.QionixMono.sync(name);
            return;
        }
        showToast("Mono is not loaded. Reload the page and try again.", "error");
    }

    page.addEventListener("click", function (e) {
        const el = e.target.closest("[data-act]");
        if (!el) return;
        const act = el.getAttribute("data-act");

        if (act === "mono-connect") {
            runMonoConnect();
        } else if (act === "mono-sync") {
            runMonoSync(state.name);
        } else if (act === "menu") {
            e.stopPropagation();
            if (!menu.hidden && menuFor === el.getAttribute("data-name")) closeMenu();
            else openMenu(el, el.getAttribute("data-name"));
        } else if (act === "open") {
            goDetail(el.getAttribute("data-name"));
        } else if (act === "add-account") {
            setModalMode(null);
            openAccountModal();
        } else if (act === "back") {
            go("#accounts");
        } else if (act === "edit") {
            openEditor(state.name);
        } else if (act === "delete") {
            deleteAccount(state.name);
        } else if (act === "tab") {
            state.tab = el.getAttribute("data-tab");
            renderPanelOnly();
        } else if (act === "range") {
            state.range = el.getAttribute("data-range");
            renderPanelOnly();
        } else if (act === "filter") {
            state.filter = el.getAttribute("data-filter");
            renderPanelOnly();
        } else if (act === "add-record") {
            const btn = document.getElementById("open-modal-btn");
            if (btn) btn.click();
        } else if (act === "edit-record") {
            startEdit(Number(el.getAttribute("data-id")));
        } else if (act === "delete-record") {
            const id = Number(el.getAttribute("data-id"));
            const label = el.getAttribute("data-transfer") === "true" ? "this transfer" : "this record";
            askConfirm("Delete " + label + "?", "It will be removed from lists and totals.", "Delete", function () {
                deleteTransaction(id);
                showToast("Record deleted", "success");
            });
        }
    });

    // Keyboard: Enter / Space opens a focused account card
    page.addEventListener("keydown", function (e) {
        if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("ap-card") && e.target.getAttribute("data-act") === "open") {
            e.preventDefault();
            goDetail(e.target.getAttribute("data-name"));
        }
    });

    // ---------------------------------------------------------
    // Edit account: re-uses the "Add New Account" modal in edit mode
    // ---------------------------------------------------------
    const accModal = document.getElementById("account-modal");
    const accTitle = accModal ? accModal.querySelector(".modal-header h2") : null;
    const accSub = accModal ? accModal.querySelector(".modal-header p") : null;
    const accSubmit = document.getElementById("create-account-btn");
    const ORIGINAL = {
        title: accTitle ? accTitle.textContent : "Add New Account",
        sub: accSub ? accSub.textContent : "",
        submit: accSubmit ? accSubmit.textContent : "Create account"
    };
    let editing = null; // name of the account being edited, or null when creating

    function setModalMode(name) {
        editing = name;
        if (!accTitle) return;
        if (name) {
            accTitle.textContent = "Edit account";
            accSub.textContent = "Update the details of " + name;
            accSubmit.textContent = "Save changes";
        } else {
            accTitle.textContent = ORIGINAL.title;
            accSub.textContent = ORIGINAL.sub;
            accSubmit.textContent = ORIGINAL.submit;
        }
    }

    // Whenever the modal closes (any way), go back to "create" mode
    if (accModal) {
        new MutationObserver(function () {
            if (!accModal.classList.contains("active") && editing !== null) setModalMode(null);
        }).observe(accModal, { attributes: true, attributeFilter: ["class"] });
    }

    function openEditor(name) {
        const acc = findAccount(name);
        if (!acc) return;
        openAccountModal(); // resets the form
        setModalMode(name);
        document.getElementById("new-account-name").value = acc.name;
        syncCreateButton();
        colorPicker.set(acc.color || DEFAULT_ACCOUNT_COLOR);
        accountTypeSelect.set(acc.type || "general");
        accountCurrencySelect.set(acc.currency || "NGN"); // also fills the default rate...
        if ((acc.currency || "NGN") !== "NGN") document.getElementById("new-account-rate").value = acc.rate; // ...so put this account's own rate back
        document.getElementById("new-account-opening").value = acc.opening || "";
        document.getElementById("new-account-exclude").checked = !!acc.excluded;
        updateRatePreview();
    }

    // Runs before the "create" handler (capture on the modal) and takes over while editing
    if (accModal) {
        accModal.addEventListener("submit", function (e) {
            if (editing === null) return; // normal create flow
            e.preventDefault();
            e.stopImmediatePropagation();

            const oldName = editing;
            const acc = findAccount(oldName);
            if (!acc) { closeAccountModal(); return; }

            const name = document.getElementById("new-account-name").value.trim();
            if (!name) { showToast("Please enter account name", "error"); return; }
            for (let i = 0; i < accounts.length; i++) {
                if (accounts[i] !== acc && accounts[i].name.toLowerCase() === name.toLowerCase()) {
                    showToast("Account already exists", "error");
                    return;
                }
            }
            const currency = document.getElementById("new-account-currency").value || "NGN";
            let rate = 1;
            if (currency !== "NGN") {
                rate = Number(document.getElementById("new-account-rate").value);
                if (!(rate > 0)) { showToast("Enter a valid exchange rate", "error"); return; }
            }
            const openingInput = document.getElementById("new-account-opening");
            let opening = 0;
            if (openingInput.value !== "") {
                opening = Number(openingInput.value);
                if (isNaN(opening) || opening < 0) { showToast("Opening balance must be 0 or more", "error"); return; }
            }
            const info = typeInfo(document.getElementById("new-account-type").value);

            // Records point to accounts by NAME, so a rename must update them too
            if (name !== oldName) {
                transactions.forEach(function (t) {
                    if (t.account === oldName) t.account = name;
                    if (t.from === oldName) t.from = name;
                    if (t.to === oldName) t.to = name;
                });
                if (selectedAccount === oldName) selectedAccount = name;
            }

            acc.name = name;
            acc.type = info.value;
            acc.icon = info.icon;
            acc.color = getPickedAccountColor();
            acc.currency = currency;
            acc.rate = rate;
            acc.opening = opening;
            acc.excluded = document.getElementById("new-account-exclude").checked;
            if (currency !== "NGN") {
                exchangeRates[currency] = rate;
                saveCurrencyPrefs();
            }

            saveData();
            closeAccountModal();

            // Keep the detail page on the (possibly renamed) account
            if (state.view === "detail" && state.name === oldName) {
                state.name = name;
                history.replaceState(null, "", "#account/" + encodeURIComponent(name));
            }
            renderAccounts();     // sidebar, dropdowns, dashboard (and this page, see hooks below)
            displayTransactions();
            showToast("Account updated", "success");
        }, true);
    }

    // ---------------------------------------------------------
    // Keep this page in sync: refresh after the app redraws accounts / records
    // (wrapping the two existing functions means dashboard.js and transactions.js stay untouched)
    // ---------------------------------------------------------
    const originalRenderAccounts = renderAccounts;
    renderAccounts = function () {
        originalRenderAccounts.apply(this, arguments);
        refresh();
    };
    const originalDisplayTransactions = displayTransactions;
    displayTransactions = function () {
        originalDisplayTransactions.apply(this, arguments);
        refresh();
    };

    // First paint: honour the saved startup page (Settings) when the URL has no hash
    if (!location.hash) {
        const startup = localStorage.getItem(prefKey("qionix.startup"));
        if (startup === "accounts") {
            history.replaceState(null, "", "#accounts");
        } else if (startup && startup !== "dashboard" && extViews[startup]) {
            history.replaceState(null, "", "#" + startup);
        }
    }

    // First paint: honour the URL (e.g. refresh on #accounts)
    route();
})();
