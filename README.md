# Football data MCP server — 98 leagues, lower divisions included (Football Charts)

[![npm](https://img.shields.io/npm/v/footballcharts-mcp)](https://www.npmjs.com/package/footballcharts-mcp) [![license](https://img.shields.io/npm/l/footballcharts-mcp)](LICENSE) [![MCP registry](https://img.shields.io/badge/MCP%20registry-io.github.ddevetak%2Ffootballcharts--mcp-blue)](https://registry.modelcontextprotocol.io)

**English** · [简体中文 (Simplified Chinese)](README.zh-CN.md)

Give your AI assistant football data for **98 leagues** (across 44 countries) — including the lower
divisions other sources skip: tables, results, fixtures, goal timing, a public
baseline model and Monte Carlo season projections from
[football-charts.com](https://www.football-charts.com).

FC publishes **probabilities and a public calibration record — not betting tips**.
Every model probability is published before kickoff and scored after; the
`get_track_record` tool returns that record (hit rate, Brier score, reliability buckets).

## No key needed

Every tool works without an API key at **100 requests/day per IP** (20/min).
A free key, for personal use, lifts that to **200/day, 60/min** (all keys on
one email address count together) — get one in seconds:

```bash
curl -X POST https://footballcharts-backend.onrender.com/api/v1/keys/register/ \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com"}'
```

The key (`fc_...`) is shown once — store it. Both tiers: all 98 leagues
(top and lower divisions, women's leagues), current + previous season,
model probabilities and daily 10,000-run Monte Carlo projections, **no
betting odds** (the historical odds archive is a paid dataset at
[football-charts.com/data](https://www.football-charts.com/data)).

## Use it on claude.ai (web or mobile) — nothing to install

Settings → Connectors → **Add custom connector**, then paste:

```
https://mcp.football-charts.com/mcp
```

That is the keyless tier. With a key, paste
`https://mcp.football-charts.com/fc_your_key_here/mcp` instead (a connector
field accepts only a URL, so the key travels in it; keys are read-only, free
and replaceable). Clients that can send headers use
`POST https://mcp.football-charts.com/mcp` with `Authorization: Bearer fc_…`.

## Use with Claude Desktop — one-click extension

Download `footballcharts-mcp-<version>.mcpb` from the
[latest release](https://github.com/ddevetak/footballcharts-mcp/releases/latest)
and open it; Claude Desktop installs it. The API key field can stay empty.

## Use with Claude Desktop — manual config

`claude_desktop_config.json` (`FC_API_KEY` is optional since 0.4.0):

```json
{
  "mcpServers": {
    "football-charts": {
      "command": "npx",
      "args": ["-y", "footballcharts-mcp"],
      "env": { "FC_API_KEY": "fc_your_key_here" }
    }
  }
}
```

## Use with Claude Code

```bash
claude mcp add football-charts -e FC_API_KEY=fc_your_key_here -- npx -y footballcharts-mcp
```

## Tools

Ten read-only tools. Each description says what the tool returns.

| tool | use it for |
|---|---|
| `about_football_charts` | Summary of the source: leagues covered, what it does not hold, league-key and season formats, how to read the probabilities. |
| `list_leagues` | Every league covered (98 across 44 countries) with its key, country and seasons available. |
| `get_league_table` | Standings for one league season with form, expected points and a luck category; `view=luck` or `goals` for alternative rankings. |
| `get_results` | Finished matches of one league season with full-time and half-time scores and first-goal minute; filter by `team`, keep the latest N with `last`. |
| `get_fixtures` | Upcoming matches of one league with the model's calibrated probabilities. |
| `get_match` | One match in full, by slug: model probabilities, team ratings and goal-timing histograms. |
| `get_season_projection` | Title, top-four and bottom-three probabilities and points ranges from 10,000 simulations, refreshed daily. |
| `get_team` | One team's season: table row, match log, goals per 15-minute period and first-goal distribution. |
| `get_goal_timing` | Goals per 15-minute period for every team in a league season, with peak periods and league totals; pass `team` for one team. |
| `get_track_record` | The model's public calibration record: hit rate, Brier score and reliability buckets. |

The model is a public baseline (Dixon-Coles). It is calibrated, and
`get_track_record` shows how well; it does not beat the bookmaker market. Per-bookmaker
opening and closing odds for 91 leagues, 2020 onward, are a paid dataset at
[football-charts.com/data](https://www.football-charts.com/data).

## Changelog

- **0.6.0** — every answer links the football-charts.com page with the same data (`source_url`); `get_track_record` returns a calibration record (hit rate, Brier score, reliability buckets); descriptions say what each tool returns, with no instructions to the model, and each tool's title is also in `annotations.title`; outputs drop the site-only fields `roi_*`, `profit_*` and `gates`; `get_season_projection` explains a missing projection instead of failing output validation. Same ten tools and arguments.
- **0.5.0** — every tool has an `outputSchema` and returns `structuredContent`; descriptions rewritten from the consumer side (purpose → when to use a sibling instead → one example); `get_match` drops storage internals. The tool list is ~6k tokens (was ~3k) — the schemas are the cost. Two deliberate choices: `list_leagues` keeps its `list_` prefix because it enumerates everything rather than fetching one thing, and `league` stays a free string rather than an enum of the 93 keys (an enum would add ~700 tokens to every tool; `list_leagues` resolves a name in one call). Schema leaves are untyped so that an unexpected `null` never fails a call; the field types are what the API returns (numbers for counts and probabilities, ISO dates, `'home:away'` score strings).
- **0.4.1** — registry entry declares the hosted endpoint (`remotes`) so connector directories list it; `get_results` ordering wording clarified (chronological, `last=N` keeps the latest N).
- **0.4.0** — a key is optional: the API serves keyless callers at 300/day
  per IP (20/min) and its 429 says how to get a free key; `about` and
  `list_leagues` guidance updated; MCPB desktop-extension bundle
  (`manifest.json`, icon); registry `isRequired: false` for FC_API_KEY.
- **0.3.0** — descriptions rewritten for the model (when / returns / example);
  new `about_football_charts` orientation tool (keyless); `get_rankings`
  folded into `get_league_table` via `view`; `get_goal_timing` gains a
  `team` filter and `peak_bins` guidance; one structured log line per tool
  call on stderr (tool, ok, ms, key prefix — never arguments).
- 0.2.0 — hosted Streamable HTTP transport, read-only annotations, key
  accepted from header, path or query for registry gateways.

## Things to ask

- "How does the Allsvenskan title race look after this weekend?"
- "When does Flamengo usually score — early or late?"
- "Show me the K League table, and who's overperforming what the market expected."
- "Which team in Serie B hasn't conceded in the first 15 minutes?"
- "What is Football Charts' actual prediction track record this season?"

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `FC_API_KEY` | — (required) | Your API key |
| `FC_API_BASE` | FC production API | Override for self-hosted/testing |

## Privacy Policy

This extension sends your tool requests (league keys, team names, seasons —
never your conversation) to football-charts.com's API over HTTPS. Requests
are rate-limited per IP; if you configure an API key, the key identifies
your account and its usage is counted per key. No conversation content is
stored. Football Charts' privacy policy:
<https://www.football-charts.com/privacy>. Questions: contact@football-charts.com.

## Terms

Free for personal and research use with attribution
("Data by football-charts.com"). No resale of the data. Commercial use of the
paid tier: contact@football-charts.com.

## License

MIT (server code only). The data served by the football-charts.com API
remains © football-charts.com, provided under the terms at
https://www.football-charts.com/developers.

## Claude Code plugin

This repository is also a Claude Code plugin (`plugins/football-charts/`). It adds
the hosted MCP server above (no key needed) and the `football-data` skill:

```
/plugin install football-charts --marketplace ddevetak/footballcharts-mcp
```

## Cursor plugin

This repository is also a Cursor plugin (`.cursor-plugin/plugin.json`). It adds the
hosted MCP server above (no key needed) and a `football-data` skill that explains
the tools and the REST API. To try it locally, copy the repository to
`~/.cursor/plugins/local/football-charts`, reload Cursor, and check Customize for
the Football Charts MCP server and skill.
