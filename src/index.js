#!/usr/bin/env node
// MCP server for football-charts.com — stdio transport (npx / Claude Desktop).
//
// 10 read-only tools over the keyed developer API (/api/v1/). Free tier:
// all 90+ leagues, current + previous season, model probabilities and
// Monte Carlo projections — no betting odds. FC publishes probabilities
// and a settled track record, not tips.
//
// Tool definitions live in ./tools.js, shared with the hosted HTTP server
// (./http.js) so the two doors can never expose different tools.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './tools.js';

const server = buildServer({ apiKey: process.env.FC_API_KEY || '' });

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('football-charts MCP server running (stdio)');
