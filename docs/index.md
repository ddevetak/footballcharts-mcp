# Football Charts MCP Server & Keyless JSON API

Official documentation for the **[Football Charts](https://www.football-charts.com)** Model Context Protocol (MCP) server and keyless REST API.

## Overview

[Football Charts](https://www.football-charts.com) provides daily calibrated **Dixon–Coles match probabilities**, **10,000-run Monte Carlo season simulations**, **goal-minute timing distributions**, and **historical pre-match odds archives** across **93 football leagues** worldwide.

- **Homepage:** [https://www.football-charts.com](https://www.football-charts.com)
- **Developer & API Hub:** [https://www.football-charts.com/developers](https://www.football-charts.com/developers)
- **Open Datasets (CC-BY-4.0):** [https://www.football-charts.com/data](https://www.football-charts.com/data)
- **Interactive Dixon–Coles Calculator:** [https://www.football-charts.com/tools/dixon-coles-calculator](https://www.football-charts.com/tools/dixon-coles-calculator)
- **Public Calibration Track Record:** [https://www.football-charts.com/track-record](https://www.football-charts.com/track-record)

## Hosted Keyless MCP Endpoint

Connect Claude Desktop, Cursor, Windsurf, or any MCP client directly to the remote streamable-HTTP endpoint:

```json
{
  "mcpServers": {
    "footballcharts": {
      "url": "https://mcp.football-charts.com/mcp"
    }
  }
}
```
