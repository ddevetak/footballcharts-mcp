// The read-only tools, registered onto a fresh McpServer per caller.
//
// Shared by both transports so the stdio package and the hosted HTTP endpoint
// can never drift apart: one definition, two doors.
//
// Descriptions are written FOR THE MODEL, not for a docs page. Since 0.5.0
// each carries three things, in this order, because that is what decides
// whether a model picks the tool and gets the call right first time:
//   purpose  - what it answers, with the phrases a user would use
//   routing  - when to use a SIBLING instead (ten overlapping football tools
//              is where wrong calls come from)
//   example  - one question -> one call
// The output SHAPE lives in outputSchema (returned as structuredContent), so
// the prose no longer has to list fields. Annotations say read-only, so the
// prose no longer has to either.
//
// `league` is a free string, not an enum of the 93 keys: an enum would add
// ~700 tokens to every tool definition, and list_leagues already turns a
// name into the key in one call (decision 2026-09-06, revisit if models
// keep guessing keys).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { makeClient } from './fc.js';

const asText = (data) => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 1) }],
  structuredContent: data,
});
const asError = (e) => ({ content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });

const LEAGUE = z.string().describe(
  "League key from list_leagues, e.g. 'premier' (England), 'spain1', 'brazil1', 'sweden1', 'wgermany1' (women). Not the display name.");
const SEASON = z.string().optional().describe(
  "Season string exactly as list_leagues returns it: winter-calendar leagues look like '2026-2027', summer-calendar leagues (Brazil, Sweden, Norway, Japan…) like '2026'. Omit for the current season. The free tier serves the current and previous season only.");

export const SERVER_INFO = { name: 'football-charts', version: '0.5.0' };

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

// ---------------------------------------------------------------- output shapes
// Deliberately permissive: every object is .passthrough() and every field is
// optional, because BOTH the server SDK and the client SDK reject a result
// whose structuredContent fails the schema — a schema one field stricter than
// the API is an outage, not a warning.
// The schemas document the fields a model should reach for; they do not
// enumerate everything the API sends.
// Leaf values are untyped on purpose: a typed leaf turns every nullable
// field into an anyOf in the JSON Schema (3× the tool-list size, measured)
// and one unexpected null becomes a failed call. Names + descriptions are
// what a model reads; the types are documented in the README.
const num = z.any().optional();
const str = z.any().optional();
const int = z.any().optional();
const obj = (shape) => z.object(shape).passthrough();

const ATTRIBUTION = { attribution: z.string().nullable().optional().describe('Cite as "Data by football-charts.com"') };
const SEASON_CTX = {
  league: str, season: str,
  season_state: str.describe("'in_season' or 'finished'"),
  current_season: str,
};

const TABLE_ROW = obj({
  team: z.string(), position: int, played: int, won: int, drawn: int, lost: int,
  goals_for: int, goals_against: int, goal_difference: int, points: int,
  last_5_form: str.describe("Latest results as letters, e.g. 'WWDLW'"), last_5_points: int,
  expected_points: num.describe('Points the underlying numbers say the team should have'),
  luck_difference: num.describe('points − expected_points; positive = ahead of the numbers'),
  luck_category: str.describe("'lucky' | 'fair' | 'unlucky'"),
  expected_position: int,
  avg_goals_scored: num, avg_goals_conceded: num, clean_sheets: int, over_25_percentage: num,
});

const PROBS = obj({
  home: num, away: num,
  btts_yes: num, 'over_0.5': num, 'over_1.5': num, 'over_2.5': num, 'over_3.5': num, 'over_4.5': num,
  'ht_over_0.5': num, 'ht_over_1.5': num,
  expected_home_goals: num, expected_away_goals: num, expected_ht_goals: num,
}).describe('Probabilities 0–1. The draw is NOT a field: draw = 1 − home − away.');

const MODEL_BLOCK = obj({
  dc_v2: obj({
    model: str,
    calibrated: PROBS.nullable().optional().describe('Use these. Calibrated on settled matches.'),
    data_through: str.describe('Last match date the model has seen'),
    computed_at: str,
  }).nullable().optional(),
});

const FIXTURE = obj({
  slug: z.string().describe('Input to get_match'),
  home_team: z.string(), away_team: z.string(),
  match_date: str, time: str, status: str,
  league: str, country: str, real_league_name: str,
  model_predictions: MODEL_BLOCK.nullable().optional(),
});

const RESULT_ROW = obj({
  date: str, time: str, homeTeam: z.string(), awayTeam: z.string(),
  score: str.describe("Full-time 'home:away', e.g. '3:0'"), ht_result: str.describe("Half-time 'home:away'"),
  first_goal_time: int.describe('Minute of the first goal; null when goalless'),
  first_goal_time_extra: int.describe('Stoppage-time minutes added to first_goal_time'),
  goalless: z.boolean().nullable().optional(),
});

const PROJECTION_TEAM = obj({
  title: num, top4: num, bottom3: num.describe('Relegation-zone probability (bottom three)'),
  bottom1: num, bottom2: num,
  pts_now: int, played: int, gd_now: int,
  mean_pts: num, p10_pts: int, p90_pts: int,
  position_matrix: z.array(z.number()).nullable().optional().describe('Probability of finishing 1st…last'),
});

const GOAL_TIMING_ROW = obj({
  team: z.string(), total: int,
  bins: z.record(z.string(), z.number()).nullable().optional().describe("Goals per bin: '0-15','15-30','30-45','45+','46-60','60-75','75-90','90+'"),
  peak_bins: z.array(z.string()).nullable().optional().describe('Bin(s) with most goals — ties are listed; report a tie as a tie'),
  peak_goals: int, late_share_pct: num.describe('% of goals from 75′ on'), first_half_pct: num,
});

const LEDGER = obj({ n: int, won: int, lost: int, void: int, pl: num.describe('Profit/loss in units at flat 1-unit stakes'), hit_rate: num });

// ---------------------------------------------------------------------- about
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
    "Model probabilities are a Dixon-Coles baseline (dc_v2). They are calibrated but do NOT beat the bookmaker market; say 'the model estimates', never 'you should bet'. Prefer the 'calibrated' block over 'raw'. The draw is 1 − home − away.",
    'For "when does X score" questions use get_goal_timing with a team filter and answer from peak_bins (ties are listed — report them as a tie).',
    'Quote the season and the date the data is from; attribute as "Data: football-charts.com".',
  ],
  free_tier: 'Works WITHOUT a key: 300 requests/day, 20/min per IP. A free key lifts that to 5,000/day, 60/min. Both: all leagues, current + previous season, no odds. Older seasons and per-bookmaker opening/closing odds: https://www.football-charts.com/data',
  get_a_key: 'Only needed past 300 requests/day: POST https://footballcharts-backend.onrender.com/api/v1/keys/register/ with {"email": "..."} or the form at https://www.football-charts.com/developers — free, shown once. Hosted: https://mcp.football-charts.com/mcp (keyless) or /<key>/mcp.',
  tools: {
    list_leagues: 'league keys + seasons — call first',
    get_league_table: 'standings now; view=luck or goals for alternative rankings',
    get_results: 'finished matches: FT/HT scores, first-goal minute',
    get_fixtures: 'upcoming matches with model probabilities; gives the slug for get_match',
    get_match: 'one match in full, by slug',
    get_season_projection: 'title / top-4 / relegation probabilities, 10,000 simulations, current season',
    get_team: 'one team in depth: table row, match log, goal bins',
    get_goal_timing: 'goals per 15-minute bin for every team — league-wide comparisons',
    get_track_record: 'the settled ledger of every published model lean, losses included',
  },
};

// Fields of the site's match object that are storage internals, never useful
// to a model. Dropped so get_match returns what its schema says.
const MATCH_INTERNALS = new Set([
  'fgt_h_data', 'fgt_a_data', 'g_h_data', 'g_a_data', 'mu_lg_cached', 'league_avg_goals_cached',
  'portal_link', 'league_phase_status', 'created_at', 'updated_at', 'api_football_league_id',
  'api_football_fixture_id', 'api_football_home_team_id', 'api_football_away_team_id', 'predictions_allowed',
  'last_score_update', 'home_team_logo', 'away_team_logo', 'prediction_probability', 'finished_at', 'match_minute',
]);

/**
 * Build a server bound to one caller's API key.
 * @param {{apiKey?: string, apiBase?: string}} opts
 */
export function buildServer({ apiKey, apiBase } = {}) {
  const { fcGet } = makeClient({ apiKey, apiBase });
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

  // API errors surfaced as tool errors, not crashes.
  const guard = (name, fn) => async (args) => {
    const started = Date.now();
    try {
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
      'What football-charts.com covers (93 leagues incl. lower divisions), what it does NOT hold (live scores, players, odds), ' +
      'how league keys and season strings work, how to phrase model probabilities honestly, and which tool answers what. ' +
      'Call when unsure whether this source fits a question, or once before the first call in a session. No parameters. ' +
      'Example: "Can you get me Estonian league data?" → about_football_charts, then list_leagues.',
    inputSchema: {},
    outputSchema: obj({
      what: z.string(), use_this_source_when: z.array(z.string()), do_not_use_for: z.array(z.string()),
      how_to_answer_well: z.array(z.string()), free_tier: z.string(), get_a_key: z.string(),
      tools: z.record(z.string(), z.string()),
    }),
  }, async () => asText(ABOUT));

  server.registerTool('list_leagues', {
    title: 'List leagues',
    annotations: READ_ONLY,
    description:
      'Every league this source covers — 93 across 42 countries — with country, league key, display name and the seasons available, newest first. No parameters. ' +
      'Call first in any workflow: every other tool takes a league key and most take a season string, and both must match these values exactly. ' +
      "Season format differs by competition (winter leagues '2026-2027', summer leagues '2026'), so read the season here rather than constructing it. " +
      '("list" rather than "get": it enumerates everything, it does not fetch one thing.) ' +
      'Example: "Which Polish league do you have?" → list_leagues, filter by country.',
    inputSchema: {},
    outputSchema: obj({
      leagues: z.array(obj({
        league: z.string().describe('The key to pass as `league`'), name: z.string(), country: z.string(),
        seasons: z.array(z.string()).describe('Newest first; exact strings for `season`'), url: str,
      })),
      count: int, season_window: str, ...ATTRIBUTION,
    }),
  }, guard('list_leagues', () => fcGet('/leagues/')));

  server.registerTool('get_league_table', {
    title: 'League table',
    annotations: READ_ONLY,
    description:
      'Standings for one league season: one row per team with position, played, W/D/L, goals, points, last-five form, plus expected points and a luck category (how far results run ahead of or behind the underlying numbers). ' +
      'Use for "who is top", "how many points", "what is the form", or any question about the table as ranked by points. ' +
      'view="luck" re-orders the same rows by over/under-performance (who is lucky, unlucky, flattered by the table); view="goals" by scoring. ' +
      'For one team in depth use get_team; for how the season is projected to END use get_season_projection. Omit season for the current one. ' +
      'Example: "Is Hull really a top-four side?" → get_league_table premier, view=luck, compare points with expected_points.',
    inputSchema: {
      league: LEAGUE,
      season: SEASON,
      view: z.enum(['classic', 'luck', 'goals']).nullable().optional().describe("Row order; default 'classic' (by points)"),
    },
    outputSchema: obj({ ...SEASON_CTX, view: str, table: z.array(TABLE_ROW).nullable().optional(), ...ATTRIBUTION }),
  }, guard('get_league_table', ({ league, season, view }) =>
    fcGet(`/leagues/${league}/table/`, { season, view: view && view !== 'classic' ? view : undefined })));

  server.registerTool('get_results', {
    title: 'Match results',
    annotations: READ_ONLY,
    description:
      'Finished matches of one league season, one row per match: date, teams, full-time and half-time score, first-goal minute, goalless flag. ' +
      'Rows are in chronological order, earliest first. last=N keeps only the N latest matches and still returns them earliest-first. team filters on a case-insensitive substring of either side\'s name. ' +
      'Use for scores, "how did X do lately", head-to-head within a season, half-time scores or first-goal minutes. ' +
      'Use get_fixtures for matches not yet played, get_match for one match\'s probability detail, get_team for one team\'s season in full. No odds. ' +
      'Example: "Last five Liverpool results" → get_results premier, team="Liverpool", last=5.',
    inputSchema: {
      league: LEAGUE,
      season: SEASON,
      team: z.string().nullable().optional().describe("Team name substring, e.g. 'Liverpool'"),
      last: z.number().int().min(1).max(500).nullable().optional()
        .describe('Keep only the N latest matches of the season, e.g. 5 for recent form (default: all)'),
    },
    outputSchema: obj({ ...SEASON_CTX, count: int, note: str, matches: z.array(RESULT_ROW).nullable().optional(), ...ATTRIBUTION }),
  }, guard('get_results', async ({ league, season, team, last }) => {
    const data = await fcGet(`/leagues/${league}/results/`, { season, team });
    if (last && Array.isArray(data.matches)) {
      data.matches = data.matches.slice(-last);
      data.count = data.matches.length;
      data.note = `Trimmed to the ${data.count} most recent matches, earliest first.`;
    }
    return data;
  }));

  server.registerTool('get_fixtures', {
    title: 'Upcoming fixtures',
    annotations: READ_ONLY,
    description:
      'Upcoming matches of one league, earliest first: kick-off date and time, teams, a slug, and the model\'s calibrated probabilities (home/away, over/under ladders, both teams to score, half-time lines; draw = 1 − home − away) with team attack/defence ratings. ' +
      'Use for "who plays this weekend", kick-off times, or the chances in an upcoming match. ' +
      'The slug on each row is the input to get_match, which returns one fixture in full — call this first when you need one match in depth. Use get_results for matches already played. ' +
      'Probabilities are a baseline model from match history alone (no injuries, motivation or weather) and are not market prices or advice — say so. ' +
      'Example: "What are the chances of goals in Brentford v Sunderland?" → get_fixtures premier, read model_predictions.dc_v2.calibrated["over_2.5"].',
    inputSchema: { league: LEAGUE },
    outputSchema: obj({ league: str, count: int, matches: z.array(FIXTURE).nullable().optional(), ...ATTRIBUTION }),
  }, guard('get_fixtures', ({ league }) => fcGet(`/leagues/${league}/fixtures/`)));

  server.registerTool('get_match', {
    title: 'Match detail',
    annotations: READ_ONLY,
    description:
      'One match in full: the complete model probability block (calibrated and raw, all markets), team ratings, first-goal-time histograms for both sides (fgt_h, fgt_a), recent form, and — once played — the score, half-time score and status. ' +
      "Use for one named fixture. slug has the form 'country/league-slug/YYYY-MM-DD-home-vs-away'; take it from a get_fixtures row rather than assembling it, because team spellings must match exactly. " +
      'Use get_fixtures for a league\'s whole upcoming slate, get_results for scores of many matches. Probabilities are model output, not advice. ' +
      "Example: slug 'england/premier-league/2026-09-05-brentford-vs-sunderland'.",
    inputSchema: {
      slug: z.string().describe("Match slug from get_fixtures, e.g. 'england/premier-league/2026-09-05-brentford-vs-sunderland'"),
    },
    outputSchema: obj({
      match: obj({
        slug: str, label: str, league: str, real_league_name: str, country: str, season: str,
        match_date: str, time: str, home_team: str, away_team: str,
        match_status: str.describe("'scheduled' before kick-off; 'ft' when finished"),
        home_score: int, away_score: int, ht_result: str,
        model_predictions: MODEL_BLOCK.nullable().optional(),
        fgt_h: z.array(z.any()).nullable().optional().describe('Home side first-goal-time histogram'),
        fgt_a: z.array(z.any()).nullable().optional().describe('Away side first-goal-time histogram'),
      }),
      ...ATTRIBUTION,
    }),
  }, guard('get_match', async ({ slug }) => {
    const data = await fcGet(`/matches/${slug}/`);
    if (data && data.match && typeof data.match === 'object') {
      data.match = Object.fromEntries(Object.entries(data.match).filter(([k]) => !MATCH_INTERNALS.has(k)));
    }
    return data;
  }));

  server.registerTool('get_season_projection', {
    title: 'Season projection',
    annotations: READ_ONLY,
    description:
      'How one league\'s CURRENT season is projected to finish: 10,000 Monte Carlo simulations refreshed daily, per team the title, top-four and relegation (bottom3) probabilities, points now, mean final points, a 10th–90th percentile points range and a full finishing-position matrix, plus the change since the previous run. ' +
      'Use for forward-looking questions — who wins the league, who goes down, how safe a position is, likely final points. ' +
      'Use get_league_table for where things stand NOW and get_fixtures for individual match probabilities. Always the current season; there is no season parameter. ' +
      'Example: "Can Hull stay up?" → get_season_projection premier, read projection.teams.Hull.bottom3.',
    inputSchema: { league: LEAGUE },
    outputSchema: obj({
      projection: obj({
        league: str, season: str, run_date: str, n_sims: int,
        scheduled_remaining: int, expected_remaining: int, partial_schedule: z.boolean().nullable().optional(),
        teams: z.record(z.string(), PROJECTION_TEAM).describe('Keyed by team name'),
        deltas_vs_prev: z.record(z.string(), obj({ title: num, top4: num, bottom3: num })).nullable().optional().describe('Change since the previous run'),
      }),
      ...ATTRIBUTION,
    }),
  }, guard('get_season_projection', ({ league }) => fcGet(`/leagues/${league}/projection/`)));

  server.registerTool('get_team', {
    title: 'Team page',
    annotations: READ_ONLY,
    description:
      'Everything held on one team in one league season: its table row (with luck and expected points), the full match log (date, opponent, venue H/A, score, half-time score, first-goal minute, outcome), goals per 15-minute bin, first-goal distribution, and the seasons available. ' +
      "team is a slug: lower-case, spaces as hyphens, e.g. 'arsenal', 'manchester-city'. Take the exact name from get_league_table first when unsure. " +
      'Use for one team in depth ("tell me about Arsenal\'s season"). Use get_league_table for every team shallowly, get_results with a team filter for just the scores, get_goal_timing to compare timing across the whole league. ' +
      'Example: "How is Arsenal doing?" → get_team premier, team="arsenal".',
    inputSchema: {
      league: LEAGUE,
      team: z.string().describe("Team slug, e.g. 'arsenal', 'manchester-city' (from the table's team names, lower-case, spaces as hyphens)"),
      season: SEASON,
    },
    outputSchema: obj({
      team: str, slug: str, league: str, season: str, seasons: z.array(z.string()).nullable().optional(),
      ranking: TABLE_ROW.nullable().optional().describe('The team\'s table row'),
      matches: z.array(obj({
        date: str, time: str, home: str, away: str, venue: str.describe("'H' or 'A'"),
        score: str, ht: str, first_goal_time: str, outcome: str.describe("'W' | 'D' | 'L'"),
      })).nullable().optional(),
      first_goal_bins: z.array(obj({ time: str, count: int })).nullable().optional(),
      ...ATTRIBUTION,
    }),
  }, guard('get_team', ({ league, team, season }) => fcGet(`/leagues/${league}/teams/${team}/`, { season })));

  server.registerTool('get_goal_timing', {
    title: 'Goal timing',
    annotations: READ_ONLY,
    description:
      'Goals per 15-minute bin (0-15 … 90+) for every team in a league season, each with peak_bins (the bin or bins with most goals — ties are listed; report a tie as a tie), late_share_pct and first_half_pct, plus league totals and the most active period. ' +
      'Use for "when does X score", late goals, fast starters, who concedes early, or which period a league\'s goals fall in. Pass team (name substring) for one team only. ' +
      'For one team\'s timing next to its match log get_team is more direct. Answer from peak_bins, never by eyeballing the bins. ' +
      'Example: "When does Flamengo score most?" → get_goal_timing brazil1, team="Flamengo".',
    inputSchema: {
      league: LEAGUE,
      season: SEASON,
      team: z.string().nullable().optional().describe("Team name substring, e.g. 'Flamengo' — returns that team's row only"),
    },
    outputSchema: obj({
      league: str, season: str, time_bins: z.array(z.string()).nullable().optional(),
      stats: obj({ total_goals: int, most_active_period: str, late_goals: int, match_count: int }).nullable().optional(),
      data: z.array(GOAL_TIMING_ROW).nullable().optional(), team_filter: str, team_not_found: str, note: str,
      ...ATTRIBUTION,
    }),
  }, guard('get_goal_timing', async ({ league, season, team }) => {
    // The API filters server-side (?team=); the client-side pass below only
    // matters for an older backend and is a no-op otherwise.
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
      'The public settled ledger: every model lean published before kick-off and graded after the result — count, hit rate and profit/loss at flat 1-unit stakes, overall and by market (1x2, ft_ou_25, ft_ou_35, ht_ou_15, bts), a daily cumulative series, the 50 most recent graded leans, and calibration (Brier score, probability buckets vs actual hit rate). days sets the lookback window, default 90. ' +
      'Losing periods are included; nothing is filtered. Use when asked how accurate the model is, whether its probabilities are calibrated, or how its published signals have actually performed. ' +
      'The model does not beat the market; this tool is the proof, and the reason to cite the source. ' +
      'Example: "Is this model any good?" → get_track_record, quote summary.hit_rate, summary.pl and accuracy.brier.',
    inputSchema: {
      days: z.number().int().min(1).max(365).nullable().optional().describe('Lookback window in days (default 90)'),
    },
    outputSchema: obj({
      track_record: obj({
        signals_only: z.boolean().nullable().optional(),
        summary: LEDGER.nullable().optional().describe('Whole window'),
        by_market: z.record(z.string(), LEDGER).nullable().optional(),
        recent: z.array(obj({
          slug: str, market: str, side: str, model_prob: num, outcome: str.describe("'won' | 'lost' | 'void'"), pl: num, result_score: str,
        })).nullable().optional().describe('The 50 most recent graded leans'),
        pending: int.describe('Leans published but not yet settled'),
        accuracy: obj({
          n: int, brier: num.describe('Brier score over settled probabilities; lower is better, 0.25 = coin flip'),
          buckets: z.array(obj({ lo: num, hi: num, n: int, avg_prob: num, hit_rate: num })).nullable().optional(),
        }).nullable().optional(),
      }),
      ...ATTRIBUTION,
    }),
  }, guard('get_track_record', ({ days }) => fcGet('/track-record/', { days })));

  return server;
}
