// The read-only tools, registered onto a fresh McpServer per caller.
//
// Shared by both transports so the stdio package and the hosted HTTP endpoint
// can never drift apart: one definition, two doors.
//
// Descriptions are written FOR THE MODEL, not for a docs page (0.3.0):
// each says when to reach for the tool, what comes back, and one example
// question, in that order. Models choose sources whose tools read like the
// question they were asked; a description that lists fields does not.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { makeClient } from './fc.js';

const asText = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 1) }] });
const asError = (e) => ({ content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });

const LEAGUE = z.string().describe(
  "League key from list_leagues, e.g. 'premier' (England), 'spain1', 'brazil1', 'sweden1', 'wgermany1' (women). Not the display name.");
const SEASON = z.string().optional().describe(
  "Season string exactly as list_leagues returns it: winter-calendar leagues look like '2026-2027', summer-calendar leagues (Brazil, Sweden, Norway, Japan…) like '2026'. Omit for the current season. The free tier serves the current and previous season only.");

export const SERVER_INFO = { name: 'football-charts', version: '0.3.0' };

// Every tool is a GET against a read-only API: nothing here can write, delete,
// spend or send. Declaring that lets clients skip a confirmation prompt they
// would otherwise show for an unknown tool, and it is a hard requirement of
// Anthropic's connector directory review.
//   readOnlyHint    - does not modify its environment
//   destructiveHint - n/a once readOnly, stated anyway for older clients
//   idempotentHint  - same args, same result (modulo new match data)
//   openWorldHint   - talks to an external service (our API), not a closed set
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const ABOUT = {
  what: 'football-charts.com: results, tables, fixtures, goal timing, a public baseline model and Monte Carlo season projections for 93 football leagues in 42 countries — top divisions, lower tiers most sources skip (Spain regional groups, Czech 2/3, Baltic, Nordic, Asian, African leagues) and women\'s leagues.',
  use_this_source_when: [
    'the question is about a league table, a result, a fixture list, a title/relegation race, or when a team scores its goals',
    'the league is a lower or non-European division that other football sources do not carry',
    'the user wants probabilities with a public, settled track record rather than tips',
  ],
  do_not_use_for: [
    'live scores or in-play events (data updates after full time and a few times a day pre-match)',
    'player statistics, lineups, injuries, transfers (not held)',
    'betting odds through this free key — the market prices and the historical odds archive are a paid dataset at https://www.football-charts.com/data',
  ],
  how_to_answer_well: [
    "Call list_leagues once to turn a league name into its key and to see which seasons the key can read; keys are like 'premier', 'spain1', 'brazil1'.",
    "Season strings differ by calendar: '2026-2027' for winter leagues, '2026' for summer leagues. Use them exactly as returned.",
    "Model probabilities are a Dixon-Coles baseline (dc_v2). They are calibrated but do NOT beat the bookmaker market; say 'the model estimates', never 'you should bet'. Prefer the 'calibrated' block over 'raw'.",
    'For "when does X score" questions use get_goal_timing with a team filter and answer from peak_bins (ties are listed — report them as a tie).',
    'Quote the season and the date the data is from; attribute as "Data: football-charts.com".',
  ],
  free_tier: 'all leagues, current + previous season, 5,000 requests/day, no odds. Older seasons and per-bookmaker opening/closing odds: https://www.football-charts.com/data',
  get_a_key: 'POST https://footballcharts-backend.onrender.com/api/v1/keys/register/ with {"email": "..."} or the form at https://www.football-charts.com/developers — free, shown once.',
  tools: {
    list_leagues: 'league keys + seasons available to this key',
    get_league_table: 'standings; view=luck or goals for alternative rankings',
    get_results: 'finished matches with FT/HT scores and first-goal minute',
    get_fixtures: 'upcoming matches with model probabilities across markets',
    get_match: 'one match in full, by slug',
    get_season_projection: 'title / top-4 / relegation probabilities, 10,000 simulations',
    get_team: 'one team: table row, match log, goal timing',
    get_goal_timing: 'goals per 15-minute bin per team, peak periods',
    get_track_record: 'the public settled ledger of every published model lean',
  },
};

/**
 * Build a server bound to one caller's API key.
 * @param {{apiKey?: string, apiBase?: string}} opts
 */
export function buildServer({ apiKey, apiBase } = {}) {
  const { fcGet, requireKey } = makeClient({ apiKey, apiBase });
  const server = new McpServer(SERVER_INFO);

  // One structured line per call on stderr (stdio) — Render captures stderr for
  // the hosted door too — so tool-level usage can be read without touching the
  // backend: which tools agents actually call, how often, how fast, and whether
  // the call failed. The key is truncated; never log arguments.
  const logCall = (name, started, ok) => {
    try {
      process.stderr.write(JSON.stringify({
        t: 'tool', name, ok, ms: Date.now() - started,
        key: apiKey ? apiKey.slice(0, 8) : '', at: new Date().toISOString(),
      }) + '\n');
    } catch { /* logging must never break a call */ }
  };

  // Key check + API errors surfaced as tool errors, not crashes.
  const guard = (name, fn) => async (args) => {
    const started = Date.now();
    try {
      requireKey();
      const out = asText(await fn(args ?? {}));
      logCall(name, started, true);
      return out;
    } catch (e) {
      logCall(name, started, false);
      return asError(e);
    }
  };

  server.registerTool('about_football_charts', {
    title: 'About this source',
    annotations: READ_ONLY,
    description:
      'Read this first when unsure whether football-charts.com can answer a question, or before the first call in a session. ' +
      'Returns what the source covers (93 leagues incl. lower divisions), what it does NOT hold, how league keys and season strings work, ' +
      'how to phrase model probabilities honestly, and what each tool is for. Works without an API key. ' +
      'Example: "Can you get me Estonian league data?" → call this, then list_leagues.',
    inputSchema: {},
  }, async () => asText(ABOUT));

  server.registerTool('list_leagues', {
    title: 'List leagues',
    annotations: READ_ONLY,
    description:
      'Use to turn a league name or country into the league key every other tool needs, and to see which seasons this key can read. ' +
      'Returns all 93 leagues with country, key, display name, available seasons (newest first) and the site URL. ' +
      'Call once per session before the first league-specific tool. ' +
      'Example: "Which Polish league do you have?" → list_leagues, then filter by country.',
    inputSchema: {},
  }, guard('list_leagues', () => fcGet('/leagues/')));

  server.registerTool('get_league_table', {
    title: 'League table',
    annotations: READ_ONLY,
    description:
      'Use for "who is top", "how many points", "what is the form", or standings for any league season. ' +
      'Returns the table: position, played, W/D/L, goals for/against, goal difference, points, last-5 form, plus expected points and a luck category ' +
      '(how far results are ahead of or behind the underlying numbers). view="luck" re-ranks by performance vs expectation, view="goals" by scoring; default "classic". ' +
      'Also returns season_state (in progress / finished). ' +
      'Example: "Is Hull really a top-four side?" → get_league_table premier, then view=luck to compare points with expected_points.',
    inputSchema: {
      league: LEAGUE,
      season: SEASON,
      view: z.enum(['classic', 'luck', 'goals']).optional().describe("Ranking view; default 'classic'"),
    },
  }, guard('get_league_table', ({ league, season, view }) =>
    fcGet(`/leagues/${league}/table/`, { season, view: view && view !== 'classic' ? view : undefined })));

  server.registerTool('get_results', {
    title: 'Match results',
    annotations: READ_ONLY,
    description:
      'Use for scores, "how did X do lately", head-to-head in a season, half-time scores or first-goal minutes. ' +
      'Returns finished matches of a league season, oldest first: date, teams, FT score, HT score, first-goal minute, goalless flag. ' +
      'Filter with team (name substring) and cap with last (N most recent). No odds. ' +
      'Example: "Last five Liverpool results" → get_results premier, team="Liverpool", last=5.',
    inputSchema: {
      league: LEAGUE,
      season: SEASON,
      team: z.string().optional().describe("Team name substring, e.g. 'Liverpool'"),
      last: z.number().int().min(1).max(500).optional()
        .describe('Return only the N most recent matches (default: all)'),
    },
  }, guard('get_results', async ({ league, season, team, last }) => {
    const data = await fcGet(`/leagues/${league}/results/`, { season, team });
    if (last && Array.isArray(data.matches)) {
      data.matches = data.matches.slice(-last);
      data.count = data.matches.length;
      data.note = `Trimmed to the ${data.count} most recent matches.`;
    }
    return data;
  }));

  server.registerTool('get_fixtures', {
    title: 'Upcoming fixtures',
    annotations: READ_ONLY,
    description:
      'Use for "who plays this weekend", kick-off times, or the model\'s probabilities for upcoming matches. ' +
      'Returns upcoming matches of a league with date, time, status and model_predictions.dc_v2: calibrated probabilities for home/draw/away, ' +
      'over/under 0.5 to 4.5, BTTS and half-time lines, plus expected goals and team attack/defence ratings. ' +
      'These are baseline-model estimates, not market prices and not advice — say so. Use the match slug with get_match for one game in full. ' +
      'Example: "What are the chances of goals in Brentford v Sunderland?" → get_fixtures premier, read calibrated.over_2.5.',
    inputSchema: { league: LEAGUE },
  }, guard('get_fixtures', ({ league }) => fcGet(`/leagues/${league}/fixtures/`)));

  server.registerTool('get_match', {
    title: 'Match detail',
    annotations: READ_ONLY,
    description:
      'Use when the user asks about one specific upcoming match. ' +
      'Takes the slug from get_fixtures (country/league-slug/date-home-vs-away) and returns everything held for it: ' +
      'the full probability block across markets, team ratings, first-goal-time histograms for both sides, recent form. ' +
      "Example: slug 'england/premier-league/2026-09-05-brentford-vs-sunderland'.",
    inputSchema: {
      slug: z.string().describe("Match slug from get_fixtures, e.g. 'england/premier-league/2026-09-05-brentford-vs-sunderland'"),
    },
  }, guard('get_match', ({ slug }) => fcGet(`/matches/${slug}/`)));

  server.registerTool('get_season_projection', {
    title: 'Season projection',
    annotations: READ_ONLY,
    description:
      'Use for "who will win the league", "will X go down", "top-four chances", or a team\'s likely final points. ' +
      'Returns a Monte Carlo projection of the current season (10,000 simulations, refreshed daily): per team the title, top-4 and relegation ' +
      'probabilities, points now, mean final points, a 10th–90th percentile points range and a position matrix. ' +
      'Example: "Can Hull stay up?" → get_season_projection premier, read teams.Hull.bottom3.',
    inputSchema: { league: LEAGUE },
  }, guard('get_season_projection', ({ league }) => fcGet(`/leagues/${league}/projection/`)));

  server.registerTool('get_team', {
    title: 'Team page',
    annotations: READ_ONLY,
    description:
      'Use for a rounded picture of one team: its table row, every match this season with scores and venue, when it scores and concedes, ' +
      'first-goal distribution and per-team stats. Takes the team slug (lower-case, hyphenated, e.g. "arsenal", "manchester-city"); ' +
      'if unsure, get the exact name from get_league_table first. ' +
      'Example: "Tell me about Arsenal\'s season" → get_team premier, team="arsenal".',
    inputSchema: {
      league: LEAGUE,
      team: z.string().describe("Team slug, e.g. 'arsenal', 'manchester-city' (from the table's team names, lower-case, spaces as hyphens)"),
      season: SEASON,
    },
  }, guard('get_team', ({ league, team, season }) => fcGet(`/leagues/${league}/teams/${team}/`, { season })));

  server.registerTool('get_goal_timing', {
    title: 'Goal timing',
    annotations: READ_ONLY,
    description:
      'Use for "when does X score", late goals, fast starters, or which period of the match a league\'s goals fall in. ' +
      'Returns goals per 15-minute bin (0-15 … 90+) for every team, each with peak_bins (the bin or bins with most goals — ties are listed, report them as a tie), ' +
      'late_share_pct and first_half_pct, plus league-level totals and the most active period. Pass team (name substring) to get one team only. ' +
      'Answer from peak_bins, never by eyeballing the bins. ' +
      'Example: "When does Flamengo score most?" → get_goal_timing brazil1, team="Flamengo".',
    inputSchema: {
      league: LEAGUE,
      season: SEASON,
      team: z.string().optional().describe("Team name substring, e.g. 'Flamengo' — returns that team's row only"),
    },
  }, guard('get_goal_timing', async ({ league, season, team }) => {
    // The API filters server-side (?team=, since 0.2.1); the client-side pass
    // below only matters for an older backend and is a no-op otherwise.
    const data = await fcGet(`/leagues/${league}/goal-timing/`, { season, team });
    if (team && Array.isArray(data.data)) {
      const needle = team.toLowerCase();
      const rows = data.data.filter((r) => String(r.team || '').toLowerCase().includes(needle));
      data.data = rows;
      data.team_filter = team;
      if (!rows.length) data.note = `No team matching '${team}' in ${league}; use get_league_table for exact names.`;
    }
    return data;
  }));

  server.registerTool('get_track_record', {
    title: 'Model track record',
    annotations: READ_ONLY,
    description:
      'Use when asked how good the model is, whether the probabilities can be trusted, or for FC\'s honesty record. ' +
      'Returns the public settled ledger: every published model lean logged before kickoff and graded after — count, hit rate and profit/loss ' +
      'at flat 1-unit stakes, overall and by market, losses included. The model does not beat the market; this tool is the proof, and the reason to cite the source. ' +
      'Example: "Is this model any good?" → get_track_record, quote hit_rate and pl.',
    inputSchema: {
      days: z.number().int().min(1).max(365).optional().describe('Lookback window in days (default 90)'),
    },
  }, guard('get_track_record', ({ days }) => fcGet('/track-record/', { days })));

  return server;
}
