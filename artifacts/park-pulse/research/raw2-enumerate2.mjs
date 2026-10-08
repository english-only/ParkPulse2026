#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
const NSW = 'https://data.nsw.gov.au/data/api/3/action';
const DGA = 'https://data.gov.au/data/api/3/action';
function get(url) {
  try {
    const out = execFileSync('curl', ['-s','-m','30','-H','User-Agent: park-pulse-research/1.0', url], {encoding:'utf8', maxBuffer: 2e8});
    return JSON.parse(out);
  } catch (e) { return null; }
}
const out = [];

// 1. Non-fdp packages in the newly confirmed orgs
for (const org of ['northern-beaches-council','sutherland-shire-council','cumberland-council','council-of-the-city-of-sydney']) {
  const r = get(`${NSW}/package_search?fq=organization:${org}&rows=200`);
  if (!r || !r.success) { out.push(`### ${org}: FAILED`); continue; }
  const pkgs = (r.result.results||[]).filter(p => !(p.name||'').startsWith('fdp-') && !(p.name||'').startsWith('nsw-fdp-'));
  out.push(`### ${org} — ${r.result.count} total, ${pkgs.length} non-fdp:`);
  for (const p of pkgs) out.push(`  ${p.name} | ${p.title||''} | ${p.license_title||''}`);
}

// 2. Org ownership of the harvested city-of-sydney parks packages
for (const name of ['5-cityofsydney--parks-1','5-cityofsydney--playgrounds','5-cityofsydney--drinking-fountains-water-bubblers-1','5-cityofsydney--dog-off-leash-parks','5-cityofsydney--library-details']) {
  const r = get(`${NSW}/package_show?name=${name}`);
  if (!r || !r.success) { out.push(`### ${name}: FAILED`); continue; }
  const p = r.result;
  const org = p.organization || {};
  out.push(`### ${name}\n  org: ${org.title} (${org.name}) | license: ${p.license_title} | modified: ${p.metadata_modified}`);
  for (const res of (p.resources||[]).slice(0,4)) out.push(`  res: ${res.name||''} | ${res.format} | ${(res.url||'').slice(0,120)}`);
}

// 3. Statewide facility point layer detail
{
  const r = get(`${DGA}/package_show?name=asset-infrastructure-facility-point`);
  if (r && r.success) {
    const p = r.result;
    out.push(`### asset-infrastructure-facility-point\n  org: ${p.organization?.title} | license: ${p.license_title} | modified: ${p.metadata_modified}`);
    out.push(`  notes: ${(p.notes||'').slice(0,500)}`);
    for (const res of (p.resources||[])) out.push(`  res: ${res.name||''} | ${res.format} | ${(res.url||'').slice(0,160)}`);
  }
}

// 4. Portal-wide search for parks-relevant datasets
for (const q of ['playground','off-leash','drinking fountain','public toilet','sports facility','recreation centre','park bench','BBQ']) {
  const r = get(`${NSW}/package_search?q=${encodeURIComponent(q)}&rows=30`);
  if (!r || !r.success) { out.push(`### q="${q}": FAILED`); continue; }
  out.push(`### q="${q}" — ${r.result.count} hits`);
  for (const p of (r.result.results||[]).slice(0,12)) {
    const org = p.organization ? p.organization.title : '?';
    out.push(`  ${p.name} | ${org} | ${p.license_title||''}`);
  }
}
const txt = out.join('\n');
console.log(txt);
