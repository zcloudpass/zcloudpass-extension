// ─── zCloudPass Background Service Worker ───
// Handles communication between popup, content scripts, and the API

const DEFAULT_API_URL = "https://zcloudpass-backend.onrender.com/api/v1";

// ── Crypto helpers (PBKDF2 + AES-GCM, mirrors web-app crypto.ts) ──

async function deriveKey(masterPassword, salt) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
        "raw", enc.encode(masterPassword), "PBKDF2", false, ["deriveBits", "deriveKey"]
    );
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
        baseKey,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

async function encryptVault(vault, masterPassword) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(masterPassword, salt);
    const enc = new TextEncoder();
    const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(vault)));
    const combined = new Uint8Array(salt.length + iv.length + buf.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(buf), salt.length + iv.length);
    return btoa(String.fromCharCode(...combined));
}

async function decryptVault(encrypted, masterPassword) {
    const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const data = combined.slice(28);
    const key = await deriveKey(masterPassword, salt);
    const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return JSON.parse(new TextDecoder().decode(dec));
}

// ── API calls ──

async function apiLogin(email, masterPassword, apiUrl) {
    const res = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, master_password: masterPassword })
    });
    if (!res.ok) throw new Error(`Login failed (${res.status})`);
    return res.json();
}

async function apiGetVault(sessionToken, apiUrl) {
    const res = await fetch(`${apiUrl}/vault`, {
        method: "GET",
        headers: { Authorization: `Bearer ${sessionToken}`, "Content-Type": "application/json" }
    });
    if (!res.ok) throw new Error(`Fetch vault failed (${res.status})`);
    return res.json();
}

async function apiUpdateVault(sessionToken, encryptedVault, apiUrl) {
    const res = await fetch(`${apiUrl}/vault`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${sessionToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ encrypted_vault: encryptedVault })
    });
    if (!res.ok) throw new Error(`Update vault failed (${res.status})`);
}

// ── Message handler ──

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handleMessage(msg).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true; // keep channel open for async
});

async function handleMessage(msg) {
    const { action } = msg;

    if (action === "login") {
        const { email, masterPassword, apiUrl } = msg;
        const url = apiUrl || DEFAULT_API_URL;
        const loginRes = await apiLogin(email, masterPassword, url);
        await chrome.storage.local.set({
            sessionToken: loginRes.session_token,
            expiresAt: loginRes.expires_at,
            email,
            masterPassword,   // needed to decrypt / re-encrypt vault
            apiUrl: url
        });
        return { success: true, expiresAt: loginRes.expires_at };
    }

    if (action === "logout") {
        await chrome.storage.local.remove(["sessionToken", "expiresAt", "email", "masterPassword"]);
        return { success: true };
    }

    if (action === "getStatus") {
        const data = await chrome.storage.local.get(["sessionToken", "email", "expiresAt"]);
        return { loggedIn: !!data.sessionToken, email: data.email, expiresAt: data.expiresAt };
    }

    if (action === "getVaultEntries") {
        const data = await chrome.storage.local.get(["sessionToken", "masterPassword", "apiUrl"]);
        if (!data.sessionToken) throw new Error("Not logged in");
        const vaultRes = await apiGetVault(data.sessionToken, data.apiUrl || DEFAULT_API_URL);
        if (!vaultRes.encrypted_vault) return { entries: [] };
        const vault = await decryptVault(vaultRes.encrypted_vault, data.masterPassword);
        return { entries: vault.entries || [] };
    }

    if (action === "saveCredential") {
        const { name, username, password, url } = msg;
        const data = await chrome.storage.local.get(["sessionToken", "masterPassword", "apiUrl"]);
        if (!data.sessionToken) throw new Error("Not logged in");
        const apiUrl = data.apiUrl || DEFAULT_API_URL;

        // 1. Fetch + decrypt existing vault
        const vaultRes = await apiGetVault(data.sessionToken, apiUrl);
        let vault = { entries: [] };
        if (vaultRes.encrypted_vault) {
            vault = await decryptVault(vaultRes.encrypted_vault, data.masterPassword);
        }

        // 2. Check for duplicates (same url + username)
        const existing = vault.entries.find(
            e => e.url === url && e.username === username
        );
        if (existing) {
            existing.password = password;
            existing.name = name || existing.name;
        } else {
            vault.entries.push({
                id: Date.now().toString(),
                name: name || "AUMS Amrita",
                username,
                password,
                url,
                notes: `Saved by zCloudPass Extension on ${new Date().toLocaleString()}`
            });
        }

        // 3. Encrypt + push
        const encrypted = await encryptVault(vault, data.masterPassword);
        await apiUpdateVault(data.sessionToken, encrypted, apiUrl);
        return { success: true, updated: !!existing };
    }

    if (action === "getMatchingEntries") {
        const { url: pageUrl } = msg;
        const data = await chrome.storage.local.get(["sessionToken", "masterPassword", "apiUrl"]);
        if (!data.sessionToken) return { entries: [] };
        try {
            const vaultRes = await apiGetVault(data.sessionToken, data.apiUrl || DEFAULT_API_URL);
            if (!vaultRes.encrypted_vault) return { entries: [] };
            const vault = await decryptVault(vaultRes.encrypted_vault, data.masterPassword);
            const matches = vault.entries.filter(e => {
                if (!e.url) return false;
                try {
                    const entryHost = new URL(e.url.startsWith("http") ? e.url : `https://${e.url}`).hostname;
                    const pageHost = new URL(pageUrl).hostname;
                    return entryHost === pageHost || pageHost.endsWith(`.${entryHost}`) || entryHost.endsWith(`.${pageHost}`);
                } catch { return false; }
            });
            return { entries: matches };
        } catch {
            return { entries: [] };
        }
    }

    throw new Error(`Unknown action: ${action}`);
}
