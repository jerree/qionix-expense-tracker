// QIONIX - analytics-page.js | Analytics page: Report, Balance trend and Cash flow for one month
// Loaded AFTER main.js and BEFORE accounts-page.js (that file owns the page switching and
// calls renderAnalyticsPage() / refreshAnalyticsPage() below).
//
// URL: #analytics

(function () {
    "use strict";

    const page = document.getElementById("view-analytics");
    if (!page) return;

    // Same blue as the dashboard's Balance Trend chart
    const CHART_COLOR = "#2563eb";

    // ---------------------------------------------------------
    // State (in memory; resets on reload)
    // ---------------------------------------------------------
    const now = new Date();
    const state = {
        y: now.getFullYear(),
        m: now.getMonth(),
        account: "all", // "all" = every account that is not excluded from statistics
        tab: "report"   // report | balance | cashflow
    };

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

    function icon(name) {
        return '<span class="material-icons" aria-hidden="true">' + name + "</span>";
    }

    function tint(hex, alpha) {
        const h = String(hex).replace("#", "");
        if (h.length !== 6) return "rgba(100, 116, 139, " + alpha + ")";
        return "rgba(" + parseInt(h.slice(0, 2), 16) + ", " + parseInt(h.slice(2, 4), 16) + ", " + parseInt(h.slice(4, 6), 16) + ", " + alpha + ")";
    }

    const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    function daysIn(y, m) { return new Date(y, m + 1, 0).getDate(); }
    function monthLabel(y, m) { return MONTH_NAMES[m] + " " + y; }
    function shortMonthLabel(y, m) { return MONTHS[m] + " " + y; }
    function prevMonth() {
        const d = new Date(state.y, state.m - 1, 1);
        return { y: d.getFullYear(), m: d.getMonth() };
    }
    function isCurrentMonth() { return state.y === now.getFullYear() && state.m === now.getMonth(); }

    function categoryName(key) { return (typeof CATEGORY_NAMES !== "undefined" && CATEGORY_NAMES[key]) || key; }
    function categoryColor(key) { return (typeof CATEGORY_COLORS !== "undefined" && CATEGORY_COLORS[key]) || "#95a5a6"; }

    // ---------------------------------------------------------
    // Which accounts are being looked at
    // ---------------------------------------------------------
    function scopeNames() {
        const set = new Set();
        if (state.account === "all") {
            accounts.forEach(function (a) { if (!a.excluded) set.add(a.name); });
        } else {
            set.add(state.account);
        }
        return set;
    }

    // How much a record moves the combined balance of the chosen accounts
    function balanceDelta(t, names) {
        if (t.type === "transfer") {
            return (names.has(t.from) ? -t.amount : 0) + (names.has(t.to) ? t.amount : 0);
        }
        if (!names.has(t.account)) return 0;
        return t.type === "income" ? t.amount : t.type === "expense" ? -t.amount : 0;
    }

    function openingTotal(names) {
        let total = 0;
        accounts.forEach(function (a) { if (names.has(a.name)) total += openingNGN(a); });
        return total;
    }

    // ---------------------------------------------------------
    // Numbers for one month
    // ---------------------------------------------------------
    // Income and expenses of one month, split by category (transfers are not income or expense)
    function monthTotals(y, m, names) {
        const out = { income: 0, expense: 0, inCats: {}, outCats: {} };
        for (let i = 0; i < transactions.length; i++) {
            const t = transactions[i];
            if (t.type !== "income" && t.type !== "expense") continue;
            if (!names.has(t.account)) continue;
            const d = new Date(t.date);
            if (isNaN(d.getTime()) || d.getFullYear() !== y || d.getMonth() !== m) continue;
            if (t.type === "income") {
                out.income += t.amount;
                out.inCats[t.category] = (out.inCats[t.category] || 0) + t.amount;
            } else {
                out.expense += t.amount;
                out.outCats[t.category] = (out.outCats[t.category] || 0) + t.amount;
            }
        }
        return out;
    }

    // Combined balance at the end of a given moment
    function balanceAt(endMs, names) {
        let total = openingTotal(names);
        for (let i = 0; i < transactions.length; i++) {
            const t = transactions[i];
            const time = new Date(t.date).getTime();
            if (isNaN(time) || time > endMs) continue;
            total += balanceDelta(t, names);
        }
        return total;
    }

    // "+12%" / "-8.5%" style text, plus whether it counts as good, bad or neutral news.
    // goodWhenUp: income and balance are good when they grow, expenses are good when they shrink.
    function deltaPill(cur, prev, goodWhenUp, prevLabel) {
        if (cur === 0 && prev === 0) return "";
        let text;
        let dir;
        if (prev === 0) {
            text = "New";
            dir = cur > 0 ? "up" : "down";
        } else {
            const pct = ((cur - prev) / Math.abs(prev)) * 100;
            if (Math.abs(pct) < 0.05) { text = "0%"; dir = "flat"; }
            else {
                text = (pct > 0 ? "+" : "") + (Math.abs(pct) >= 100 ? pct.toFixed(0) : pct.toFixed(1)) + "%";
                dir = pct > 0 ? "up" : "down";
            }
        }
        let tone = "flat";
        if (dir === "up") tone = goodWhenUp ? "good" : "bad";
        else if (dir === "down") tone = goodWhenUp ? "bad" : "good";
        const arrow = dir === "up" ? "arrow_upward" : dir === "down" ? "arrow_downward" : "remove";
        return '<span class="an-delta ' + tone + '" title="Compared with ' + esc(prevLabel) + '">' + icon(arrow) + text + "</span>";
    }

    // ---------------------------------------------------------
    // Rendering: the frame (title, month picker, account filter, tabs)
    // ---------------------------------------------------------
    function render() {
        // An account that was renamed or deleted can no longer be the filter
        if (state.account !== "all" && !accounts.some(function (a) { return a.name === state.account; })) state.account = "all";

        const accountOptions = ['<option value="all"' + (state.account === "all" ? " selected" : "") + ">All accounts</option>"]
            .concat(accounts.map(function (a) {
                return '<option value="' + esc(a.name) + '"' + (state.account === a.name ? " selected" : "") + ">" + esc(a.name) + "</option>";
            })).join("");

        const tabs = [
            { k: "report", l: "Report", i: "assessment" },
            { k: "balance", l: "Balance trend", i: "show_chart" },
            { k: "cashflow", l: "Cash flow", i: "bar_chart" }
        ];
        const tabsHTML = tabs.map(function (t) {
            return '<button type="button" role="tab" class="' + (state.tab === t.k ? "on" : "") + '" data-act="tab" data-tab="' + t.k + '" aria-selected="' + (state.tab === t.k) + '">' + icon(t.i) + t.l + "</button>";
        }).join("");

        page.innerHTML = '' +
            '<div class="ap-wrap an">' +
            '  <header class="ap-head">' +
            '    <div><h1>Analytics</h1><p>See where your money comes from and where it goes</p></div>' +
            "  </header>" +
            '  <div class="an-controls">' +
            '    <div class="rp-period">' +
            '      <div class="rp-nav">' +
            '        <button type="button" class="rp-arrow" data-act="prev" aria-label="Previous month">' + icon("chevron_left") + "</button>" +
            '        <button type="button" class="rp-month" data-act="this-month" title="Jump to this month">' + icon("event") + "<span>" + monthLabel(state.y, state.m) + "</span></button>" +
            '        <button type="button" class="rp-arrow" data-act="next" aria-label="Next month">' + icon("chevron_right") + "</button>" +
            "      </div>" +
            "    </div>" +
            '    <div class="an-filter">' +
            '      <select id="an-account" aria-label="Account">' + accountOptions + "</select>" +
            '      <button type="button" class="rp-reset" data-act="reset"' + (state.account === "all" ? " hidden" : "") + ">" + icon("restart_alt") + "Reset</button>" +
            "    </div>" +
            "  </div>" +
            '  <div class="ap-tabs" role="tablist">' + tabsHTML + "</div>" +
            '  <section class="an-panel" id="an-panel"></section>' +
            "</div>";

        renderPanel();
    }

    function renderPanel() {
        const panel = document.getElementById("an-panel");
        if (!panel) return;
        const names = scopeNames();
        if (state.tab === "report") panel.innerHTML = reportHTML(names);
        else if (state.tab === "balance") { panel.innerHTML = balanceHTML(names); attachLineHover(); }
        else { panel.innerHTML = cashflowHTML(names); attachCashflowHover(); }

        document.querySelectorAll(".an .ap-tabs button").forEach(function (b) {
            const on = b.getAttribute("data-tab") === state.tab;
            b.classList.toggle("on", on);
            b.setAttribute("aria-selected", String(on));
        });
    }

    // ---------------------------------------------------------
    // TAB 1: Report (income and expenses by category, compared with last month)
    // ---------------------------------------------------------
    function reportHTML(names) {
        const cur = monthTotals(state.y, state.m, names);
        const pm = prevMonth();
        const prev = monthTotals(pm.y, pm.m, names);
        const prevLabel = shortMonthLabel(pm.y, pm.m);

        const net = cur.income - cur.expense;
        const prevNet = prev.income - prev.expense;

        // No records last month = nothing to compare with, so no percentages (they would all say "New")
        const canCompare = prev.income > 0 || prev.expense > 0;
        const pill = function (a, b, good) { return canCompare ? deltaPill(a, b, good, prevLabel) : ""; };
        const vsText = canCompare ? "vs " + prevLabel : "No " + prevLabel + " data";

        const kpis = '' +
            '<div class="an-kpis">' +
            kpiCard("Income", cur.income, pill(cur.income, prev.income, true), "pos", "in", "trending_up", vsText) +
            kpiCard("Expenses", cur.expense, pill(cur.expense, prev.expense, false), "neg", "out", "shopping_bag", vsText) +
            kpiCard("Net", net, pill(net, prevNet, true), net < 0 ? "neg" : net > 0 ? "pos" : "", "net", "savings", vsText) +
            "</div>";

        if (cur.income === 0 && cur.expense === 0 && prev.income === 0 && prev.expense === 0) {
            return kpis + '<div class="an-card an-empty-card"><div class="ap-empty">' + icon("assessment") + "<strong>Nothing to report yet</strong>" +
                "<p>There is no income or spending in " + esc(monthLabel(state.y, state.m)) + " or the month before. Try another month, or add a record.</p></div></div>";
        }

        return kpis +
            '<div class="an-breakdown">' +
            categoryList("Income", cur.income, cur.inCats, prev.inCats, true, canCompare ? prevLabel : null) +
            categoryList("Expenses", cur.expense, cur.outCats, prev.outCats, false, canCompare ? prevLabel : null) +
            "</div>";
    }

    // One headline number with a tinted icon badge and a comparison line
    function kpiCard(label, value, pill, tone, iconTone, iconName, compareText) {
        const sign = label === "Net" && value > 0 ? "+" : "";
        return '<div class="an-card an-kpi">' +
            '<div class="an-kpi-top"><span class="an-kpi-ico ' + iconTone + '">' + icon(iconName) + '</span><span class="an-kpi-label">' + label + "</span></div>" +
            '<strong class="' + tone + '">' + sign + money(label === "Expenses" ? -value : value) + "</strong>" +
            '<div class="an-kpi-foot">' + (pill || "") + "<span>" + esc(compareText) + "</span></div>" +
            "</div>";
    }

    function categoryList(title, total, curCats, prevCats, goodWhenUp, prevLabel) {
        const keys = {};
        Object.keys(curCats).forEach(function (k) { keys[k] = true; });
        Object.keys(prevCats).forEach(function (k) { keys[k] = true; });
        const list = Object.keys(keys).sort(function (a, b) { return (curCats[b] || 0) - (curCats[a] || 0); });

        let rows = "";
        list.forEach(function (k) {
            const amount = curCats[k] || 0;
            const was = prevCats[k] || 0;
            const share = total > 0 ? (amount / total) * 100 : 0;
            const color = categoryColor(k);
            rows += '' +
                '<li class="an-row' + (amount === 0 ? " idle" : "") + '">' +
                '  <span class="an-ico" style="background:' + tint(color, 0.14) + ";color:" + esc(color) + '">' + icon(getCategoryIcon(k)) + "</span>" +
                '  <div class="an-row-main">' +
                '    <div class="an-row-top"><strong>' + esc(categoryName(k)) + "</strong><span>" + money(amount) + "</span></div>" +
                '    <div class="an-bar"><i style="width:' + share + "%;background:" + esc(color) + '"></i></div>' +
                '    <div class="an-row-sub"><span>' + (amount > 0 ? share.toFixed(0) + "% of " + title.toLowerCase() : "Nothing this month") + "</span>" +
                (prevLabel && (was > 0 || amount > 0) ? deltaPill(amount, was, goodWhenUp, prevLabel) : "") + "</div>" +
                "  </div>" +
                "</li>";
        });

        if (!rows) rows = '<li class="an-none">No ' + title.toLowerCase() + " in this period.</li>";

        return '<section class="an-card an-cat-card">' +
            "<header><h3>" + title + " by category</h3><strong class=\"" + (title === "Expenses" ? "neg" : "pos") + '">' + money(title === "Expenses" ? -total : total) + "</strong></header>" +
            "<ul>" + rows + "</ul></section>";
    }

    // ---------------------------------------------------------
    // Shared chart pieces
    // ---------------------------------------------------------
    function niceScale(lo, hi) {
        if (hi === lo) hi = lo + 1000;
        const raw = (hi - lo) / 4;
        const mag = Math.pow(10, Math.floor(Math.log10(raw)));
        const norm = raw / mag;
        const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
        return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step: step };
    }

    function gridHTML(scale, yPct) {
        let grid = "";
        for (let v = scale.min; v <= scale.max + scale.step / 2; v += scale.step) {
            grid += '<div class="ap-gl' + (Math.abs(v) < scale.step / 1000 ? " zero" : "") + '" style="top:' + yPct(v) + '%"><span>' + short(v) + "</span></div>";
        }
        return grid;
    }

    // Day labels under a chart. centered = bar charts (label sits in the middle of a day's slot)
    function xLabelsHTML(days, xPos) {
        const target = window.innerWidth < 700 ? 4 : 8; // fewer labels on a phone so they do not overlap
        const step = Math.max(1, Math.ceil(days / target));
        let html = "";
        for (let d = 1; d <= days; d += step) {
            html += '<span style="left:' + xPos(d - 1) + '%">' + d + " " + MONTHS[state.m] + "</span>";
        }
        return html;
    }

    function dayWord(day) {
        const d = new Date(state.y, state.m, day);
        return WEEKDAYS[d.getDay()] + ", " + day + " " + MONTHS[state.m] + " " + state.y;
    }

    // ---------------------------------------------------------
    // TAB 2: Balance trend
    // ---------------------------------------------------------
    let lineCtx = null;

    function balanceHTML(names) {
        const D = daysIn(state.y, state.m);
        const monthStart = new Date(state.y, state.m, 1).getTime();
        const isNow = isCurrentMonth();
        const shownDays = isNow ? now.getDate() : D; // the line stops at today for the current month

        // Records of the chosen accounts, oldest first, with their balance effect
        const recs = [];
        for (let i = 0; i < transactions.length; i++) {
            const t = transactions[i];
            const time = new Date(t.date).getTime();
            if (isNaN(time)) continue;
            const d = balanceDelta(t, names);
            if (d !== 0) recs.push({ time: time, d: d });
        }
        recs.sort(function (a, b) { return a.time - b.time; });

        let running = openingTotal(names);
        let p = 0;
        while (p < recs.length && recs[p].time < monthStart) { running += recs[p].d; p++; }
        const startBal = running;

        const pts = [];
        for (let day = 1; day <= shownDays; day++) {
            const limit = new Date(state.y, state.m, day, 23, 59, 59, 999).getTime();
            while (p < recs.length && recs[p].time <= limit) { running += recs[p].d; p++; }
            pts.push({ day: day, value: running });
        }
        const endBal = pts[pts.length - 1].value;

        const pm = prevMonth();
        const prevEnd = balanceAt(new Date(pm.y, pm.m, daysIn(pm.y, pm.m), 23, 59, 59, 999).getTime(), names);
        const prevLabel = monthLabel(pm.y, pm.m);

        let lo = 0, hi = 0;
        pts.forEach(function (pt) { if (pt.value < lo) lo = pt.value; if (pt.value > hi) hi = pt.value; });
        const scale = niceScale(lo, hi);
        const yPct = function (v) { return ((scale.max - v) / (scale.max - scale.min)) * 100; };
        const xPct = function (i) { return D === 1 ? 50 : (i / (D - 1)) * 100; };

        let line = "";
        pts.forEach(function (pt, i) {
            line += (i === 0 ? "M" : "L") + (xPct(i) * 10).toFixed(2) + "," + yPct(pt.value).toFixed(2) + " ";
        });
        const last = pts.length - 1;
        const area = pts.length > 1 ? line + "L" + (xPct(last) * 10).toFixed(2) + ",100 L0,100 Z" : "";

        lineCtx = { pts: pts, D: D, xPct: xPct, yPct: yPct };

        const change = endBal - prevEnd;
        const noData = recs.length === 0 && openingTotal(names) === 0;

        return '' +
            '<section class="an-card an-chart-card">' +
            '<div class="an-head">' +
            '  <div>' +
            '    <span class="ap-eyebrow">Balance ' + (isNow ? "today" : "at end of " + MONTH_NAMES[state.m]) + "</span>" +
            '    <div class="an-big">' + money(endBal) + "</div>" +
            "  </div>" +
            '  <div class="an-vs">' +
            '    <span class="ap-eyebrow">VS ' + esc(prevLabel) + "</span>" +
            "    <div>" + deltaPill(endBal, prevEnd, true, prevLabel) + '<small>' + (change >= 0 ? "+" : "") + money(change) + "</small></div>" +
            "  </div>" +
            "</div>" +
            '<div class="ap-chart" style="--acc:' + CHART_COLOR + '">' +
            '  <div class="ap-plot" id="an-plot">' + gridHTML(scale, yPct) +
            '    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">' +
            '      <defs><linearGradient id="an-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + CHART_COLOR + '" stop-opacity="0.28"/><stop offset="1" stop-color="' + CHART_COLOR + '" stop-opacity="0.02"/></linearGradient></defs>' +
            (area ? '      <path d="' + area + '" fill="url(#an-fill)"/>' : "") +
            (pts.length > 1 ? '      <path d="' + line + '" fill="none" stroke="' + CHART_COLOR + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' : "") +
            "    </svg>" +
            '    <span class="ap-end-dot" style="left:' + xPct(last) + "%;top:" + yPct(pts[last].value) + '%"></span>' +
            '    <div class="ap-hover-line" id="an-hline"></div>' +
            '    <span class="ap-hover-dot" id="an-hdot"></span>' +
            '    <div class="ap-tip" id="an-tip"></div>' +
            '    <div class="ap-hit" id="an-hit"></div>' +
            "  </div>" +
            '  <div class="ap-xlabels">' + xLabelsHTML(D, xPct) + "</div>" +
            "</div>" +
            (noData ? '<p class="ap-empty-note">No money here yet. The line will start moving once you add records.</p>' : "") +
            "</section>";
    }

    function attachLineHover() {
        const hit = document.getElementById("an-hit");
        if (!hit || !lineCtx) return;
        const plot = document.getElementById("an-plot");
        const line = document.getElementById("an-hline");
        const dot = document.getElementById("an-hdot");
        const tip = document.getElementById("an-tip");
        const ctx = lineCtx;

        function show(clientX) {
            const rect = plot.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            const idx = Math.round(ratio * (ctx.D - 1));
            if (idx >= ctx.pts.length) { plot.classList.remove("hovering"); return; } // days that have not happened yet
            const p = ctx.pts[idx];
            const x = ctx.xPct(idx);
            const y = ctx.yPct(p.value);
            line.style.left = x + "%";
            dot.style.left = x + "%";
            dot.style.top = y + "%";
            tip.innerHTML = "<small>" + dayWord(p.day) + "</small><strong>" + money(p.value) + "</strong>";
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

    // ---------------------------------------------------------
    // TAB 3: Cash flow (income bars up, expense bars down, running net line)
    // ---------------------------------------------------------
    let cfCtx = null;

    function cashflowHTML(names) {
        const D = daysIn(state.y, state.m);
        const income = new Array(D).fill(0);
        const expense = new Array(D).fill(0);

        for (let i = 0; i < transactions.length; i++) {
            const t = transactions[i];
            if ((t.type !== "income" && t.type !== "expense") || !names.has(t.account)) continue;
            const d = new Date(t.date);
            if (isNaN(d.getTime()) || d.getFullYear() !== state.y || d.getMonth() !== state.m) continue;
            if (t.type === "income") income[d.getDate() - 1] += t.amount;
            else expense[d.getDate() - 1] += t.amount;
        }

        // Running net (what you have kept so far this month)
        const net = [];
        let run = 0;
        for (let i = 0; i < D; i++) { run += income[i] - expense[i]; net.push(run); }

        const totalIn = income.reduce(function (a, b) { return a + b; }, 0);
        const totalOut = expense.reduce(function (a, b) { return a + b; }, 0);
        const lastDay = isCurrentMonth() ? now.getDate() : D;

        let lo = 0, hi = 0;
        for (let i = 0; i < D; i++) {
            if (-expense[i] < lo) lo = -expense[i];
            if (income[i] > hi) hi = income[i];
            if (i < lastDay) { if (net[i] < lo) lo = net[i]; if (net[i] > hi) hi = net[i]; }
        }
        const scale = niceScale(lo, hi);
        const yPct = function (v) { return ((scale.max - v) / (scale.max - scale.min)) * 100; };
        const xCenter = function (i) { return ((i + 0.5) / D) * 100; };
        const zero = yPct(0);

        let slots = "";
        for (let i = 0; i < D; i++) {
            slots += '<div class="an-slot">' +
                (income[i] > 0 ? '<i class="in" style="top:' + yPct(income[i]) + "%;height:" + (zero - yPct(income[i])) + '%"></i>' : "") +
                (expense[i] > 0 ? '<i class="out" style="top:' + zero + "%;height:" + (yPct(-expense[i]) - zero) + '%"></i>' : "") +
                "</div>";
        }

        let poly = "";
        for (let i = 0; i < lastDay; i++) poly += (xCenter(i) * 10).toFixed(2) + "," + yPct(net[i]).toFixed(2) + " ";

        cfCtx = { D: D, income: income, expense: expense, net: net, lastDay: lastDay };

        const pm = prevMonth();
        const prev = monthTotals(pm.y, pm.m, names);
        const prevLabel = monthLabel(pm.y, pm.m);
        const monthNet = totalIn - totalOut;
        const noData = totalIn === 0 && totalOut === 0;

        return '' +
            '<section class="an-card an-chart-card">' +
            '<div class="an-head">' +
            '  <div>' +
            '    <span class="ap-eyebrow">Net cash flow</span>' +
            '    <div class="an-big ' + (monthNet < 0 ? "neg" : monthNet > 0 ? "pos" : "") + '">' + (monthNet > 0 ? "+" : "") + money(monthNet) + "</div>" +
            '    <div class="an-sub"><span class="pos">' + money(totalIn) + ' in</span><span class="neg">' + money(totalOut) + " out</span></div>" +
            "  </div>" +
            ((prev.income > 0 || prev.expense > 0)
                ? '  <div class="an-vs"><span class="ap-eyebrow">VS ' + esc(prevLabel) + "</span><div>" + deltaPill(monthNet, prev.income - prev.expense, true, prevLabel) + "</div></div>"
                : "") +
            "</div>" +
            '<div class="ap-chart" style="--acc:' + CHART_COLOR + '">' +
            '  <div class="ap-plot" id="an-plot">' + gridHTML(scale, yPct) +
            '    <div class="an-bars" style="grid-template-columns:repeat(' + D + ',1fr)">' + slots + "</div>" +
            '    <svg class="an-netline" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">' +
            (lastDay > 1 ? '<polyline points="' + poly + '" fill="none" stroke="var(--color-text)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' : "") +
            "    </svg>" +
            '    <div class="an-slot-hi" id="an-hi" style="width:' + (100 / D) + '%"></div>' +
            '    <div class="ap-tip" id="an-tip"></div>' +
            '    <div class="ap-hit" id="an-hit"></div>' +
            "  </div>" +
            '  <div class="ap-xlabels">' + xLabelsHTML(D, xCenter) + "</div>" +
            "</div>" +
            '<ul class="an-legend"><li><i class="in"></i>Income</li><li><i class="out"></i>Expense</li><li><i class="net"></i>Net so far</li></ul>' +
            (noData ? '<p class="ap-empty-note">No income or spending in ' + esc(monthLabel(state.y, state.m)) + ".</p>" : "") +
            "</section>";
    }

    function attachCashflowHover() {
        const hit = document.getElementById("an-hit");
        if (!hit || !cfCtx) return;
        const plot = document.getElementById("an-plot");
        const hi = document.getElementById("an-hi");
        const tip = document.getElementById("an-tip");
        const ctx = cfCtx;

        function show(clientX) {
            const rect = plot.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(0.9999, (clientX - rect.left) / rect.width));
            const i = Math.floor(ratio * ctx.D);
            const x = ((i + 0.5) / ctx.D) * 100;
            hi.style.left = (i / ctx.D) * 100 + "%";
            const dayNet = ctx.income[i] - ctx.expense[i];
            tip.innerHTML = "<small>" + dayWord(i + 1) + "</small>" +
                '<div class="an-tip-row"><span>Income</span><b>' + money(ctx.income[i]) + "</b></div>" +
                '<div class="an-tip-row"><span>Expense</span><b>' + money(-ctx.expense[i]) + "</b></div>" +
                '<div class="an-tip-row"><span>Day net</span><b>' + (dayNet > 0 ? "+" : "") + money(dayNet) + "</b></div>" +
                (i < ctx.lastDay ? '<div class="an-tip-row"><span>Net so far</span><b>' + money(ctx.net[i]) + "</b></div>" : "");
            tip.style.left = x + "%";
            tip.style.top = "36px";
            tip.classList.toggle("flip", x > 60);
            plot.classList.add("hovering");
        }
        function hide() { plot.classList.remove("hovering"); }

        hit.addEventListener("mousemove", function (e) { show(e.clientX); });
        hit.addEventListener("mouseleave", hide);
        hit.addEventListener("touchstart", function (e) { if (e.touches[0]) show(e.touches[0].clientX); }, { passive: true });
        hit.addEventListener("touchmove", function (e) { if (e.touches[0]) show(e.touches[0].clientX); }, { passive: true });
        hit.addEventListener("touchend", hide);
    }

    // ---------------------------------------------------------
    // Events
    // ---------------------------------------------------------
    function shiftMonth(delta) {
        const d = new Date(state.y, state.m + delta, 1);
        state.y = d.getFullYear();
        state.m = d.getMonth();
        render();
    }

    page.addEventListener("click", function (e) {
        const el = e.target.closest("[data-act]");
        if (!el) return;
        const act = el.getAttribute("data-act");
        if (act === "prev") shiftMonth(-1);
        else if (act === "next") shiftMonth(1);
        else if (act === "this-month") { state.y = now.getFullYear(); state.m = now.getMonth(); render(); }
        else if (act === "tab") { state.tab = el.getAttribute("data-tab"); renderPanel(); }
        else if (act === "reset") { state.account = "all"; render(); }
    });

    page.addEventListener("change", function (e) {
        if (e.target.id === "an-account") {
            state.account = e.target.value;
            const reset = page.querySelector('[data-act="reset"]');
            if (reset) reset.hidden = state.account === "all";
            renderPanel();
        }
    });

    // ---------------------------------------------------------
    // Called by accounts-page.js (it owns the page switching)
    // ---------------------------------------------------------
    window.renderAnalyticsPage = function () { render(); };
    window.refreshAnalyticsPage = function () { render(); }; // data changed somewhere else
})();
