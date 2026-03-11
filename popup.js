// ─── zCloudPass Popup Script ───

document.addEventListener("DOMContentLoaded", async () => {
    // ── Elements ──
    const loginView = document.getElementById("login-view");
    const dashView = document.getElementById("dashboard-view");
    const loginForm = document.getElementById("login-form");
    const emailInput = document.getElementById("email");
    const masterPwInput = document.getElementById("master-password");
    const apiUrlInput = document.getElementById("api-url");
    const loginBtn = document.getElementById("login-btn");
    const loginError = document.getElementById("login-error");
    const userEmail = document.getElementById("user-email");
    const logoutBtn = document.getElementById("logout-btn");
    const searchInput = document.getElementById("search-input");
    const entriesList = document.getElementById("entries-list");
    const tabs = document.querySelectorAll(".tab");
    const tabPasswords = document.getElementById("tab-passwords");
    const tabSave = document.getElementById("tab-save");
    const saveForm = document.getElementById("save-form");
    const saveError = document.getElementById("save-error");
    const saveSuccess = document.getElementById("save-success");
    const toggleSavePw = document.getElementById("toggle-save-pw");
    const savePwInput = document.getElementById("save-password");

    let allEntries = [];

    // ── Check login status ──
    const status = await sendMsg({ action: "getStatus" });
    if (status.loggedIn) {
        showDashboard(status.email);
    }

    // ── Tab switching ──
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            const target = tab.dataset.tab;
            tabPasswords.classList.toggle("hidden", target !== "passwords");
            tabSave.classList.toggle("hidden", target !== "save");
        });
    });

    // ── Login ──
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        loginError.classList.add("hidden");
        setLoading(loginBtn, true);

        const res = await sendMsg({
            action: "login",
            email: emailInput.value.trim(),
            masterPassword: masterPwInput.value,
            apiUrl: apiUrlInput.value.trim() || undefined
        });

        setLoading(loginBtn, false);

        if (res.error) {
            loginError.textContent = res.error;
            loginError.classList.remove("hidden");
        } else {
            showDashboard(emailInput.value.trim());
        }
    });

    // ── Logout ──
    logoutBtn.addEventListener("click", async () => {
        await sendMsg({ action: "logout" });
        loginView.classList.remove("hidden");
        dashView.classList.add("hidden");
        masterPwInput.value = "";
    });

    // ── Show dashboard ──
    async function showDashboard(email) {
        loginView.classList.add("hidden");
        dashView.classList.remove("hidden");
        userEmail.textContent = email;
        await loadEntries();
    }

    // ── Load vault entries ──
    async function loadEntries() {
        entriesList.innerHTML = '<div class="empty-state"><div class="spin" style="margin:0 auto;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:28px;height:28px;color:var(--text-muted);animation:spinner 1s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg></div><p style="margin-top:12px">Loading vault…</p></div>';

        const res = await sendMsg({ action: "getVaultEntries" });
        if (res.error) {
            entriesList.innerHTML = `<div class="error-msg">${escapeHtml(res.error)}</div>`;
            return;
        }

        allEntries = res.entries || [];
        renderEntries(allEntries);
    }

    // ── Search ──
    searchInput.addEventListener("input", () => {
        const q = searchInput.value.toLowerCase();
        const filtered = allEntries.filter(e =>
            (e.name || "").toLowerCase().includes(q) ||
            (e.username || "").toLowerCase().includes(q) ||
            (e.url || "").toLowerCase().includes(q)
        );
        renderEntries(filtered);
    });

    // ── Render entries ──
    function renderEntries(entries) {
        if (entries.length === 0) {
            entriesList.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg>
          <p>No passwords found</p>
          <span>Login to any site to auto-capture or manually add</span>
        </div>
      `;
            return;
        }

        const colors = ["#3b82f6", "#7c3aed", "#ef4444", "#f59e0b", "#10b981", "#06b6d4", "#ec4899", "#64748b"];

        entriesList.innerHTML = entries.map((entry, i) => {
            const color = colors[entry.name.split("").reduce((s, c) => s + c.charCodeAt(0), 0) % colors.length];
            const letter = (entry.name && entry.name[0].toUpperCase()) || "?";
            const faviconUrl = getFaviconUrl(entry.url);
            return `
        <div class="entry-card" data-idx="${i}">
          <div class="entry-icon" style="background:${color}">
            ${faviconUrl
                    ? `<img src="${faviconUrl}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" style="width:100%;height:100%;border-radius:8px;object-fit:cover" /><span style="display:none">${letter}</span>`
                    : letter}
          </div>
          <div class="entry-details">
            <div class="entry-name">${escapeHtml(entry.name)}</div>
            <div class="entry-username">${escapeHtml(entry.username || entry.url || "No details")}</div>
          </div>
          <div class="entry-actions">
            <button class="entry-action-btn copy-user-btn" title="Copy username" data-value="${escapeAttr(entry.username || "")}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </button>
            <button class="entry-action-btn copy-pw-btn" title="Copy password" data-value="${escapeAttr(entry.password || "")}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
          </div>
        </div>
      `;
        }).join("");

        // Copy handlers
        entriesList.querySelectorAll(".copy-user-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                copyToClipboard(btn.dataset.value, "Username copied!");
            });
        });
        entriesList.querySelectorAll(".copy-pw-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                copyToClipboard(btn.dataset.value, "Password copied!");
            });
        });

        // Click entry to autofill on current page
        entriesList.querySelectorAll(".entry-card").forEach(card => {
            card.addEventListener("click", async () => {
                const idx = parseInt(card.dataset.idx);
                const entry = entries[idx];
                try {
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (tab?.id) {
                        await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: autofillOnPage,
                            args: [entry.username || "", entry.password || ""]
                        });
                        showToast("Autofilled on page!");
                    }
                } catch {
                    showToast("Could not autofill on this page");
                }
            });
        });
    }

    // ── Save form ──
    saveForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        saveError.classList.add("hidden");
        saveSuccess.classList.add("hidden");
        const saveBtn = document.getElementById("save-btn");
        setLoading(saveBtn, true);

        const res = await sendMsg({
            action: "saveCredential",
            name: document.getElementById("save-name").value.trim(),
            username: document.getElementById("save-username").value.trim(),
            password: savePwInput.value,
            url: document.getElementById("save-url").value.trim()
        });

        setLoading(saveBtn, false);

        if (res.error) {
            saveError.textContent = res.error;
            saveError.classList.remove("hidden");
        } else {
            saveSuccess.textContent = res.updated ? "✅ Password updated in vault!" : "✅ Saved to vault successfully!";
            saveSuccess.classList.remove("hidden");
            saveForm.reset();
            // Refresh the passwords tab
            await loadEntries();
        }
    });

    // ── Toggle password visibility ──
    toggleSavePw.addEventListener("click", () => {
        const isPassword = savePwInput.type === "password";
        savePwInput.type = isPassword ? "text" : "password";
    });

    // ── Pre-fill save form from active tab URL ──
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url) {
            const url = new URL(tab.url);
            document.getElementById("save-url").value = url.origin;
            // Try to guess name from hostname
            const host = url.hostname.replace("www.", "");
            document.getElementById("save-name").value = host.split(".").slice(0, -1).join(".") || host;
        }
    } catch { /* ignore */ }

    // ── Helpers ──

    function sendMsg(msg) {
        return new Promise(resolve => {
            chrome.runtime.sendMessage(msg, res => {
                resolve(res || { error: "No response" });
            });
        });
    }

    function setLoading(btn, loading) {
        const text = btn.querySelector(".btn-text");
        const loader = btn.querySelector(".btn-loader");
        if (loading) {
            text.classList.add("hidden");
            loader.classList.remove("hidden");
            btn.disabled = true;
        } else {
            text.classList.remove("hidden");
            loader.classList.add("hidden");
            btn.disabled = false;
        }
    }

    function copyToClipboard(text, message) {
        navigator.clipboard.writeText(text);
        showToast(message || "Copied!");
    }

    function showToast(message) {
        let toast = document.querySelector(".copy-toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.className = "copy-toast";
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 1800);
    }

    function escapeHtml(str) {
        const d = document.createElement("div");
        d.textContent = str || "";
        return d.innerHTML;
    }

    function escapeAttr(str) {
        return (str || "").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function getFaviconUrl(url) {
        if (!url) return null;
        try {
            const u = new URL(url.startsWith("http") ? url : `https://${url}`);
            return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
        } catch { return null; }
    }
});

// This function gets injected into the active page for autofill
function autofillOnPage(username, password) {
    function setVal(el, val) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(el, val);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const pwField = document.querySelector('input[type="password"]');
    if (!pwField) return;

    const form = pwField.closest("form") || document.body;
    const userField =
        form.querySelector('input[name*="user" i]') ||
        form.querySelector('input[name*="login" i]') ||
        form.querySelector('input[name*="email" i]') ||
        form.querySelector('input[name*="roll" i]') ||
        form.querySelector('input[type="text"]') ||
        form.querySelector('input[type="email"]');

    if (userField && username) setVal(userField, username);
    if (password) setVal(pwField, password);
}
