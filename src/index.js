#!/usr/bin/env node
// MCP server for football-charts.com — stdio transport (npx / Claude Desktop).
//
// 10 read-only tools (9 data + 1 orientation) over the developer API (/api/v1/).
// A key is OPTIONAL since 0.4.0: without one the API serves 300 requests/day
// per IP (20/min); FC_API_KEY lifts that to 5,000/day. All 93 leagues, current
// + previous season, no betting odds. FC publishes probabilities and a settled
// track record, not tips.
//
// Tool definitions live in ./tools.js, shared with the hosted HTTP server
// (./http.js) so the two doors can never expose different tools.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './tools.js';

const server = buildServer({ apiKey: process.env.FC_API_KEY || '' });

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('football-charts MCP server running (stdio)');
