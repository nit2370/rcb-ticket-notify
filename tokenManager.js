import puppeteer from 'puppeteer';

const TICKET_PAGE  = 'https://shop.royalchallengers.com/ticket';
const TOKEN_TTL_MS = 50 * 60 * 1000;

let _cachedToken    = null;
let _tokenFetchedAt = null;

export async function getAuthToken() {
    if (_cachedToken && _tokenFetchedAt && Date.now() - _tokenFetchedAt < TOKEN_TTL_MS) {
        return _cachedToken;
    }

    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
            ],
        });

        const page = await browser.newPage();
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
        );
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        let capturedToken = null;

        // Use CDP to passively observe outgoing request headers (no interception needed)
        const client = await page.createCDPSession();
        await client.send('Network.enable');
        client.on('Network.requestWillBeSent', event => {
            const auth = event.request.headers?.Authorization || event.request.headers?.authorization;
            if (auth && auth.startsWith('Bearer ') && !capturedToken) {
                capturedToken = auth;
                console.warn(`[tokenManager] Token captured from: ${event.request.url}`);
            }
        });

        console.warn('[tokenManager] Navigating to ticket page...');
        await page.goto(TICKET_PAGE, { waitUntil: 'networkidle2', timeout: 45000 });
        console.warn(`[tokenManager] Page loaded. Token after load: ${capturedToken ? 'found' : 'not found'}`);

        // Check localStorage / sessionStorage for stored token
        if (!capturedToken) {
            capturedToken = await page.evaluate(() => {
                const keys = [
                    'token', 'authToken', 'auth_token', 'access_token',
                    'bearerToken', 'tg_token', 'userToken', 'jwt',
                ];
                for (const key of keys) {
                    const val = localStorage.getItem(key) ?? sessionStorage.getItem(key);
                    if (val) return val.startsWith('Bearer ') ? val : `Bearer ${val}`;
                }
                // Also scan all keys for anything that looks like a JWT/bearer
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    const val = localStorage.getItem(key);
                    if (val && (val.startsWith('Bearer ') || val.split('.').length === 3)) {
                        return val.startsWith('Bearer ') ? val : `Bearer ${val}`;
                    }
                }
                return null;
            });
            if (capturedToken) console.warn('[tokenManager] Token found in storage.');
        }

        // Click the "BUY TICKETS" button to trigger an authenticated API call
        if (!capturedToken) {
            console.warn('[tokenManager] Trying to click Buy Tickets button...');
            const clicked = await page.evaluate(() => {
                const all = Array.from(document.querySelectorAll('button, a, [role="button"]'));
                const btn = all.find(el => /buy|book|ticket/i.test(el.textContent?.trim()));
                if (btn) { btn.click(); return btn.textContent?.trim(); }
                return null;
            });
            console.warn(`[tokenManager] Clicked: ${clicked ?? 'nothing found'}`);
            // Wait for any triggered network requests
            await new Promise(r => setTimeout(r, 5000));
            console.warn(`[tokenManager] Token after click: ${capturedToken ? 'found' : 'still not found'}`);
        }

        if (capturedToken) {
            _cachedToken    = capturedToken;
            _tokenFetchedAt = Date.now();
        } else {
            console.error('[tokenManager] Could not capture auth token — stands will be omitted.');
        }

        return capturedToken;
    } catch (err) {
        console.error(`[tokenManager] Error: ${err.message}`);
        return null;
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}
