//Scraper (API-First + DOM Fallback)

import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { getAuthToken } from './tokenManager.js';

const TICKET_API   = 'https://rcbscaleapi.ticketgenie.in/ticket/eventlist/O';
const STANDS_API   = 'https://rcbscaleapi.ticketgenie.in/ticket/standslist';
const TICKET_PAGE  = 'https://shop.royalchallengers.com/ticket';

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1',
];

export const STATUS = {
    AVAILABLE:     'AVAILABLE',      // Tickets are bookable for this match
    SOLD_OUT:      'SOLD_OUT',       // Match exists but sold out
    NOT_AVAILABLE: 'NOT_AVAILABLE',  // "Tickets not available" — nothing released yet
    ERROR:         'ERROR',
};

function randomBetween(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function randomUA() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchStandPrices(eventCode) {
    try {
        const token = await getAuthToken();
        const headers = {
            'User-Agent': randomUA(),
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type': 'application/json',
            'Origin': 'https://shop.royalchallengers.com',
            'Referer': 'https://shop.royalchallengers.com/',
        };
        if (token) headers['Authorization'] = token;

        const res = await fetch(`${STANDS_API}/${eventCode}`, {
            headers,
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return [];
        const data = await res.json();
        if (data.status !== 'Success' || !data.result?.stands) return [];
        return data.result.stands
            .filter(s => s.stand_Status !== 'S' && s.price > 0)
            .map(s => ({ name: s.stand_Name, price: s.price }));
    } catch {
        return [];
    }
}

async function scrapeViaAPI() {
    const jitter = randomBetween(500, 2000);
    await sleep(jitter);

    const res = await fetch(TICKET_API, {
        headers: {
            'User-Agent': randomUA(),
            'Accept': 'application/json',
            'Origin': 'https://shop.royalchallengers.com',
            'Referer': 'https://shop.royalchallengers.com/',
        },
        signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
        throw new Error(`API returned HTTP ${res.status}`);
    }

    const data = await res.json();

    if (data.status !== 'Success') {
        throw new Error(`API returned non-success: ${JSON.stringify(data)}`);
    }

    // If result is empty → no tickets released for any match
    if (!data.result || data.result.length === 0) {
        return { method: 'API', matches: [], pageStatus: STATUS.NOT_AVAILABLE };
    }

    const matches = await Promise.all(data.result.map(async event => {
        const name  = event.event_Name || 'Unknown Match';
        const id    = slugify(name);
        const date  = event.event_Display_Date || event.event_Date || '';
        const venue = event.venue_Name
            ? `${event.venue_Name}${event.city_Name ? ', ' + event.city_Name : ''}`
            : 'M. Chinnaswamy Stadium, Bengaluru';
        const team1 = event.team_1 || '';
        const team2 = event.team_2 || '';
        const buttonText = (event.event_Button_Text || '').toLowerCase();

        let status = STATUS.NOT_AVAILABLE;
        if (buttonText.includes('sold out') || buttonText.includes('housefull')) {
            status = STATUS.SOLD_OUT;
        } else if (buttonText.includes('buy') || buttonText.includes('book') || buttonText.includes('get ticket') || buttonText.includes('available')) {
            status = STATUS.AVAILABLE;
        }

        const stands = status === STATUS.AVAILABLE
            ? await fetchStandPrices(event.event_Code)
            : [];

        return { id, name, date, venue, team1, team2, status, stands, link: TICKET_PAGE };
    }));

    return { method: 'API', matches, pageStatus: STATUS.AVAILABLE };
}

// DOM-BASED SCRAPING (if API is down)

async function scrapeViaDOM() {
    const jitter = randomBetween(800, 2500);
    await sleep(jitter);

    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                   '--disable-blink-features=AutomationControlled'],
        });

        const page = await browser.newPage();
        await page.setUserAgent(randomUA());
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        await page.goto(TICKET_PAGE, { waitUntil: 'networkidle2', timeout: 45000 });
        await page.waitForFunction(() => document.body.innerText.length > 50, { timeout: 5000 }).catch(() => {});

        const html = await page.content();
        const $ = cheerio.load(html);
        const bodyText = $('body').text().toLowerCase();

        // "Tickets not available" is the definitive NOT_AVAILABLE signal
        if (bodyText.includes('tickets not available') || bodyText.includes('please await further')) {
            return { method: 'DOM', matches: [], pageStatus: STATUS.NOT_AVAILABLE };
        }

        // If we see match-specific content (dates, team names with booking)
        // this means tickets are likely live — but we can't parse individual matches
        // as reliably as the API. Return a generic indicator.
        const hasTicketContent = (
            /book\s+now|book\s+tickets|get\s+tickets/.test(bodyText) &&
            !bodyText.includes('be ready with your merchandise') // ignore merch "Buy Now"
        );

        if (hasTicketContent) {
            return {
                method: 'DOM',
                matches: [{ id: 'unknown-match', name: 'RCB Match (check site)', date: '', venue: 'M. Chinnaswamy Stadium', status: STATUS.AVAILABLE, link: TICKET_PAGE }],
                pageStatus: STATUS.AVAILABLE,
            };
        }

        return { method: 'DOM', matches: [], pageStatus: STATUS.NOT_AVAILABLE };
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

/**
 * Main scrape function. Tries API first, falls back to DOM if API fails.
 * Returns: { method, matches[], pageStatus, error? }
 */
export async function scrape({ retries = 2 } = {}) {
    // Try API first (fast, lightweight, accurate)
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const result = await scrapeViaAPI();
            return result;
        } catch (err) {
            console.warn(`  ⚠️  API attempt ${attempt} failed: ${err.message}`);
            if (attempt < retries) await sleep(randomBetween(1000, 3000));
        }
    }

    // Fallback to DOM scraping
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const result = await scrapeViaDOM();
            return result;
        } catch (err) {
            console.warn(`  ⚠️  DOM attempt ${attempt} failed: ${err.message}`);
            if (attempt < retries) await sleep(randomBetween(2000, 5000) * attempt);
        }
    }

    return { method: 'FAILED', matches: [], pageStatus: STATUS.ERROR, error: 'All scrape methods failed' };
}

function slugify(str) {
    return str.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);
}
