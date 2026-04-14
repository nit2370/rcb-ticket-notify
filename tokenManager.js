import puppeteer from 'puppeteer';

const TICKET_PAGE  = 'https://shop.royalchallengers.com/ticket';
const TOKEN_TTL_MS = 50 * 60 * 1000;

let _cachedToken    = null;
let _tokenFetchedAt = null;

export async function getAuthToken() {
    // 1. Prioritize explicitly provided token from environment/secrets
    if (process.env.TG_AUTH_TOKEN) {
        const t = process.env.TG_AUTH_TOKEN.trim();
        return t.startsWith('Bearer ') ? t : `Bearer ${t}`;
    }

    // 2. Use cached token if valid
    if (_cachedToken && _tokenFetchedAt && Date.now() - _tokenFetchedAt < TOKEN_TTL_MS) {
        return _cachedToken;
    }

    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });

        const page = await browser.newPage();
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
        );
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        let capturedToken = null;

        // Passive CDP listener — survives SPA navigations on the same page object
        const client = await page.createCDPSession();
        await client.send('Network.enable');
        client.on('Network.requestWillBeSent', event => {
            const auth = event.request.headers?.Authorization || event.request.headers?.authorization;
            if (auth && auth.startsWith('Bearer ') && !capturedToken) {
                capturedToken = auth;
                console.warn(`[tokenManager] ✅ Token captured from: ${event.request.url}`);
            }
        });

        console.warn('[tokenManager] Loading ticket page...');
        await page.goto(TICKET_PAGE, { waitUntil: 'networkidle2', timeout: 45000 });
        console.warn(`[tokenManager] Page loaded — token: ${capturedToken ? 'found' : 'not found yet'}`);

        // Find the first BUTTON element (not links) that contains "BUY" text
        // Use elementHandle.click() so real mouse events fire
        if (!capturedToken) {
            console.warn('[tokenManager] Looking for BUY TICKETS button...');

            const buyHandle = await page.evaluateHandle(() => {
                // Only <button> elements, prioritising those with "buy" in text
                const btns = Array.from(document.querySelectorAll('button'));
                return btns.find(b => /\bbuy\b/i.test(b.textContent)) ?? null;
            });

            const element = buyHandle.asElement();
            if (element) {
                const txt = await element.evaluate(el => el.textContent.trim());
                console.warn(`[tokenManager] Clicking: "${txt}"`);

                // Navigate-safe click: start listening for navigation before clicking
                const navPromise = page.waitForNavigation({
                    waitUntil: 'networkidle2',
                    timeout: 10000,
                }).catch(() => null); // resolve null if no nav happens

                await element.click();
                await navPromise;

                console.warn(`[tokenManager] After click — token: ${capturedToken ? 'found' : 'still not found'}`);

                // Extra wait for SPA lazy-load requests
                if (!capturedToken) {
                    await new Promise(r => setTimeout(r, 4000));
                    console.warn(`[tokenManager] After wait — token: ${capturedToken ? 'found' : 'still not found'}`);
                }
            } else {
                console.warn('[tokenManager] No BUY button found on page.');
            }
        }

        // Last resort: dump all localStorage / sessionStorage keys for debugging
        if (!capturedToken) {
            const storageKeys = await page.evaluate(() => ({
                local: { ...localStorage },
                session: { ...sessionStorage },
            }));
            console.warn('[tokenManager] localStorage keys:', Object.keys(storageKeys.local).join(', ') || 'none');
            console.warn('[tokenManager] sessionStorage keys:', Object.keys(storageKeys.session).join(', ') || 'none');

            // Check if any value looks like a Bearer token or JWT
            const allVals = [
                ...Object.values(storageKeys.local),
                ...Object.values(storageKeys.session),
            ];
            for (const v of allVals) {
                if (typeof v === 'string' && v.length > 40) {
                    const candidate = v.startsWith('Bearer ') ? v : `Bearer ${v}`;
                    if (!capturedToken) {
                        capturedToken = candidate;
                        console.warn('[tokenManager] Candidate token from storage, using it.');
                        break;
                    }
                }
            }
        }

        if (capturedToken) {
            _cachedToken    = capturedToken;
            _tokenFetchedAt = Date.now();
            console.warn('[tokenManager] Token cached successfully.');
        } else {
            console.error('[tokenManager] ❌ Could not capture auth token — stands will be omitted.');
        }

        return capturedToken;
    } catch (err) {
        console.error(`[tokenManager] Error: ${err.message}`);
        return null;
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}
