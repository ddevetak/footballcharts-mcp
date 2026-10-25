# Football Charts MCP Server & Keyless JSON API

Official documentation for the **[Football Charts](https://www.football-charts.com)** Model Context Protocol (MCP) server and keyless REST API.

## Overview

[Football Charts](https://www.football-charts.com) provides daily calibrated **Dixon–Coles match probabilities**, **10,000-run Monte Carlo season simulations**, **goal-minute timing distributions**, and **historical pre-match odds archives** across **98 football leagues** (44 countries) worldwide.

- **Homepage:** [https://www.football-charts.com](https://www.football-charts.com)
- **Daily Match Predictions:** [https://www.football-charts.com/predictions](https://www.football-charts.com/predictions)
- **Global Team Attack/Defence Rankings:** [https://www.football-charts.com/rankings](https://www.football-charts.com/rankings)
- **Developer & API Hub:** [https://www.football-charts.com/developers](https://www.football-charts.com/developers)
- **Simplified Chinese API Docs (中文接口文档):** [https://www.football-charts.com/zh-cn/developers](https://www.football-charts.com/zh-cn/developers)
- **Simplified Chinese Stoppage-Time Open Dataset (中文开放数据集):** [https://www.football-charts.com/zh-cn/dataset](https://www.football-charts.com/zh-cn/dataset)
- **Open Datasets (CC-BY-4.0):** [https://www.football-charts.com/data](https://www.football-charts.com/data)
- **Interactive Dixon–Coles & Shot-xG Calculator:** [https://www.football-charts.com/tools/dixon-coles-calculator](https://www.football-charts.com/tools/dixon-coles-calculator)
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
