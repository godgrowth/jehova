// Matchs à venir (+ meilleures cotes si une clé The Odds API est fournie).
// Lance : node aggregator/sports.js  →  écrit data/sports.json
// Sans clé : programme des matchs seulement (TheSportsDB, gratuit).
// Avec clé (variable ODDS_API_KEY) : meilleures cotes 1/N/2 parmi les bookmakers.
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "data", "sports.json");
const KEY = process.env.ODDS_API_KEY || "";
const MAX_DAYS = 14, MAX_MATCHES = 60;

// Ajoutez/retirez des championnats ici (id = TheSportsDB, odds = clé The Odds API)
const LEAGUES = [
  { id: 4328, name: "Premier League", odds: "soccer_epl" },
  { id: 4335, name: "La Liga", odds: "soccer_spain_la_liga" },
  { id: 4332, name: "Serie A", odds: "soccer_italy_serie_a" },
  { id: 4331, name: "Bundesliga", odds: "soccer_germany_bundesliga" },
  { id: 4334, name: "Ligue 1", odds: "soccer_france_ligue_one" },
  { id: 4480, name: "Ligue des champions", odds: "soccer_uefa_champs_league" },
];

async function getJSON(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 20000);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { "user-agent": "NGG-Aggregator/1.0" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function fixtures(l) {
  const j = await getJSON(`https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=${l.id}`);
  return (j.events || []).map((e) => ({
    league: l.name, home: e.strHomeTeam, away: e.strAwayTeam,
    date: new Date(`${e.dateEvent}T${(e.strTime || "12:00:00").slice(0, 8)}Z`).toISOString(),
    badgeHome: e.strHomeTeamBadge || "", badgeAway: e.strAwayTeamBadge || "",
  }));
}

async function withOdds(l) {
  const j = await getJSON(`https://api.the-odds-api.com/v4/sports/${l.odds}/odds/?regions=eu&markets=h2h&oddsFormat=decimal&apiKey=${KEY}`);
  return j.map((ev) => {
    const best = {};
    for (const b of ev.bookmakers || []) for (const m of b.markets || []) if (m.key === "h2h") for (const o of m.outcomes) {
      const k = o.name === ev.home_team ? "home" : o.name === ev.away_team ? "away" : "draw";
      if (!best[k] || o.price > best[k].price) best[k] = { price: o.price, book: b.title };
    }
    return { league: l.name, home: ev.home_team, away: ev.away_team, date: ev.commence_time, odds: best };
  });
}

(async () => {
  let all = [];
  await Promise.all(LEAGUES.map(async (l) => {
    try {
      let list = [];
      if (KEY) { try { list = await withOdds(l); } catch (e) { console.warn("Cotes KO", l.name, e.message); } }
      if (!list.length) list = await fixtures(l);
      all = all.concat(list);
    } catch (e) { console.warn("Échec", l.name, e.message); }
  }));

  const now = Date.now(), max = now + MAX_DAYS * 864e5;
  all = all.filter((m) => m.home && m.away && new Date(m.date).getTime() > now && new Date(m.date).getTime() < max)
    .sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, MAX_MATCHES);

  if (!all.length) { console.warn("Aucun match récupéré : fichier précédent conservé."); return; }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), hasOdds: all.some((m) => m.odds), matches: all }, null, 1));
  console.log(all.length, "matchs");
})();
