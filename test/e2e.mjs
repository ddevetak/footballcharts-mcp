import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['src/index.js'],
  env: {
    ...process.env,
    // Default: the local stub. Set FC_API_BASE (and a real FC_API_KEY) to run
    // the same script against production.
    FC_API_BASE: process.env.FC_API_BASE || 'http://127.0.0.1:8199/api/v1',
    // The stub on 127.0.0.1:8199 does not validate the key, so any value works.
    // Never commit a real one: this file is public.
    // Only the stub gets a default key; against a real base an unset/empty
    // FC_API_KEY means "test the keyless tier".
    FC_API_KEY: process.env.FC_API_KEY ?? (process.env.FC_API_BASE ? '' : 'fc_local_stub_key'),
  },
});
const client = new Client({ name: 'e2e', version: '0.0.1' });
await client.connect(transport);

const tools = await client.listTools();
console.log('TOOLS:', tools.tools.map(t => t.name).join(', '));

async function call(name, args) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content[0].text;
  console.log(`\n== ${name}${r.isError ? ' [ERROR]' : ''} -> ${text.length} chars`);
  console.log(text.slice(0, 220).replace(/\n/g, ' '));
  return text;
}

await call('about_football_charts', {});
// Since 0.4.0 a missing FC_API_KEY is not an error: the API serves keyless
// callers at 300/day. Run with FC_API_KEY unset against production to verify.
await call('list_leagues', {});
await call('get_league_table', { league: 'premier' });
await call('get_league_table', { league: 'premier', view: 'luck' });
const res = await call('get_results', { league: 'premier', last: 3 });
if (res.includes('odds')) console.log('!!! ODDS LEAKED');
await call('get_season_projection', { league: 'premier' });
await call('get_goal_timing', { league: 'premier' });
await call('get_goal_timing', { league: 'premier', team: 'Arsenal' });
await call('get_team', { league: 'premier', team: 'arsenal' });
await call('get_track_record', {});
// error paths
await call('get_results', { league: 'premier', season: '2021-2022' });
await call('get_league_table', { league: 'nowhere9' });
await client.close();
console.log('\nE2E DONE');
