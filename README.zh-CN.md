# 免费足球数据 MCP 服务器 — 覆盖 98 个联赛（含中超与低级别联赛）

[![npm](https://img.shields.io/npm/v/footballcharts-mcp)](https://www.npmjs.com/package/footballcharts-mcp) [![license](https://img.shields.io/npm/l/footballcharts-mcp)](LICENSE)

[English](README.md) · **简体中文**

让支持 MCP 的 AI 客户端（Cursor、Cherry Studio、Cline、Windsurf 等）直接查询 **44 个国家和地区 98 个足球联赛**的数据：赛果、半场比分、每个进球的分钟数、每 15 分钟进球分布、积分榜和赛程。

- **中文接口文档（含 Python 示例与 CSV 样例）：** [https://www.football-charts.com/zh-cn/developers?ref=github](https://www.football-charts.com/zh-cn/developers?ref=github)
- **开放数据集（92 个联赛补时进球占比排名，CC BY 4.0）：** [https://www.football-charts.com/zh-cn/dataset?ref=github](https://www.football-charts.com/zh-cn/dataset?ref=github)
- **完整历史赛季 API 与学术申请（中文）：** [https://www.football-charts.com/zh-cn/pricing?ref=github](https://www.football-charts.com/zh-cn/pricing?ref=github)

## 1. 免安装、免密钥直接连接（Streamable HTTP 托管端点）

无需在本地安装 Node.js，也无需申请 API 密钥（匿名每天可调用 300 次；在[中文开发者页面](https://www.football-charts.com/zh-cn/developers?ref=github)用邮箱注册免费密钥后每天 5,000 次）：

```json
{
  "mcpServers": {
    "football-charts": {
      "url": "https://mcp.football-charts.com/mcp"
    }
  }
}
```

如果已有免费密钥（`fc_...`），可将 URL 设为 `https://mcp.football-charts.com/fc_你的密钥/mcp`。

## 2. 本地通过 `npx` 运行

```json
{
  "mcpServers": {
    "football-charts": {
      "command": "npx",
      "args": ["-y", "footballcharts-mcp"]
    }
  }
}
```

国内网络可配合 npm 镜像源：

```bash
npx --registry=https://registry.npmmirror.com -y footballcharts-mcp
```

## 3. 工具列表（全部只读）

| 工具名 | 说明 |
|---|---|
| `about_football_charts` | 数据覆盖范围、赛季字符串写法与免费额度说明 |
| `list_leagues` | 全部 98 个联赛（44 个国家和地区）的代码与可查询赛季 |
| `get_results` | 已完赛比赛：全场比分、半场比分、首个进球分钟数 |
| `get_goal_timing` | 每 15 分钟进球分布（含 `45+` 与 `90+` 补时阶段） |
| `get_league_table` | 联赛积分榜：积分、胜平负、进失球、近期状态 |
| `get_team` | 单支球队单赛季：积分榜位置、比赛记录、进球时间统计 |
| `get_fixtures` | 未来赛程 |
| `get_match` | 单场比赛详情与历史交锋 |
| `get_season_projection` | 赛季排名蒙特卡洛模拟（每天 10,000 次模拟更新） |

## 许可证

代码采用 MIT 许可证开源；接口与开放数据集返回的数据归 football-charts.com 所有，遵循 [中文开发者文档](https://www.football-charts.com/zh-cn/developers?ref=github) 中的署名要求（`"Data by football-charts.com"`）。
