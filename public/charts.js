// QIONIX - charts.js | Trend hover, donut, balance trend
// Loaded 4th.

// =========================================================
// BALANCE TREND - Interactive hover line like Wallet
// =========================================================
const trendChart = document.getElementById("trend-chart");
const trendHoverLine = document.getElementById("trend-hover-line");
const trendTooltip = document.getElementById("trend-tooltip");
const trendHoverDot = document.getElementById("trend-hover-dot");
const trendSvgEl = trendChart ? trendChart.querySelector(".trend-svg") : null;

if (trendChart && trendHoverLine && trendTooltip && trendHoverDot) {
    // trendPoints is now global and updated by updateBalanceTrend() from real data
    function updateTrendHover(mouseX, chartWidth) {
        if (!trendPoints || trendPoints.length === 0) return;
        // Convert mouse X to viewBox X (0-300)
        const viewBoxX = Math.max(0, Math.min(300, (mouseX / chartWidth) * 300));

        // Find the segment the cursor is over and interpolate value + y position
        let closest = trendPoints[0];
        let y = closest.y;
        let value = closest.value;

        for (let i = 0; i < trendPoints.length - 1; i++) {
            const a = trendPoints[i];
            const b = trendPoints[i + 1];
            if (viewBoxX >= a.x && viewBoxX <= b.x) {
                const ratio = b.x === a.x ? 0 : (viewBoxX - a.x) / (b.x - a.x);
                y = a.y + ratio * (b.y - a.y);
                value = a.value + ratio * (b.value - a.value);
                // Snap the date label to whichever endpoint the cursor is nearer
                closest = ratio < 0.5 ? a : b;
                break;
            }
        }

        // Convert viewBox coords (300 x 80) to real pixels for the HTML overlay elements.
        // The chart height changes with the card, so read the real height every time.
        const plotHeight = (trendSvgEl && trendSvgEl.clientHeight) || 120;
        const pixelX = (viewBoxX / 300) * chartWidth;
        const pixelY = (y / 80) * plotHeight;

        // Position vertical guide line at cursor X
        trendHoverLine.style.left = pixelX + "px";
        trendHoverLine.classList.add("show");

        // Move the dot along the line to the exact hovered point
        trendHoverDot.style.left = pixelX + "px";
        trendHoverDot.style.top = pixelY + "px";
        trendHoverDot.classList.add("show");

        // Position tooltip above the dot: net + day high + each record that day
        let html = "<strong>" + closest.date + " · NGN " + Math.round(value).toLocaleString() + "</strong>";
        if (closest.high !== undefined && closest.high !== value) {
            html += "<br><span>Day high NGN " + Math.round(closest.high).toLocaleString() + "</span>";
        }
        if (closest.list && closest.list.length > 0) {
            const show = closest.list.slice(0, 4);
            for (let li = 0; li < show.length; li++) {
                if (show[li].type === "transfer") {
                    html += "<br><span>⇄ NGN " + Number(show[li].amount).toLocaleString() + " " + show[li].from + " → " + show[li].to + "</span>";
                } else {
                    const sign = show[li].type === "income" ? "+" : "-";
                    html += "<br><span>" + sign + "NGN " + Number(show[li].amount).toLocaleString() + " " + (CATEGORY_NAMES[show[li].category] || show[li].category) + "</span>";
                }
            }
            if (closest.list.length > 4) {
                html += "<br><span>+" + (closest.list.length - 4) + " more</span>";
            }
        } else {
            html += "<br><span>No records</span>";
        }
        trendTooltip.innerHTML = html;

        // Sit the tooltip ABOVE the dot (or below it when there is no room above),
        // and keep it inside the chart horizontally
        const tipW = trendTooltip.offsetWidth;
        const tipH = trendTooltip.offsetHeight;
        const tipLeft = Math.max(tipW / 2, Math.min(chartWidth - tipW / 2, pixelX));
        let tipTop = pixelY - tipH - 14;
        if (tipTop < -8) tipTop = pixelY + 14;
        trendTooltip.style.left = tipLeft + "px";
        trendTooltip.style.top = tipTop + "px";
        trendTooltip.classList.add("show");
    }

    trendChart.addEventListener("mousemove", function (e) {
        const rect = trendChart.getBoundingClientRect();
        updateTrendHover(e.clientX - rect.left, rect.width);
    });

    // Support touch/drag on mobile too
    trendChart.addEventListener("touchmove", function (e) {
        const rect = trendChart.getBoundingClientRect();
        const touch = e.touches[0];
        if (touch) {
            updateTrendHover(touch.clientX - rect.left, rect.width);
        }
    }, { passive: true });

    function hideTrendHover() {
        trendHoverLine.classList.remove("show");
        trendTooltip.classList.remove("show");
        trendHoverDot.classList.remove("show");
    }

    trendChart.addEventListener("mouseleave", hideTrendHover);
    trendChart.addEventListener("touchend", hideTrendHover);
}


// =========================================================
// EXPENSES STRUCTURE - Donut from real expenses per category
// Why? Donut was hardcoded red. Now each category gets a slice.
// How? Loop expenses, sum per category, build conic-gradient.
// =========================================================
const CATEGORY_COLORS = {
    food: "#e74c3c",
    transport: "#f39c12",
    data: "#9b59b6",
    entertainment: "#e91e63",
    shopping: "#3498db",
    groceries: "#27ae60",
    salary: "#2ecc71",
    other: "#95a5a6",
    transfer: "#2563eb"
};

const CATEGORY_NAMES = {
    salary: "Salary",
    food: "Food & Drinks",
    transport: "Transport",
    data: "Data",
    entertainment: "Entertainment",
    shopping: "Shopping",
    groceries: "Groceries",
    other: "Other",
    transfer: "Transfer"
};

function updateExpensesStructure(totalExpenses) {
    const donut = document.getElementById("expenses-donut");
    const center = document.getElementById("expenses-center");
    const totalEl = document.getElementById("expenses-total");
    const legendList = document.getElementById("donut-legend-list");
    if (!donut || !legendList) return;

    // 1. Sum expenses per category (selected period only)
    const perCategory = {};
    const visibleExp = getVisibleTransactions();
    for (let i = 0; i < visibleExp.length; i++) {
        if (visibleExp[i].type === "expense") {
            const cat = visibleExp[i].category;
            if (!perCategory[cat]) perCategory[cat] = 0;
            perCategory[cat] = perCategory[cat] + visibleExp[i].amount;
        }
    }

    // 2. Update total text
    if (totalEl) {
        if (totalExpenses === 0) totalEl.textContent = "NGN 0.00";
        else totalEl.textContent = "-NGN " + Number(totalExpenses).toLocaleString() + ".00";
    }

    // 3. Empty case
    const cats = Object.keys(perCategory);
    if (cats.length === 0) {
        donut.style.background = "var(--color-bg)";
        if (center) center.textContent = "No data";
        legendList.innerHTML = '<div class="donut-legend"><span class="dot" style="background:var(--color-border-input)"></span> No expenses yet<span class="legend-val"></span></div>';
        return;
    }

    // 4. Build conic-gradient slices
    let gradientParts = [];
    let currentPercent = 0;
    for (let i = 0; i < cats.length; i++) {
        const cat = cats[i];
        const percent = (perCategory[cat] / totalExpenses) * 100;
        const color = CATEGORY_COLORS[cat] || "#95a5a6";
        gradientParts.push(color + " " + currentPercent + "% " + (currentPercent + percent) + "%");
        currentPercent = currentPercent + percent;
    }
    donut.style.background = "conic-gradient(" + gradientParts.join(", ") + ")";

    if (center) center.textContent = "All categories";

    // 5. Rebuild legend rows
    legendList.innerHTML = "";
    for (let i = 0; i < cats.length; i++) {
        const cat = cats[i];
        const color = CATEGORY_COLORS[cat] || "#95a5a6";
        const row = document.createElement("div");
        row.className = "donut-legend";

        const dot = document.createElement("span");
        dot.className = "dot";
        dot.style.background = color;

        const name = document.createTextNode(" " + (CATEGORY_NAMES[cat] || cat) + " ");

        const val = document.createElement("span");
        val.className = "legend-val";
        val.textContent = "NGN " + Number(perCategory[cat]).toLocaleString();

        row.appendChild(dot);
        row.appendChild(name);
        row.appendChild(val);
        legendList.appendChild(row);
    }
}

// =========================================================
// BALANCE TREND - Line from real cumulative balance
// Why? Line was hardcoded M0,15... Now it follows transactions sorted by date.
// How? Sort by date, cumulative income-expenses, map to SVG 0-300 x 0-80 y.
// =========================================================
let trendPoints = [];

function updateBalanceTrend(balance) {
    const svgPath = document.querySelector(".trend-path");
    const svgArea = document.querySelector(".trend-area");
    const trendBalanceEl = document.getElementById("trend-balance-amount");
    const labelsWrap = document.querySelector(".trend-labels");
    if (!svgPath || !svgArea) return;

    if (trendBalanceEl) {
        trendBalanceEl.textContent = "NGN " + Number(balance).toLocaleString() + ".00";
    }

    // 1. Sort visible transactions by date (oldest first) - respects calendar filter
    const visibleTrend = getVisibleTransactions();
    const sorted = visibleTrend.slice().sort(function (a, b) {
        return new Date(a.date) - new Date(b.date);
    });

    // 2. Empty in view: flat line at carried balance + labels for the selected range
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const fmtDay = function (d) {
        return d.getDate() + " " + monthNames[d.getMonth()];
    };
    if (sorted.length === 0) {
        // Opening carried from history before the viewed range (openings + prior net, account-aware)
        const rg0 = getActiveRange();
        let opening0 = openingsInScope();
        if (rg0) {
            for (let i = 0; i < transactions.length; i++) {
                const t = transactions[i];
                if (!inSelectedAccount(t)) continue;
                if (new Date(t.date) < rg0.start) {
                    if (t.type === "income") opening0 = opening0 + t.amount;
                    else if (t.type === "expense") opening0 = opening0 - t.amount;
                }
            }
        }
        const y0 = opening0 === 0 ? 80 : 80 - 40;
        trendPoints = [{ x: 0, y: 80, value: opening0, date: "Start" }, { x: 300, y: 80, value: opening0, date: "Now" }];
        // Flat at opening level (map opening into view; empty view min=max=opening so y=80 when 0 handled above)
        svgPath.setAttribute("d", "M0,80 L300,80");
        svgArea.setAttribute("d", "M0,80 L300,80 L300,80 L0,80 Z");
        // Labels follow selected range (or current month when All+no data at all)
        let labStart, labEnd;
        if (rg0) {
            labStart = rg0.start;
            labEnd = rg0.end;
        } else {
            labStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            labEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        }
        if (labelsWrap) {
            const spans = labelsWrap.querySelectorAll("span");
            for (let si = 0; si < spans.length; si++) {
                const t = spans.length === 1 ? 1 : si / (spans.length - 1);
                const tt = new Date(labStart.getTime() + t * (labEnd.getTime() - labStart.getTime()));
                spans[si].textContent = fmtDay(tt);
            }
        }
        const yAxisEmpty = document.querySelectorAll(".trend-yaxis span");
        if (yAxisEmpty.length >= 5) {
            const lbl = opening0 === 0 ? "0" : (Math.abs(opening0) >= 1000 ? ((Math.round(opening0 / 100) / 10) + "K") : ("" + Math.round(opening0)));
            for (let yi = 0; yi < yAxisEmpty.length; yi++) yAxisEmpty[yi].textContent = lbl;
        }
        if (trendBalanceEl) {
            trendBalanceEl.textContent = "NGN " + Number(balance).toLocaleString() + ".00";
        }
        return;
    }

    // 3. Cumulative balance after each transaction (transfers net zero, skip)
    let running = 0;
    const balances = [];
    for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].type === "income") running = running + sorted[i].amount;
        else if (sorted[i].type === "expense") running = running - sorted[i].amount;
        balances.push(running);
    }

    // 4. Scale Y: max balance -> top (y=0), min -> bottom (y=80) so it touches grid
    let maxVal = balances[0];
    let minVal = balances[0];
    for (let i = 1; i < balances.length; i++) {
        if (balances[i] > maxVal) maxVal = balances[i];
        if (balances[i] < minVal) minVal = balances[i];
    }
    // Include 0 in range so line doesn't fly
    if (minVal > 0) minVal = 0;
    if (maxVal < 0) maxVal = 0;
    let range = maxVal - minVal;
    if (range === 0) range = 1;

    // 5. Range-based daily line so week/day/custom work (graph was month-locked before)
    // X spans the selected range (week = 7 days, day = intraday jump, month = days, year/All = buckets).
    // One point per day (net close). Tooltip lists every record that day + day high.
    const rg = getActiveRange();
    let rangeStart, rangeEnd;
    if (rg) {
        rangeStart = startOfDay(rg.start);
        rangeEnd = startOfDay(rg.end);
    } else {
        // All: min to max visible date
        let mn = new Date(sorted[0].date);
        let mx = new Date(sorted[0].date);
        for (let i = 1; i < sorted.length; i++) {
            const d = new Date(sorted[i].date);
            if (d < mn) mn = d;
            if (d > mx) mx = d;
        }
        rangeStart = startOfDay(mn);
        rangeEnd = startOfDay(mx);
    }
    // Clip future (no future transactions allowed): stop line at today
    const todayClip = startOfDay(new Date());
    if (rangeEnd > todayClip) rangeEnd = todayClip;
    // Day count in range (min 1)
    const dayMs = 24 * 60 * 60 * 1000;
    let nDays = Math.round((rangeEnd - rangeStart) / dayMs) + 1;
    if (nDays < 1) nDays = 1;
    if (nDays > 400) nDays = 400; // safety cap for huge All ranges (buckets below handle it)
    const dayAt = function (idx) {
        return new Date(rangeStart.getTime() + idx * dayMs);
    };
    const dayX = function (idx) {
        return nDays === 1 ? 300 : (idx / (nDays - 1)) * 300;
    };
    // Opening balance before range start: openings + prior net (transfers don't change total)
    let opening = openingsInScope();
    for (let i = 0; i < transactions.length; i++) {
        const t = transactions[i];
        if (!inSelectedAccount(t)) continue;
        if (new Date(t.date) < rangeStart) {
            if (t.type === "income") opening = opening + t.amount;
            else if (t.type === "expense") opening = opening - t.amount;
        }
    }
    // Buckets: 1 point per day (single-day range gets opening + close so jump shows)
    const closes = [];
    const details = [];
    let runningDay = opening;
    maxVal = opening;
    minVal = opening;
    // Single-day range: two points (opening at x=0, close at x=300)
    const singleDay = (nDays === 1);
    const iterDays = singleDay ? 1 : nDays;
    for (let di = 0; di < iterDays; di++) {
        const cur = dayAt(di);
        let dayHigh = runningDay;
        let dayLow = runningDay;
        const list = [];
        for (let i = 0; i < sorted.length; i++) {
            const d = new Date(sorted[i].date);
            if (d.getFullYear() === cur.getFullYear() && d.getMonth() === cur.getMonth() && d.getDate() === cur.getDate()) {
                list.push(sorted[i]);
                if (sorted[i].type === "income") runningDay = runningDay + sorted[i].amount;
                else if (sorted[i].type === "expense") runningDay = runningDay - sorted[i].amount;
                if (runningDay > dayHigh) dayHigh = runningDay;
                if (runningDay < dayLow) dayLow = runningDay;
            }
        }
        closes.push(runningDay);
        details.push({ list: list, high: dayHigh, low: dayLow });
        if (runningDay > maxVal) maxVal = runningDay;
        if (runningDay < minVal) minVal = runningDay;
        if (dayHigh > maxVal) maxVal = dayHigh;
        if (dayLow < minVal) minVal = dayLow;
    }
    if (minVal > 0) minVal = 0;
    if (maxVal < 0) maxVal = 0;
    range = maxVal - minVal;
    if (range === 0) range = 1;
    const yFor = function (bal) {
        return 80 - ((bal - minVal) / range) * 80;
    };
    trendPoints = [];
    if (singleDay) {
        trendPoints.push({ x: 0, y: yFor(opening), value: opening, date: fmtDay(rangeStart), list: [], high: opening });
        trendPoints.push({ x: 300, y: yFor(closes[0]), value: closes[0], date: fmtDay(rangeStart), list: details[0].list, high: details[0].high });
    } else {
        for (let di = 0; di < nDays; di++) {
            const cur = dayAt(di);
            trendPoints.push({
                x: dayX(di),
                y: yFor(closes[di]),
                value: closes[di],
                date: fmtDay(cur),
                list: details[di].list,
                high: details[di].high
            });
        }
    }

    // 6. Build SVG path strings
    let lineD = "M" + trendPoints[0].x + "," + trendPoints[0].y;
    for (let i = 1; i < trendPoints.length; i++) {
        lineD = lineD + " L" + trendPoints[i].x + "," + trendPoints[i].y;
    }
    svgPath.setAttribute("d", lineD);
    svgArea.setAttribute("d", lineD + " L300,80 L0,80 Z");

    // 7. Scale labels span the selected range on every tick (week/day/month all correct)
    if (labelsWrap && trendPoints.length > 0) {
        const spans = labelsWrap.querySelectorAll("span");
        for (let si = 0; si < spans.length; si++) {
            const t = spans.length === 1 ? 1 : si / (spans.length - 1);
            const idx = Math.round(t * (trendPoints.length - 1));
            spans[si].textContent = trendPoints[idx].date;
        }
    }

    // 8. Update Y-axis evenly: max, 75%, 50%, 25%, min (e.g., 10k -> 10K, 7.5K, 5K, 2.5K, 0)
    const yAxis = document.querySelectorAll(".trend-yaxis span");
    if (yAxis.length >= 5) {
        const step = (maxVal - minVal) / 4;
        const formatY = function (v) {
            if (Math.abs(v) >= 1000) {
                const k = v / 1000;
                // Keep 1 decimal only if needed (7.5K not 7.50K, 10K not 10.0K)
                const rounded = Math.round(k * 10) / 10;
                return (rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)) + "K";
            }
            return "" + Math.round(v);
        };
        yAxis[0].textContent = formatY(maxVal);
        yAxis[1].textContent = formatY(maxVal - step);
        yAxis[2].textContent = formatY(maxVal - step * 2);
        yAxis[3].textContent = formatY(maxVal - step * 3);
        yAxis[4].textContent = formatY(minVal);
    }
}
