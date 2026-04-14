import puppeteer from 'puppeteer';
(async () => {
    const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
    const page = await browser.newPage();
    try {
        await page.goto('https://shop.royalchallengers.com/ticket', {waitUntil: 'networkidle2'});
        const html = await page.content();
        console.log('HTML size:', html.length);
        console.log('IFRAMES count:', page.frames().length);
        for (let i = 0; i < page.frames().length; i++) {
            const f = page.frames()[i];
            console.log(`FRAME ${i}: ${f.url()} - ${await f.title()}`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
})();
