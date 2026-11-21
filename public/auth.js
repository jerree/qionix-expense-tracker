// QIONIX - auth.js | Log in / sign up page
// Accounts live in localStorage (this is a front-end demo - there is no server):
//   qionix.users   -> [{ id, name, email, passHash, createdAt }]
//   qionix.session -> { userId, email, at }
//   qionix.profile -> { name }  (the name shown in the navbar)
//
// Passwords are hashed with SHA-256 before saving. Real apps must also
// validate on a server - this page only keeps casual visitors out.

(function () {
    "use strict";

    const USERS_KEY = "qionix.users";
    const SESSION_KEY = "qionix.session";
    const PROFILE_KEY = "qionix.profile";

    // ---------------------------------------------------------
    // Elements
    // ---------------------------------------------------------
    const form = document.getElementById("auth-form");
    if (!form) return;

    const card = document.getElementById("auth-card");
    const title = document.getElementById("auth-title");
    const sub = document.getElementById("auth-sub");
    const tabs = document.querySelectorAll(".auth-tabs button");
    const nameField = document.getElementById("name-field");
    const nameInput = document.getElementById("auth-name");
    const emailInput = document.getElementById("auth-email");
    const passInput = document.getElementById("auth-password");
    const confirmField = document.getElementById("confirm-field");
    const confirmInput = document.getElementById("auth-confirm");
    const submitBtn = document.getElementById("auth-submit");
    const switchText = document.getElementById("auth-switch");
    const switchBtn = document.getElementById("auth-switch-btn");
    const formError = document.getElementById("err-form");

    let mode = "login";

    // ---------------------------------------------------------
    // Storage helpers
    // ---------------------------------------------------------
    function readUsers() {
        try {
            const list = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
            return Array.isArray(list) ? list : [];
        } catch (err) {
            return [];
        }
    }

    function saveUsers(list) {
        localStorage.setItem(USERS_KEY, JSON.stringify(list));
    }

    function findUser(email) {
        const list = readUsers();
        for (let i = 0; i < list.length; i++) {
            if (list[i].email === email) return list[i];
        }
        return null;
    }

    function readSession() {
        try {
            return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
        } catch (err) {
            return null;
        }
    }

    function startSession(user) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
            userId: user.id,
            email: user.email,
            at: Date.now()
        }));
        localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: user.name }));
        location.replace("index.html");
    }

    // Already logged in? Go straight into the app.
    const existing = readSession();
    if (existing && existing.userId) {
        const owner = readUsers().some(function (u) { return u.id === existing.userId; });
        if (owner) {
            location.replace("index.html");
            return;
        }
        localStorage.removeItem(SESSION_KEY); // session points at a user that no longer exists
    }

    // ---------------------------------------------------------
    // Password hashing (plain JS fallback if crypto is unavailable)
    // ---------------------------------------------------------
    async function hashPassword(password) {
        const text = "qionix.v1:" + password;

        if (window.crypto && window.crypto.subtle && typeof TextEncoder !== "undefined") {
            const bytes = new TextEncoder().encode(text);
            const digest = await window.crypto.subtle.digest("SHA-256", bytes);
            return Array.from(new Uint8Array(digest))
                .map(function (b) { return b.toString(16).padStart(2, "0"); })
                .join("");
        }

        // Tiny non-cryptographic fallback so the page still works offline
        let h = 5381;
        for (let i = 0; i < text.length; i++) {
            h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
        }
        return "fb" + h.toString(16);
    }

    // ---------------------------------------------------------
    // Inline errors
    // ---------------------------------------------------------
    function setError(id, message) {
        const p = document.getElementById(id);
        if (!p) return;
        p.textContent = message || "";
        p.hidden = !message;
    }

    function setInvalid(input, invalid) {
        const field = input.closest(".auth-field");
        if (field) field.classList.toggle("invalid", invalid);
    }

    function clearErrors() {
        setError("err-name", "");
        setError("err-email", "");
        setError("err-password", "");
        setError("err-confirm", "");
        formError.textContent = "";
        formError.hidden = true;
        setInvalid(nameInput, false);
        setInvalid(emailInput, false);
        setInvalid(passInput, false);
        setInvalid(confirmInput, false);
    }

    function fail(message) {
        formError.textContent = message;
        formError.hidden = false;
        card.classList.remove("shake");
        void card.offsetWidth; // restart the CSS animation
        card.classList.add("shake");
    }

    function resetEyes() {
        document.querySelectorAll(".auth-eye").forEach(function (btn) {
            const input = document.getElementById(btn.getAttribute("data-target"));
            if (input) input.type = "password";
            btn.textContent = "Show";
            btn.setAttribute("aria-label", "Show password");
        });
    }

    // ---------------------------------------------------------
    // Switch between Log in and Sign up
    // ---------------------------------------------------------
    function setMode(next) {
        mode = next;
        const isSignup = mode === "signup";

        nameField.hidden = !isSignup;
        confirmField.hidden = !isSignup;
        title.textContent = isSignup ? "Create your account" : "Welcome back";
        sub.textContent = isSignup
            ? "A few details and your dashboard is ready."
            : "Log in to pick up where you left off.";
        submitBtn.textContent = isSignup ? "Create account" : "Log in";
        passInput.setAttribute("autocomplete", isSignup ? "new-password" : "current-password");
        switchText.firstChild.textContent = isSignup ? "Already have an account? " : "New to Qionix? ";
        switchBtn.textContent = isSignup ? "Log in" : "Create an account";
        switchBtn.setAttribute("data-mode", isSignup ? "login" : "signup");

        tabs.forEach(function (b) {
            const on = b.getAttribute("data-mode") === mode;
            b.classList.toggle("on", on);
            b.setAttribute("aria-selected", String(on));
        });

        clearErrors();
        passInput.value = "";
        confirmInput.value = "";
        resetEyes();
        (isSignup ? nameInput : emailInput).focus();
    }

    tabs.forEach(function (b) {
        b.addEventListener("click", function () { setMode(b.getAttribute("data-mode")); });
    });

    switchBtn.addEventListener("click", function () {
        setMode(switchBtn.getAttribute("data-mode"));
    });

    // ---------------------------------------------------------
    // Show / hide password buttons
    // ---------------------------------------------------------
    document.querySelectorAll(".auth-eye").forEach(function (btn) {
        btn.addEventListener("click", function () {
            const input = document.getElementById(btn.getAttribute("data-target"));
            if (!input) return;
            const show = input.type === "password";
            input.type = show ? "text" : "password";
            btn.textContent = show ? "Hide" : "Show";
            btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
            input.focus();
        });
    });

    // Clear a field's red state as soon as the visitor types again
    [nameInput, emailInput, passInput, confirmInput].forEach(function (input) {
        input.addEventListener("input", function () {
            setInvalid(input, false);
            if (input.id === "auth-name") setError("err-name", "");
            if (input.id === "auth-email") setError("err-email", "");
            if (input.id === "auth-password") setError("err-password", "");
            if (input.id === "auth-confirm") setError("err-confirm", "");
        });
    });

    // ---------------------------------------------------------
    // Submit
    // ---------------------------------------------------------
    form.addEventListener("submit", async function (e) {
        e.preventDefault();
        clearErrors();

        const name = nameInput.value.trim();
        const email = emailInput.value.trim().toLowerCase();
        const password = passInput.value;
        const confirm = confirmInput.value;
        const emailOK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        let ok = true;

        if (mode === "signup" && name.length < 2) {
            setError("err-name", "Please enter your name (at least 2 characters).");
            setInvalid(nameInput, true);
            ok = false;
        }
        if (!emailOK) {
            setError("err-email", "Enter a valid email address.");
            setInvalid(emailInput, true);
            ok = false;
        }
        if (password.length < 6) {
            setError("err-password", "Use at least 6 characters.");
            setInvalid(passInput, true);
            ok = false;
        }
        if (mode === "signup" && confirm !== password) {
            setError("err-confirm", "Passwords do not match.");
            setInvalid(confirmInput, true);
            ok = false;
        }

        if (!ok) {
            fail("Please fix the highlighted fields.");
            return;
        }

        // ---- sign up ----
        if (mode === "signup") {
            if (findUser(email)) {
                setError("err-email", "An account with this email already exists.");
                setInvalid(emailInput, true);
                fail("Try logging in instead.");
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = "Creating account...";

            try {
                const user = {
                    id: "u_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                    name: name,
                    email: email,
                    passHash: await hashPassword(password),
                    createdAt: new Date().toISOString()
                };
                const users = readUsers();
                users.push(user);
                saveUsers(users);
                startSession(user);
            } catch (err) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Create account";
                fail("Could not save your account. Is storage blocked?");
            }
            return;
        }

        // ---- log in ----
        const user = findUser(email);
        if (!user) {
            setError("err-email", "No account found with that email.");
            setInvalid(emailInput, true);
            fail("Create an account first, then log in.");
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Checking...";

        try {
            const hash = await hashPassword(password);
            if (hash !== user.passHash) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Log in";
                setError("err-password", "Incorrect password. Try again.");
                setInvalid(passInput, true);
                fail("That password does not match.");
                return;
            }
            startSession(user);
        } catch (err) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Log in";
            fail("Something went wrong. Try again.");
        }
    });

    // ---------------------------------------------------------
    // First visit ever -> open on Sign up
    // ---------------------------------------------------------
    if (readUsers().length === 0) {
        setMode("signup");
        sub.textContent = "No accounts on this device yet - create the first one.";
    } else {
        setMode("login");
    }
})();
