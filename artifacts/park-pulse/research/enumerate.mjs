#!/usr/bin/env node
// Comprehensive ArcGIS Online discovery + enumeration for Greater Sydney councils.
// Method: search by council name -> item lookup -> orgId -> portal name -> enumerate owner's items.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const LGAS = [
  ['Sydney','City of Sydney','cityofsydney'],
  ['Blacktown','Blacktown','blacktown'],
  ['Cumberland','Cumberland Council','cumberland'],
  ['Parramatta','Parramatta','parramatta'],
  ['Canterbury-Bankstown','Canterbury Bankstown','canterbury'],
  ['Georges River','Georges River','georgesriver'],
  ['Bayside','Bayside Council','bayside'],
  ['Northern Beaches','Northern Beaches','northernbeaches'],
  ['Sutherland','Sutherland Shire','sutherland'],
  ['Hornsby','Hornsby Shire','hornsby'],
  ['Ryde','Ryde','ryde'],
  ['Penrith','Penrith','penrith'],
  ['Hawkesbury','Hawkesbury','hawkesbury'],
  ['Strathfield','Strathfield','strathfield'],
  ['Inner West','Inner West Council','innerwest'],
  ['Randwick','Randwick','randwick'],
  ['Woollahra','Woollahra','woollahra'],
  ['Waverley','Waverley Council','waverley'],
  ['Lane Cove','Lane Cove','lanecove'],
  ['Willoughby','Willoughby','willoughby'],
  ['Ku-ring-gai','Ku-ring-gai','kuringgai'],
  ['Mosman','Mosman','mosman'],
  ['Hunters Hill','Hunters Hill','huntershill'],
  ['Fairfield','Fairfield City','fairfield'],
  ['Liverpool','Liverpool City','liverpool'],
  ['Camden','Camden Council','camden'],
  ['Campbelltown','Campbelltown City','campbelltown'],
  ['Blue Mountains','Blue Mountains','bluemountains'],
  ['Canada Bay','Canada Bay','canadabay'],
  ['North Sydney','North Sydney','northsydney'],
];

function get(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const out = execFileSync('curl', ['-s','-m','30', url], {encoding:'utf8', maxBuffer: 2e8});
      const j = JSON.parse(out);
      if (j) return j;
    } catch (e) {}
  }
  return null;
}

function search(q, num=100, start=1) {
  return get(`https://www.arcgis.com/sharing/rest/search?q=${encodeURIComponent(q)}&f=json&num=${num}&start=${start}`);
}
function item(id) {
  return get(`https://www.arcgis.com/sharing/rest/content/items/${id}?f=json`);
}
function portal(id) {
  return get(`https://www.arcgis.com/sharing/rest/portals/${id}?f=json`);
}

const orgInfo = new Map(); // orgId -> {name, owners:Set, lgas:Set}
function noteOrg(orgId, owner, lga) {
  if (!orgId) return;
  if (!orgInfo.has(orgId)) orgInfo.set(orgId, { name:null, owners:new Set(), lgas:new Set() });
  const o = orgInfo.get(orgId);
  if (owner) o.owners.add(owner);
  if (lga) o.lgas.add(lga);
}

// Phase 1: discover orgs per LGA via name searches
console.log('=== PHASE 1: org discovery ===');
for (const [lga, name, hint] of LGAS) {
  const queries = [`${name} playground`, `${name} parks reserves`, `${name} public toilet`, `${name} sports field`, hint];
  const owners = new Map(); // owner -> count
  for (const q of queries) {
    const r = search(q, 50);
    if (!r || !r.results) continue;
    for (const it of r.results) {
      if (it.owner) owners.set(it.owner, (owners.get(it.owner)||0)+1);
    }
  }
  // For top owners, look up an item to get orgId
  const topOwners = [...owners.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8);
  const found = [];
  for (const [owner] of topOwners) {
    const r = search(`owner:${owner}`, 1);
    if (!r || !r.results || !r.results[0]) continue;
    const it = item(r.results[0].id);
    if (it && it.orgId) {
      noteOrg(it.orgId, owner, lga);
      found.push(`${owner}->${it.orgId}`);
    }
  }
  console.log(`${lga}|owners=${owners.size}|${found.join(' ; ')}`);
}

// Resolve org names
console.log('\n=== PHASE 2: org names ===');
for (const [orgId, o] of orgInfo) {
  const p = portal(orgId);
  o.name = p && p.name ? p.name : null;
  console.log(`${orgId}|${o.name}|owners=${[...o.owners].join(',')}|lgas=${[...o.lgas].join(',')}`);
}

writeFileSync('raw/org-info.json', JSON.stringify([...orgInfo.entries()].map(([id,o])=>({orgId:id, name:o.name, owners:[...o.owners], lgas:[...o.lgas]})), null, 1));
console.log('\nSaved raw/org-info.json');
