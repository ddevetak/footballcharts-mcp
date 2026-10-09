// Thin client for the football-charts.com developer API (/api/v1/).
// The MCP layer never talks to the database — only to the keyed public API,
// so the MCP server can be open source while the data stays server-side.
//
// The key is passed IN, not read from the environment: the stdio server has
// one key for its whole life, but the hosted HTTP server serves many callers
// and must bind a key per request. A module-level key would leak one caller's
// quota — or data — into another's session.

import { AsyncLocalStorage } from 'node:async_hooks';

const DEFAULT_BASE = 'https://footballcharts-backend.onrender.com/api/v1';

// Which tool is on the stack, so fcGet can name it to the API in X-FC-Tool.
// AsyncLocalStorage and not a module-level variable: the hosted HTTP server
// handles many callers at once, and a plain variable would attribute one
// caller's request to whichever tool another caller entered last.
const toolContext = new AsyncLocalStorage();

/** Run `fn` with `name` recorded as the tool behind any API call it makes. */
export function withTool(name, fn) {
  return toolContext.run(name, fn);
}

export function makeClient({ apiKey = '', apiBase } = {}) {
  const base = (apiBase || process.env.FC_API_BASE || DEFAULT_BASE).replace(/\/$/, '');

  async function fcGet(path, params = {}) {
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    // No key → no Authorization header: the API serves keyless callers at a
    // small per-IP budget (300/day, 20/min) and its 429 says how to get a key.
    const headers = { Accept: 'application/json', 'User-Agent': 'footballcharts-mcp/0.4' };
    // Names the tool behind this call so usage can be read per tool rather
    // than as one undifferentiated MCP total. Server-side it is treated as
    // untrusted input: matched against the known tool list, else discarded.
    const tool = toolContext.getStore();
    if (tool) headers['X-FC-Tool'] = tool;
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    // The hosted server serves every ChatGPT / Claude user from one egress
    // address; without this the API's per-IP keyless budget (300/day) would be
    // shared by all of them. The secret identifies the service, not a user,
    // so it may come from the environment. Unset → ordinary keyless call.
    const serviceSecret = (process.env.FC_MCP_SERVICE_SECRET || '').trim();
    if (!apiKey && serviceSecret) headers['X-FC-MCP-Secret'] = serviceSecret;
    const res = await fetch(url, {
      headers: {
        ...headers,
      },
    });
    let body;
    try {
      body = await res.json();
    } catch {
      throw new Error(`football-charts API returned ${res.status} with a non-JSON body`);
    }
    if (!res.ok) {
      const err = body?.error || {};
      if (err.code === 'season_gated') {
        throw new Error('That season is outside the free window, which covers the current and previous season of each league. list_leagues shows the exact season strings available.');
      }
      throw new Error(err.message || `football-charts API error ${res.status} (${err.code || 'unknown'})`);
    }
    return body;
  }

  // Kept for API compatibility with 0.3 callers; a key is optional since 0.4.
  function requireKey() {}

  return { fcGet, requireKey, base };
}
