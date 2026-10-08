#!/usr/bin/env node
// Enumerate Feature Services for confirmed NSW council ArcGIS Online orgs.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const ORGS = [
  ['City of Sydney','cNVyNtjGVZybOQWZ'],
  ['City of Parramatta','NrOjMi9LSYL3MUze'],
  ['Northern Beaches','LRvZf9YQitIniyDH'],
  ['Hornsby','VKqP0BP08pVXloHq'],
  ['Inner West','dp2UIID5MUpTUFVA'],
  ['Woollahra','zjbesynggtrdwb3p'],
  ['Liverpool','Ys4U0NCXGgyTtRWx'],
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
for (const [name, orgId] of ORGS) {
  let start = 1;
  let count = 0;
  const services = [];
  while (true) {
    const r = get(`https://www.arcgis.com/sharing/rest/search?q=orgid%3A${orgId}%20type%3A%22Feature%20Service%22&f=json&num=100&start=${start}`);
    if (!r || !r.results) break;
    for (const it of r.results) {
      services.push({ org:name, orgId, id:it.id, title:it.title, owner:it.owner, type:it.type, modified:it.modified, url:it.url||'' });
      count++;
    }
    if (start + 100 > (r.total||0)) break;
    start += 100;
    if (start > 1000) break;
  }
  console.log(`${name}|${orgId}|featureServices=${count}`);
  all.push(...services);
}
writeFileSync('raw/council-feature-services.json', JSON.stringify(all, null, 1));
console.log(`\nTotal feature services across 7 orgs: ${all.length}`);
console.log('Saved raw/council-feature-services.json');
