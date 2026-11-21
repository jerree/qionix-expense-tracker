// QIONIX - dashboard.js | Totals, gauges, bars, accounts render/delete/create, VS badges
// Loaded 3rd.

// =========================================================
// STAGE 3: CALCULATIONS - Total Income, Expenses, Balance
// What is it? Loop + if/else + arithmetic to sum amounts
// Why? Dashboard must show real totals, not hardcoded 28K
// How? For each transaction, if income add to income else to expenses, balance = income - expenses
// =========================================================
// Currency metadata for the "Balance by Currencies" card
const CURRENCY_INFO = {
    NGN: { name: "Nigerian Naira", symbol: "\u20A6" },
    USD: { name: "US Dollar", symbol: "$" },
    EUR: { name: "Euro", symbol: "\u20AC" },
    GBP: { name: "British Pound", symbol: "\u00A3" },
    GHS: { name: "Ghanaian Cedi", symbol: "\u20B5" },
    KES: { name: "Kenyan Shilling", symbol: "KSh" }
};

// Balance by Currencies = a converter. Row 1 is the total balance in NGN (main currency);
// the next two rows are that SAME total shown in the 2 currencies the user picked.
// (displayCurrencies + exchangeRates live in main.js)
function renderCurrencyBalances(balanceNGN) {
    const list = document.getElementById("currency-list");
    if (!list) return;
    const money = function (n) {
        return Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    const rows = [{ code: "NGN", sub: "Main currency", amount: balanceNGN }];
    displayCurrencies.forEach(function (code) {
        const rate = Number(exchangeRates[code]) || 1;
        rows.push({
            code: code,
            sub: "1 " + code + " = NGN " + rate.toLocaleString(),
            amount: balanceNGN / rate
        });
    });

    list.innerHTML = "";
    rows.forEach(function (r) {
        const info = CURRENCY_INFO[r.code] || { name: r.code, symbol: r.code.charAt(0) };
        const neg = r.amount < 0;
        const li = document.createElement("li");
        li.className = "currency-item";
        li.innerHTML =
            '<div class="currency-badge">' + info.symbol + '</div>' +
            '<div class="currency-info"><strong>' + info.name + '</strong><small>' + r.sub + '</small></div>' +
            '<div class="currency-figures"><strong class="' + (neg ? "negative" : "") + '">' +
            (neg ? "-" : "") + r.code + " " + money(r.amount) + '</strong></div>';
        list.appendChild(li);
    });
}

function updateDashboard() {
    let totalIncome = 0;
    let totalExpenses = 0;

    // Loop through visible transactions only (period + account). Transfers move money, not income/expenses.
    const visible = getVisibleTransactions();
    for (let i = 0; i < visible.length; i++) {
        if (visible[i].type === "income") {
            totalIncome = totalIncome + visible[i].amount;
        } else if (visible[i].type === "expense") {
            totalExpenses = totalExpenses + visible[i].amount;
        }
    }

    // Balance includes opening capital + net flow
    const balance = openingsInScope() + totalIncome - totalExpenses;

    // Find dashboard elements (keep old IDs for JS)
    const balanceEl = document.getElementById("balance-amount");
    const incomeEl = document.getElementById("income-amount");
    const expenseEl = document.getElementById("expense-amount");
    const fullBalanceEl = document.querySelector(".full-balance");
    const cashFlowIncomeBar = document.querySelector(".cashflow-row .progress-fill.green");
    const cashFlowExpenseBar = document.querySelector(".cashflow-row .progress-fill.red");
    const cashFlowAmount = document.querySelector(".cashflow-row + .cashflow-row .cf-label strong");
    // Actually cashFlow total is balance, update both cashflow rows

    // Helper to format: 27600 -> 27.6K or 27,600
    function formatShort(num) {
        if (Math.abs(num) >= 1000) {
            return (num / 1000).toFixed(1) + "K";
        }
        return num.toString();
    }

    function formatFull(num) {
        return "NGN " + Number(num).toLocaleString() + ".00";
    }

    // Update text - keep short like 28K for gauges, full elsewhere
    const cashflowEl = document.getElementById("cashflow-amount");
    if (balanceEl) balanceEl.textContent = formatShort(balance);
    if (incomeEl) incomeEl.textContent = formatFull(totalIncome);
    if (expenseEl) expenseEl.textContent = formatShort(-totalExpenses); // spending shows negative
    if (cashflowEl) cashflowEl.textContent = formatShort(balance); // cash flow = same as balance for now
    if (fullBalanceEl) fullBalanceEl.textContent = formatFull(balance);

    // Quick stats row under the gauges (same period + account filter as everything else)
    const statIncomeEl = document.getElementById("stat-income");
    const statExpenseEl = document.getElementById("stat-expense");
    const statSavingsEl = document.getElementById("stat-savings");
    if (statIncomeEl) statIncomeEl.textContent = formatShort(totalIncome);
    if (statExpenseEl) statExpenseEl.textContent = formatShort(totalExpenses);
    if (statSavingsEl) {
        // Savings rate = share of income you kept. No income = nothing to measure yet.
        if (totalIncome > 0) {
            statSavingsEl.textContent = Math.round(((totalIncome - totalExpenses) / totalIncome) * 100) + "%";
        } else {
            statSavingsEl.textContent = "\u2014";
        }
    }

    // Update Cash Flow bars (Income green, Expense red)
    const total = totalIncome + totalExpenses;
    let incomePercent = 0;
    let expensePercent = 0;
    if (total > 0) {
        incomePercent = (totalIncome / total) * 100;
        expensePercent = (totalExpenses / total) * 100;
    }
    if (cashFlowIncomeBar) cashFlowIncomeBar.style.width = incomePercent + "%";
    if (cashFlowExpenseBar) cashFlowExpenseBar.style.width = expensePercent + "%";

    // Update Cash Flow amount (-NGN 3,300) - first cashflow-row is income, second is expense
    const cashFlowRows = document.querySelectorAll(".cashflow-row .cf-label strong");
    if (cashFlowRows.length >= 2) {
        // First row already incomeEl, second is expense
        cashFlowRows[1].textContent = "-NGN " + Number(totalExpenses).toLocaleString() + ".00";
    }
    // Update the main Cash Flow balance (-NGN 3,300)
    const cashFlowBalance = document.querySelector(".board-card:nth-child(6) .card-subtitle strong");
    if (cashFlowBalance) {
        cashFlowBalance.textContent = formatFull(balance);
    }

    // Move gauge needles - fixed scale so small money stays left
    // Old bug: max = max(income, expenses), so ₦1 / ₦1 = 100% = full green. Felt wrong.
    // Fix: fixed GAUGE_SCALE = 100000. ₦1 / 100000 = almost 0 = stays left. ₦100k = full.
    // Gauge sweep: -135deg (min) -> 0deg (mid) -> +135deg (max). Formula: -135 + ratio * 270.
    // Gauges all health % (no absolute) but different windows so pins can differ:
    // Balance = all-time kept/earned. Cash Flow = momentum vs prev month. Spending = this month spent/earned.
    let balanceAngle = 0;
    let cashFlowAngle = 0;
    let spendingAngle = 0;
    // Opening capital counts as kept money even with no income yet
    const hasOpenings = openingsInScope() !== 0;
    if (totalIncome === 0 && totalExpenses === 0 && !hasOpenings) {
        // Truly empty: all middle
        balanceAngle = 0;
        cashFlowAngle = 0;
        spendingAngle = 0;
    } else if (visible.length === 0 && hasOpenings) {
        // Only openings (e.g., filtered month with no records): balance green, flows middle
        balanceAngle = 135;
        cashFlowAngle = 0;
        spendingAngle = 0;
    } else if (visible.length === 0) {
        balanceAngle = 0;
        cashFlowAngle = 0;
        spendingAngle = 0;
    } else {
        // 1. Balance: health kept/earned incl. openings (0 or negative -> red, 100% -> green)
        if (totalIncome === 0) {
            balanceAngle = balance > 0 ? 135 : -135;
        } else {
            const balRatio = Math.max(0, Math.min(1, balance / (totalIncome + openingsInScope())));
            balanceAngle = -135 + balRatio * 270;
        }
        // 2. Cash Flow + 3. Spending: latest month inside the selected period
        let latestYear = new Date(visible[0].date).getFullYear();
        let latestMonth = new Date(visible[0].date).getMonth();
        let latestTime = new Date(visible[0].date).getTime();
        for (let i = 1; i < visible.length; i++) {
            const t = new Date(visible[i].date).getTime();
            if (t > latestTime) {
                latestTime = t;
                latestYear = new Date(visible[i].date).getFullYear();
                latestMonth = new Date(visible[i].date).getMonth();
            }
        }
        let mIncome = 0;
        let mExpenses = 0;
        // Previous month for momentum (cash flow) - from full history so comparison works
        let pYear = latestYear;
        let pMonth = latestMonth - 1;
        if (pMonth < 0) {
            pMonth = 11;
            pYear = pYear - 1;
        }
        let pIncome = 0;
        let pExpenses = 0;
        for (let i = 0; i < visible.length; i++) {
            const d = new Date(visible[i].date);
            if (d.getFullYear() === latestYear && d.getMonth() === latestMonth) {
                if (visible[i].type === "income") mIncome = mIncome + visible[i].amount;
                else if (visible[i].type === "expense") mExpenses = mExpenses + visible[i].amount;
            }
        }
        for (let i = 0; i < transactions.length; i++) {
            const t = transactions[i];
            if (!inSelectedAccount(t)) continue;
            const d = new Date(t.date);
            if (d.getFullYear() === pYear && d.getMonth() === pMonth) {
                if (t.type === "income") pIncome = pIncome + t.amount;
                else if (t.type === "expense") pExpenses = pExpenses + t.amount;
            }
        }
        // Spending: this month spend rate (level). 0 spend = green right, 100%+ = red left.
        if (mIncome === 0 && mExpenses === 0) {
            spendingAngle = 0;
        } else if (mIncome === 0) {
            spendingAngle = -135;
        } else {
            const spRatio = Math.max(0, Math.min(1, mExpenses / mIncome));
            spendingAngle = 135 - spRatio * 270;
        }
        // Cash Flow: momentum vs previous month net (change). NEW with no history = middle.
        // Maps -100%..+100% to -135..+135 so it differs from Spending level.
        const mNet = mIncome - mExpenses;
        const pNet = pIncome - pExpenses;
        const hasPrev = (pIncome !== 0 || pExpenses !== 0);
        if (!hasPrev) {
            if (mIncome === 0 && mExpenses === 0) cashFlowAngle = 0;
            else if (mNet === 0) cashFlowAngle = 0;
            else cashFlowAngle = mNet > 0 ? 135 : -135;
        } else if (pNet === 0) {
            if (mNet === 0) cashFlowAngle = 0;
            else cashFlowAngle = mNet > 0 ? 135 : -135;
        } else {
            let pct = ((mNet - pNet) / Math.abs(pNet)) * 100;
            if (pct > 100) pct = 100;
            if (pct < -100) pct = -100;
            cashFlowAngle = (pct / 100) * 135;
        }
    }

    const needleBalance = document.querySelector(".needle-balance");
    const needleCashflow = document.querySelector(".needle-cashflow");
    const needleSpending = document.querySelector(".needle-spending");
    if (needleBalance) needleBalance.style.transform = "translateX(-50%) rotate(" + balanceAngle + "deg)";
    if (needleCashflow) needleCashflow.style.transform = "translateX(-50%) rotate(" + cashFlowAngle + "deg)";
    if (needleSpending) needleSpending.style.transform = "translateX(-50%) rotate(" + spendingAngle + "deg)";

    // Update accounts sidebar per account: opening + income - expenses + transfers
    const accountCards = document.querySelectorAll(".accounts-sidebar .account-card:not(.add-account)");
    // Real balances: every account (even excluded ones), same period filter
    const visibleAll = getVisibleTransactions(true);
    for (let a = 0; a < accounts.length; a++) {
        let accBalance = openingNGN(accounts[a]); // always NGN
        for (let i = 0; i < visibleAll.length; i++) {
            const t = visibleAll[i];
            if (t.type === "transfer") {
                if (t.from === accounts[a].name) accBalance = accBalance - t.amount;
                if (t.to === accounts[a].name) accBalance = accBalance + t.amount;
            } else if (t.account === accounts[a].name) {
                if (t.type === "income") {
                    accBalance = accBalance + t.amount;
                } else if (t.type === "expense") {
                    accBalance = accBalance - t.amount;
                }
            }
        }
        // Card order matches accounts order, update its <strong>
        if (accountCards[a]) {
            const strong = accountCards[a].querySelector("strong");
            if (strong) strong.textContent = formatFull(accBalance);
            // Hint when the account was opened in another currency
            const cur = accounts[a].currency || "NGN";
            accountCards[a].title = cur === "NGN" ? "" :
                "Opened with " + cur + " " + Number(accounts[a].opening || 0).toLocaleString() + " at NGN " + Number(accounts[a].rate).toLocaleString() + " per " + cur;
        }
    }
    renderCurrencyBalances(balance); // total balance, converted

    // Dynamic charts from real data
    updateExpensesStructure(totalExpenses);
    updateBalanceTrend(balance);
    updateVsBadges();

    console.log("Dashboard updated:", { totalIncome, totalExpenses, balance });
}

// =========================================================
// VS BADGES - This month vs previous month % change
// Why? Badges were hardcoded -11% / -100%. Now real.
// How? Sum income/expenses per month, pct = (curr-prev)/|prev|*100.
// =========================================================
function updateVsBadges() {
    const trendBadge = document.getElementById("trend-vs-badge");
    const expensesBadge = document.getElementById("expenses-vs-badge");
    const cashflowBadge = document.getElementById("cashflow-vs-badge");

    // Helper: pro percent change, uncapped (300% allowed), NEW when prev=0
    // Returns { pct, isNew }. prev=0 + curr=0 => 0%. prev=0 + curr!=0 => NEW (no real %).
    const pctChange = function (curr, prev) {
        if (prev === 0) {
            if (curr === 0) return { pct: 0, isNew: false };
            return { pct: 0, isNew: true, dir: curr > 0 ? 1 : -1 };
        }
        return { pct: ((curr - prev) / Math.abs(prev)) * 100, isNew: false };
    };

    // Helper: paint badge (arrow + color). NEW shows as "↑ NEW" / "↓ NEW".
    const paintBadge = function (el, result, invert) {
        if (!el) return;
        if (result.isNew) {
            const up = result.dir > 0;
            let cls = "badge flat";
            if (!invert) cls = up ? "badge up" : "badge down";
            else cls = up ? "badge down" : "badge up";
            el.className = cls;
            el.textContent = (up ? "↑" : "↓") + " NEW";
            return;
        }
        const rounded = Math.round(result.pct);
        let arrow = "→";
        if (rounded > 0) arrow = "↑";
        else if (rounded < 0) arrow = "↓";
        let cls = "badge flat";
        if (rounded === 0) {
            cls = "badge flat";
        } else if (!invert) {
            cls = rounded > 0 ? "badge up" : "badge down";
        } else {
            cls = rounded > 0 ? "badge down" : "badge up";
        }
        el.className = cls;
        if (rounded < 0) el.textContent = arrow + " -" + Math.abs(rounded) + "%";
        else el.textContent = arrow + " " + Math.abs(rounded) + "%";
    };

    if (transactions.length === 0) {
        const zero = { pct: 0, isNew: false };
        paintBadge(trendBadge, zero);
        paintBadge(expensesBadge, zero, true);
        paintBadge(cashflowBadge, zero);
        return;
    }

    // Use latest transaction month as "this month" so demo always works
    // Find latest month (beginner loop)
    let latestYear = new Date(transactions[0].date).getFullYear();
    let latestMonth = new Date(transactions[0].date).getMonth();
    let latestTime = new Date(transactions[0].date).getTime();
    for (let i = 1; i < transactions.length; i++) {
        const t = new Date(transactions[i].date).getTime();
        if (t > latestTime) {
            latestTime = t;
            latestYear = new Date(transactions[i].date).getFullYear();
            latestMonth = new Date(transactions[i].date).getMonth();
        }
    }
    // Previous month (handles January -> December last year)
    let prevYear = latestYear;
    let prevMonth = latestMonth - 1;
    if (prevMonth < 0) {
        prevMonth = 11;
        prevYear = prevYear - 1;
    }

    let currIncome = 0;
    let currExpenses = 0;
    let prevIncome = 0;
    let prevExpenses = 0;
    for (let i = 0; i < transactions.length; i++) {
        const t = transactions[i];
        if (!inSelectedAccount(t)) continue;
        if (t.type !== "income" && t.type !== "expense") continue;
        const d = new Date(t.date);
        const y = d.getFullYear();
        const m = d.getMonth();
        if (y === latestYear && m === latestMonth) {
            if (t.type === "income") currIncome = currIncome + t.amount;
            else currExpenses = currExpenses + t.amount;
        } else if (y === prevYear && m === prevMonth) {
            if (t.type === "income") prevIncome = prevIncome + t.amount;
            else prevExpenses = prevExpenses + t.amount;
        }
    }

    const currNet = currIncome - currExpenses;
    const prevNet = prevIncome - prevExpenses;

    paintBadge(trendBadge, pctChange(currNet, prevNet));
    paintBadge(expensesBadge, pctChange(currExpenses, prevExpenses), true);
    paintBadge(cashflowBadge, pctChange(currNet, prevNet));
}

// Delete a transaction by id (beginner-friendly: loop + splice)

// =========================================================
// ACCOUNTS - Dynamic (user creates, form reflects)
// =========================================================

const accountsSidebar = document.getElementById("accounts-sidebar");
const addAccountBtn = document.getElementById("add-account-btn");
const accountSelect = document.getElementById("account");

// Render sidebar cards and form dropdown from accounts array
function renderAccounts() {
    // Keep title (first child) and add button + note (last 2), remove old cards
    const cards = accountsSidebar.querySelectorAll(".account-card:not(.add-account)");
    cards.forEach(function (c) { c.remove(); });

    // Insert each account before the + Add Account button
    for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        const card = document.createElement("div");
        card.className = "account-card";
        card.style.background = acc.color || DEFAULT_ACCOUNT_COLOR;
        card.style.color = readableTextColor(acc.color || DEFAULT_ACCOUNT_COLOR);
        // Use Material Icon
        const icon = document.createElement("span");
        icon.className = "material-icons acc-icon";
        icon.textContent = acc.icon;

        const textWrap = document.createElement("div");
        textWrap.style.flex = "1";
        const small = document.createElement("small");
        small.textContent = acc.name;
        if (acc.excluded) {
            const ex = document.createElement("span");
            ex.className = "material-icons acc-excluded";
            ex.textContent = "visibility_off";
            ex.title = "Excluded from statistics";
            small.appendChild(ex);
        }
        const strong = document.createElement("strong");
        strong.textContent = "NGN 0.00"; // updated below by updateDashboard

        textWrap.appendChild(small);
        textWrap.appendChild(strong);
        card.appendChild(icon);
        card.appendChild(textWrap);

        // Click-to-filter: click card isolates it, click again shows All
        if (selectedAccount === acc.name) {
            card.classList.add("selected");
        }
        (function (accountName, cardEl) {
            cardEl.addEventListener("click", function (e) {
                // Don't trigger when clicking the delete ✕
                if (e.target && e.target.classList && e.target.classList.contains("btn-delete-account")) return;
                if (selectedAccount === accountName) selectedAccount = null;
                else selectedAccount = accountName;
                renderAccounts();
                displayTransactions();
            });
        })(acc.name, card);

        // Delete button for this account
        const delAccBtn = document.createElement("button");
        delAccBtn.className = "btn-delete-account";
        delAccBtn.innerHTML = "✕";
        delAccBtn.title = "Delete " + acc.name;
        // Use closure to capture name
        (function (accountName) {
            delAccBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                deleteAccount(accountName);
            });
        })(acc.name);

        card.appendChild(delAccBtn);

        // Insert before Add button
        accountsSidebar.insertBefore(card, addAccountBtn);
    }

    // Update form dropdowns (single account + transfer from/to)
    const transferFrom = document.getElementById("transfer-from");
    const transferTo = document.getElementById("transfer-to");
    const fillSelect = function (sel, keepVal) {
        if (!sel) return;
        const currentVal = sel.value;
        sel.innerHTML = '<option value="" disabled selected>Select account</option>';
        for (let i = 0; i < accounts.length; i++) {
            const opt = document.createElement("option");
            opt.value = accounts[i].name;
            opt.textContent = accounts[i].name;
            sel.appendChild(opt);
        }
        if (keepVal && currentVal) sel.value = currentVal;
    };
    if (accountSelect) {
        fillSelect(accountSelect, true);
    }
    fillSelect(transferFrom, false);
    fillSelect(transferTo, false);
    // Refresh amounts after re-render
    if (typeof updateDashboard === "function") {
        updateDashboard();
    }
}

// Delete an account (beginner-friendly: loop + splice)
// NOTE (block-or-move, later): pros block deletes with history or force-move it.
// Ours warns and allows orphans for now - kept simple on purpose.
function deleteAccount(name) {
    if (accounts.length <= 1) {
        showToast("You must keep at least one account", "error");
        return;
    }
    // Check if any transaction uses this account (incl. transfers from/to)
    let used = false;
    for (let i = 0; i < transactions.length; i++) {
        const t = transactions[i];
        if (t.account === name || t.from === name || t.to === name) {
            used = true;
            break;
        }
    }
    let msg = "Its card will be removed from the sidebar.";
    if (used) msg = "It has records. They will remain but show '" + name + "' (orphaned).";
    askConfirm("Delete '" + name + "'?", msg, "Delete", function () {
        for (let i = 0; i < accounts.length; i++) {
            if (accounts[i].name === name) {
                accounts.splice(i, 1);
                break;
            }
        }
        if (selectedAccount === name) selectedAccount = null;
        saveData();
        renderAccounts();
        displayTransactions();
        showToast("Account deleted", "success");
        console.log("Deleted account:", name);
    });
}

// Handle account creation form
// (looked up here because main.js, which defines accountForm, loads after this file)
const accountFormEl = document.getElementById("account-form");
if (accountFormEl) {
    accountFormEl.addEventListener("submit", function (e) {
        e.preventDefault();
        const name = newAccountNameInput.value.trim();
        if (!name) {
            showToast("Please enter account name", "error");
            return;
        }
        // Check duplicate
        for (let i = 0; i < accounts.length; i++) {
            if (accounts[i].name.toLowerCase() === name.toLowerCase()) {
                showToast("Account already exists", "error");
                return;
            }
        }
        const typeInfo = ACCOUNT_TYPES.find(function (t) { return t.value === document.getElementById("new-account-type").value; }) || ACCOUNT_TYPES[0];
        const currency = document.getElementById("new-account-currency").value || "NGN";
        let rate = 1;
        if (currency !== "NGN") {
            rate = Number(document.getElementById("new-account-rate").value);
            if (!(rate > 0)) {
                showToast("Enter a valid exchange rate", "error");
                return;
            }
        }
        const excluded = document.getElementById("new-account-exclude").checked;
        const color = (typeof getPickedAccountColor === "function") ? getPickedAccountColor() : DEFAULT_ACCOUNT_COLOR;
        const openingInput = document.getElementById("new-account-opening");
        let opening = 0;
        if (openingInput && openingInput.value !== "") {
            opening = Number(openingInput.value);
            if (isNaN(opening) || opening < 0) {
                showToast("Opening balance must be 0 or more", "error");
                return;
            }
        }
        accounts.push({ name: name, type: typeInfo.value, icon: typeInfo.icon, color: color, currency: currency, rate: rate, opening: opening, excluded: excluded });
        if (currency !== "NGN") {
            exchangeRates[currency] = rate; // newest rate you typed becomes the rate used by the card
            saveCurrencyPrefs();
        }
        saveData();
        renderAccounts();
        closeAccountModal();
        showToast("Account created", "success");
        console.log("Added account:", name);
    });
}
