// The 10 read-only tools, registered onto a fresh McpServer per caller.
//
// Shared by both transports so the stdio package and the hosted HTTP endpoint
// can never drift apart: one definition, two doors.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { makeClient } from './fc.js';

const asText = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 1) }] });
const asError = (e) => ({ content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });

const LEAGUE = z.string().describe(
  "League key, e.g. 'premier', 'spain1', 'brazil1', 'wgermany1'. Use list_leagues to discover keys.");
const SEASON = z.string().optional().describe(
  "Season string exactly as returned by list_leagues (summer leagues '2026', winter '2026-2027'). Omit for the latest.");

export const SERVER_INFO = { name: 'football-charts', version: '0.2.1' };

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

/**
 * Build a server bound to one caller's API key.
 * @param {{apiKey?: string, apiBase?: string}} opts
 */
export function buildServer({ apiKey, apiBase } = {}) {
  const { fcGet, requireKey } = makeClient({ apiKey, apiBase });
  const server = new McpServer(SERVER_INFO);

  // Key check + API errors surfaced as tool errors, not crashes.
  const guard = (fn) => async (args) => {
    try {
      requireKey();
      return asText(await fn(args ?? {}));
    } catch (e) {
      return asError(e);
    }
  };

  server.registerTool('list_leagues', {
    title: 'List leagues',
    annotations: READ_ONLY,
    description: 'All 90+ leagues on football-charts.com with country, league key and the seasons available to your key (newest first). Call this first to resolve league keys and season strings.',
    inputSchema: {},
  }, guard(() => fcGet('/leagues/')));

  server.registerTool('get_league_table', {
    title: 'League table',
    annotations: READ_ONLY,
    description: 'Current standings for a league season: position, points, W/D/L, goals, goal difference, last-5 form.',
    inputSchema: { league: LEAGUE, season: SEASON },
  }, guard(({ league, season }) => fcGet(`/leagues/${league}/table/`, { season })));

  server.registerTool('get_rankings', {
    title: 'Alternative rankings',
    annotations: READ_ONLY,
    description: "The table re-ranked by FC's alternative views: 'luck' (luck-adjusted — who over/under-performs their underlying numbers) or 'goals' (highest-scoring matches).",
    inputSchema: {
      league: LEAGUE,
      view: z.enum(['luck', 'goals']).describe('Ranking view'),
      season: SEASON,
    },
  }, guard(({ league, view, season }) => fcGet(`/leagues/${league}/table/`, { view, season })));

  server.registerTool('get_results', {
    title: 'Match results',
    annotations: READ_ONLY,
    description: 'Finished matches of a league season with FT/HT scores and first-goal minute, oldest first. Optionally filter by team name substring and cap the number of most recent matches.',
    inputSchema: {
      league: LEAGUE,
      season: SEASON,
      team: z.string().optional().describe('Team name substring filter'),
      last: z.number().int().min(1).max(500).optional()
        .describe('Return only the N most recent matches (default: all)'),
    },
  }, guard(async ({ league, season, team, last }) => {
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
    description: "Upcoming matches of a league with FC's model probabilities (Dixon-Coles based) for HT over 1.5 and FT over 2.5. Probabilities, not betting advice.",
    inputSchema: { league: LEAGUE },
  }, guard(({ league }) => fcGet(`/leagues/${league}/fixtures/`)));

  server.registerTool('get_match', {
    title: 'Match detail',
    annotations: READ_ONLY,
    description: "One match by slug (country/league-slug/date-home-vs-away, as returned by get_fixtures): full model probability block across markets (1X2, over/under lines, BTTS, HT lines), team ratings, first-goal-time histograms.",
    inputSchema: {
      slug: z.string().describe("Match slug, e.g. 'england/premier-league/2026-08-22-arsenal-vs-chelsea'"),
    },
  }, guard(({ slug }) => fcGet(`/matches/${slug}/`)));

  server.registerTool('get_season_projection', {
    title: 'Season projection',
    annotations: READ_ONLY,
    description: 'Monte Carlo season projection (10,000 simulations, refreshed daily): per team the title / top-4 / relegation probability, mean final points and a 10th-90th percentile points range.',
    inputSchema: { league: LEAGUE },
  }, guard(({ league }) => fcGet(`/leagues/${league}/projection/`)));

  server.registerTool('get_team', {
    title: 'Team page',
    annotations: READ_ONLY,
    description: 'One team in a league season: table row, full match log (scores, HT, venue, outcome), goal-timing bins, first-goal distribution and per-team stats.',
    inputSchema: {
      league: LEAGUE,
      team: z.string().describe("Team slug, e.g. 'arsenal' (see get_league_table / list of teams)"),
      season: SEASON,
    },
  }, guard(({ league, team, season }) => fcGet(`/leagues/${league}/teams/${team}/`, { season })));

  server.registerTool('get_goal_timing', {
    title: 'Goal timing heat map',
    annotations: READ_ONLY,
    description: 'When teams score: goals per 15-minute bin. Pass `team` (name substring) to get ONE team; omit it for the whole league. Each row carries labelled `bins`, `peak_bins` (ties listed — report them as a tie), `late_share_pct` and `first_half_pct`, plus league-level stats.',
    inputSchema: {
      league: LEAGUE,
      season: SEASON,
      team: z.string().optional().describe('Team name substring, e.g. "flamengo" — returns only that team'),
    },
  }, guard(({ league, season, team }) => fcGet(`/leagues/${league}/goal-timing/`, { season, team })));

  server.registerTool('get_track_record', {
    title: 'Model track record',
    annotations: READ_ONLY,
    description: "FC's public, settled prediction track record — every published model signal graded against real results. Transparency data: hit rates and P/L by market, no cherry-picking.",
    inputSchema: {
      days: z.number().int().min(1).max(365).optional().describe('Lookback window in days (default 90)'),
    },
  }, guard(({ days }) => fcGet('/track-record/', { days })));

  return server;
}
