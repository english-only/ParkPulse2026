#!/usr/bin/env node
// For relevant council feature services, query the FeatureServer for layers + record counts.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const services = JSON.parse(execFileSync('cat',['raw/council-feature-services.json'],{encoding:'utf8'}));

// relevant keyword filter
const RE = /park|playground|toilet|sport|reserve|open.?space|recreation|picnic|bbq|barbecue|bench|seat|fountain|drinking|court|skate|bike|bicycle|library|pool|swim|fitness|accessib|amenit|dog|leash|trail|walk|track|pavilion|shelter|active|crown|crR|care and control|mowing/i;
const relevant = services.filter(s => RE.test(s.title));

function get(url) {
  for (let a=0;a<2;a++){
    try {
      const out = execFileSync('curl',['-s','-m','30',url],{encoding:'utf8',maxBuffer:2e8});
      return JSON.parse(out);
    } catch(e){}
  }
  return null;
}

const results = [];
for (const s of relevant) {
  // item lookup to get url
  const it = get(`https://www.arcgis.com/sharing/rest/content/items/${s.id}?f=json`);
  const url = it && it.url ? it.url : s.url;
  if (!url || !/FeatureServer/i.test(url)) {
    results.push({ org:s.org, title:s.title, id:s.id, url:url||'', note:'no-featureserver-url' });
    continue;
  }
  const fs = get(`${url}?f=json`);
  const layers = (fs && fs.layers) ? fs.layers : [];
  const layerInfo = [];
  let totalFeatures = 0;
  for (const L of layers.slice(0, 12)) {
    const cnt = get(`${url}/${L.id}/query?where=1%3D1&returnCountOnly=true&f=json`);
    const c = cnt && typeof cnt.count === 'number' ? cnt.count : null;
    if (c) totalFeatures += c;
    layerInfo.push({ id:L.id, name:L.name, geometryType:L.geometryType, count:c });
  }
  results.push({ org:s.org, title:s.title, id:s.id, url, layers:layerInfo, totalFeatures, layerCount:layers.length });
  console.log(`${s.org}|${s.title}|layers=${layers.length}|features=${totalFeatures}`);
}
writeFileSync('raw/service-counts.json', JSON.stringify(results, null, 1));
console.log(`\nDone. ${results.length} services. Saved raw/service-counts.json`);
