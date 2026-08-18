#!/usr/bin/env node
// MCP server for football-charts.com.
//
// 10 read-only tools over the keyed developer API (/api/v1/). Free tier:
// all 90+ leagues, current + previous season, model probabilities and
// Monte Carlo projections — no betting odds. FC publishes probabilities
// and a settled track record, not tips.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { fcGet, requireKey } from './fc.js';

const server = new McpServer({
  name: 'football-charts',
  version: '0.1.0',
});

const asText = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 1) }] });
const asError = (e) => ({ content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });

// Wrap a handler: key check + API errors surfaced as tool errors, not crashes.
const guard = (fn) => async (args) => {
  try {
    requireKey();
    return asText(await fn(args ?? {}));
  } catch (e) {
    return asError(e);
  }
};

const LEAGUE = z.string().describe(
  "League key, e.g. 'premier', 'spain1', 'brazil1', 'wgermany1'. Use list_leagues to discover keys.");
const SEASON = z.string().optional().describe(
  "Season string exactly as returned by list_leagues (summer leagues '2026', winter '2026-2027'). Omit for the latest.");

server.registerTool('list_leagues', {
  title: 'List leagues',
  description: 'All 90+ leagues on football-charts.com with country, league key and the seasons available to your key (newest first). Call this first to resolve league keys and season strings.',
  inputSchema: {},
}, guard(() => fcGet('/leagues/')));

server.registerTool('get_league_table', {
  title: 'League table',
  description: 'Current standings for a league season: position, points, W/D/L, goals, goal difference, last-5 form.',
  inputSchema: { league: LEAGUE, season: SEASON },
}, guard(({ league, season }) => fcGet(`/leagues/${league}/table/`, { season })));

server.registerTool('get_rankings', {
  title: 'Alternative rankings',
  description: "The table re-ranked by FC's alternative views: 'luck' (luck-adjusted — who over/under-performs their underlying numbers) or 'goals' (highest-scoring matches).",
  inputSchema: {
    league: LEAGUE,
    view: z.enum(['luck', 'goals']).describe('Ranking view'),
    season: SEASON,
  },
}, guard(({ league, view, season }) => fcGet(`/leagues/${league}/table/`, { view, season })));

server.registerTool('get_results', {
  title: 'Match results',
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
  description: "Upcoming matches of a league with FC's model probabilities (Dixon-Coles based) for HT over 1.5 and FT over 2.5. Probabilities, not betting advice.",
  inputSchema: { league: LEAGUE },
}, guard(({ league }) => fcGet(`/leagues/${league}/fixtures/`)));

server.registerTool('get_match', {
  title: 'Match detail',
  description: "One match by slug (country/league-slug/date-home-vs-away, as returned by get_fixtures): full model probability block across markets (1X2, over/under lines, BTTS, HT lines), team ratings, first-goal-time histograms.",
  inputSchema: {
    slug: z.string().describe("Match slug, e.g. 'england/premier-league/2026-08-22-arsenal-vs-chelsea'"),
  },
}, guard(({ slug }) => fcGet(`/matches/${slug}/`)));

server.registerTool('get_season_projection', {
  title: 'Season projection',
  description: 'Monte Carlo season projection (10,000 simulations, refreshed daily): per team the title / top-4 / relegation probability, mean final points and a 10th-90th percentile points range.',
  inputSchema: { league: LEAGUE },
}, guard(({ league }) => fcGet(`/leagues/${league}/projection/`)));

server.registerTool('get_team', {
  title: 'Team page',
  description: 'One team in a league season: table row, full match log (scores, HT, venue, outcome), goal-timing bins, first-goal distribution and per-team stats.',
  inputSchema: {
    league: LEAGUE,
    team: z.string().describe("Team slug, e.g. 'arsenal' (see get_league_table / list of teams)"),
    season: SEASON,
  },
}, guard(({ league, team, season }) => fcGet(`/leagues/${league}/teams/${team}/`, { season })));

server.registerTool('get_goal_timing', {
  title: 'Goal timing heat map',
  description: 'When each team in a league scores: goals per 15-minute bin per team, plus league-level stats (most active period, late-goal share).',
  inputSchema: { league: LEAGUE, season: SEASON },
}, guard(({ league, season }) => fcGet(`/leagues/${league}/goal-timing/`, { season })));

server.registerTool('get_track_record', {
  title: 'Model track record',
  description: "FC's public, settled prediction track record — every published model signal graded against real results. Transparency data: hit rates and P/L by market, no cherry-picking.",
  inputSchema: {
    days: z.number().int().min(1).max(365).optional().describe('Lookback window in days (default 90)'),
  },
}, guard(({ days }) => fcGet('/track-record/', { days })));

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('football-charts MCP server running (stdio)');
