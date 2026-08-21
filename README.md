# football-charts MCP server

Give your AI assistant live football data for **90+ leagues**: tables, results,
fixtures, model probabilities and Monte Carlo season projections from
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

| Tool | What it returns |
|---|---|
| `list_leagues` | All leagues + the seasons your key can query. Call first. |
| `get_league_table` | Standings: points, W/D/L, goals, form. |
| `get_rankings` | Luck-adjusted or goals-based re-ranking of the table. |
| `get_results` | Finished matches with FT/HT scores + first-goal minute. |
| `get_fixtures` | Upcoming matches with model probabilities. |
| `get_match` | One match: full probability block across markets. |
| `get_season_projection` | Title / top-4 / relegation %, points ranges (10k sims, daily). |
| `get_team` | One team: match log, goal timing, stats. |
| `get_goal_timing` | Goals per 15-minute bin, per team. |
| `get_track_record` | FC's settled public prediction ledger. |

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
