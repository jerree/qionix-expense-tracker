// QIONIX - transactions.js | Form, type toggle, list display (2), delete, datetime defaults
// Loaded 2nd. Needs main.js data only at runtime (after all scripts load).

// =========================================================
// STAGE 2: TRANSACTIONS - Array + Object + DOM
// What is it?
//   Array: a list that holds many transactions like [t1, t2, t3]
//   Object: one transaction with properties {id, description, amount, type, category, date}
// Why we need it?
//   We need to store every income/expense the user adds, so we can show it and calculate balance later.
// How it works?
//   1. Get values from form (DOM)
//   2. Create an object
//   3. Push object into array
//   4. Loop through array and create <li> for each (DOM manipulation)
// =========================================================


const transactionForm = document.getElementById("transaction-form");
const transactionList = document.getElementById("transaction-list");

function displayTransactions() {
    // Clear current list
    transactionList.innerHTML = "";
    // Only show transactions inside the selected calendar period
    const visible = getVisibleTransactions();

    // If no transactions, show empty message + reset dashboard to 0
    if (visible.length === 0) {
        const empty = document.createElement("li");
        empty.className = "empty-message";
        empty.textContent = "No transactions yet. Click + Record to add one!";
        transactionList.appendChild(empty);
        updateDashboard();
        return;
    }

    // Show only last 2 (newest first) as per design
    const toShow = visible.slice(-2).reverse();

    // Loop through each transaction and create <li>
    for (let i = 0; i < toShow.length; i++) {
        const t = toShow[i];

        // Create <li class="record">
        const li = document.createElement("li");
        li.className = "record";

        // Icon with check badge
        const iconWrap = document.createElement("div");
        iconWrap.className = "record-icon-wrap";

        const icon = document.createElement("div");
        icon.className = "record-icon " + t.category;
        // Add background class fallback
        if (t.category === "food" || t.category === "groceries") {
            icon.classList.add("food");
        } else {
            icon.classList.add("transfer");
        }
        // Use Material Icon inside
        const iconSpan = document.createElement("span");
        iconSpan.className = "material-icons";
        iconSpan.textContent = getCategoryIcon(t.category);
        icon.appendChild(iconSpan);

        const badge = document.createElement("span");
        badge.className = "check-badge";
        badge.textContent = "✓";

        iconWrap.appendChild(icon);
        iconWrap.appendChild(badge);

        // Info: category (as title) + account dot
        // Category now displays instead of description to avoid long text breaking card
        const info = document.createElement("div");
        info.className = "record-info";

        const title = document.createElement("strong");
        // Show nice category name (transfer shows "Transfer")
        title.textContent = CATEGORY_NAMES[t.category] || t.category;

        const sub = document.createElement("small");
        if (t.type === "transfer") {
            // Transfer shows From -> To with From dot color
            const dot = document.createElement("span");
            dot.className = "dot-account";
            dot.style.background = getAccountColor(t.from);
            sub.appendChild(dot);
            sub.appendChild(document.createTextNode(" " + t.from + " → " + t.to));
        } else {
            const dot = document.createElement("span");
            dot.className = "dot-account";
            dot.style.background = getAccountColor(t.account);
            sub.appendChild(dot);
            sub.appendChild(document.createTextNode(" " + t.account));
        }

        info.appendChild(title);
        info.appendChild(sub);

        // Right: amount + date
        const right = document.createElement("div");
        right.className = "record-right";

        const amountDiv = document.createElement("div");
        amountDiv.className = "record-amount " + t.type;
        if (t.type === "expense") {
            amountDiv.textContent = "-NGN " + Number(t.amount).toLocaleString() + ".00";
        } else if (t.type === "transfer") {
            amountDiv.textContent = "⇄ NGN " + Number(t.amount).toLocaleString() + ".00";
        } else {
            amountDiv.textContent = "NGN " + Number(t.amount).toLocaleString() + ".00";
        }

        const dateSmall = document.createElement("small");
        dateSmall.className = "record-date";
        // Format datetime-local like 09/07/2026 12:23 PM
        try {
            const d = new Date(t.date);
            const pad2 = function (n) { return n < 10 ? "0" + n : n; };
            let h = d.getHours();
            const ampm = h >= 12 ? "PM" : "AM";
            h = h % 12; if (h === 0) h = 12;
            dateSmall.textContent = pad2(d.getMonth() + 1) + "/" + pad2(d.getDate()) + "/" + d.getFullYear() + " " + pad2(h) + ":" + pad2(d.getMinutes()) + " " + ampm;
        } catch (e) {
            dateSmall.textContent = t.date;
        }

        right.appendChild(amountDiv);
        right.appendChild(dateSmall);

        // Edit button - opens the same modal prefilled (edit mode)
        const editBtn = document.createElement("button");
        editBtn.className = "btn-edit";
        editBtn.title = "Edit";
        const editIcon = document.createElement("span");
        editIcon.className = "material-icons";
        editIcon.textContent = "edit";
        editBtn.appendChild(editIcon);
        // When clicked, prefill the form with this transaction
        editBtn.addEventListener("click", function () {
            startEdit(t.id);
        });

        // Delete button - asks for confirm first (popup, not instant)
        const delBtn = document.createElement("button");
        delBtn.className = "btn-delete";
        delBtn.textContent = "✕";
        delBtn.title = "Delete";
        // When clicked, confirm then remove this transaction by id
        delBtn.addEventListener("click", function () {
            const label = t.type === "transfer" ? "this transfer" : "this record";
            askConfirm("Delete " + label + "?", "It will be removed from lists and totals.", "Delete", function () {
                deleteTransaction(t.id);
                showToast("Record deleted", "success");
            });
        });

        // Put all together
        li.appendChild(iconWrap);
        li.appendChild(info);
        li.appendChild(right);
        li.appendChild(editBtn);
        li.appendChild(delBtn);

        transactionList.appendChild(li);
    }
    // After list built, update dashboard numbers (Stage 3)
    updateDashboard();
}

function deleteTransaction(id) {
    // Loop to find the transaction with this id
    for (let i = 0; i < transactions.length; i++) {
        if (transactions[i].id === id) {
            transactions.splice(i, 1); // remove 1 item at position i
            break;
        }
    }
    saveData();
    // If we were editing this record, leave edit mode
    if (editingId === id) {
        exitEditMode();
    }
    // Re-display the list (now with one less)
    displayTransactions();
    console.log("Deleted id:", id);
    console.log("Remaining:", transactions);
}

// =========================================================
// EDIT MODE - same modal adds new or updates existing
// Why? One form, two jobs. editingId remembers which.
// null = add mode. A number = edit mode for that id.
// =========================================================
let editingId = null;

const recordModalTitle = document.getElementById("record-modal-title");
const recordModalSubtitle = document.getElementById("record-modal-subtitle");
const recordSubmitBtn = document.getElementById("record-submit-btn");

function enterAddMode() {
    editingId = null;
    transactionForm.reset();
    if (recordModalTitle) recordModalTitle.textContent = "Add New Record";
    if (recordModalSubtitle) recordModalSubtitle.textContent = "Fill in the details of your income or expense";
    if (recordSubmitBtn) recordSubmitBtn.textContent = "+ Add Record";
    refreshTypeFields();
}

function exitEditMode() {
    enterAddMode();
}

function startEdit(id) {
    // Find the transaction by id (same loop pattern as delete)
    let found = null;
    for (let i = 0; i < transactions.length; i++) {
        if (transactions[i].id === id) {
            found = transactions[i];
            break;
        }
    }
    if (!found) {
        showToast("Record not found", "error");
        return;
    }
    editingId = id;
    // Prefill common fields
    document.getElementById("amount").value = found.amount;
    document.getElementById("type").value = found.type;
    refreshTypeFields();
    document.getElementById("date").value = found.date;
    if (found.type === "transfer") {
        if (transferFromSelect) transferFromSelect.value = found.from;
        if (transferToSelect) transferToSelect.value = found.to;
    } else {
        document.getElementById("category").value = found.category;
        document.getElementById("account").value = found.account;
    }
    // Switch modal text to edit mode
    if (recordModalTitle) recordModalTitle.textContent = "Edit Record";
    if (recordModalSubtitle) recordModalSubtitle.textContent = "Update the details and save";
    if (recordSubmitBtn) recordSubmitBtn.textContent = "Save Changes";
    setDateTimeDefaults();
    openModal();
}

// Type toggle: Transfer shows From/To + hides Category/Account, others show Category/Account
const typeSelect = document.getElementById("type");
const categoryWrap = document.getElementById("category-wrap");
const accountSingleWrap = document.getElementById("account-single-wrap");
const transferRow = document.getElementById("transfer-row");
const transferFromSelect = document.getElementById("transfer-from");
const transferToSelect = document.getElementById("transfer-to");

function refreshTypeFields() {
    const isTransfer = typeSelect && typeSelect.value === "transfer";
    if (categoryWrap) categoryWrap.style.display = isTransfer ? "none" : "";
    if (accountSingleWrap) accountSingleWrap.style.display = isTransfer ? "none" : "";
    if (transferRow) transferRow.style.display = isTransfer ? "" : "none";
    const categorySelect = document.getElementById("category");
    const accountSelectEl = document.getElementById("account");
    if (categorySelect) categorySelect.required = !isTransfer;
    if (accountSelectEl) accountSelectEl.required = !isTransfer;
    if (transferFromSelect) transferFromSelect.required = !!isTransfer;
    if (transferToSelect) transferToSelect.required = !!isTransfer;
}

if (typeSelect) {
    typeSelect.addEventListener("change", refreshTypeFields);
}
refreshTypeFields();

// Handle form submission (income/expense/transfer)
transactionForm.addEventListener("submit", function (e) {
    e.preventDefault(); // Stop page reload

    // 1. Get common values
    const amount = document.getElementById("amount").value;
    const type = document.getElementById("type").value;
    const date = document.getElementById("date").value;

    if (amount === "" || type === "" || date === "") {
        showToast("Please fill all fields", "error");
        return;
    }

    if (Number(amount) <= 0) {
        showToast("Amount must be greater than 0", "error");
        return;
    }

    // No future dates (picker max can be bypassed by typing)
    if (new Date(date) > new Date()) {
        showToast("Date cannot be in the future", "error");
        return;
    }

    let newTransaction = null;

    if (type === "transfer") {
        const from = transferFromSelect ? transferFromSelect.value : "";
        const to = transferToSelect ? transferToSelect.value : "";
        if (!from || !to) {
            showToast("Please select From and To accounts", "error");
            return;
        }
        if (from === to) {
            showToast("From and To must be different accounts", "error");
            return;
        }
        // Transfer moves money: not income/expenses, no category
        newTransaction = {
            id: Date.now(),
            amount: Number(amount),
            type: "transfer",
            category: "transfer",
            from: from,
            to: to,
            date: date
        };
    } else {
        const category = document.getElementById("category").value;
        const account = document.getElementById("account").value;
        if (category === "" || account === "") {
            showToast("Please fill all fields", "error");
            return;
        }
        newTransaction = {
            id: Date.now(), // unique id
            amount: Number(amount),
            type: type, // income or expense
            category: category,
            account: account,
            date: date
        };
    }

    // 3. Save: update existing if editing, else push new
    if (editingId !== null) {
        // Find by id and overwrite fields (keep the same id)
        for (let i = 0; i < transactions.length; i++) {
            if (transactions[i].id === editingId) {
                transactions[i].amount = newTransaction.amount;
                transactions[i].type = newTransaction.type;
                transactions[i].date = newTransaction.date;
                if (newTransaction.type === "transfer") {
                    transactions[i].category = "transfer";
                    transactions[i].from = newTransaction.from;
                    transactions[i].to = newTransaction.to;
                    delete transactions[i].account;
                } else {
                    transactions[i].category = newTransaction.category;
                    transactions[i].account = newTransaction.account;
                    delete transactions[i].from;
                    delete transactions[i].to;
                }
                break;
            }
        }
        showToast("Record updated", "success");
        console.log("Updated id:", editingId);
    } else {
        transactions.push(newTransaction);
        showToast("Record added", "success");
        console.log("Added:", newTransaction);
    }

    saveData();

    // 4. Show on page
    displayTransactions();

    // 5. Clear form, leave edit mode, close modal
    exitEditMode();
    closeModal();

    console.log("All transactions:", transactions);
});

// Closing the modal with Escape without saving also leaves edit mode
// (open/close/cancel/overlay hooks live in main.js init - its consts load last)
document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
        exitEditMode();
    }
});

// =========================================================
// DATE & TIME - Only present/previous, default to now
// =========================================================
const dateInput = document.getElementById("date");

function setDateTimeDefaults() {
    if (!dateInput) return;
    const now = new Date();
    // Format for datetime-local: YYYY-MM-DDTHH:MM
    const pad = function (n) { return n < 10 ? "0" + n : n; };
    const local = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) + "T" + pad(now.getHours()) + ":" + pad(now.getMinutes());
    dateInput.max = local; // no future
    if (!dateInput.value) {
        dateInput.value = local; // default to now
    }
    // Update max every minute in case user keeps page open
    setInterval(function () {
        const n = new Date();
        const updated = n.getFullYear() + "-" + pad(n.getMonth() + 1) + "-" + pad(n.getDate()) + "T" + pad(n.getHours()) + ":" + pad(n.getMinutes());
        dateInput.max = updated;
    }, 60000);
}
