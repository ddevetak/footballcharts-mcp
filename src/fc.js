// Thin client for the football-charts.com developer API (/api/v1/).
// The MCP layer never talks to the database — only to the keyed public API,
// so the MCP server can be open source while the data stays server-side.

const BASE = (process.env.FC_API_BASE || 'https://footballcharts-backend.onrender.com/api/v1')
  .replace(/\/$/, '');
const KEY = process.env.FC_API_KEY || '';

export async function fcGet(path, params = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${KEY}`,
      Accept: 'application/json',
      'User-Agent': 'footballcharts-mcp/0.1',
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

export function requireKey() {
  if (!KEY) {
    throw new Error(
      'FC_API_KEY is not set. Get a free key: ' +
      `curl -X POST ${BASE}/keys/register/ -H 'Content-Type: application/json' ` +
      `-d '{"email":"you@example.com"}' — then set FC_API_KEY in this server's environment.`
    );
  }
}
