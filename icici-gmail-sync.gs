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

// Diagnostics: shows subject, body lengths, parse result AND a snippet of the actual
// text the parser sees — so we can fix the regex precisely. Limited to a few emails.
function debugInfo(){
  const q = 'from:(' + ICICI_FROM + ') newer_than:' + LOOKBACK_DAYS + 'd';
  const threads = GmailApp.search(q, 0, 6);
  const samples = [];
  threads.forEach(function(th){
    th.getMessages().forEach(function(m){
      if (samples.length >= 6) return;
      const plain = m.getPlainBody() || '';
      const raw = plain || m.getBody() || '';
      const norm = String(raw).replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim();
      const p = parseIcici(raw);
      samples.push({
        subject: m.getSubject(),
        plainLen: plain.length,
        rawLen: raw.length,
        parsed: p ? ('amt=' + p.amt + ' merchant=' + (p.merchant || '(none)')) : 'NO MATCH',
        snippet: norm.slice(0, 220)
      });
    });
  });
  return { query: q, threadsFound: threads.length, codeVersion: 'v4-snippet', samples: samples };
}

function getSpends(){
  const q = 'from:(' + ICICI_FROM + ') newer_than:' + LOOKBACK_DAYS + 'd';
  const threads = GmailApp.search(q, 0, MAX_THREADS);
  const out = [];
  threads.forEach(function(th){
    th.getMessages().forEach(function(m){
      const body = m.getPlainBody() || m.getBody() || '';
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
  // normalise: strip HTML tags + entities, collapse ALL whitespace/newlines to single spaces
  t = String(t || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim();

  // A spend is identified POSITIVELY by "transaction of INR <amt>". Bill-payments,
  // reversals and reward/statement mails don't contain this phrase — so we DON'T use a
  // broad keyword skip (it was wrongly catching words like "statement"/"reward" that
  // appear in every transaction email's footer boilerplate).
  const am = t.match(/transaction of\s+(?:INR|Rs\.?)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  if (!am) return null;
  // narrow guard: exclude reversals/refunds/repayments that might still say "transaction"
  if (/reversal of|has been reversed|refund of|payment received|received payment/i.test(t)) return null;
  const amt = parseFloat(am[1].replace(/,/g, ''));
  if (!amt || amt <= 0) return null;

  // merchant: "Info: UPI-609223681951-ZEPTO MA" → "ZEPTO MA"  (also handles "at X on", "towards X")
  let merchant = '';
  const mm = t.match(/Info:\s*([^.]+)/i)
          || t.match(/\bat\s+([A-Za-z0-9 &._\-*]{2,40}?)\s+on\b/i)
          || t.match(/towards\s+([^.]+)/i)
          || t.match(/spent at\s+([^.]+)/i);
  if (mm) {
    merchant = mm[1].trim();
    const upi = merchant.match(/UPI-\d+-(.+)/i);     // strip the UPI-<ref>- prefix
    if (upi) merchant = upi[1].trim();
    merchant = merchant.replace(/\s+/g, ' ').trim();
  }

  return { amt: amt, merchant: merchant };
}

function toISO(d){
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
