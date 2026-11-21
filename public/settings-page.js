// QIONIX - settings-page.js | Settings page: profile, appearance, startup page, data and about
// Loaded AFTER main.js and BEFORE accounts-page.js (that file owns the page switching and
// calls renderSettingsPage() / refreshSettingsPage() below).
//
// URL: #settings
//
// Every setting is stored in localStorage, so it survives a refresh:
//   qionix.profile  -> { name: "Jerree" }
//   qionix.theme.<userId> -> "dark" or "light"
//   qionix.startup.<userId> -> "dashboard" | "accounts" | "records" | "analytics"
//   qionix.users    -> the signed-up accounts (auth.js owns them)
//   qionix.session  -> who is logged in right now (auth.js owns it)
//   qionix.data.v1.<userId> -> that user's accounts + transactions (main.js owns them)

(function () {
    "use strict";

    const page = document.getElementById("view-settings");
    if (!page) return;

    const PROFILE_KEY = "qionix.profile";
    const THEME_KEY = "qionix.theme";
    const STARTUP_KEY = "qionix.startup";
    const USERS_KEY = "qionix.users";
    const SESSION_KEY = "qionix.session";

    // ---------------------------------------------------------
    // Small helpers
    // ---------------------------------------------------------
    function esc(value) {
        return String(value).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    function readProfileName() {
        let name = "Jerree";
        try {
            const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
            if (saved && typeof saved.name === "string" && saved.name.trim() !== "") {
                name = saved.name.trim();
            }
        } catch (err) { /* corrupted value - keep the default */ }
        return name;
    }

    function isDark() {
        return document.documentElement.getAttribute("data-theme") === "dark";
    }

    // The account auth.js saved for this browser session
    function currentUser() {
        try {
            const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
            if (!session || !session.userId) return null;
            const users = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
            if (!Array.isArray(users)) return null;
            for (let i = 0; i < users.length; i++) {
                if (users[i].id === session.userId) return users[i];
            }
        } catch (err) { /* corrupted - treat as signed out */ }
        return null;
    }

    // Keep the saved account in sync when the display name changes
    function saveUserName(name) {
        const user = currentUser();
        if (!user) return;
        try {
            const users = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
            for (let i = 0; i < users.length; i++) {
                if (users[i].id === user.id) users[i].name = name;
            }
            localStorage.setItem(USERS_KEY, JSON.stringify(users));
        } catch (err) { /* the profile name still saves below */ }
    }

    // Sum the size of every qionix.* key (rough localStorage usage)
    function storageBytes() {
        let bytes = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.indexOf("qionix") === 0) {
                const value = localStorage.getItem(key) || "";
                bytes += (key.length + value.length) * 2; // UTF-16 = 2 bytes per char
            }
        }
        return bytes;
    }

    function fmtBytes(bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }

    // The navbar profile: "J" avatar + name next to it
    function applyProfile(name) {
        const profile = document.querySelector(".profile");
        if (!profile) return;
        const label = profile.querySelector("span:not(.avatar)");
        const avatar = profile.querySelector(".avatar");
        if (label) label.textContent = name;
        if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
    }

    // ---------------------------------------------------------
    // Markup (rebuilt every time the page opens)
    // ---------------------------------------------------------
    function buildHTML() {
        const name = readProfileName();
        const dark = isDark();
        const user = currentUser();
        const startup = localStorage.getItem(prefKey(STARTUP_KEY)) || "dashboard";
        const used = storageBytes();
        const percent = Math.min(100, Math.max(3, Math.round((used / (5 * 1024 * 1024)) * 100)));

        const startupOptions = [
            ["dashboard", "Dashboard"],
            ["accounts", "Accounts"],
            ["records", "Records"],
            ["analytics", "Analytics"]
        ];
        let optionsHTML = "";
        for (let i = 0; i < startupOptions.length; i++) {
            const selected = startup === startupOptions[i][0] ? " selected" : "";
            optionsHTML += '<option value="' + startupOptions[i][0] + '"' + selected + ">" + startupOptions[i][1] + "</option>";
        }

        return '' +
            '<div class="ap-head">' +
            '    <div>' +
            '        <h1>Settings</h1>' +
            '        <p>Make Qionix feel like yours</p>' +
            '    </div>' +
            '</div>' +

            '<div class="st-grid">' +

            '    <section class="ap-panel st-card">' +
            '        <h2 class="st-title"><span class="material-icons">person</span> Profile</h2>' +
            '        <div class="st-profile-row">' +
            '            <div class="st-avatar" id="st-avatar">' + esc(name.charAt(0).toUpperCase()) + '</div>' +
            '            <div class="st-field grow">' +
            '                <label for="st-name">Display name</label>' +
            '                <input class="af-input" id="st-name" maxlength="18" autocomplete="off" value="' + esc(name) + '">' +
            '            </div>' +
            '        </div>' +
            '        <p class="st-note">Shown in the top-right corner of the app.' +
            (user ? " Signed in as <strong>" + esc(user.email) + "</strong>." : "") + '</p>' +
            '        <div class="st-actions">' +
            '            <button type="button" class="ap-btn primary" id="st-save-profile">Save name</button>' +
            '            <button type="button" class="ap-btn ghost" id="st-logout">Log out</button>' +
            '        </div>' +
            '    </section>' +

            '    <section class="ap-panel st-card">' +
            '        <h2 class="st-title"><span class="material-icons">dark_mode</span> Appearance</h2>' +
            '        <label class="af-switch">' +
            '            <input type="checkbox" id="st-dark"' + (dark ? " checked" : "") + '>' +
            '            <span class="af-track"></span>' +
            '            <span>Dark mode</span>' +
            '        </label>' +
            '        <p class="st-note">Saved in this browser and applied instantly - no reload needed.</p>' +
            '    </section>' +

            '    <section class="ap-panel st-card">' +
            '        <h2 class="st-title"><span class="material-icons">home</span> Startup page</h2>' +
            '        <div class="st-field">' +
            '            <label for="st-startup">Open Qionix on</label>' +
            '            <select class="st-select" id="st-startup">' + optionsHTML + '</select>' +
            '        </div>' +
            '        <p class="st-note">Used when the app is opened without a page in the URL.</p>' +
            '    </section>' +

            '    <section class="ap-panel st-card">' +
            '        <h2 class="st-title"><span class="material-icons">storage</span> Data</h2>' +
            '        <div class="st-meter">' +
            '            <div class="st-meter-top"><span>Stored in this browser</span><strong>' + fmtBytes(used) + '</strong></div>' +
            '            <div class="st-meter-bar"><i style="width:' + percent + '%"></i></div>' +
            '        </div>' +
            '        <p class="st-note">Accounts and records live only in this browser (localStorage). Clearing browser data removes them.</p>' +
            '        <div class="st-actions">' +
            '            <button type="button" class="ap-btn danger" id="st-reset">Reset all data</button>' +
            '        </div>' +
            '    </section>' +

            '</div>' +

            '<section class="ap-panel st-card st-about">' +
            '    <h2 class="st-title"><span class="material-icons">info</span> About</h2>' +
            '    <p class="st-note">Qionix 1.0 - a personal expense tracker demo built with plain HTML, CSS and JavaScript. No server: your login, accounts and records stay on this device.</p>' +
            '</section>';
    }

    // ---------------------------------------------------------
    // Wire the controls (after every render)
    // ---------------------------------------------------------
    function attach() {
        const nameInput = document.getElementById("st-name");
        const avatar = document.getElementById("st-avatar");
        const saveBtn = document.getElementById("st-save-profile");
        const logoutBtn = document.getElementById("st-logout");
        const darkInput = document.getElementById("st-dark");
        const startupSelect = document.getElementById("st-startup");
        const resetBtn = document.getElementById("st-reset");

        function saveName() {
            const name = nameInput.value.trim();
            if (name === "") {
                showToast("Please enter a name", "error");
                nameInput.focus();
                return;
            }
            localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: name }));
            saveUserName(name);
            applyProfile(name);
            showToast("Name saved", "success");
        }

        if (nameInput) {
            // Live avatar preview while typing
            nameInput.addEventListener("input", function () {
                if (avatar) avatar.textContent = (nameInput.value.trim().charAt(0) || "J").toUpperCase();
            });
            nameInput.addEventListener("keydown", function (e) {
                if (e.key === "Enter") {
                    e.preventDefault();
                    saveName();
                }
            });
        }

        if (saveBtn) saveBtn.addEventListener("click", saveName);

        if (logoutBtn) {
            logoutBtn.addEventListener("click", function () {
                askConfirm(
                    "Log out of Qionix?",
                    "Your accounts and records stay saved. You can log back in with your email and password.",
                    "Log out",
                    function () {
                        localStorage.removeItem(SESSION_KEY);
                        location.replace("auth.html");
                    }
                );
            });
        }

        if (darkInput) {
            darkInput.addEventListener("change", function () {
                const dark = darkInput.checked;
                if (dark) {
                    document.documentElement.setAttribute("data-theme", "dark");
                } else {
                    document.documentElement.removeAttribute("data-theme");
                }
                localStorage.setItem(prefKey(THEME_KEY), dark ? "dark" : "light");
                showToast(dark ? "Dark mode on" : "Dark mode off", "info");
            });
        }

        if (startupSelect) {
            startupSelect.addEventListener("change", function () {
                localStorage.setItem(prefKey(STARTUP_KEY), startupSelect.value);
                showToast("Startup page saved", "success");
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener("click", function () {
                const user = currentUser();
                askConfirm(
                    "Reset all data?",
                    "Every account and record saved for " + (user ? user.email : "this login") +
                    " will be deleted. This cannot be undone.",
                    "Reset",
                    function () {
                        // Only this login's dataset - other accounts keep their own records
                        if (user) {
                            localStorage.removeItem("qionix.data.v1." + user.id);
                        }
                        location.reload();
                    }
                );
            });
        }
    }

    // ---------------------------------------------------------
    // Render + hooks used by accounts-page.js
    // ---------------------------------------------------------
    function render() {
        page.innerHTML = buildHTML();
        attach();
    }

    window.renderSettingsPage = function () {
        render();
    };
    window.refreshSettingsPage = function () {
        render();
    };

    // Profile is global: show the saved name even before Settings is opened
    applyProfile(readProfileName());
})();
