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
import { makeClient, withTool } from './fc.js';

const asText = (data) => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 1) }],
  structuredContent: data,
});

// The API tags every source_url (and per-fixture url) ?ref=api. Behind this
// door the tag names the door instead — mcp, or chatgpt / claude when the
// hosted endpoint can tell the client — so the site's analytics can count
// the visits each assistant sends (2026-10-03). Data only: no tool
// definition changes, so the reviewed ChatGPT / Claude listings stay valid.
export const retag = (data, ref) => {
  if (!ref || ref === 'api' || data == null || typeof data !== 'object') return data;
  return JSON.parse(JSON.stringify(data).replace(/([?&])ref=api\b/g, `$1ref=${ref}`));
};

// Table rows carry the site's per-team "return from backing at flat stakes"
// columns (roi_*, profit_*) and predictions the site's display gates
// (gates.leans); the API keeps them for the site, assistant surfaces never
// see them.
// Same reason as the track-record reshaping below: the directories refuse
// anything that reads as wagering guidance (2026-10-09, found while testing
// for the Claude directory).
const WAGER_KEY = /^(roi_|profit_)|^gates$/;
export const dropWagerFields = (data) => (data == null || typeof data !== 'object')
  ? data
  : JSON.parse(JSON.stringify(data), (k, v) => (WAGER_KEY.test(k) ? undefined : v));
const asError = (e) => ({ content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });

const LEAGUE = z.string().describe(
  "League key as listed by list_leagues, e.g. 'premier' (England), 'spain1', 'brazil1', 'sweden1', 'wgermany1' (women). Not the display name.");
const SEASON = z.string().optional().describe(
  "Season string as listed by list_leagues: '2026-2027' for winter-calendar leagues, '2026' for summer-calendar leagues (Brazil, Sweden, Norway, Japan…). Omit for the current season. The free tier serves the current and previous season.");

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

// Calibration record — the site's ledger reshaped for assistant surfaces.
// The API keeps its unit-stake profit/loss columns for the site's own
// calibration study; here they are dropped and the questions are named in
// plain words. The ChatGPT and Claude directories refuse anything that reads
// as wagering guidance, and a scoring record of a public model is not one —
// but "profit/loss at flat stakes" made a reviewer's scanner say it was.
const QUESTION_NAMES = {
  '1x2': 'match_result', ft_ou_25: 'total_goals_over_2_5', ft_ou_35: 'total_goals_over_3_5',
  ht_ou_15: 'half_time_goals_over_1_5', bts: 'both_teams_score',
};
const OUTCOME_NAMES = { won: 'correct', lost: 'incorrect', void: 'void' };
const scoreBlock = (b) => (b && typeof b === 'object')
  ? { n: b.n, correct: b.won, incorrect: b.lost, void: b.void, hit_rate: b.hit_rate }
  : b;
export const shapeTrackRecord = (data) => {
  const t = data?.track_record;
  if (!t || typeof t !== 'object') return data;
  const by_question = Object.fromEntries(
    Object.entries(t.by_market || {}).map(([k, v]) => [QUESTION_NAMES[k] || k, scoreBlock(v)]));
  const recent = Array.isArray(t.recent) ? t.recent.map((r) => ({
    slug: r.slug, home_team: r.home_team, away_team: r.away_team, league: r.real_league_name,
    country: r.country, match_date: r.match_date,
    question: QUESTION_NAMES[r.market] || r.market, side: r.side, line: r.line, model_prob: r.model_prob,
    outcome: OUTCOME_NAMES[r.outcome] || r.outcome, result_score: r.result_score, result_ht_score: r.result_ht_score,
  })) : t.recent;
  return { ...data, track_record: { summary: scoreBlock(t.summary), by_question, recent, pending: t.pending, accuracy: t.accuracy } };
};
const SCORE = obj({
  n: int.describe('Scored predictions'), correct: int, incorrect: int,
  void: int.describe('Postponed or abandoned; not scored'), hit_rate: num.describe('correct / (correct + incorrect)'),
});

// ---------------------------------------------------------------------- about
const ABOUT = {
  what: 'football-charts.com: results, tables, fixtures, goal timing, a public baseline model and Monte Carlo season projections for 93 football leagues in 42 countries — top divisions, lower tiers most sources skip (Spain regional groups, Czech 2/3, Baltic, Nordic, Asian, African leagues) and women\'s leagues.',
  covers: [
    'league tables, results with half-time scores, fixtures, title and relegation races, and when teams score their goals',
    'lower and non-European divisions that many football sources do not carry',
    'model probabilities with a public, settled track record',
  ],
  not_held: [
    'live scores or in-play events (data updates after full time and a few times a day before matches)',
    'player statistics, lineups, injuries, transfers',
    'bookmaker odds',
  ],
  notes: [
    "League keys look like 'premier', 'spain1', 'brazil1'; list_leagues returns all of them with the seasons available.",
    "Season strings differ by calendar: '2026-2027' for winter leagues, '2026' for summer leagues.",
    "Model probabilities come from a Dixon-Coles baseline model (dc_v2) calibrated on past results; they do not beat the bookmaker market. Each prediction has a 'calibrated' and a 'raw' block; the draw is 1 − home − away.",
    'Goal-timing rows list each team\'s peak period or periods; ties are listed together.',
    'Every response carries source_url, the football-charts.com page with the same data, and the attribution "Data: football-charts.com".',
  ],
  free_tier: 'Without a key: 300 requests/day and 20/min per IP. A free key raises this to 5,000/day and 60/min. Both cover all leagues for the current and previous season.',
  get_a_key: 'Free keys: https://www.football-charts.com/developers (or POST https://footballcharts-backend.onrender.com/api/v1/keys/register/ with {"email": "..."}). Hosted server: https://mcp.football-charts.com/mcp (keyless) or /<key>/mcp.',
  tools: {
    list_leagues: 'league keys and the seasons available',
    get_league_table: 'standings; view=luck or goals for alternative orderings',
    get_results: 'finished matches: full-time and half-time scores, first-goal minute',
    get_fixtures: 'upcoming matches with model probabilities and match slugs',
    get_match: 'one match in full, by slug',
    get_season_projection: 'title, top-four and relegation probabilities from 10,000 simulations, current season',
    get_team: 'one team in depth: table row, match log, goal periods, match-stat averages where covered',
    get_goal_timing: 'goals per 15-minute period for every team in a league',
    get_track_record: 'the calibration record: every published model probability, scored after the result, misses included',
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
 * @param {{apiKey?: string, apiBase?: string, ref?: string}} opts
 *   ref: the analytics tag written into source_url links (default 'mcp').
 */
export function buildServer({ apiKey, apiBase, ref = 'mcp' } = {}) {
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
      // withTool so fcGet can stamp X-FC-Tool on whatever calls this makes.
      const out = asText(retag(dropWagerFields(await withTool(name, () => fn(args ?? {}))), ref));
      logCall(name, started, true);
      return out;
    } catch (e) {
      logCall(name, started, false);
      return asError(e);
    }
  };

  server.registerTool('about_football_charts', {
    title: 'About this source',
    annotations: { ...READ_ONLY, title: 'About this source' },
    description:
      'Returns a summary of the football-charts.com source: the leagues and data it covers (93 leagues, including lower divisions), what it does not hold (live scores, player data, bookmaker odds), the league-key and season-string formats, how the model probabilities are produced, and the free-tier limits. No parameters.',
    inputSchema: {},
    outputSchema: obj({
      what: z.string(), covers: z.array(z.string()), not_held: z.array(z.string()),
      notes: z.array(z.string()), free_tier: z.string(), get_a_key: z.string(),
      tools: z.record(z.string(), z.string()),
    }),
  }, async () => asText(ABOUT));

  server.registerTool('list_leagues', {
    title: 'List leagues',
    annotations: { ...READ_ONLY, title: 'List leagues' },
    description:
      'Returns every league covered (93 across 42 countries) with its league key, display name, country and the seasons available, newest first. Other tools take these league keys and season strings. Season format depends on the competition: \'2026-2027\' for winter-calendar leagues, \'2026\' for summer-calendar leagues. No parameters.',
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
    annotations: { ...READ_ONLY, title: 'League table' },
    description:
      'Returns the standings of one league season: one row per team with position, played, wins, draws, losses, goals, points and last-five form, plus expected points and a luck category (how far results run ahead of or behind the underlying performance). view=\'luck\' orders the same rows by over- or under-performance and view=\'goals\' by goals scored; the default orders by points. Without a season, returns the current season.',
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
    annotations: { ...READ_ONLY, title: 'Match results' },
    description:
      'Returns the finished matches of one league season in chronological order: date, teams, full-time and half-time score, first-goal minute and a goalless flag. team keeps the matches where either side\'s name contains the given text (case-insensitive); last=N keeps only the N most recent matches. Contains no odds.',
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
    annotations: { ...READ_ONLY, title: 'Upcoming fixtures' },
    description:
      'Returns the upcoming matches of one league, earliest first: kick-off date and time, teams, a match slug, and the model\'s calibrated probabilities (home and away win, over/under goal lines, both teams to score, half-time lines; the draw probability is 1 - home - away) with team attack and defence ratings. The probabilities come from a baseline statistical model of past results (no injuries, motivation or weather) and are not bookmaker prices.',
    inputSchema: { league: LEAGUE },
    outputSchema: obj({ league: str, count: int, matches: z.array(FIXTURE).nullable().optional(), ...ATTRIBUTION }),
  }, guard('get_fixtures', ({ league }) => fcGet(`/leagues/${league}/fixtures/`)));

  server.registerTool('get_match', {
    title: 'Match detail',
    annotations: { ...READ_ONLY, title: 'Match detail' },
    description:
      'Returns one match in full, identified by its slug (\'country/league-slug/YYYY-MM-DD-home-vs-away\', as listed in the slug field of upcoming fixtures): the complete model probability block (calibrated and raw), team ratings, first-goal-time histograms for both sides, recent form and, once played, the score, half-time score and status.',
    inputSchema: {
      slug: z.string().describe("Match slug as listed in upcoming fixtures, e.g. 'england/premier-league/2026-09-05-brentford-vs-sunderland'"),
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
    annotations: { ...READ_ONLY, title: 'Season projection' },
    description:
      'Returns how one league\'s current season is projected to finish, from 10,000 Monte Carlo simulations refreshed daily: for each team the probabilities of winning the title, finishing in the top four and finishing in the bottom three, current points, mean final points, a 10th-90th percentile points range, a finishing-position matrix, and the change since the previous run. Covers the current season only; returns a note when no projection exists for the league yet.',
    inputSchema: { league: LEAGUE },
    outputSchema: obj({
      projection: obj({
        league: str, season: str, run_date: str, n_sims: int,
        scheduled_remaining: int, expected_remaining: int, partial_schedule: z.boolean().nullable().optional(),
        teams: z.record(z.string(), PROJECTION_TEAM).describe('Keyed by team name'),
        deltas_vs_prev: z.record(z.string(), obj({ title: num, top4: num, bottom3: num })).nullable().optional().describe('Change since the previous run'),
      }).nullable().optional(),
      note: str.describe('Set when no projection exists for the league yet'),
      ...ATTRIBUTION,
    }),
  }, guard('get_season_projection', async ({ league }) => {
    // The API answers {projection: null} for a league the simulator has not
    // run (too few played matches for the model fit, or an unmappable
    // remaining schedule). A null used to fail output validation and reach
    // the model as an error; say what it means instead.
    const data = await fcGet(`/leagues/${league}/projection/`);
    if (data && data.projection == null) {
      data.note = `No season projection is available for '${league}' yet: the simulator needs roughly 30 played matches and a mappable remaining schedule. Current standings and match probabilities are still available.`;
    }
    return data;
  }));

  server.registerTool('get_team', {
    title: 'Team page',
    annotations: { ...READ_ONLY, title: 'Team page' },
    description:
      'Returns one team\'s season in one league: its table row (with expected points and luck category), the full match log (date, opponent, home or away, score, half-time score, first-goal minute, outcome), goals per 15-minute period, the first-goal distribution, and season averages of match statistics (shots, shots on target, possession, corners, xG) where the league has them. team is a lower-case slug with hyphens, e.g. \'arsenal\' or \'manchester-city\'.',
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
      stats: obj({
        matches_with_stats: int, shots_avg: num, shots_on_target_avg: num, shots_against_avg: num,
        possession_avg: num, corners_avg: num, xg_avg: num, xg_against_avg: num,
      }).nullable().optional().describe('Per-match averages over this season, computed from stored match statistics; null where the league has none'),
      ...ATTRIBUTION,
    }),
  }, guard('get_team', ({ league, team, season }) => fcGet(`/leagues/${league}/teams/${team}/`, { season })));

  server.registerTool('get_goal_timing', {
    title: 'Goal timing',
    annotations: { ...READ_ONLY, title: 'Goal timing' },
    description:
      'Returns goals per 15-minute period (0-15 to 90+) for every team in one league season, with each team\'s peak period or periods (ties are listed together), share of late goals and share of first-half goals, plus league totals and the league\'s most active period. team limits the result to teams whose name contains the given text.',
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
      if (!rows.length) data.note = `No team matching '${team}' in ${league}; team names are as shown in the league table.`;
    }
    return data;
  }));

  server.registerTool('get_track_record', {
    title: 'Model calibration record',
    annotations: { ...READ_ONLY, title: 'Model calibration record' },
    description:
      'Returns the public calibration record of the model: every probability published before kick-off and scored after the result, with count, hit rate, Brier score and reliability buckets (predicted probability against observed frequency), overall and by question type (match result, total goals over 2.5 and 3.5, half-time goals over 1.5, both teams to score), plus the 50 most recent scored predictions. Misses are included. days sets the lookback window (default 90).',
    inputSchema: {
      days: z.number().int().min(1).max(365).nullable().optional().describe('Lookback window in days (default 90)'),
    },
    outputSchema: obj({
      track_record: obj({
        summary: SCORE.nullable().optional().describe('Whole window'),
        by_question: z.record(z.string(), SCORE).nullable().optional(),
        recent: z.array(obj({
          slug: str, home_team: str, away_team: str, league: str, match_date: str,
          question: str, side: str, line: num, model_prob: num,
          outcome: str.describe("'correct' | 'incorrect' | 'void'"), result_score: str,
        })).nullable().optional().describe('The 50 most recent scored predictions'),
        pending: int.describe('Published but not yet scored'),
        accuracy: obj({
          n: int, brier: num.describe('Brier score over scored probabilities; lower is better, 0.25 = coin flip'),
          buckets: z.array(obj({ lo: num, hi: num, n: int, avg_prob: num, hit_rate: num })).nullable().optional(),
        }).nullable().optional(),
      }),
      ...ATTRIBUTION,
    }),
  }, guard('get_track_record', async ({ days }) => shapeTrackRecord(await fcGet('/track-record/', { days }))));

  return server;
}
