# Football data MCP server — 93 leagues, lower divisions included (Football Charts)

[![npm](https://img.shields.io/npm/v/footballcharts-mcp)](https://www.npmjs.com/package/footballcharts-mcp) [![license](https://img.shields.io/npm/l/footballcharts-mcp)](LICENSE) [![MCP registry](https://img.shields.io/badge/MCP%20registry-io.github.ddevetak%2Ffootballcharts--mcp-blue)](https://registry.modelcontextprotocol.io)

Give your AI assistant football data for **93 leagues** — including the lower
divisions other sources skip: tables, results, fixtures, goal timing, a public
baseline model and Monte Carlo season projections from
[football-charts.com](https://www.football-charts.com).

FC publishes **probabilities and a settled track record — not betting tips**.
Every model signal is published before kickoff and graded after; the
`get_track_record` tool returns that ledger.

## Free tier

- All 90+ leagues (top and lower divisions, women's leagues)
- Current + previous season per league
- Model probabilities (Dixon-Coles based) and daily 10,000-run Monte Carlo
  season projections
- 5,000 requests/day, 60/minute
- No betting odds (odds + full historical archive are part of the paid tier —
  contact contact@football-charts.com)

## Get a key

```bash
curl -X POST https://footballcharts-backend.onrender.com/api/v1/keys/register/ \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com"}'
```

The key (`fc_...`) is shown once — store it.

## Use it on claude.ai (web or mobile) — nothing to install

Settings → Connectors → **Add custom connector**, then paste:

```
https://mcp.football-charts.com/fc_your_key_here/mcp
```

The key sits in the URL because a connector field accepts only a URL. If your
client can send headers, `POST https://mcp.football-charts.com/mcp` with
`Authorization: Bearer fc_your_key` works identically. Keys are read-only,
free and replaceable, so a key in a URL grants published statistics and
nothing else.

## Use with Claude Desktop

`claude_desktop_config.json`:

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

Ten read-only tools. Descriptions are written for the model: when to use it,
what comes back, one example. `about_football_charts` needs no key.

| tool | use it for |
|---|---|
| `about_football_charts` | What this source covers and does not, how keys and seasons work, how to phrase probabilities. Call first when unsure. |
| `list_leagues` | Turn a league name into its key; see the seasons your key can read. |
| `get_league_table` | Standings, form, expected points; `view=luck` or `goals` for alternative rankings. |
| `get_results` | Finished matches with FT/HT scores and first-goal minute; filter by team, cap with `last`. |
| `get_fixtures` | Upcoming matches with the baseline model's calibrated probabilities across markets. |
| `get_match` | One upcoming match in full, by slug. |
| `get_season_projection` | Title / top-4 / relegation probabilities and points ranges, 10,000 simulations, daily. |
| `get_team` | One team: table row, match log, goal timing, stats. |
| `get_goal_timing` | Goals per 15-minute bin per team with `peak_bins`; pass `team` for one team. |
| `get_track_record` | The public settled ledger of every published model lean, losses included. |

The model is a public baseline (Dixon-Coles). It is calibrated and it does
not beat the bookmaker market; `get_track_record` is the proof. Per-bookmaker
opening and closing odds for 91 leagues, 2020 onward, are a paid dataset at
[football-charts.com/data](https://www.football-charts.com/data).

## Changelog

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

## Terms

Free for personal and research use with attribution
("Data by football-charts.com"). No resale of the data. Commercial use of the
paid tier: contact@football-charts.com.

## License

MIT (server code only). The data served by the football-charts.com API
remains © football-charts.com, provided under the terms at
https://www.football-charts.com/developers.
