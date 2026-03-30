import fs from 'fs';
import path from 'path';

const STATE_FILE = path.resolve('./state.json');

export function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        }
    } catch (_) { /* ignore corrupt state */ }
    return {};
}

export function saveState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Get state for a specific match, creating default if not exists.
 */
export function getMatchState(state, matchId) {
    if (!state[matchId]) {
        state[matchId] = {
            status: 'NOT_AVAILABLE',
            alertedAvailable: false,
            alertedSoldOut: false,
            lastChecked: null,
        };
    }
    return state[matchId];
}

/**
 * Determine if we should send a notification based on the status transition.
 * Returns: 'ALERT_AVAILABLE' | 'ALERT_SOLD_OUT' | 'ALERT_BACK_AVAILABLE' | null
 */
export function shouldAlert(matchState, newStatus) {
    const old = matchState.status;

    // NOT_AVAILABLE → AVAILABLE (first time tickets drop!)
    if (newStatus === 'AVAILABLE' && old !== 'AVAILABLE') {
        // Was it sold out before? → special "back in stock" alert
        if (matchState.alertedSoldOut) {
            return 'ALERT_BACK_AVAILABLE';
        }
        return 'ALERT_AVAILABLE';
    }

    // AVAILABLE → SOLD_OUT
    if (newStatus === 'SOLD_OUT' && old !== 'SOLD_OUT') {
        return 'ALERT_SOLD_OUT';
    }

    // No change or same status → no alert
    return null;
}

/**
 * Apply status update after notification decision.
 */
export function updateMatchState(matchState, newStatus, alerted) {
    matchState.status = newStatus;
    matchState.lastChecked = new Date().toISOString();

    if (alerted === 'ALERT_AVAILABLE' || alerted === 'ALERT_BACK_AVAILABLE') {
        matchState.alertedAvailable = true;
        matchState.alertedSoldOut = false;
    } else if (alerted === 'ALERT_SOLD_OUT') {
        matchState.alertedSoldOut = true;
        matchState.alertedAvailable = false; // reset so we re-alert if tickets return
    }

    // If status went back to NOT_AVAILABLE, reset the available flag
    // so next time tickets drop, we alert again
    if (newStatus === 'NOT_AVAILABLE') {
        matchState.alertedAvailable = false;
    }
}
