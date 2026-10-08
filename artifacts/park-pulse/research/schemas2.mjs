#!/usr/bin/env node
// Get field schemas using the RESOLVED urls from service-counts.json (item lookups).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const counts = JSON.parse(execFileSync('cat',['raw/service-counts.json'],{encoding:'utf8'}));

// Key facilities we care about (by title regex)
const KEY = /^(Parks|Playgrounds|Sports and recreation facilities|National public toilets|Seats|PARKS_ASSETS_WEB_PUBLISH_Rec|Playground Equipment|Public Toilets|Sporting Fields|Toilets|WMC Open Space and Reserves|Crown Reserves|Active Inner West|Parks for GeoHub|Drinking Fountains|BBQs|Fitness Equipment|Skate and BMX|Hard Court Sport Surfaces|Tennis Courts|Picnic Areas|Water Playground Equipment|WMC Open Space|Parks Online Map|CRR Assets_PUBLIC|HSC Care and Control)$/i;

function get(url) {
  for (let a=0;a<3;a++){
    try {
      const out = execFileSync('curl',['-s','-m','30',url],{encoding:'utf8',maxBuffer:2e8});
      return JSON.parse(out);
    } catch(e){}
  }
  return null;
}

const out = [];
for (const s of counts) {
  if (!KEY.test(s.title)) continue;
  if (!s.url || !/FeatureServer/.test(s.url||'')) continue;
  const svc = get(`${s.url}?f=json`);
  const layers = svc && svc.layers ? svc.layers : [];
  for (const L of layers.slice(0,3)) {
    const lyr = get(`${s.url}/${L.id}?f=json`);
    if (!lyr) continue;
    const fields = (lyr.fields||[]).map(f=>f.name);
    const rec = { org:s.org, title:s.title, layer:L.id, name:lyr.name, geometryType:lyr.geometryType, fieldCount:fields.length, fields, url:s.url };
    out.push(rec);
    console.log(`${s.org}|${s.title}|L${L.id}|${lyr.name}|geom=${lyr.geometryType}|fields=${fields.length}`);
    console.log(`    ${fields.join(', ')}`);
  }
}
writeFileSync('raw/schemas2.json', JSON.stringify(out, null, 1));
console.log(`\nSaved ${out.length} layer schemas to raw/schemas2.json`);
