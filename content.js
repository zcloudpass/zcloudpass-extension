// ─── zCloudPass Content Script ───
// Injects into AUMS Amrita pages to detect login forms and offer autofill / save

(function () {
    "use strict";

    const BANNER_ID = "zcloudpass-save-banner";
    const AUTOFILL_ID = "zcloudpass-autofill-banner";
    let observerActive = false;
    let capturedCredentials = null;

    // ── Utility ──
    function findLoginForm() {
        // AUMS uses a standard form with username + password inputs
        const forms = document.querySelectorAll("form");
        for (const form of forms) {
            const pwField = form.querySelector('input[type="password"]');
            const userField =
                form.querySelector('input[name*="user" i]') ||
                form.querySelector('input[name*="login" i]') ||
                form.querySelector('input[name*="email" i]') ||
                form.querySelector('input[name*="roll" i]') ||
                form.querySelector('input[name*="uid" i]') ||
                form.querySelector('input[type="text"]') ||
                form.querySelector('input[type="email"]');
            if (pwField && userField) {
                return { form, userField, pwField };
            }
        }
        // Fallback: look for any password field on the page
        const pwField = document.querySelector('input[type="password"]');
        if (pwField) {
            const container = pwField.closest("form") || document.body;
            const userField =
                container.querySelector('input[name*="user" i]') ||
                container.querySelector('input[name*="login" i]') ||
                container.querySelector('input[name*="email" i]') ||
                container.querySelector('input[name*="roll" i]') ||
                container.querySelector('input[type="text"]') ||
                container.querySelector('input[type="email"]');
            return { form: container, userField, pwField };
        }
        return null;
    }

    // ── Save banner ──
    function showSaveBanner(username, password) {
        if (document.getElementById(BANNER_ID)) return;
        const banner = document.createElement("div");
        banner.id = BANNER_ID;
        banner.innerHTML = `
      <div class="zcp-banner-inner">
        <div class="zcp-banner-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <div class="zcp-banner-text">
          <strong>zCloudPass</strong>
          <span>Save password for <b>${escapeHtml(username)}</b>?</span>
        </div>
        <div class="zcp-banner-actions">
          <button id="zcp-save-btn" class="zcp-btn zcp-btn-primary">Save</button>
          <button id="zcp-dismiss-btn" class="zcp-btn zcp-btn-ghost">Dismiss</button>
        </div>
      </div>
    `;
        document.body.appendChild(banner);

        document.getElementById("zcp-save-btn").addEventListener("click", () => {
            saveCredentialToVault(username, password);
        });
        document.getElementById("zcp-dismiss-btn").addEventListener("click", () => {
            banner.classList.add("zcp-banner-hide");
            setTimeout(() => banner.remove(), 300);
        });
    }

    // ── Autofill banner ──
    function showAutofillBanner(entries, userField, pwField) {
        if (document.getElementById(AUTOFILL_ID)) return;
        if (!entries || entries.length === 0) return;

        const banner = document.createElement("div");
        banner.id = AUTOFILL_ID;

        let entryListHtml = entries.map((e, i) => `
      <button class="zcp-entry-btn" data-idx="${i}">
        <span class="zcp-entry-user">${escapeHtml(e.username || "No username")}</span>
        <span class="zcp-entry-name">${escapeHtml(e.name)}</span>
      </button>
    `).join("");

        banner.innerHTML = `
      <div class="zcp-banner-inner zcp-autofill-inner">
        <div class="zcp-banner-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
            <polyline points="10 17 15 12 10 7"/>
            <line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
        </div>
        <div class="zcp-banner-text">
          <strong>zCloudPass</strong>
          <span>Autofill a saved login?</span>
        </div>
        <div class="zcp-entry-list">${entryListHtml}</div>
        <button id="zcp-autofill-dismiss" class="zcp-btn zcp-btn-ghost zcp-close-btn">✕</button>
      </div>
    `;
        document.body.appendChild(banner);

        banner.querySelectorAll(".zcp-entry-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.dataset.idx);
                const entry = entries[idx];
                if (userField && entry.username) {
                    setNativeValue(userField, entry.username);
                }
                if (pwField && entry.password) {
                    setNativeValue(pwField, entry.password);
                }
                banner.classList.add("zcp-banner-hide");
                setTimeout(() => banner.remove(), 300);
            });
        });

        document.getElementById("zcp-autofill-dismiss").addEventListener("click", () => {
            banner.classList.add("zcp-banner-hide");
            setTimeout(() => banner.remove(), 300);
        });
    }

    // Set a form value natively (triggers React/Angular change detection)
    function setNativeValue(el, value) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, "value"
        ).set;
        nativeInputValueSetter.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function escapeHtml(str) {
        const d = document.createElement("div");
        d.textContent = str;
        return d.innerHTML;
    }

    // ── Save to vault via background ──
    async function saveCredentialToVault(username, password) {
        const saveBtn = document.getElementById("zcp-save-btn");
        if (saveBtn) {
            saveBtn.textContent = "Saving…";
            saveBtn.disabled = true;
        }

        try {
            const response = await chrome.runtime.sendMessage({
                action: "saveCredential",
                name: document.title || "AUMS Amrita",
                username,
                password,
                url: window.location.origin
            });

            if (response.error) {
                showBannerStatus("❌ " + response.error, true);
            } else {
                showBannerStatus(response.updated ? "✅ Password updated!" : "✅ Saved to vault!", false);
            }
        } catch (err) {
            showBannerStatus("❌ " + err.message, true);
        }
    }

    function showBannerStatus(text, isError) {
        const banner = document.getElementById(BANNER_ID);
        if (!banner) return;
        const inner = banner.querySelector(".zcp-banner-inner");
        inner.innerHTML = `
      <div class="zcp-banner-text" style="flex:1; text-align:center;">
        <span style="color: ${isError ? "#ef4444" : "#10b981"}">${text}</span>
      </div>
    `;
        setTimeout(() => {
            banner.classList.add("zcp-banner-hide");
            setTimeout(() => banner.remove(), 300);
        }, 2500);
    }

    // ── Intercept form submission ──
    function interceptForm(loginInfo) {
        const { form, userField, pwField } = loginInfo;

        function captureAndStore() {
            const username = userField?.value;
            const password = pwField?.value;
            if (username && password) {
                capturedCredentials = { username, password };

                // AUMS uses CAS redirect login — the page navigates away on submit.
                // Persist credentials to chrome.storage so the next page can offer to save.
                const pendingData = {
                    username,
                    password,
                    url: window.location.origin,
                    name: "AUMS Amrita"
                };
                try {
                    chrome.storage.local.set({ pendingCredential: pendingData });
                } catch (e) { /* ignore */ }

                // In case the page stays (AJAX), show banner after delay
                setTimeout(() => {
                    if (capturedCredentials) {
                        showSaveBanner(capturedCredentials.username, capturedCredentials.password);
                        capturedCredentials = null;
                    }
                }, 2000);
            }
        }

        form.addEventListener("submit", captureAndStore);

        // Also catch click on submit buttons (AUMS uses input[type="submit"] with name="submit")
        const submitBtns = form.querySelectorAll(
            'button[type="submit"], input[type="submit"], input[name="submit"], button:not([type]), .btn-submit'
        );
        submitBtns.forEach(btn => {
            btn.addEventListener("click", captureAndStore);
        });
    }

    // ── Autofill check ──
    async function checkForAutofill(loginInfo) {
        try {
            const response = await chrome.runtime.sendMessage({
                action: "getMatchingEntries",
                url: window.location.href
            });
            if (response.entries && response.entries.length > 0) {
                showAutofillBanner(response.entries, loginInfo.userField, loginInfo.pwField);
            }
        } catch {
            // Extension not logged in – ignore
        }
    }

    // ── Init ──
    function init() {
        const loginInfo = findLoginForm();
        if (!loginInfo) {
            // Retry after a moment (some pages load dynamically)
            if (!observerActive) {
                observerActive = true;
                const observer = new MutationObserver(() => {
                    const info = findLoginForm();
                    if (info) {
                        observer.disconnect();
                        interceptForm(info);
                        checkForAutofill(info);
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
                // Timeout after 10s
                setTimeout(() => observer.disconnect(), 10000);
            }
            return;
        }
        interceptForm(loginInfo);
        checkForAutofill(loginInfo);
    }

    // Check if there are captured creds from a previous page (CAS redirect)
    try {
        chrome.storage?.local?.get(["pendingCredential"], (data) => {
            if (data?.pendingCredential) {
                const { username, password } = data.pendingCredential;
                if (username && password) {
                    // Small delay to let the page finish loading
                    setTimeout(() => {
                        showSaveBanner(username, password);
                    }, 800);
                }
                chrome.storage.local.remove(["pendingCredential"]);
            }
        });
    } catch (e) { /* extension context may not be available */ }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
