// End-to-end check of the hosted HTTP transport with a REAL MCP client —
// the same handshake claude.ai performs, not a hand-rolled curl.
//
//   node src/http.js &                     # or PORT=8099 node src/http.js
//   FC_MCP_URL=http://localhost:8099 FC_API_KEY=fc_... node test/e2e-http.mjs
//
// With a valid key it calls a tool for real; without one it asserts the
// no-key guidance path instead, so the test is still meaningful unkeyed.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE = (process.env.FC_MCP_URL || 'http://localhost:8099').replace(/\/$/, '');
const KEY = process.env.FC_API_KEY || '';
const url = new URL(KEY ? `${BASE}/${KEY}/mcp` : `${BASE}/mcp`);

const client = new Client({ name: 'fc-e2e-http', version: '0.1.0' });
await client.connect(new StreamableHTTPClientTransport(url));
console.log(`connected to ${url.pathname.replace(KEY, 'fc_***')}`);

const { tools } = await client.listTools();
console.log(`TOOLS (${tools.length}):`, tools.map((t) => t.name).join(', '));
if (tools.length !== 10) throw new Error(`expected 10 tools, got ${tools.length}`);

const r = await client.callTool({ name: 'list_leagues', arguments: {} });
const text = r.content[0].text;

if (KEY) {
  if (r.isError) throw new Error(`list_leagues failed with a key: ${text.slice(0, 200)}`);
  const data = JSON.parse(text);
  console.log(`list_leagues -> ${data.count} leagues, season window: ${data.season_window}`);
  if (!data.count) throw new Error('list_leagues returned no leagues');
  // The free tier must never leak odds through this door either.
  if (/"odds"|"home_win"|"over25"/.test(text)) throw new Error('odds leaked into a free-tier response');
} else {
  if (!r.isError || !/API key/i.test(text)) {
    throw new Error(`expected key guidance without a key, got: ${text.slice(0, 200)}`);
  }
  console.log('no-key path OK ->', text.split('.')[0]);
}

await client.close();
console.log('e2e-http PASSED');
