import puppeteer from 'puppeteer';

const TICKET_PAGE  = 'https://shop.royalchallengers.com/ticket';
const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 min — tokens seem to last ~1 hour

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

        // Intercept every outgoing request and grab the first Bearer token we see
        await page.setRequestInterception(true);
        page.on('request', req => {
            const auth = req.headers()['authorization'];
            if (auth && auth.startsWith('Bearer ') && !capturedToken) {
                capturedToken = auth;
            }
            req.continue();
        });

        await page.goto(TICKET_PAGE, { waitUntil: 'networkidle2', timeout: 45000 });

        // Fallback: check localStorage / sessionStorage for a stored token
        if (!capturedToken) {
            capturedToken = await page.evaluate(() => {
                const keys = ['token', 'authToken', 'auth_token', 'access_token', 'bearerToken'];
                for (const key of keys) {
                    const val = localStorage.getItem(key) ?? sessionStorage.getItem(key);
                    if (val) return val.startsWith('Bearer ') ? val : `Bearer ${val}`;
                }
                return null;
            });
        }

        // Fallback: click the first "Buy Tickets" button to trigger an authenticated API call
        if (!capturedToken) {
            try {
                await page.click('button');
                await new Promise(r => setTimeout(r, 3000));
            } catch { /* button may not exist — safe to ignore */ }
        }

        if (capturedToken) {
            _cachedToken    = capturedToken;
            _tokenFetchedAt = Date.now();
        }

        return capturedToken;
    } catch {
        return null;
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}
