// ─── zCloudPass Content Script ───
// Injects into ALL websites to detect login forms and offer autofill / save
// Supports multi-step login flows (username on one page, password on the next)

(function () {
    "use strict";

    const BANNER_ID = "zcloudpass-save-banner";
    const AUTOFILL_ID = "zcloudpass-autofill-banner";
    let observerActive = false;
    let capturedCredentials = null;

    // ── Multi-step login state ──
    // Tracks username captured on a page that only has a username field (no password)
    let pendingUsername = null;

    // ── Utility ──

    // Get a friendly site name from the page
    function getSiteName() {
        // Try to extract a clean name from the page title or hostname
        const title = document.title || "";
        const hostname = window.location.hostname || "";

        // Use the title if it's reasonable, otherwise fall back to hostname
        if (title && title.length > 2 && title.length < 80) {
            // Clean up common suffixes like " - Login", " | Sign In", etc.
            return title
                .replace(/\s*[-–—|·•]\s*(log\s*in|sign\s*in|account|welcome|home).*$/i, "")
                .replace(/\s*(log\s*in|sign\s*in)\s*[-–—|·•]\s*/i, "")
                .trim() || hostname;
        }
        // Fall back to a clean hostname (remove www.)
        return hostname.replace(/^www\./, "");
    }

    // Find login form — works on any website
    function findLoginForm() {
        const result = { form: null, userField: null, pwField: null, isMultiStep: false };

        // Strategy 1: Find a form with both username and password fields
        const forms = document.querySelectorAll("form");
        for (const form of forms) {
            const pwField = form.querySelector('input[type="password"]:not([aria-hidden="true"])');
            const userField = findUsernameField(form);
            if (pwField && userField) {
                return { form, userField, pwField, isMultiStep: false };
            }
        }

        // Strategy 2: No form with both? Look for a password field anywhere on the page
        const pwField = document.querySelector('input[type="password"]:not([aria-hidden="true"])');
        if (pwField) {
            const container = pwField.closest("form") || document.body;
            const userField = findUsernameField(container);
            return {
                form: pwField.closest("form") || container,
                userField,
                pwField,
                isMultiStep: !userField  // If no username field, it's likely step 2 of a multi-step flow
            };
        }

        // Strategy 3: No password field visible — check for username-only forms (multi-step step 1)
        for (const form of forms) {
            const userField = findUsernameField(form);
            if (userField && !form.querySelector('input[type="password"]')) {
                // Check if this looks like a login form (has a submit/continue button)
                const hasSubmit = form.querySelector(
                    'button[type="submit"], input[type="submit"], button:not([type]), [role="button"]'
                );
                if (hasSubmit) {
                    return { form, userField, pwField: null, isMultiStep: true };
                }
            }
        }

        // Strategy 4: Loose fallback — look for any text/email input that looks like a login
        const allInputs = document.querySelectorAll(
            'input[type="text"], input[type="email"], input[type="tel"]'
        );
        for (const input of allInputs) {
            if (looksLikeUsernameField(input)) {
                const form = input.closest("form");
                if (form) {
                    return { form, userField: input, pwField: null, isMultiStep: true };
                }
            }
        }

        return null;
    }

    // Find a username/email input within a container
    function findUsernameField(container) {
        // Priority order: explicit name/id matches, then type-based fallbacks
        const selectors = [
            'input[autocomplete="username"]',
            'input[autocomplete="email"]',
            'input[name*="user" i]',
            'input[name*="login" i]',
            'input[name*="email" i]',
            'input[name*="roll" i]',
            'input[name*="uid" i]',
            'input[name*="account" i]',
            'input[name*="phone" i]',
            'input[id*="user" i]',
            'input[id*="login" i]',
            'input[id*="email" i]',
            'input[id*="account" i]',
            'input[id*="phone" i]',
            'input[aria-label*="user" i]',
            'input[aria-label*="email" i]',
            'input[aria-label*="phone" i]',
            'input[placeholder*="user" i]',
            'input[placeholder*="email" i]',
            'input[placeholder*="phone" i]',
            'input[placeholder*="roll" i]',
            'input[type="email"]',
            'input[type="tel"]',
            'input[type="text"]',
        ];

        for (const sel of selectors) {
            const field = container.querySelector(sel);
            if (field && isVisible(field) && !isHiddenInput(field)) {
                return field;
            }
        }
        return null;
    }

    // Check if an input looks like a username field based on attributes
    function looksLikeUsernameField(input) {
        const attrs = [
            input.name, input.id, input.placeholder,
            input.getAttribute("aria-label"), input.autocomplete
        ].filter(Boolean).join(" ").toLowerCase();

        const keywords = [
            "user", "email", "login", "account", "phone",
            "roll", "uid", "identifier", "sign"
        ];
        return keywords.some(kw => attrs.includes(kw));
    }

    // Check if element is visible
    function isVisible(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== "none" &&
               style.visibility !== "hidden" &&
               style.opacity !== "0" &&
               el.offsetWidth > 0 &&
               el.offsetHeight > 0;
    }

    // Check if input is a hidden/honeypot field
    function isHiddenInput(el) {
        return el.type === "hidden" ||
               el.tabIndex === -1 ||
               el.getAttribute("aria-hidden") === "true";
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
          <span>Save password for <b>${escapeHtml(username)}</b> on <b>${escapeHtml(getSiteName())}</b>?</span>
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
                // If this is a multi-step form (no password field), store username for step 2
                if (!pwField && entry.username && userField) {
                    setNativeValue(userField, entry.username);
                    // Store password for autofill on the next step
                    try {
                        chrome.storage.local.set({
                            pendingAutofill: {
                                password: entry.password,
                                url: window.location.origin,
                                timestamp: Date.now()
                            }
                        });
                    } catch (e) { /* ignore */ }
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

    // Set a form value natively (triggers React/Angular/Vue change detection)
    function setNativeValue(el, value) {
        // Focus the element first
        el.focus();

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, "value"
        ).set;
        nativeInputValueSetter.call(el, value);

        // Dispatch multiple events for maximum compatibility
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
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
                name: getSiteName(),
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
        const { form, userField, pwField, isMultiStep } = loginInfo;

        function captureAndStore(e) {
            const username = userField?.value;
            const password = pwField?.value;

            // ── Multi-step step 1: Only username visible, no password field ──
            if (username && !password && isMultiStep) {
                // Store the username for step 2
                pendingUsername = username;
                try {
                    chrome.storage.local.set({
                        pendingUsername: {
                            username,
                            url: window.location.origin,
                            name: getSiteName(),
                            timestamp: Date.now()
                        }
                    });
                } catch (e) { /* ignore */ }
                return; // Don't show banner yet, wait for password
            }

            // ── Standard flow or multi-step step 2 ──
            if (password) {
                // If we don't have a username from this page, check for pending from step 1
                let finalUsername = username || pendingUsername;

                if (!finalUsername) {
                    // Try to get from storage (cross-page multi-step flow)
                    // We handle this asynchronously below
                    chrome.storage.local.get(["pendingUsername"], (data) => {
                        if (data?.pendingUsername) {
                            const pending = data.pendingUsername;
                            // Only use if from the same origin and within the last 5 minutes
                            const isRecent = (Date.now() - pending.timestamp) < 5 * 60 * 1000;
                            const isSameOrigin = pending.url === window.location.origin;
                            if (isRecent && isSameOrigin) {
                                finalUsername = pending.username;
                            }
                        }
                        if (finalUsername && password) {
                            storeCapturedCredentials(finalUsername, password);
                        }
                        chrome.storage.local.remove(["pendingUsername"]);
                    });
                    return;
                }

                storeCapturedCredentials(finalUsername, password);
            }
        }

        function storeCapturedCredentials(username, password) {
            capturedCredentials = { username, password };

            // Persist credentials for redirect-based logins
            const pendingData = {
                username,
                password,
                url: window.location.origin,
                name: getSiteName()
            };
            try {
                chrome.storage.local.set({ pendingCredential: pendingData });
            } catch (e) { /* ignore */ }

            // Clear any pending username
            pendingUsername = null;
            try {
                chrome.storage.local.remove(["pendingUsername"]);
            } catch (e) { /* ignore */ }

            // In case the page stays (AJAX/SPA), show banner after delay
            setTimeout(() => {
                if (capturedCredentials) {
                    showSaveBanner(capturedCredentials.username, capturedCredentials.password);
                    capturedCredentials = null;
                }
            }, 2000);
        }

        if (form && form !== document.body) {
            form.addEventListener("submit", captureAndStore, true);
        }

        // Also catch click on submit/continue buttons
        const submitBtns = (form || document.body).querySelectorAll(
            'button[type="submit"], input[type="submit"], input[name="submit"], button:not([type]), .btn-submit, [role="button"]'
        );
        submitBtns.forEach(btn => {
            btn.addEventListener("click", captureAndStore, true);
        });

        // For Enter key submission
        const targetFields = [userField, pwField].filter(Boolean);
        targetFields.forEach(field => {
            field.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    captureAndStore(e);
                }
            });
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

    // ── Check for pending autofill from multi-step step 1 ──
    async function checkPendingAutofill(pwField) {
        if (!pwField) return;
        try {
            chrome.storage.local.get(["pendingAutofill"], (data) => {
                if (data?.pendingAutofill) {
                    const pending = data.pendingAutofill;
                    const isRecent = (Date.now() - pending.timestamp) < 5 * 60 * 1000;
                    const isSameOrigin = pending.url === window.location.origin;
                    if (isRecent && isSameOrigin && pending.password) {
                        setNativeValue(pwField, pending.password);
                    }
                    chrome.storage.local.remove(["pendingAutofill"]);
                }
            });
        } catch (e) { /* ignore */ }
    }

    // ── Watch for dynamically added password fields (multi-step SPAs) ──
    function watchForPasswordField() {
        const observer = new MutationObserver(() => {
            const pwField = document.querySelector('input[type="password"]:not([aria-hidden="true"])');
            if (pwField && isVisible(pwField)) {
                observer.disconnect();

                // We found a password field that appeared dynamically
                const container = pwField.closest("form") || document.body;
                const userField = findUsernameField(container);

                const loginInfo = {
                    form: pwField.closest("form") || container,
                    userField,
                    pwField,
                    isMultiStep: !userField  // No username visible = step 2
                };

                interceptForm(loginInfo);
                checkForAutofill(loginInfo);
                checkPendingAutofill(pwField);

                // If we had a pending username (from step 1 on same page), load it
                if (!userField) {
                    chrome.storage.local.get(["pendingUsername"], (data) => {
                        if (data?.pendingUsername) {
                            const pending = data.pendingUsername;
                            const isRecent = (Date.now() - pending.timestamp) < 5 * 60 * 1000;
                            if (isRecent) {
                                pendingUsername = pending.username;
                            }
                        }
                    });
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        // Timeout after 30s to avoid indefinite observation
        setTimeout(() => observer.disconnect(), 30000);
    }

    // ── Init ──
    function init() {
        // Don't run on extension pages, chrome:// pages, etc.
        if (window.location.protocol === "chrome-extension:" ||
            window.location.protocol === "chrome:" ||
            window.location.protocol === "about:" ||
            window.location.protocol === "moz-extension:") {
            return;
        }

        const loginInfo = findLoginForm();
        if (!loginInfo) {
            // No login form found yet — watch for dynamically loaded ones
            if (!observerActive) {
                observerActive = true;
                const observer = new MutationObserver(() => {
                    const info = findLoginForm();
                    if (info) {
                        observer.disconnect();
                        interceptForm(info);
                        checkForAutofill(info);
                        if (info.pwField) {
                            checkPendingAutofill(info.pwField);
                        }
                        // If multi-step step 1, also watch for password field to appear
                        if (info.isMultiStep && !info.pwField) {
                            watchForPasswordField();
                        }
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
                // Timeout after 15s
                setTimeout(() => observer.disconnect(), 15000);
            }
            return;
        }

        interceptForm(loginInfo);
        checkForAutofill(loginInfo);

        if (loginInfo.pwField) {
            checkPendingAutofill(loginInfo.pwField);
        }

        // If this is a multi-step form (username only), watch for password field
        if (loginInfo.isMultiStep && !loginInfo.pwField) {
            watchForPasswordField();
        }
    }

    // Check if there are captured creds from a previous page (redirect-based login)
    try {
        chrome.storage?.local?.get(["pendingCredential"], (data) => {
            if (data?.pendingCredential) {
                const { username, password, url } = data.pendingCredential;
                // Only show if we're now on a different page (successful redirect)
                const isDifferentPage = url !== window.location.origin ||
                    !document.querySelector('input[type="password"]');
                if (username && password && isDifferentPage) {
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
