#!/usr/bin/env node
// Enumerate SEED NSW CKAN packages for Greater Sydney council organizations.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const ORGS = [
  'bayside-council','blacktown-city-council','blue-mountains-city-council','burwood-council',
  'camden-council','campbelltown-city-council','canterbury-bankstown-council','city-of-canada-bay-council',
  'city-of-parramatta-council','council-of-the-city-of-sydney','cumberland-council','fairfield-city-council',
  'georges-river-council','hawkesbury-city-council','hornsby-shire-council','inner-west-council',
  'ku-ring-gai-council','liverpool-city-council','mosman-municipal-council','northern-beaches-council',
  'north-sydney-council','penrith-city-council','randwick-city-council','ryde-city-council',
  'strathfield-municipal-council','sutherland-shire-council','woollahra-municipal-council',
  'waverley-municipal-council','lane-cove-council','city-of-willoughby','hunters-hill-council',
  'city-of-ryde','city-of-blacktown','city-of-cumberland'
];

function get(url) {
  for (let a=0;a<3;a++){
    try {
      const out = execFileSync('curl',['-s','-m','40',url],{encoding:'utf8',maxBuffer:2e8});
      return JSON.parse(out);
    } catch(e){}
  }
  return null;
}

const all = [];
for (const org of ORGS) {
  // CKAN package_search with organization filter
  let start = 0;
  const pkgs = [];
  while (true) {
    const r = get(`https://datasets.seed.nsw.gov.au/api/3/action/package_search?fq=organization%3A${org}&rows=100&start=${start}`);
    if (!r || !r.result) break;
    const res = r.result;
    for (const p of (res.results||[])) {
      pkgs.push({ org, name:p.name, title:p.title, notes:(p.notes||'').slice(0,200), metadata_modified:p.metadata_modified, resources:(p.resources||[]).length });
    }
    if (start + 100 >= (res.count||0)) break;
    start += 100;
    if (start > 500) break;
  }
  if (pkgs.length) {
    console.log(`${org}|${pkgs.length}`);
    all.push(...pkgs);
  } else {
    console.log(`${org}|0`);
  }
}
writeFileSync('raw/seed-packages.json', JSON.stringify(all, null, 1));
console.log(`\nTotal packages: ${all.length}. Saved raw/seed-packages.json`);
