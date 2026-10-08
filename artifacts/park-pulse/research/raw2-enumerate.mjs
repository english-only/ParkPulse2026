#!/usr/bin/env node
// Enumerate ALL CKAN packages per council org on data.nsw.gov.au and data.gov.au
import { execFileSync } from 'node:child_process';

const TARGETS = [
  // [portal, orgName, label]
  ['https://data.nsw.gov.au/data/api/3/action', 'blacktown-city-council', 'Blacktown (data.nsw)'],
  ['https://data.gov.au/data/api/3/action', 'blacktown-city-council-datansw', 'Blacktown (data.gov.au)'],
  ['https://data.nsw.gov.au/data/api/3/action', 'canterbury-bankstown-council', 'Canterbury-Bankstown (data.nsw)'],
  ['https://data.gov.au/data/api/3/action', 'canterbury-bankstown-council-datansw', 'Canterbury-Bankstown (data.gov.au)'],
  ['https://data.nsw.gov.au/data/api/3/action', 'georges-river-council', 'Georges River (data.nsw)'],
  ['https://data.gov.au/data/api/3/action', 'georges-river-council-datansw', 'Georges River (data.gov.au)'],
  ['https://data.nsw.gov.au/data/api/3/action', 'city-of-parramatta-council', 'Parramatta (data.nsw)'],
  ['https://data.gov.au/data/api/3/action', 'city-of-parramatta-council-datansw', 'Parramatta (data.gov.au)'],
  ['https://data.nsw.gov.au/data/api/3/action', 'bayside-council', 'Bayside (data.nsw)'],
  ['https://data.nsw.gov.au/data/api/3/action', 'council-of-the-city-of-sydney', 'Sydney (data.nsw)'],
  ['https://data.gov.au/data/api/3/action', 'council-of-the-city-of-sydney-datansw', 'Sydney (data.gov.au)'],
  // slug probes for orgs not yet confirmed
  ['https://data.nsw.gov.au/data/api/3/action', 'northern-beaches-council', 'Northern Beaches (data.nsw probe)'],
  ['https://data.nsw.gov.au/data/api/3/action', 'sutherland-shire-council', 'Sutherland (data.nsw probe)'],
  ['https://data.nsw.gov.au/data/api/3/action', 'hornsby-shire-council', 'Hornsby (data.nsw probe)'],
  ['https://data.nsw.gov.au/data/api/3/action', 'cumberland-council', 'Cumberland (data.nsw probe)'],
  ['https://data.nsw.gov.au/data/api/3/action', 'northern-beaches', 'Northern Beaches (data.nsw probe2)'],
  ['https://data.gov.au/data/api/3/action', 'northern-beaches-council', 'Northern Beaches (dga probe)'],
  ['https://data.nsw.gov.au/data/api/3/action', 'randwick-city-council', 'Randwick (data.nsw probe)'],
  ['https://data.nsw.gov.au/data/api/3/action', 'inner-west-council', 'Inner West (data.nsw probe)'],
];

function get(url) {
  try {
    const out = execFileSync('curl', ['-s', '-m', '30', '-H', 'User-Agent: park-pulse-research/1.0', url], { encoding: 'utf8', maxBuffer: 2e8 });
    return JSON.parse(out);
  } catch (e) { return null; }
}

const out = [];
for (const [base, org, label] of TARGETS) {
  const r = get(`${base}/package_search?fq=organization:${org}&rows=200`);
  if (!r || !r.success) { out.push(`### ${label}\n  FAILED/404\n`); continue; }
  const res = r.result;
  const count = res.count;
  const pkgs = (res.results || []).map(p => `${p.name} | ${p.title || ''} | ${p.license_title || ''}`);
  out.push(`### ${label} — ${count} packages\n` + pkgs.map(p => '  ' + p).join('\n') + '\n');
}
const txt = out.join('\n');
console.log(txt);
