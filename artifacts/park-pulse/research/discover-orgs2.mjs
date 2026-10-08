#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const LGAS = [
  ['Sydney','City of Sydney'],
  ['Blacktown','Blacktown'],
  ['Cumberland','Cumberland Council'],
  ['Parramatta','Parramatta Council'],
  ['Canterbury-Bankstown','Canterbury Bankstown'],
  ['Georges River','Georges River'],
  ['Bayside','Bayside Council'],
  ['Northern Beaches','Northern Beaches Council'],
  ['Sutherland','Sutherland Shire'],
  ['Hornsby','Hornsby Shire'],
  ['Ryde','Ryde'],
  ['Penrith','Penrith City'],
  ['Hawkesbury','Hawkesbury'],
  ['Strathfield','Strathfield'],
  ['Inner West','Inner West Council'],
  ['Randwick','Randwick'],
  ['Woollahra','Woollahra'],
  ['Waverley','Waverley Council'],
  ['Lane Cove','Lane Cove'],
  ['Willoughby','Willoughby'],
  ['Ku-ring-gai','Ku-ring-gai'],
  ['Mosman','Mosman'],
  ['Hunters Hill','Hunters Hill'],
  ['Fairfield','Fairfield City Council NSW'],
  ['Liverpool','Liverpool City Council NSW'],
  ['Camden','Camden Council'],
  ['Campbelltown','Campbelltown City Council'],
  ['Blue Mountains','Blue Mountains'],
  ['Canada Bay','Canada Bay'],
  ['North Sydney','North Sydney'],
];

function get(url) {
  try {
    const out = execFileSync('curl', ['-s','-m','25', url], {encoding:'utf8', maxBuffer: 1e8});
    return JSON.parse(out);
  } catch (e) { return null; }
}

const orgMap = new Map();
for (const [lga, name] of LGAS) {
  // multiple query strategies
  const queries = [
    `${encodeURIComponent(name)} playground`,
    `${encodeURIComponent(name)} parks`,
    `orgName:${encodeURIComponent(name)}`,
  ];
  const orgs = new Map();
  for (const q of queries) {
    const r = get(`https://www.arcgis.com/sharing/rest/search?q=${q}&f=json&num=50`);
    if (!r || !r.results) continue;
    for (const it of r.results) {
      if (it.orgId && it.orgName) orgs.set(it.orgId, it.orgName);
    }
  }
  const arr = [...orgs.entries()];
  console.log(`${lga}|${arr.length}|` + arr.map(([id,n])=>`${id}~${n}`).join(' ; '));
  for (const [id,n] of arr) {
    if (!orgMap.has(id)) orgMap.set(id, { name: n, lgas: new Set() });
    orgMap.get(id).lgas.add(lga);
  }
}
console.log('\n=== ORG SUMMARY (name non-empty) ===');
for (const [id,o] of [...orgMap.entries()].sort((a,b)=>a[1].name.localeCompare(b[1].name))) {
  if (o.name) console.log(`${id}|${o.name}|${[...o.lgas].join(',')}`);
}
