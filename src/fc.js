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
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'User-Agent': 'footballcharts-mcp/0.2',
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

  function requireKey() {
    if (!apiKey) {
      throw new Error(
        'No football-charts API key supplied. Get a free key: ' +
        `curl -X POST ${base}/keys/register/ -H 'Content-Type: application/json' ` +
        `-d '{"email":"you@example.com"}' — then set FC_API_KEY (stdio) or use ` +
        'your keyed URL https://mcp.football-charts.com/<key>/mcp (hosted).'
      );
    }
  }

  return { fcGet, requireKey, base };
}
