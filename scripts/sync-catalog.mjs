import { readFile, writeFile, rename } from 'node:fs/promises';
import { normalizeCatalog, catalogDiff, UPSTREAM } from './catalog/normalize.mjs';
const target = new URL('../src/catalog-snapshot.json', import.meta.url);
const temp = new URL('../src/catalog-snapshot.json.tmp', import.meta.url);
const args = process.argv.slice(2);
if (args.some(a => !['--check', '--allow-removals'].includes(a))) throw new Error('Usage: npm run catalog:sync -- [--check] [--allow-removals]');
async function json(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'PedalBook-catalog-sync', Accept: 'application/json' }, signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!res.ok) throw new Error(`${res.status}: ${url}`);
  const body = await res.text();
  if (body.length > 15_000_000) throw new Error('Catalog too large');
  return JSON.parse(body);
}
// Resolve once, then fetch both files from that immutable revision.
const commit = await json('https://api.github.com/repos/PedalPlayground/pedalplayground/commits/beta');
if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error('Invalid source revision');
let previous;
try { previous = JSON.parse(await readFile(target, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const base = `https://raw.githubusercontent.com/PedalPlayground/pedalplayground/${commit.sha}/public/data/`;
const pedals = normalizeCatalog(await json(`${base}pedals.json`), 'pedals');
const boards = normalizeCatalog(await json(`${base}pedalboards.json`), 'boards');
const diff = { pedals: catalogDiff(previous?.pedals, pedals), boards: catalogDiff(previous?.boards, boards) };
console.log(JSON.stringify({ revision: commit.sha, counts: { pedals: pedals.length, boards: boards.length }, diff }, null, 2));
if (args.includes('--check')) process.exit(0);
if (previous && !args.includes('--allow-removals') && (diff.pedals.removed || diff.boards.removed)) throw new Error('Removed identities detected. Review --check, then explicitly use --allow-removals. Existing snapshot is unchanged.');
if (previous?.revision === commit.sha) { console.log('Already up to date.'); process.exit(0); }
const snapshot = { revision: commit.sha, syncedAt: new Date().toISOString(), sourceUrl: UPSTREAM, unit: 'mm', pedals, boards };
const { pedals: pedalRows, boards: boardRows, ...metadata } = snapshot;
const contents = JSON.stringify(metadata, null, 2).slice(0, -2) + ',\n  "pedals": [\n' + pedalRows.map(r => '    ' + JSON.stringify(r)).join(',\n') + '\n  ],\n  "boards": [\n' + boardRows.map(r => '    ' + JSON.stringify(r)).join(',\n') + '\n  ]\n}\n';
await writeFile(temp, contents, { flag: 'wx' });
await rename(temp, target);
console.log('Catalog snapshot updated. Review diff, run verify/build, then commit. Images load on demand; no bulk image download.');
