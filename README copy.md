# 🔐 zCloudPass Browser Extension

A Chrome/Edge browser extension for **zCloudPass** — automatically capture and autofill passwords from **any website** into your encrypted zCloudPass vault.

## ✨ Features

- **Auto-detect login forms** on all websites
- **Save credentials** when you log in — a floating banner asks "Save this password?"
- **Autofill** saved passwords on matching sites with one click
- **Search & browse** all vault entries from the popup
- **Copy** usernames/passwords to clipboard
- **Manual save** — add any credential from the popup's "Save New" tab
- **End-to-end encrypted** — uses the same PBKDF2 + AES-GCM encryption as the web app
- **Works with your existing zCloudPass account** (same backend API)

## 🚀 Installation

### Load as Unpacked Extension (Development)

1. Open **Chrome** (or Edge) and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select the `zcloudpass-extension` folder
5. The extension icon should appear in your toolbar!

### Pin the Extension

- Click the puzzle piece icon (🧩) in Chrome's toolbar
- Find **zCloudPass** and click the pin icon 📌

## 🔑 Usage

### First-Time Setup

1. Click the **zCloudPass** icon in the toolbar
2. Enter your **zCloudPass email** and **master password**
3. (Optional) Under "Advanced", set a custom API URL for local dev
4. Click **Sign In**

### Auto-Save Credentials

1. Navigate to any website's login page
2. Enter your username/email and password
3. Submit the form
4. A **floating banner** will appear at the top: *"Save password for user@example.com?"*
5. Click **Save** — credentials are encrypted and stored in your vault!

### Autofill on any site

1. When you visit a login page with a saved password, a **blue autofill banner** appears
2. Select the account to fill
3. Username and password are automatically inserted

### Browse Vault in Popup

- Open the popup → **Passwords** tab shows all saved entries
- **Search** by name, username, or URL
- **Hover** an entry to copy username/password
- **Click** an entry to autofill it on the current page

### Manually Save a Password

- Open the popup → **Save New** tab
- Fill in the site name, URL, username, and password
- Click **Save to Vault**

## 🏗️ Architecture

```
zcloudpass-extension/
├── manifest.json       # Chrome Manifest V3 config
├── background.js       # Service worker (API calls, crypto, message routing)
├── content.js          # Injected into pages (form detection, save/autofill banners)
├── content.css         # Styles for injected banners
├── popup.html          # Extension popup UI
├── popup.css           # Popup styles (dark theme)
├── popup.js            # Popup logic (login, search, save, autofill)
└── icons/              # Extension icons (16, 32, 48, 128px)
```

## 🔒 Security

- **Zero-knowledge encryption**: Your master password never leaves the extension
- **PBKDF2 key derivation** (100,000 iterations) with AES-256-GCM encryption
- **Same crypto** as the web app — vaults are interchangeable
- Session tokens expire after 1 hour
- No telemetry or analytics

## 🛠️ Development

- Edit files directly — no build step needed!
- After making changes, go to `chrome://extensions/` and click the **refresh** icon on the extension card
- Open the popup's DevTools: right-click the popup → **Inspect**
- Content script console logs appear in the **page's DevTools console**

## 📋 Supported Sites

The content script auto-injects on:
- `<all_urls>` (All websites)

You can manage site permissions in your browser's extension settings.
