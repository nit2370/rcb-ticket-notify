import { scrape, STATUS }  from './scraper.js';
import { loadState, saveState, getMatchState, shouldAlert, updateMatchState } from './state.js';
import { sendAvailableAlert, sendSoldOutAlert, sendBackAvailableAlert, sendErrorAlert } from './notifier.js';
import dotenv from 'dotenv';

dotenv.config();

// ─── CONFIG ────────────────────────────────────────────────────────────────
const TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const RUN_DURATION_MS      = 4 * 60 * 1000 + 30 * 1000; // 4.5 minutes
const POLL_MIN_MS          = 15_000;  // 15 seconds
const POLL_MAX_MS          = 25_000;  // 25 seconds
const ERROR_COOLDOWN_MS    = 30 * 60 * 1000; // 30 min between error alerts

// ─── HELPERS ───────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomBetween(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

// ─── SINGLE POLL CYCLE ─────────────────────────────────────────────────────

async function runPollCycle(state) {
    log('─── Poll Cycle ───');

    const result = await scrape({ retries: 2 });
    log(`  Method: ${result.method} | Page Status: ${result.pageStatus} | Matches found: ${result.matches.length}`);

    // ── Handle scrape errors ──
    if (result.pageStatus === STATUS.ERROR) {
        const meta = state.meta || {};
        const lastErr = meta.lastErrorAlertedAt ? new Date(meta.lastErrorAlertedAt) : null;
        if (!lastErr || Date.now() - lastErr.getTime() > ERROR_COOLDOWN_MS) {
            await sendErrorAlert(result.error || 'Scrape failed');
            state.meta = { ...meta, lastErrorAlertedAt: new Date().toISOString() };
            saveState(state);
        } else {
            log('  ⚠️  Error on cooldown, skipping alert.');
        }
        return;
    }

    // ── No matches in API → page says "Tickets not available" ──
    if (result.matches.length === 0) {
        log('  ℹ️  No matches with tickets. "Tickets not available" state.');
        // Don't touch per-match state here — we only update when we SEE a match
        return;
    }

    // ── Process each match individually ──
    let stateChanged = false;

    for (const match of result.matches) {
        const ms = getMatchState(state, match.id);
        const alertType = shouldAlert(ms, match.status);

        if (alertType) {
            log(`  🔔 Match "${match.name}" → ${alertType}`);

            try {
                if (alertType === 'ALERT_AVAILABLE')      await sendAvailableAlert(match);
                if (alertType === 'ALERT_BACK_AVAILABLE')  await sendBackAvailableAlert(match);
                if (alertType === 'ALERT_SOLD_OUT')        await sendSoldOutAlert(match);
            } catch (err) {
                log(`  ❌ Failed to send Telegram alert: ${err.message}`);
            }

            updateMatchState(ms, match.status, alertType);
            stateChanged = true;
        } else {
            // Status unchanged — just update lastChecked
            ms.lastChecked = new Date().toISOString();
            log(`  ✅ Match "${match.name}" → ${match.status} (no change, no alert)`);
        }
    }

    if (stateChanged) {
        saveState(state);
        log('  💾 State saved.');
    }
}

// ─── MAIN ──────────────────────────────────────────────────────────────────

async function main() {
    if (!TOKEN || !CHAT_ID) {
        console.error('❌ Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID.');
        process.exit(1);
    }

    console.log('\n' + '═'.repeat(55));
    console.log('  🏏  RCB TICKET MONITOR — PRODUCTION v3');
    console.log('═'.repeat(55));
    console.log(`  API Endpoint : TicketGenie eventlist (primary)`);
    console.log(`  Fallback     : Puppeteer + Cheerio DOM scraping`);
    console.log(`  Run Duration : ${RUN_DURATION_MS / 60000} minutes`);
    console.log(`  Poll Interval: ${POLL_MIN_MS/1000}–${POLL_MAX_MS/1000}s`);
    console.log('═'.repeat(55) + '\n');

    let state = loadState();
    const startTime = Date.now();
    let cycleCount = 0;

    while (Date.now() - startTime < RUN_DURATION_MS) {
        cycleCount++;
        log(`\n══ CYCLE #${cycleCount} (${Math.round((Date.now() - startTime) / 1000)}s elapsed) ══`);

        try {
            await runPollCycle(state);
        } catch (err) {
            log(`❌ Unhandled cycle error: ${err.message}`);
            try { await sendErrorAlert(err.message); } catch (_) {}
        }

        const elapsed   = Date.now() - startTime;
        const remaining = RUN_DURATION_MS - elapsed;
        const nextWait  = randomBetween(POLL_MIN_MS, POLL_MAX_MS);

        if (remaining <= nextWait + 5000) {
            log(`\n⏱️  ${Math.round(remaining / 1000)}s remaining — ending run.`);
            break;
        }

        log(`  Next poll in ${Math.round(nextWait / 1000)}s...`);
        await sleep(nextWait);
    }

    saveState(state);
    log(`\n✅ Run complete. ${cycleCount} cycles. State saved.`);
    process.exit(0);
}

main().catch(async err => {
    console.error('❌ Fatal:', err.message);
    try { await sendErrorAlert(`Fatal: ${err.message}`); } catch (_) {}
    process.exit(1);
});
