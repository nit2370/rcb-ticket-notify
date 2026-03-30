import TelegramBot from 'node-telegram-bot-api';

const TOKEN      = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_IDS   = (process.env.TELEGRAM_CHAT_ID || '').split(',').map(id => id.trim()).filter(Boolean);
const TICKET_URL = 'https://shop.royalchallengers.com/ticket';

let _bot = null;
function getBot() {
    if (!_bot) _bot = new TelegramBot(TOKEN, { polling: false });
    return _bot;
}

async function broadcast(msg, options) {
    if (!CHAT_IDS.length) {
        console.warn('⚠️ No TELEGRAM_CHAT_ID configured!');
        return;
    }
    const bot = getBot();
    await Promise.allSettled(
        CHAT_IDS.map(chatId => bot.sendMessage(chatId, msg, options).catch(err => {
            console.error(`❌ Failed to send to ${chatId}:`, err.message);
        }))
    );
}

function istNow() {
    return new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

export async function sendAvailableAlert(match) {
    const link = match.link || TICKET_URL;
    const msg =
        `🚨🏏 *RCB TICKETS ARE LIVE!* 🏏🚨\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `✅ *Status:* TICKETS AVAILABLE NOW!\n\n` +
        `🆚 *Match:* ${match.name}\n` +
        (match.date ? `📅 *Date:* ${match.date}\n` : '') +
        `🏟️ *Venue:* ${match.venue || 'M. Chinnaswamy Stadium'}\n` +
        (match.price ? `💰 *Price:* ${match.price}\n` : '') +
        `\n🔗 *[👉 BOOK NOW](${link})*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⏰ *Detected:* ${istNow()} IST\n\n` +
        `_Book immediately — tickets sell out in minutes!_ 🔥`;

    await broadcast(msg, { parse_mode: 'Markdown', disable_web_page_preview: false });
    console.log(`📩 [LIVE] Alert sent to ${CHAT_IDS.length} chat(s): ${match.name}`);
}

export async function sendSoldOutAlert(match) {
    const msg =
        `😔 *Tickets Sold Out*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🆚 *Match:* ${match.name}\n` +
        (match.date ? `📅 *Date:* ${match.date}\n` : '') +
        `\nAll tickets gone. Keep watching — returns sometimes open up.\n` +
        `🔗 ${TICKET_URL}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⏰ ${istNow()} IST`;

    await broadcast(msg, { parse_mode: 'Markdown' });
    console.log(`📩 [SOLD OUT] Alert sent to ${CHAT_IDS.length} chat(s): ${match.name}`);
}

export async function sendBackAvailableAlert(match) {
    const link = match.link || TICKET_URL;
    const msg =
        `🔄🚨 *TICKETS BACK IN STOCK!* 🚨🔄\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `♻️ Were sold out → NOW AVAILABLE AGAIN!\n\n` +
        `🆚 *Match:* ${match.name}\n` +
        (match.date ? `📅 *Date:* ${match.date}\n` : '') +
        `🏟️ *Venue:* ${match.venue || 'M. Chinnaswamy Stadium'}\n\n` +
        `🔗 *[👉 BOOK NOW](${link})*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⏰ *Detected:* ${istNow()} IST`;

    await broadcast(msg, { parse_mode: 'Markdown', disable_web_page_preview: false });
    console.log(`📩 [BACK IN STOCK] Alert sent to ${CHAT_IDS.length} chat(s): ${match.name}`);
}

export async function sendErrorAlert(errorMessage) {
    const msg =
        `⚠️ *RCB Monitor — Error*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `The monitor hit an error.\n\n` +
        `\`\`\`\n${errorMessage.slice(0, 400)}\n\`\`\`\n\n` +
        `[Check Logs](https://github.com/nit2370/rcb-ticket-notify/actions)\n` +
        `⏰ ${istNow()} IST`;

    await broadcast(msg, { parse_mode: 'Markdown' });
    console.log(`📩 [ERROR] Alert sent to ${CHAT_IDS.length} chat(s).`);
}
