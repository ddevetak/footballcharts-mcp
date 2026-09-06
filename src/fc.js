// Thin client for the football-charts.com developer API (/api/v1/).
// The MCP layer never talks to the database — only to the keyed public API,
// so the MCP server can be open source while the data stays server-side.
//
// The key is passed IN, not read from the environment: the stdio server has
// one key for its whole life, but the hosted HTTP server serves many callers
// and must bind a key per request. A module-level key would leak one caller's
// quota — or data — into another's session.

const DEFAULT_BASE = 'https://footballcharts-backend.onrender.com/api/v1';

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
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
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
      throw new Error(err.message || `football-charts API error ${res.status} (${err.code || 'unknown'})`);
    }
    return body;
  }

  // Kept for API compatibility with 0.3 callers; a key is optional since 0.4.
  function requireKey() {}

  return { fcGet, requireKey, base };
}
