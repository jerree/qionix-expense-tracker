// QIONIX - records-page.js | Records page: every record with month picker, search, filters, sort and bulk delete
// Loaded AFTER main.js and BEFORE accounts-page.js (that file owns the page switching and
// calls renderRecordsPage() / refreshRecordsPage() below).
//
// URL: #records

(function () {
    "use strict";

    const page = document.getElementById("view-records");
    if (!page) return;

    // ---------------------------------------------------------
    // State (lives in memory; filters reset when you reload)
    // ---------------------------------------------------------
    const now = new Date();
    const state = {
        mode: "month",              // month | all
        y: now.getFullYear(),
        m: now.getMonth(),
        q: "",                      // search text
        type: "all",                // all | income | expense | transfer
        account: "all",             // account name or "all"
        category: "all",            // category key or "all"
        sort: "newest",             // newest | oldest | highest | lowest
        limit: 100,                 // rows drawn at once ("Show more" adds 100)
        selected: new Set()         // ids of ticked records
    };

    const PAGE_STEP = 100;

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

    function icon(name) {
        return '<span class="material-icons" aria-hidden="true">' + name + "</span>";
    }

    // "#e74c3c" + 0.14 -> "rgba(231, 76, 60, 0.14)" (soft tinted icon backgrounds)
    function tint(hex, alpha) {
        const h = String(hex).replace("#", "");
        if (h.length !== 6) return "rgba(100, 116, 139, " + alpha + ")";
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
    }

    const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
    function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
    function fmtDay(d) { return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear(); }
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
        return WEEKDAYS[d.getDay()] + ", " + fmtDay(d);
    }
    function dayKey(d) { return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); }

    function categoryName(t) {
        if (t.type === "transfer") return "Transfer";
        return (typeof CATEGORY_NAMES !== "undefined" && CATEGORY_NAMES[t.category]) || t.category;
    }
    function categoryColor(t) {
        if (t.type === "transfer") return "#2563eb";
        return (typeof CATEGORY_COLORS !== "undefined" && CATEGORY_COLORS[t.category]) || "#95a5a6";
    }
    function accountColor(name) {
        const acc = accounts.find(function (a) { return a.name === name; });
        return acc ? (acc.color || DEFAULT_ACCOUNT_COLOR) : "#94a3b8";
    }

    // ---------------------------------------------------------
    // Filtering + sorting
    // ---------------------------------------------------------
    function involvesAccount(t, name) {
        if (t.type === "transfer") return t.from === name || t.to === name;
        return t.account === name;
    }

    function getResults() {
        const q = state.q.trim().toLowerCase();
        const list = [];
        for (let i = 0; i < transactions.length; i++) {
            const t = transactions[i];
            const d = new Date(t.date);
            if (isNaN(d.getTime())) continue;
            if (state.mode === "month" && (d.getFullYear() !== state.y || d.getMonth() !== state.m)) continue;
            if (state.type !== "all" && t.type !== state.type) continue;
            if (state.account !== "all" && !involvesAccount(t, state.account)) continue;
            if (state.category !== "all" && t.category !== state.category) continue;
            if (q) {
                const hay = [categoryName(t), t.account || "", t.from || "", t.to || "", String(t.amount), t.type].join(" ").toLowerCase();
                if (hay.indexOf(q) === -1) continue;
            }
            list.push({ t: t, time: d.getTime() });
        }
        list.sort(function (a, b) {
            if (state.sort === "oldest") return a.time - b.time;
            if (state.sort === "highest") return b.t.amount - a.t.amount || b.time - a.time;
            if (state.sort === "lowest") return a.t.amount - b.t.amount || b.time - a.time;
            return b.time - a.time; // newest
        });
        return list;
    }

    function filtersActive() {
        return state.q.trim() !== "" || state.type !== "all" || state.account !== "all" || state.category !== "all";
    }

    function groupedByDay() { return state.sort === "newest" || state.sort === "oldest"; }

    // ---------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------
    function periodLabel() {
        return state.mode === "all" ? "All time" : MONTH_NAMES[state.m] + " " + state.y;
    }

    function selectOptions(items, current) {
        return items.map(function (it) {
            return '<option value="' + esc(it.value) + '"' + (it.value === current ? " selected" : "") + ">" + esc(it.label) + "</option>";
        }).join("");
    }

    function render() {
        // An account that was renamed / deleted can no longer be a filter
        if (state.account !== "all" && !accounts.some(function (a) { return a.name === state.account; })) state.account = "all";

        const accountItems = [{ value: "all", label: "All accounts" }].concat(accounts.map(function (a) { return { value: a.name, label: a.name }; }));
        const categoryItems = [{ value: "all", label: "All categories" }].concat(
            Object.keys(CATEGORY_NAMES).filter(function (k) { return k !== "transfer"; }).map(function (k) { return { value: k, label: CATEGORY_NAMES[k] }; })
        );
        const sortItems = [
            { value: "newest", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
            { value: "highest", label: "Highest amount" },
            { value: "lowest", label: "Lowest amount" }
        ];

        const types = [{ k: "all", l: "All" }, { k: "income", l: "Income" }, { k: "expense", l: "Expenses" }, { k: "transfer", l: "Transfers" }];
        const seg = types.map(function (t) {
            return '<button type="button" class="' + (state.type === t.k ? "on" : "") + '" data-act="type" data-type="' + t.k + '">' + t.l + "</button>";
        }).join("");

        const inAll = state.mode === "all";

        page.innerHTML = '' +
            '<div class="ap-wrap rp">' +
            '  <header class="ap-head">' +
            '    <div><h1>Records</h1><p>Everything that came in and went out</p></div>' +
            '    <button type="button" class="ap-btn primary" data-act="add">' + icon("add") + "Add record</button>" +
            "  </header>" +
            '  <div class="rp-period">' +
            '    <div class="rp-nav">' +
            '      <button type="button" class="rp-arrow" data-act="prev" aria-label="Previous month"' + (inAll ? " disabled" : "") + ">" + icon("chevron_left") + "</button>" +
            '      <button type="button" class="rp-month" data-act="this-month" title="Jump to this month">' + icon("event") + "<span>" + periodLabel() + "</span></button>" +
            '      <button type="button" class="rp-arrow" data-act="next" aria-label="Next month"' + (inAll ? " disabled" : "") + ">" + icon("chevron_right") + "</button>" +
            "    </div>" +
            '    <button type="button" class="rp-alltime' + (inAll ? " on" : "") + '" data-act="all-time">' + (inAll ? "By month" : "All time") + "</button>" +
            "  </div>" +
            '  <section class="rp-summary" id="rp-totals"></section>' +
            '  <section class="rp-filters">' +
            '    <label class="rp-search">' + icon("search") + '<input type="search" id="rp-q" placeholder="Search category, account or amount" value="' + esc(state.q) + '" autocomplete="off"></label>' +
            '    <div class="rp-seg" role="group" aria-label="Record type">' + seg + "</div>" +
            '    <div class="rp-selects">' +
            '      <select id="rp-account" aria-label="Account">' + selectOptions(accountItems, state.account) + "</select>" +
            '      <select id="rp-category" aria-label="Category">' + selectOptions(categoryItems, state.category) + "</select>" +
            '      <select id="rp-sort" aria-label="Sort by">' + selectOptions(sortItems, state.sort) + "</select>" +
            '      <button type="button" class="rp-reset" id="rp-reset" data-act="reset"' + (filtersActive() ? "" : " hidden") + ">" + icon("restart_alt") + "Reset</button>" +
            "    </div>" +
            "  </section>" +
            '  <div class="rp-bar" id="rp-bar"></div>' +
            '  <div id="rp-list"></div>' +
            "</div>";

        renderResults();
    }

    // Re-draws totals + selection bar + list (keeps the toolbar, so typing in search keeps focus)
    function renderResults() {
        const results = getResults();

        // Keep ticked records that are still in the result
        const visibleIds = new Set(results.map(function (r) { return r.t.id; }));
        state.selected.forEach(function (id) { if (!visibleIds.has(id)) state.selected.delete(id); });

        // ---- totals for what you are looking at ----
        let income = 0;
        let expense = 0;
        results.forEach(function (r) {
            if (r.t.type === "income") income += r.t.amount;
            else if (r.t.type === "expense") expense += r.t.amount;
        });
        const net = income - expense;
        const total = income + expense;
        const incomePct = total > 0 ? ((income / total) * 100).toFixed(1) : 0;
        const expensePct = total > 0 ? ((expense / total) * 100).toFixed(1) : 0;
        document.getElementById("rp-totals").innerHTML = '' +
            '<div class="rp-sum-main">' +
            '  <span class="ap-eyebrow">Net · ' + esc(periodLabel()) + "</span>" +
            '  <p class="rp-net ' + (net < 0 ? "neg" : net > 0 ? "pos" : "") + '">' + (net > 0 ? "+" : "") + money(net) + "</p>" +
            '  <p class="rp-sum-sub">' + results.length + " record" + (results.length === 1 ? "" : "s") + "</p>" +
            "</div>" +
            '<div class="rp-sum-split">' +
            '  <div class="ap-split-bar">' +
            (income > 0 ? '<i style="width:' + incomePct + '%;background:var(--color-income)"></i>' : "") +
            (expense > 0 ? '<i style="width:' + expensePct + '%;background:var(--color-expense)"></i>' : "") +
            "  </div>" +
            '  <ul class="ap-split-legend">' +
            '    <li><i class="ap-dot" style="background:var(--color-income)"></i><span class="ap-split-name">Income</span><strong class="pos">+' + money(income) + "</strong></li>" +
            '    <li><i class="ap-dot" style="background:var(--color-expense)"></i><span class="ap-split-name">Expenses</span><strong class="neg">-' + money(expense) + "</strong></li>" +
            "  </ul>" +
            "</div>";

        // ---- reset button visibility ----
        const resetBtn = document.getElementById("rp-reset");
        if (resetBtn) resetBtn.hidden = !filtersActive();

        // ---- selection bar ----
        const bar = document.getElementById("rp-bar");
        if (results.length === 0) {
            bar.innerHTML = "";
        } else if (state.selected.size > 0) {
            const n = state.selected.size;
            bar.innerHTML = '<div class="rp-selbar"><span><b>' + n + "</b> selected</span>" +
                '<div><button type="button" class="ap-btn ghost" data-act="clear-sel">Clear</button>' +
                '<button type="button" class="ap-btn danger" data-act="delete-selected">' + icon("delete_outline") + "Delete</button></div></div>";
        } else {
            bar.innerHTML = '<div class="rp-selectall"><label><input type="checkbox" data-act="select-all" aria-label="Select all records"> Select all</label>' +
                "<span>Found " + results.length + " record" + (results.length === 1 ? "" : "s") + "</span></div>";
        }
        syncSelectAllBox(results);

        // ---- list ----
        const list = document.getElementById("rp-list");
        if (results.length === 0) {
            list.innerHTML = emptyHTML();
            return;
        }

        const shown = results.slice(0, state.limit);
        let html = "";
        if (groupedByDay()) {
            // Group rows by calendar day, each day with its net total
            const groups = [];
            const byKey = {};
            shown.forEach(function (r) {
                const d = new Date(r.time);
                const k = dayKey(d);
                if (!byKey[k]) { byKey[k] = { date: d, rows: [], net: 0 }; groups.push(byKey[k]); }
                byKey[k].rows.push(r);
                if (r.t.type === "income") byKey[k].net += r.t.amount;
                else if (r.t.type === "expense") byKey[k].net -= r.t.amount;
            });
            groups.forEach(function (g) {
                const netCls = g.net < 0 ? "neg" : g.net > 0 ? "pos" : "";
                html += '<section class="rp-day"><header><h3>' + dayHeading(g.date) + '</h3><span class="rp-daynet ' + netCls + '">' + (g.net > 0 ? "+" : "") + money(g.net) + "</span></header>" +
                    '<ul class="rp-rows">' + g.rows.map(function (r) { return rowHTML(r, false); }).join("") + "</ul></section>";
            });
        } else {
            html += '<section class="rp-day"><ul class="rp-rows">' + shown.map(function (r) { return rowHTML(r, true); }).join("") + "</ul></section>";
        }

        if (results.length > shown.length) {
            html += '<div class="rp-more"><button type="button" class="ap-btn ghost" data-act="more">Show ' + Math.min(PAGE_STEP, results.length - shown.length) + " more</button>" +
                "<span>Showing " + shown.length + " of " + results.length + "</span></div>";
        }
        list.innerHTML = html;
    }

    function rowHTML(r, withDate) {
        const t = r.t;
        const d = new Date(r.time);
        const color = categoryColor(t);
        const checked = state.selected.has(t.id);

        let chip;
        if (t.type === "transfer") {
            chip = '<span class="rp-chip"><i style="background:' + esc(accountColor(t.from)) + '"></i>' + esc(t.from) + " " + icon("arrow_forward") + '<i style="background:' + esc(accountColor(t.to)) + '"></i>' + esc(t.to) + "</span>";
        } else {
            chip = '<span class="rp-chip"><i style="background:' + esc(accountColor(t.account)) + '"></i>' + esc(t.account) + "</span>";
        }

        let amount;
        let tone;
        if (t.type === "income") { amount = "+" + money(t.amount); tone = "in"; }
        else if (t.type === "expense") { amount = "-" + money(t.amount); tone = "out"; }
        else { amount = money(t.amount); tone = "tr"; }

        const when = (withDate ? fmtDay(d) + " · " : "") + fmtTime(d);
        const ico = t.type === "transfer" ? "swap_horiz" : getCategoryIcon(t.category);

        return '' +
            '<li class="rp-row' + (checked ? " selected" : "") + '">' +
            '  <label class="rp-check"><input type="checkbox" data-act="select" data-id="' + t.id + '"' + (checked ? " checked" : "") + ' aria-label="Select record"></label>' +
            '  <span class="rp-ico" style="background:' + tint(color, 0.14) + ";color:" + esc(color) + '">' + icon(ico) + "</span>" +
            '  <div class="rp-info"><strong>' + esc(categoryName(t)) + '</strong><div class="rp-sub">' + chip + "<span>" + when + "</span></div></div>" +
            '  <div class="rp-actions">' +
            '    <button type="button" data-act="edit" data-id="' + t.id + '" title="Edit" aria-label="Edit record">' + icon("edit") + "</button>" +
            '    <button type="button" data-act="delete" data-id="' + t.id + '" data-transfer="' + (t.type === "transfer") + '" title="Delete" aria-label="Delete record">' + icon("delete_outline") + "</button>" +
            "  </div>" +
            '  <div class="rp-amt ' + tone + '">' + amount + "</div>" +
            "</li>";
    }

    function emptyHTML() {
        if (transactions.length === 0) {
            return '<div class="ap-empty">' + icon("receipt_long") + "<strong>No records yet</strong><p>Add your first income or expense and it will show up here.</p>" +
                '<button type="button" class="ap-btn primary" data-act="add">' + icon("add") + "Add record</button></div>";
        }
        if (filtersActive()) {
            return '<div class="ap-empty">' + icon("search") + "<strong>No records match</strong><p>Try a different search or clear the filters.</p>" +
                '<button type="button" class="ap-btn ghost" data-act="reset">' + icon("restart_alt") + "Reset filters</button></div>";
        }
        return '<div class="ap-empty">' + icon("receipt_long") + "<strong>Nothing in " + esc(periodLabel()) + "</strong><p>No records in this period. Try another month, or look at all time.</p>" +
            '<button type="button" class="ap-btn ghost" data-act="all-time">Show all time</button></div>';
    }

    // Tick / untick / half-tick the "Select all" box
    function syncSelectAllBox(results) {
        const box = page.querySelector('input[data-act="select-all"]');
        if (!box) return;
        box.checked = results.length > 0 && state.selected.size === results.length;
        box.indeterminate = state.selected.size > 0 && state.selected.size < results.length;
    }

    // ---------------------------------------------------------
    // Events (delegation: one listener for the whole page)
    // ---------------------------------------------------------
    function shiftMonth(delta) {
        const d = new Date(state.y, state.m + delta, 1);
        state.y = d.getFullYear();
        state.m = d.getMonth();
        state.selected.clear();
        state.limit = PAGE_STEP;
        render();
    }

    page.addEventListener("click", function (e) {
        const el = e.target.closest("[data-act]");
        if (!el || el.tagName === "INPUT") return;
        const act = el.getAttribute("data-act");

        if (act === "add") {
            const btn = document.getElementById("open-modal-btn");
            if (btn) btn.click();
        } else if (act === "prev") shiftMonth(-1);
        else if (act === "next") shiftMonth(1);
        else if (act === "this-month") {
            const n = new Date();
            state.mode = "month"; state.y = n.getFullYear(); state.m = n.getMonth();
            state.selected.clear(); state.limit = PAGE_STEP; render();
        } else if (act === "all-time") {
            state.mode = state.mode === "all" ? "month" : "all";
            state.selected.clear(); state.limit = PAGE_STEP; render();
        } else if (act === "type") {
            state.type = el.getAttribute("data-type");
            state.limit = PAGE_STEP;
            // categories only exist for income/expense records
            if (state.type === "transfer") state.category = "all";
            render();
        } else if (act === "reset") {
            state.q = ""; state.type = "all"; state.account = "all"; state.category = "all";
            state.selected.clear(); state.limit = PAGE_STEP; render();
        } else if (act === "more") {
            state.limit += PAGE_STEP; renderResults();
        } else if (act === "clear-sel") {
            state.selected.clear(); renderResults();
        } else if (act === "edit") {
            startEdit(Number(el.getAttribute("data-id")));
        } else if (act === "delete") {
            const id = Number(el.getAttribute("data-id"));
            const label = el.getAttribute("data-transfer") === "true" ? "this transfer" : "this record";
            askConfirm("Delete " + label + "?", "It will be removed from lists and totals.", "Delete", function () {
                deleteTransaction(id);
                showToast("Record deleted", "success");
            });
        } else if (act === "delete-selected") {
            const ids = new Set(state.selected);
            const n = ids.size;
            if (n === 0) return;
            askConfirm("Delete " + n + " record" + (n === 1 ? "" : "s") + "?", "They will be removed from every list and total.", "Delete", function () {
                for (let i = transactions.length - 1; i >= 0; i--) {
                    if (ids.has(transactions[i].id)) transactions.splice(i, 1);
                }
                if (typeof editingId !== "undefined" && editingId !== null && ids.has(editingId) && typeof exitEditMode === "function") exitEditMode();
                state.selected.clear();
                saveData();
                displayTransactions(); // redraws every list, this page included
                showToast(n + " record" + (n === 1 ? "" : "s") + " deleted", "success");
            });
        }
    });

    page.addEventListener("change", function (e) {
        const t = e.target;
        if (t.id === "rp-account") { state.account = t.value; state.selected.clear(); state.limit = PAGE_STEP; renderResults(); }
        else if (t.id === "rp-category") {
            state.category = t.value; state.selected.clear(); state.limit = PAGE_STEP;
            if (state.category !== "all" && state.type === "transfer") { state.type = "all"; render(); } else renderResults();
        } else if (t.id === "rp-sort") { state.sort = t.value; state.limit = PAGE_STEP; renderResults(); }
        else if (t.getAttribute && t.getAttribute("data-act") === "select") {
            const id = Number(t.getAttribute("data-id"));
            if (t.checked) state.selected.add(id); else state.selected.delete(id);
            renderResults();
        } else if (t.getAttribute && t.getAttribute("data-act") === "select-all") {
            const results = getResults();
            state.selected.clear();
            if (t.checked) results.forEach(function (r) { state.selected.add(r.t.id); });
            renderResults();
        }
    });

    page.addEventListener("input", function (e) {
        if (e.target.id === "rp-q") {
            state.q = e.target.value;
            state.selected.clear();
            state.limit = PAGE_STEP;
            renderResults();
        }
    });

    // ---------------------------------------------------------
    // Called by accounts-page.js (it owns the page switching)
    // ---------------------------------------------------------
    window.renderRecordsPage = function () {
        state.selected.clear();
        state.limit = PAGE_STEP;
        render();
    };

    // Data changed somewhere else (new / edited / deleted record, account renamed...)
    window.refreshRecordsPage = function () {
        render();
    };
})();
