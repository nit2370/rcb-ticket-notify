// Quick verification script — runs against the real API, previews the message.
// Usage: node test-stands.js [eventCode]
// Example: node test-stands.js 3

import dotenv from 'dotenv';
dotenv.config();

const STANDS_API = 'https://rcbscaleapi.ticketgenie.in/ticket/standslist';
const eventCode  = process.argv[2] || '3';
const token      = process.argv[3] || '';

console.log(`\nFetching stands for event_Code = ${eventCode}...\n`);

const headers = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Content-Type': 'application/json',
    'Origin': 'https://shop.royalchallengers.com',
    'Referer': 'https://shop.royalchallengers.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
};
if (token) headers['Authorization'] = token;

const res = await fetch(`${STANDS_API}/${eventCode}`, {
    headers,
    signal: AbortSignal.timeout(10000),
});

if (!res.ok) {
    console.error(`❌ HTTP ${res.status} — API unreachable or auth required.`);
    process.exit(1);
}

const data = await res.json();

if (data.status !== 'Success' || !data.result?.stands) {
    console.error('❌ Unexpected response:', JSON.stringify(data, null, 2));
    process.exit(1);
}

const allStands = data.result.stands;
const available = allStands.filter(s => s.stand_Status !== 'S' && s.price > 0);

console.log(`✅ Event : ${data.result.event_Name}`);
console.log(`📅 Date  : ${data.result.event_Display_Date}`);
console.log(`🏟️  Venue : ${data.result.venue_Name}, ${data.result.city_Name}`);
console.log(`\nAll stands (${allStands.length} total, ${available.length} available):\n`);

for (const s of allStands) {
    const sold = s.stand_Status === 'S' ? ' [SOLD OUT]' : '';
    console.log(`  ${sold ? '🔴' : '🟢'} ${s.stand_Name.padEnd(40)} ₹${s.price.toLocaleString('en-IN')}${sold}`);
}

// Preview the formatted block that will appear in the Telegram message
if (available.length > 0) {
    const lines = available.map(s => `  • ${s.stand_Name}: ₹${s.price.toLocaleString('en-IN')}`);
    console.log('\n── Telegram message preview (stands section) ──');
    console.log(`🎟️ Available Stands:\n${lines.join('\n')}`);
} else {
    console.log('\n⚠️  No available stands found — stands section will be omitted from the alert.');
}
