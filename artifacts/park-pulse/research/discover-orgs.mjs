#!/usr/bin/env node
// Systematic ArcGIS Online org discovery for Greater Sydney LGAs
// For each council, search ArcGIS Online by name variants, collect orgIds, then enumerate feature services.
import { execFileSync } from 'node:child_process';

const LGAS = [
  ['Sydney','City of Sydney'],
  ['Blacktown','Blacktown City Council'],
  ['Cumberland','Cumberland Council NSW'],
  ['Parramatta','City of Parramatta Council'],
  ['Canterbury-Bankstown','Canterbury Bankstown Council'],
  ['Georges River','Georges River Council'],
  ['Bayside','Bayside Council NSW'],
  ['Northern Beaches','Northern Beaches Council'],
  ['Sutherland','Sutherland Shire Council'],
  ['Hornsby','Hornsby Shire Council'],
  ['Ryde','City of Ryde'],
  ['Penrith','City of Penrith'],
  ['Hawkesbury','Hawkesbury City Council'],
  ['Strathfield','Strathfield Council'],
  ['Inner West','Inner West Council'],
  ['Randwick','Randwick City Council'],
  ['Woollahra','Woollahra Municipal Council'],
  ['Waverley','Waverley Council'],
  ['Lane Cove','Lane Cove Council'],
  ['Willoughby','City of Willoughby'],
  ['Ku-ring-gai','Ku-ring-gai Council'],
  ['Mosman','Mosman Council'],
  ['Hunters Hill','Hunters Hill Council'],
  ['Fairfield','Fairfield City Council'],
  ['Liverpool','City of Liverpool NSW'],
  ['Camden','Camden Council NSW'],
  ['Campbelltown','Campbelltown City Council NSW'],
  ['Blue Mountains','Blue Mountains City Council'],
  ['Canada Bay','City of Canada Bay'],
  ['North Sydney','North Sydney Council'],
];

function get(url) {
  try {
    const out = execFileSync('curl', ['-s','-m','25', url], {encoding:'utf8', maxBuffer: 1e8});
    return JSON.parse(out);
  } catch (e) { return null; }
}

const orgMap = new Map(); // orgId -> {name, lgas:Set}
for (const [lga, name] of LGAS) {
  const q = encodeURIComponent(`"${name}"`);
  const r = get(`https://www.arcgis.com/sharing/rest/search?q=${q}&f=json&num=40`);
  if (!r || !r.results) { console.log(`${lga}|NO-RESPONSE`); continue; }
  const orgs = new Map();
  for (const it of r.results) {
    if (it.orgId) orgs.set(it.orgId, { name: it.orgName || '', title: it.title });
  }
  const orgsArr = [...orgs.entries()];
  console.log(`${lga}|${orgsArr.length}|` + orgsArr.map(([id,o])=>`${id}~${o.name}`).join(' ; '));
  for (const [id,o] of orgsArr) {
    if (!orgMap.has(id)) orgMap.set(id, { name: o.name, lgas: new Set() });
    orgMap.get(id).lgas.add(lga);
  }
}
console.log('\n=== ORG SUMMARY ===');
for (const [id,o] of [...orgMap.entries()].sort((a,b)=>a[1].name.localeCompare(b[1].name))) {
  console.log(`${id}|${o.name}|${[...o.lgas].join(',')}`);
}
