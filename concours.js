// Concours / recrutements de la fonction publique en Afrique (FR + EN).
// Lance : node aggregator/concours.js  →  écrit data/concours.json
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "data", "concours.json");
const KEEP_DAYS = 45, MAX_ITEMS = 600, DELAY_MS = 600;

// [code, drapeau, nom FR, nom EN, langue des recherches ("fr" | "en" | "fr+en"), édition Google Actualités]
// Pour ajouter un pays : ajoutez simplement une ligne.
const COUNTRIES = [
  ["CI", "🇨🇮", "Côte d'Ivoire", "Ivory Coast", "fr", "CI"],
  ["SN", "🇸🇳", "Sénégal", "Senegal", "fr", "SN"],
  ["ML", "🇲🇱", "Mali", "Mali", "fr", "CI"],
  ["BF", "🇧🇫", "Burkina Faso", "Burkina Faso", "fr", "CI"],
  ["CM", "🇨🇲", "Cameroun", "Cameroon", "fr+en", "CM"],
  ["BJ", "🇧🇯", "Bénin", "Benin", "fr", "CI"],
  ["TG", "🇹🇬", "Togo", "Togo", "fr", "CI"],
  ["GN", "🇬🇳", "Guinée", "Guinea", "fr", "CI"],
  ["CD", "🇨🇩", "RDC", "DR Congo", "fr", "CI"],
  ["GA", "🇬🇦", "Gabon", "Gabon", "fr", "CI"],
  ["MA", "🇲🇦", "Maroc", "Morocco", "fr", "MA"],
  ["DZ", "🇩🇿", "Algérie", "Algeria", "fr", "DZ"],
  ["TN", "🇹🇳", "Tunisie", "Tunisia", "fr", "TN"],
  ["NG", "🇳🇬", "Nigeria", "Nigeria", "en", "NG"],
  ["GH", "🇬🇭", "Ghana", "Ghana", "en", "GH"],
  ["KE", "🇰🇪", "Kenya", "Kenya", "en", "KE"],
  ["ZA", "🇿🇦", "Afrique du Sud", "South Africa", "en", "ZA"],
];

const feedUrl = (q, lang, ed) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${lang}&gl=${ed}&ceid=${ed}:${lang}`;

function queries([code, , fr, en, langs, ed]) {
  const out = [];
  if (langs.includes("fr")) {
    out.push({ lang: "fr", url: feedUrl(`concours fonction publique ${fr}`, "fr", ed) });
    out.push({ lang: "fr", url: feedUrl(`recrutement fonction publique ${fr}`, "fr", ed) });
  }
  if (langs.includes("en")) {
    const e = langs === "en" ? ed : "NG";
    out.push({ lang: "en", url: feedUrl(`civil service recruitment ${en}`, "en", e) });
    out.push({ lang: "en", url: feedUrl(`public service vacancies ${en}`, "en", e) });
  }
  return out;
}

const REL = /concours|recrut|fonction publique|emploi|vacanc|civil service|public service|recruit|commission|exam/i;
const MONTHS = { janvier: 1, "février": 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, "août": 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, "décembre": 12, decembre: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const MN = Object.keys(MONTHS).join("|");
const KW = /date limite|avant le|jusqu'au|jusqu’au|clôture|cloture|dépôt des (?:dossiers|candidatures)|deadline|closing date|apply (?:before|by)|closes?|until/i;

// Date limite : détectée seulement si un mot-clé de clôture figure dans le texte
function deadline(text, pubISO) {
  if (!KW.test(text)) return "";
  let d, mo, y = null, m;
  if ((m = text.match(new RegExp(`(\\d{1,2})(?:er|st|nd|rd|th)?\\s+(${MN})\\.?,?\\s*(\\d{4})?`, "i")))) { d = +m[1]; mo = MONTHS[m[2].toLowerCase()]; y = m[3] ? +m[3] : null; }
  else if ((m = text.match(new RegExp(`(${MN})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})?`, "i")))) { mo = MONTHS[m[1].toLowerCase()]; d = +m[2]; y = m[3] ? +m[3] : null; }
  else if ((m = text.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else return "";
  if (!mo || mo > 12 || d < 1 || d > 31) return "";
  const pub = new Date(pubISO);
  if (!y) { y = pub.getUTCFullYear(); if (new Date(Date.UTC(y, mo - 1, d)) < pub - 30 * 864e5) y++; }
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const decode = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const strip = (h) => decode(h || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const tag = (b, n) => { const m = b.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, "i")); return m ? m[1] : ""; };

function parseFeed(xml, country, lang) {
  return (xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []).map((b) => {
    const source = strip(tag(b, "source")) || "Web";
    let title = strip(tag(b, "title"));
    if (title.endsWith(" - " + source)) title = title.slice(0, -(source.length + 3));
    let date = new Date(strip(tag(b, "pubDate")));
    if (isNaN(date)) date = new Date();
    const item = { title, link: strip(tag(b, "link")), source, date: date.toISOString(), country, lang };
    const dl = deadline(title + " " + strip(tag(b, "description")), item.date);
    if (dl) item.deadline = dl;
    return item;
  }).filter((x) => REL.test(x.title));
}

async function get(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 20000);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; NGG-Aggregator/1.0)" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch (e) {}
  const fresh = [];
  for (const c of COUNTRIES) {
    for (const q of queries(c)) {
      try { fresh.push(...parseFeed(await get(q.url), c[0], q.lang)); }
      catch (e) { console.warn("Échec", c[0], q.lang, e.message); }
      await sleep(DELAY_MS);
    }
  }
  const cutoff = Date.now() - KEEP_DAYS * 864e5, seen = new Set();
  const items = [...fresh, ...(prev.items || [])]
    .filter((x) => x.title && /^https?:\/\//.test(x.link) && new Date(x.date).getTime() > cutoff)
    .filter((x) => { const k = x.title.toLowerCase().replace(/\W+/g, ""); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, MAX_ITEMS);
  if (!items.length) { console.warn("Rien récupéré : fichier précédent conservé."); return; }
  const used = new Set(items.map((x) => x.country));
  const countries = COUNTRIES.filter((c) => used.has(c[0])).map((c) => ({ code: c[0], flag: c[1], fr: c[2], en: c[3] }));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), countries, items }, null, 1));
  console.log(items.length, "annonces,", countries.length, "pays");
})();
