#!/usr/bin/env node
// Hosted MCP endpoint for football-charts.com — Streamable HTTP transport.
//
// Why this exists alongside the stdio server: a stdio server reaches people
// who will run `npx` and edit a JSON config. A URL reaches anyone who can
// paste one into a connector field — which is most people. Same 10 tools,
// same free tier, no install.
//
// STATELESS by design: every POST builds a fresh server + transport and
// throws them away. The tools are read-only, so there is no session state
// worth keeping, and statelessness is what makes per-caller API keys safe —
// one caller's key can never survive into another's request — while letting
// Render scale this to more than one instance without sticky sessions.
//
// The key travels one of four ways:
//   1. Authorization: Bearer fc_...        (clients that can set headers)
//   2. /fc_yourkey/mcp                     (connector fields that take only a URL)
//   3. Authorization: fc_...               (gateways that map config onto a header)
//   4. ?api_key=fc_...                     (gateways that forward config as a query)
// (3) and (4) exist for registry gateways such as Smithery, which proxy a
// user-declared config value to the upstream server and cannot add a 'Bearer '
// prefix; their documented default is a query parameter. Without them a gateway
// listing connects, lists all 10 tools, and fails on every single tool call.
// (2) and (4) put a credential in a URL, which is not something to do lightly.
// It is acceptable HERE because an FC key is read-only, free, rate-limited and
// self-serve replaceable — it grants published statistics, nothing more. Do
// not extend this pattern to anything that can write or spend.

import { createServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildServer, SERVER_INFO } from './tools.js';

const PORT = Number(process.env.PORT || 8080);
const MAX_BODY = 1_000_000; // 1 MB — MCP requests are small; anything larger is abuse

const KEY_IN_PATH = /^\/(fc_[A-Za-z0-9_-]+)\/mcp\/?$/;
const PLAIN_PATH = /^\/mcp\/?$/;

// Query names a gateway might use for the declared config field. Smithery
// defaults to the property name, so accept the plausible spellings rather than
// forcing one — the cost of an extra lookup is nil, a silent auth failure is not.
const KEY_QUERY_PARAMS = ['api_key', 'apiKey', 'fcApiKey', 'fc_api_key'];
const BARE_KEY = /^fc_[A-Za-z0-9_-]+$/;

function keyFrom(req, url) {
  const m = url.pathname.match(KEY_IN_PATH);
  if (m) return m[1];

  const auth = (req.headers.authorization || '').trim();
  const bearer = auth.match(/^Bearer\s+(\S+)$/i);
  if (bearer) return bearer[1];
  // A gateway mapping config onto Authorization forwards the raw value.
  if (BARE_KEY.test(auth)) return auth;

  for (const name of KEY_QUERY_PARAMS) {
    const v = (url.searchParams.get(name) || '').trim();
    if (v) return v;
  }
  return '';
}

// The MCP spec requires servers to validate Origin, to stop a random web page
// driving an MCP server the victim's browser can reach (DNS rebinding). The
// exposure is smaller for a remote read-only server than for a localhost one,
// but a public endpoint that reflects every Origin is a bad default.
//
// The clients that matter send NO Origin at all — claude.ai calls connectors
// server-side, and Claude Desktop / Code / curl are not browsers. So: allow
// requests without an Origin, allow a small allowlist for genuine browser use,
// and reject the rest. FC_ALLOWED_ORIGINS (comma-separated, or '*') widens it
// without a redeploy if a legitimate browser client ever turns up.
const ORIGIN_ALLOWLIST = (process.env.FC_ALLOWED_ORIGINS
  || 'https://claude.ai,https://www.claude.ai,https://claude.com,https://www.football-charts.com,http://localhost:3000,http://localhost:3001'
).split(',').map((s) => s.trim()).filter(Boolean);

function originAllowed(origin) {
  if (!origin) return true;                       // non-browser client
  if (ORIGIN_ALLOWLIST.includes('*')) return true;
  return ORIGIN_ALLOWLIST.includes(origin);
}

function cors(res, origin) {
  // Echo the specific origin rather than '*' so the allowlist is what decides.
  res.setHeader('Access-Control-Allow-Origin', origin && originAllowed(origin) ? origin : 'null');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id, mcp-protocol-version, last-event-id');
  // Browser clients cannot read these without an explicit expose list.
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const origin = req.headers.origin;
  cors(res, origin);

  if (!originAllowed(origin)) {
    return json(res, 403, {
      error: 'origin not allowed',
      detail: 'This MCP endpoint does not accept browser requests from this origin. '
            + 'Add it as a connector (server-side) or use the stdio package.',
    });
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // Render health check + a human landing on the bare host.
  if (url.pathname === '/healthz') return json(res, 200, { ok: true, ...SERVER_INFO });
  if (url.pathname === '/') {
    return json(res, 200, {
      ...SERVER_INFO,
      transport: 'streamable-http',
      endpoint: 'POST /<your-key>/mcp  (or POST /mcp with Authorization: Bearer <key>)',
      get_a_key: 'https://www.football-charts.com/developers',
      note: 'Probabilities and a settled public track record, not betting tips.',
    });
  }

  const isMcpPath = KEY_IN_PATH.test(url.pathname) || PLAIN_PATH.test(url.pathname);
  if (!isMcpPath) return json(res, 404, { error: 'not found', try: 'POST /<your-key>/mcp' });

  // GET (server-initiated SSE stream) and DELETE (session teardown) have no
  // meaning without sessions; answer honestly rather than hanging the client.
  if (req.method !== 'POST') {
    return json(res, 405, {
      error: 'method not allowed',
      detail: 'This endpoint is stateless: use POST. There is no server-initiated stream to open.',
    });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return json(res, 400, { error: e.message });
  }

  const apiKey = keyFrom(req, url);
  const server = buildServer({ apiKey });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  // Free the per-request pair whichever way the exchange ends.
  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    console.error('mcp request failed:', e?.message || e);
    if (!res.headersSent) json(res, 500, { error: 'internal error' });
  }
});

httpServer.listen(PORT, () => {
  console.log(`football-charts MCP server running (streamable http) on :${PORT}`);
});
