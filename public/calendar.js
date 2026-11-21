// QIONIX - calendar.js | Period selector: state, range, tabs, arrows, custom/weeks/months/years, quick buttons
// Loaded 1st. No data dependency at load time.


// =========================================================
// PERIOD SELECTOR - Calendar like Wallet
// =========================================================

const periodDisplay = document.getElementById("period-display");
const periodDropdown = document.getElementById("period-dropdown");
const periodPrev = document.getElementById("period-prev");
const periodNext = document.getElementById("period-next");

// Tabs
const periodTabs = document.querySelectorAll(".period-tab");
const periodContents = document.querySelectorAll(".period-content");

// State - current date we are viewing (default: Sep 6 2026 like screenshots)
let currentDate = new Date(); // real today, so default period matches the form's date
let activeTab = "custom"; // custom, weeks, months, years
let decadeStart = 2020;
let displayMode = "month"; // what the top box shows: week, month, year, all, etc.
// Custom range picked by clicking calendar days (two clicks: start then end)
let customStart = null;
let customEnd = null;

// =========================================================
// PERIOD RANGE - derive start/end dates from calendar state
// Why? Calendar was UI-only. Now every dashboard calc uses this range.
// How? Week = Mon-Sun of currentDate. Month = 1st-last. Year = Jan-Dec.
// =========================================================
function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
}

function endOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
}

function getActiveRange() {
    // Custom two-click range wins when set
    if (customStart && customEnd && activeTab === "custom") {
        const s = customStart < customEnd ? customStart : customEnd;
        const e = customStart < customEnd ? customEnd : customStart;
        return { start: startOfDay(s), end: endOfDay(e) };
    }
    if (displayMode === "all") return null;
    if (displayMode === "today") {
        return { start: startOfDay(currentDate), end: endOfDay(currentDate) };
    }
    if (displayMode === "week" || activeTab === "weeks") {
        // Monday-start week containing currentDate
        const dow = (currentDate.getDay() === 0 ? 6 : currentDate.getDay() - 1);
        const monday = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - dow);
        const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
        return { start: startOfDay(monday), end: endOfDay(sunday) };
    }
    if (displayMode === "year" || activeTab === "years") {
        const y = currentDate.getFullYear();
        return { start: new Date(y, 0, 1, 0, 0, 0), end: new Date(y, 11, 31, 23, 59, 59) };
    }
    if (displayMode === "7days") {
        const end = endOfDay(currentDate);
        const start = startOfDay(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 6));
        return { start: start, end: end };
    }
    if (displayMode === "30days") {
        const end = endOfDay(currentDate);
        const start = startOfDay(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 29));
        return { start: start, end: end };
    }
    if (displayMode === "90days") {
        const end = endOfDay(currentDate);
        const start = startOfDay(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 89));
        return { start: start, end: end };
    }
    if (displayMode === "12months") {
        const end = endOfDay(currentDate);
        const start = startOfDay(new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), currentDate.getDate()));
        return { start: start, end: end };
    }
    // Default: month containing currentDate
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    return { start: new Date(y, m, 1, 0, 0, 0), end: new Date(y, m + 1, 0, 23, 59, 59) };
}


// Helper: format month label
function getMonthName(monthIndex) {
    const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return names[monthIndex];
}

// Helper: update the top display text
function updatePeriodDisplay() {
    let text = "";
    if (activeTab === "weeks" || displayMode === "week") {
        text = "This week";
    } else if (activeTab === "months" || displayMode === "month") {
        text = "This month";
    } else if (activeTab === "years") {
        text = "This year";
    } else {
        if (displayMode === "today") text = "Today";
        else if (displayMode === "7days") text = "Last 7 days";
        else if (displayMode === "30days") text = "Last 30 days";
        else if (displayMode === "90days") text = "Last 90 days";
        else if (displayMode === "12months") text = "Last 12 months";
        else if (displayMode === "all") text = "All";
        else if (displayMode === "custom") {
            if (customStart && customEnd) {
                const s = customStart < customEnd ? customStart : customEnd;
                const e = customStart < customEnd ? customEnd : customStart;
                text = (s.getMonth() + 1) + "/" + s.getDate() + " - " + (e.getMonth() + 1) + "/" + e.getDate();
            } else if (customStart) {
                text = (customStart.getMonth() + 1) + "/" + customStart.getDate() + " - ...";
            } else {
                text = "Custom range";
            }
        }
        else text = "This month";
    }
    periodDisplay.textContent = text;
}

// Toggle dropdown
periodDisplay.addEventListener("click", function (e) {
    e.stopPropagation();
    periodDropdown.classList.toggle("show");
});

// Close dropdown when clicking outside
document.addEventListener("click", function (e) {
    if (!periodDropdown.contains(e.target) && e.target !== periodDisplay) {
        periodDropdown.classList.remove("show");
    }
});

// Tab switching
periodTabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
        const target = tab.getAttribute("data-tab");
        activeTab = target;

        // Update tab buttons
        periodTabs.forEach(function (t) { t.classList.remove("active"); });
        tab.classList.add("active");

        // Show correct content
        periodContents.forEach(function (c) { c.classList.remove("active"); });
        document.getElementById("tab-" + target).classList.add("active");

        // Update labels for each tab
        if (target === "custom") {
            renderCustomCalendar(currentDate);
        } else if (target === "weeks") {
            renderWeeksCalendar(currentDate);
        } else if (target === "months") {
            renderMonths(currentDate.getFullYear());
        } else if (target === "years") {
            renderYears(decadeStart);
        }

        // New tab = new range (clear custom day picks)
        customStart = null;
        customEnd = null;
        if (target === "weeks") displayMode = "week";
        else if (target === "months") displayMode = "month";
        else if (target === "years") displayMode = "year";
        refreshForPeriod();
    });
});

// ------------------- OUTSIDE ARROWS -------------------
// < > arrows move by selected period
periodPrev.addEventListener("click", function () {
    if (activeTab === "weeks" || activeTab === "custom") {
        // Move 7 days back (one week)
        currentDate.setDate(currentDate.getDate() - 7);
        renderCustomCalendar(currentDate);
        renderWeeksCalendar(currentDate);
        displayMode = "week";
    } else if (activeTab === "months") {
        // Move 1 month back
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderMonths(currentDate.getFullYear());
        displayMode = "month";
    } else if (activeTab === "years") {
        // Move 1 year back
        currentDate.setFullYear(currentDate.getFullYear() - 1);
        decadeStart -= 10;
        renderYears(decadeStart);
        displayMode = "year";
    }
    customStart = null;
    customEnd = null;
    refreshForPeriod();
});

periodNext.addEventListener("click", function () {
    if (activeTab === "weeks" || activeTab === "custom") {
        currentDate.setDate(currentDate.getDate() + 7);
        renderCustomCalendar(currentDate);
        renderWeeksCalendar(currentDate);
        displayMode = "week";
    } else if (activeTab === "months") {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderMonths(currentDate.getFullYear());
        displayMode = "month";
    } else if (activeTab === "years") {
        currentDate.setFullYear(currentDate.getFullYear() + 1);
        decadeStart += 10;
        renderYears(decadeStart);
        displayMode = "year";
    }
    customStart = null;
    customEnd = null;
    refreshForPeriod();
});

// ------------------- CUSTOM CALENDAR -------------------
function renderCustomCalendar(date) {
    const label = document.getElementById("custom-month-label");
    const grid = document.getElementById("custom-calendar-grid");
    if (!label || !grid) return;

    const year = date.getFullYear();
    const month = date.getMonth();
    label.textContent = getMonthName(month) + " " + year;

    grid.innerHTML = "";

    // First day of month (0=Sun, 1=Mon...)
    let firstDay = new Date(year, month, 1).getDay();
    // Convert to Mon=0 ... Sun=6
    firstDay = (firstDay === 0 ? 6 : firstDay - 1);

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    // Real custom range highlight (two-click pick)
    const sameDay = function (a, b) {
        return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    };
    let rangeStart = null;
    let rangeEnd = null;
    if (customStart && customEnd) {
        rangeStart = customStart < customEnd ? customStart : customEnd;
        rangeEnd = customStart < customEnd ? customEnd : customStart;
    }

    // Previous month days (gray)
    for (let i = firstDay - 1; i >= 0; i--) {
        const btn = document.createElement("button");
        btn.className = "calendar-day other-month";
        btn.textContent = daysInPrevMonth - i;
        grid.appendChild(btn);
    }

    // Current month days (click = pick custom range, two clicks)
    for (let d = 1; d <= daysInMonth; d++) {
        const btn = document.createElement("button");
        btn.className = "calendar-day";
        btn.textContent = d;

        // Weekend red (Sat=5, Sun=6 in Mon-start)
        const dayOfWeek = (firstDay + d - 1) % 7;
        if (dayOfWeek === 5 || dayOfWeek === 6) {
            btn.classList.add("weekend");
        }

        // Highlight picked custom range
        const thisDay = new Date(year, month, d);
        if (rangeStart && rangeEnd && thisDay >= startOfDay(rangeStart) && thisDay <= startOfDay(rangeEnd)) {
            if (sameDay(thisDay, rangeStart) && sameDay(thisDay, rangeEnd)) btn.classList.add("selected");
            else if (sameDay(thisDay, rangeStart)) btn.classList.add("range-start");
            else if (sameDay(thisDay, rangeEnd)) btn.classList.add("range-end");
            else btn.classList.add("range");
        } else if (!customEnd && customStart && sameDay(thisDay, customStart)) {
            btn.classList.add("selected");
        }

        // Two-click custom range pick
        (function (dayNum) {
            btn.addEventListener("click", function () {
                const picked = new Date(year, month, dayNum);
                if (!customStart || (customStart && customEnd)) {
                    customStart = picked;
                    customEnd = null;
                } else {
                    customEnd = picked;
                    displayMode = "custom";
                    currentDate = new Date(picked.getFullYear(), picked.getMonth(), picked.getDate());
                }
                renderCustomCalendar(currentDate);
                refreshForPeriod();
            });
        })(d);

        grid.appendChild(btn);
    }

    // Next month days to fill grid
    const totalCells = firstDay + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
        const btn = document.createElement("button");
        btn.className = "calendar-day other-month";
        btn.textContent = d;
        grid.appendChild(btn);
    }
}

document.getElementById("custom-prev").addEventListener("click", function () {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCustomCalendar(currentDate);
});

document.getElementById("custom-next").addEventListener("click", function () {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCustomCalendar(currentDate);
});

// ------------------- WEEKS CALENDAR -------------------
function renderWeeksCalendar(date) {
    const label = document.getElementById("weeks-month-label");
    const grid = document.getElementById("weeks-calendar-grid");
    if (!label || !grid) return;

    const year = date.getFullYear();
    const month = date.getMonth();
    label.textContent = getMonthName(month) + " " + year;

    grid.innerHTML = "";
    let firstDay = new Date(year, month, 1).getDay();
    firstDay = (firstDay === 0 ? 6 : firstDay - 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    for (let i = firstDay - 1; i >= 0; i--) {
        const btn = document.createElement("button");
        btn.className = "calendar-day other-month";
        btn.textContent = daysInPrevMonth - i;
        grid.appendChild(btn);
    }

    // Highlight the week containing currentDate (real, not demo 7-13)
    const dowNow = (currentDate.getDay() === 0 ? 6 : currentDate.getDay() - 1);
    const mondayNow = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - dowNow);
    for (let d = 1; d <= daysInMonth; d++) {
        const btn = document.createElement("button");
        btn.className = "calendar-day";
        btn.textContent = d;
        const dayOfWeek = (firstDay + d - 1) % 7;
        if (dayOfWeek === 5 || dayOfWeek === 6) btn.classList.add("weekend");
        // Highlight picked week
        const thisDay = new Date(year, month, d);
        const dow = (thisDay.getDay() === 0 ? 6 : thisDay.getDay() - 1);
        const monday = new Date(thisDay.getFullYear(), thisDay.getMonth(), thisDay.getDate() - dow);
        if (monday.getTime() === startOfDay(mondayNow).getTime()) {
            if (dow === 0) btn.classList.add("range-start");
            else if (dow === 6) btn.classList.add("range-end");
            else btn.classList.add("range");
        }
        // Click a day = select its week
        (function (dayNum) {
            btn.addEventListener("click", function () {
                currentDate = new Date(year, month, dayNum);
                displayMode = "week";
                customStart = null;
                customEnd = null;
                renderWeeksCalendar(currentDate);
                refreshForPeriod();
            });
        })(d);
        grid.appendChild(btn);
    }

    const totalCells = firstDay + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
        const btn = document.createElement("button");
        btn.className = "calendar-day other-month";
        btn.textContent = d;
        grid.appendChild(btn);
    }
}

document.getElementById("weeks-prev").addEventListener("click", function () {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderWeeksCalendar(currentDate);
});

document.getElementById("weeks-next").addEventListener("click", function () {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderWeeksCalendar(currentDate);
});

// ------------------- MONTHS GRID -------------------
function renderMonths(year) {
    const label = document.getElementById("months-year-label");
    const grid = document.getElementById("months-grid");
    if (!label || !grid) return;
    label.textContent = year;
    grid.innerHTML = "";
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    months.forEach(function (m, index) {
        const cell = document.createElement("div");
        cell.className = "month-cell";
        cell.textContent = m;
        if (index === currentMonth && year === currentYear) {
            cell.classList.add("selected");
        }
        cell.addEventListener("click", function () {
            currentDate.setMonth(index);
            currentDate.setFullYear(year);
            displayMode = "month";
            updatePeriodDisplay();
            document.querySelector('[data-tab="custom"]').click();
            renderCustomCalendar(currentDate);
            periodDropdown.classList.remove("show");
        });
        grid.appendChild(cell);
    });
}

document.getElementById("months-prev").addEventListener("click", function () {
    currentDate.setFullYear(currentDate.getFullYear() - 1);
    renderMonths(currentDate.getFullYear());
});

document.getElementById("months-next").addEventListener("click", function () {
    currentDate.setFullYear(currentDate.getFullYear() + 1);
    renderMonths(currentDate.getFullYear());
});

// ------------------- YEARS GRID -------------------
function renderYears(start) {
    const label = document.getElementById("years-range-label");
    const grid = document.getElementById("years-grid");
    if (!label || !grid) return;
    label.textContent = start + " - " + (start + 9);
    grid.innerHTML = "";
    const currentYear = currentDate.getFullYear();

    for (let y = start; y <= start + 9; y++) {
        const cell = document.createElement("div");
        cell.className = "year-cell";
        cell.textContent = y;
        if (y === currentYear) cell.classList.add("selected");
        cell.addEventListener("click", function () {
            currentDate.setFullYear(y);
            displayMode = "year";
            updatePeriodDisplay();
            document.querySelector('[data-tab="custom"]').click();
            renderCustomCalendar(currentDate);
            periodDropdown.classList.remove("show");
        });
        grid.appendChild(cell);
    }
}

document.getElementById("years-prev").addEventListener("click", function () {
    decadeStart -= 10;
    renderYears(decadeStart);
});

document.getElementById("years-next").addEventListener("click", function () {
    decadeStart += 10;
    renderYears(decadeStart);
});

// ------------------- QUICK BUTTONS -------------------
document.querySelectorAll(".quick-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
        const range = btn.getAttribute("data-range");
        displayMode = range;
        customStart = null;
        customEnd = null;
        if (range === "today") {
            currentDate = new Date();
        } else if (range === "week") {
            displayMode = "week";
        } else if (range === "month") {
            displayMode = "month";
        }
        refreshForPeriod();
        periodDropdown.classList.remove("show");
    });
});

// Initial render
renderCustomCalendar(currentDate);
renderWeeksCalendar(currentDate);
renderMonths(currentDate.getFullYear());
renderYears(decadeStart);
updatePeriodDisplay();
