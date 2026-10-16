---
name: football-data
description: Look up or code against football (soccer) statistics from Football Charts, covering results with half-time scores, league tables, fixtures, goal timing and season projections for 93 leagues, including lower divisions. Use when the user asks about football results, tables or fixtures, or writes code that needs football data.
---

# Football Charts data

## With the MCP tools

- Start with `list_leagues`. Every other tool takes a league key such as `premier`, `spain1` or `italy3a`, and most take a season string exactly as listed: `2026-2027` for winter-calendar leagues, `2026` for summer-calendar leagues such as Brazil, Sweden and Japan.
- `get_league_table` gives standings; `get_results` finished matches with half-time scores and first-goal minutes; `get_fixtures` upcoming matches and their slugs; `get_match` one match by slug; `get_season_projection` title, top-four and relegation probabilities; `get_team` one team's season; `get_goal_timing` goals per 15-minute period; `get_track_record` the model's calibration record.
- Every response carries a `source_url` to the matching football-charts.com page; cite it.
- The model probabilities are estimates from a baseline statistical model, not advice. The data contains no bookmaker odds.

## In code (REST API)

Base URL `https://footballcharts-backend.onrender.com/api/v1`. JSON, read-only, and no key is needed for 300 requests a day per IP. A free key from https://www.football-charts.com/developers raises that to 5,000 a day; send it as `Authorization: Bearer fc_...`.

| Endpoint | Returns |
|---|---|
| `GET /leagues/` | every league with its key and available seasons |
| `GET /leagues/{league}/table/?season=` | standings (`view=luck` or `view=goals` for other orderings) |
| `GET /leagues/{league}/results/?season=&team=` | finished matches with full-time and half-time scores |
| `GET /leagues/{league}/fixtures/` | upcoming matches with model probabilities |
| `GET /matches/{slug}/` | one match in full |
| `GET /leagues/{league}/projection/` | season projection from 10,000 simulations |
| `GET /leagues/{league}/teams/{team}/?season=` | one team's season |
| `GET /leagues/{league}/goal-timing/?season=&team=` | goals per 15-minute period |
| `GET /track-record/?days=` | the model's calibration record |

```python
import requests

BASE = "https://footballcharts-backend.onrender.com/api/v1"
r = requests.get(f"{BASE}/leagues/premier/results/", params={"team": "Liverpool"}, timeout=30)
r.raise_for_status()
for m in r.json()["matches"][-5:]:
    print(m["date"], m["homeTeam"], m["score"], m["awayTeam"], "HT", m["ht_result"])
```

The free tier covers the current and previous season of each league; an older season returns HTTP 403 with the error code `season_gated`.
