# 🏏 RCB Ticket Monitor

> Get instant Telegram alerts the **second** RCB match tickets drop on [shop.royalchallengers.com](https://shop.royalchallengers.com/ticket). Never miss a Chinnaswamy match again!

![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js)
![GitHub Actions](https://img.shields.io/badge/Runs%20on-GitHub%20Actions-blue?logo=github)
![Telegram](https://img.shields.io/badge/Alerts%20via-Telegram-26A5E4?logo=telegram)
![License](https://img.shields.io/badge/License-ISC-yellow)

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔌 **API-First Detection** | Hits the official TicketGenie API directly — no fragile HTML scraping |
| 🛡️ **DOM Fallback** | If the API is down, auto-falls back to Puppeteer + Cheerio browser scraping |
| 🏟️ **Dynamic Match Discovery** | Automatically detects which matches have tickets — zero hardcoding needed |
| 🔔 **Smart Alerts** | 4 alert types: `LIVE 🚨`, `SOLD OUT 😔`, `BACK IN STOCK 🔄`, `ERROR ⚠️` |
| 🚫 **No Duplicate Spam** | Per-match state tracking — alerts ONLY when a match's status **changes** |
| ⚡ **Near Real-Time** | Polls every 15-25 seconds for 4.5 minutes per run (≤25s detection window) |
| 🕵️ **Bot Evasion** | Rotating User-Agents, random delays, anti-fingerprinting headers |
| 🆓 **100% Free** | Runs on GitHub Actions (unlimited for public repos) |

---

## 📱 Alert Examples

**When tickets drop:**
```
🚨🏏 RCB TICKETS ARE LIVE! 🏏🚨
━━━━━━━━━━━━━━━━━━━━━━━━
✅ Status: TICKETS AVAILABLE NOW!

🆚 Match: RCB vs Sunrisers Hyderabad
📅 Date: 28 Mar 2026
🏟️ Venue: M. Chinnaswamy Stadium

🔗 👉 BOOK NOW
━━━━━━━━━━━━━━━━━━━━━━━━
⏰ Detected: 24 Mar 2026, 11:45:30 AM IST

Book immediately — tickets sell out in minutes! 🔥
```

---

## 🚀 Setup Guide (15 minutes)

### Prerequisites
- A [GitHub](https://github.com) account
- [Telegram](https://telegram.org) app installed
- [Node.js 20+](https://nodejs.org) (only for local testing)

### Step 1 — Create a Telegram Bot

1. Open Telegram → search for **@BotFather**
2. Send `/newbot` → follow the prompts to name your bot
3. Copy the **API Token** BotFather gives you (looks like `123456789:ABCdefGHI...`)
4. Send any message to your new bot (e.g., "hello")
5. Open this URL in your browser (replace `<TOKEN>` with your actual token):
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
6. Find `"chat":{"id":123456789}` in the response → copy that number. This is your **Chat ID**.

### Step 2 — Fork & Configure This Repo

1. **Fork** this repository to your GitHub account
2. Go to your forked repo → **Settings** → **Secrets and variables** → **Actions**
3. Add two **Repository Secrets**:

   | Secret Name | Value |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | Your bot token from Step 1 |
   | `TELEGRAM_CHAT_ID` | Your chat ID from Step 1 |

### Step 3 — Enable GitHub Actions

1. Go to the **Actions** tab in your forked repo
2. Click **"I understand my workflows, go ahead and enable them"**
3. Click **"RCB Ticket Monitor"** on the left sidebar
4. Click **"Run workflow"** → **"Run workflow"** to test manually
5. Check your Telegram — if the monitor is working, you'll see a log in the Actions run

### Step 4 — (Recommended) Add Reliable Scheduling

GitHub Actions' built-in cron can be delayed by hours. For reliable 24/7 monitoring, use [cron-job.org](https://cron-job.org) to trigger the workflow externally:

1. Create a **GitHub Fine-Grained Personal Access Token**:
   - Go to [github.com/settings/tokens](https://github.com/settings/tokens?type=beta)
   - **Repository access** → select your forked repo only
   - **Permissions** → Actions → Read & Write
   - Set expiry to cover the IPL season

2. Create a free account on [cron-job.org](https://cron-job.org) and add a new cron job:

   | Field | Value |
   |---|---|
   | **URL** | `https://api.github.com/repos/YOUR_USERNAME/rcb-ticket-notify/actions/workflows/monitor.yml/dispatches` |
   | **Method** | `POST` |
   | **Schedule** | Every 5 minutes |
   | **Header** | `Authorization: Bearer YOUR_GITHUB_TOKEN` |
   | **Header** | `Accept: application/vnd.github+json` |
   | **Header** | `Content-Type: application/json` |
   | **Body** | `{"ref":"main"}` |

3. Click **"Run Now"** to test → check your GitHub Actions tab for a new run.

---

## 🏗️ Architecture

```
cron-job.org (every 5 min, reliable)
    │
    ▼
GitHub Actions (workflow_dispatch trigger)
    │
    ▼
┌─────────────────────────────────────────────┐
│  cron.js — Orchestrator                     │
│  Polls every 15-25s for 4.5 min per run     │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ scraper.js                          │    │
│  │  1. Try TicketGenie API (fast)      │    │
│  │  2. Fallback: Puppeteer + Cheerio   │    │
│  └─────────────┬───────────────────────┘    │
│                │                            │
│  ┌─────────────▼───────────────────────┐    │
│  │ state.js                            │    │
│  │  Per-match status tracking          │    │
│  │  Only alerts on STATUS CHANGE       │    │
│  └─────────────┬───────────────────────┘    │
│                │                            │
│  ┌─────────────▼───────────────────────┐    │
│  │ notifier.js                         │    │
│  │  LIVE | SOLD OUT | BACK | ERROR     │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
    │
    ▼
📱 Telegram Alert on Your Phone
```

---

## 📁 Project Structure

```
├── .github/workflows/monitor.yml  — GitHub Actions workflow (5-min cron + manual trigger)
├── .gitignore                     — Prevents secrets & state from being committed
├── cron.js                        — Main orchestrator (real-time polling loop)
├── scraper.js                     — API-first scraper with Puppeteer DOM fallback
├── state.js                       — Per-match state manager (prevents duplicate alerts)
├── notifier.js                    — Telegram notification builder (4 alert types)
├── package.json                   — Dependencies & scripts
└── package-lock.json              — Dependency lock file
```

---

## 🔧 Customization

### Monitor a Different Team
Edit `scraper.js` and change the `TICKET_API` and `TICKET_PAGE` constants to your team's ticket endpoint.

### Change Poll Frequency
Edit `cron.js`:
```javascript
const POLL_MIN_MS = 15_000;  // Minimum seconds between checks
const POLL_MAX_MS = 25_000;  // Maximum seconds between checks
```

### Change Alert Messages
Edit `notifier.js` — each `send*Alert()` function builds a Markdown message you can customize.

---

## 🛠️ Local Development

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/rcb-ticket-notify.git
cd rcb-ticket-notify

# Install dependencies
npm install

# Create .env file
echo "TELEGRAM_BOT_TOKEN=your_token_here" > .env
echo "TELEGRAM_CHAT_ID=your_chat_id_here" >> .env

# Run a single monitoring session
npm start
```

---

## ❓ FAQ

<details>
<summary><b>Why not just use GitHub Actions cron?</b></summary>
GitHub Actions free-tier cron is notoriously unreliable — delays of 30 minutes to several hours are common. Using cron-job.org to trigger <code>workflow_dispatch</code> externally gives you rock-solid 5-minute intervals.
</details>

<details>
<summary><b>Will I get duplicate alerts?</b></summary>
No. The monitor tracks per-match state in <code>state.json</code>. You only get alerted when a match's status <b>changes</b> (e.g., NOT_AVAILABLE → AVAILABLE). If tickets remain available across multiple runs, you'll only get one alert.
</details>

<details>
<summary><b>What if the website blocks the bot?</b></summary>
The scraper uses rotating User-Agents, random delays (500ms–3s), anti-fingerprinting headers, and the <code>webdriver</code> flag override. The primary API method doesn't even load a browser.
</details>

<details>
<summary><b>Can I monitor away matches too?</b></summary>
Yes — the monitor detects <b>all</b> matches returned by the TicketGenie API. If away tickets are sold through the same portal, they'll be detected automatically.
</details>

<details>
<summary><b>Is my Telegram token safe?</b></summary>
Yes. Tokens are stored as <b>GitHub Repository Secrets</b> (encrypted, invisible even in a public repo). The <code>.gitignore</code> blocks all <code>.env</code> files from being committed.
</details>

---

## 📄 License

ISC — Use it however you want. If this helps you grab those Chinnaswamy tickets, a ⭐ on the repo would be awesome!

---

<p align="center">
  <b>🏏 Made with ❤️ for the RCB fam. Ee Sala Cup Namde! 🏆</b>
</p>
