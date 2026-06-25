/**
 * THE SYSTEM — ICICI credit-card → app spend sync (Google Apps Script web app)
 * Reads ONLY your ICICI transaction-alert emails and returns recent spends as JSON.
 * The app fetches this over JSONP, so there's no weekly re-login and no Google Cloud project.
 *
 * SETUP (one time, ~10 min):
 *  1. Go to script.google.com  →  New project  →  paste this whole file (replace the default).
 *  2. Set ICICI_FROM below to the exact sender of your ICICI card alerts (check an email's "from").
 *     (Optional) set TOKEN to any secret word for a little extra privacy.
 *  3. Deploy  →  New deployment  →  type "Web app".
 *       Execute as:  Me
 *       Who has access:  Anyone with the link
 *     Click Deploy, then "Authorize access" and allow Gmail (one time — never again).
 *  4. Copy the Web app URL (ends with /exec) and paste it into the app:  ⚙ Settings → ICICI Sync URL.
 *     If you set a TOKEN, paste the URL as:  https://.../exec?token=YOURWORD
 *  Done. The app auto-syncs ICICI spends every time you open it.
 */

// ICICI card alerts come from credit_cards@icici.bank.in (also covers icicibank.com just in case).
// The parser below filters out non-spend mail (statements, payments, OTPs).
const ICICI_FROM   = 'icici.bank.in OR icicibank.com';
const TOKEN        = '';        // <-- optional secret; leave '' to disable
const LOOKBACK_DAYS = 35;       // how far back to read
const MAX_THREADS   = 100;

function doGet(e){
  const cb = (e && e.parameter && e.parameter.callback) || 'callback';
  let out;
  try {
    if (TOKEN && (!e || !e.parameter || e.parameter.token !== TOKEN)) {
      out = { error: 'unauthorized' };
    } else if (e && e.parameter && e.parameter.debug) {
      out = debugInfo();          // open .../exec?debug=1 in your browser to see what's found
    } else {
      out = getSpends();
    }
  } catch (err) {
    out = { error: String(err) };
  }
  return ContentService
    .createTextOutput(cb + '(' + JSON.stringify(out) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

// Diagnostics: shows the senders/subjects found and whether the parser matched each.
function debugInfo(){
  const q = 'from:(' + ICICI_FROM + ') newer_than:' + LOOKBACK_DAYS + 'd';
  const threads = GmailApp.search(q, 0, 12);
  const samples = [];
  threads.forEach(function(th){
    th.getMessages().forEach(function(m){
      const p = parseIcici(m.getPlainBody() || '');
      samples.push({
        from: m.getFrom(),
        subject: m.getSubject(),
        parsed: p ? ('amt=' + p.amt + ' merchant=' + (p.merchant || '(none)')) : 'NO MATCH'
      });
    });
  });
  return { query: q, threadsFound: threads.length, samples: samples };
}

function getSpends(){
  const q = 'from:(' + ICICI_FROM + ') newer_than:' + LOOKBACK_DAYS + 'd';
  const threads = GmailApp.search(q, 0, MAX_THREADS);
  const out = [];
  threads.forEach(function(th){
    th.getMessages().forEach(function(m){
      const body = m.getPlainBody() || '';
      const p = parseIcici(body);
      if (p && p.amt) {
        out.push({
          id: m.getId(),                 // unique → app dedupes on this, never double-adds
          amt: p.amt,
          merchant: p.merchant || 'ICICI',
          date: toISO(m.getDate())
        });
      }
    });
  });
  return out;
}

/**
 * ICICI credit-card transaction-alert parser (best-effort; will be tuned to your real email).
 * Returns { amt, merchant } or null for non-spend emails.
 */
function parseIcici(t){
  // must be a real spend alert
  if (!/has been used for a transaction|transaction of (?:INR|Rs)/i.test(t)) return null;
  // skip non-spend / informational alerts
  if (/payment received|thank you for paying|statement is|\botp\b|reward points|e-?statement|amount due/i.test(t)) return null;

  // amount: anchor on "transaction of INR 135.00"; fall back to first INR/Rs amount
  const am = t.match(/transaction of\s+(?:INR|Rs\.?)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i)
          || t.match(/(?:INR|Rs\.?)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  if (!am) return null;
  const amt = parseFloat(am[1].replace(/,/g, ''));
  if (!amt || amt <= 0) return null;

  // merchant: "Info: UPI-609223681951-ZEPTO MA" → "ZEPTO MA"  (also handles "at X on", "towards X")
  let merchant = '';
  const mm = t.match(/Info:\s*([^.\n\r]+)/i)
          || t.match(/\bat\s+([A-Za-z0-9 &._\-*]{2,40}?)\s+on\b/i)
          || t.match(/towards\s+([^.\n\r]+)/i)
          || t.match(/spent at\s+([^.\n\r]+)/i);
  if (mm) {
    merchant = mm[1].trim();
    const upi = merchant.match(/UPI-\d+-(.+)/i);     // strip the UPI-<ref>- prefix
    if (upi) merchant = upi[1].trim();
    merchant = merchant.replace(/\s+/g, ' ');
  }

  return { amt: amt, merchant: merchant };
}

function toISO(d){
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
