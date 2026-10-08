#!/usr/bin/env node
// Get field schemas for the most important facility layers.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// [org, serviceTitle, serviceUrl, layerId]
const TARGETS = [
  ['City of Sydney','Parks','https://services1.arcgis.com/cNVyNtjGVZybOQWZ/arcgis/rest/services/Parks/FeatureServer',0],
  ['City of Sydney','Playgrounds','https://services1.arcgis.com/cNVyNtjGVZybOQWZ/arcgis/rest/services/Playgrounds/FeatureServer',0],
  ['City of Sydney','Sports and recreation facilities','https://services1.arcgis.com/cNVyNtjGVZybOQWZ/arcgis/rest/services/Sports%20and%20recreation%20facilities/FeatureServer',0],
  ['City of Sydney','National public toilets','https://services1.arcgis.com/cNVyNtjGVZybOQWZ/arcgis/rest/services/National%20public%20toilets/FeatureServer',0],
  ['City of Sydney','Seats','https://services1.arcgis.com/cNVyNtjGVZybOQWZ/arcgis/rest/services/Seats/FeatureServer',0],
  ['City of Parramatta','PARKS_ASSETS_WEB_PUBLISH_Rec','https://services1.arcgis.com/NrOjMi9LSYL3MUze/arcgis/rest/services/PARKS_ASSETS_WEB_PUBLISH_Rec/FeatureServer',null],
  ['City of Parramatta','Playground Equipment','https://services1.arcgis.com/NrOjMi9LSYL3MUze/arcgis/rest/services/Playground%20Equipment/FeatureServer',0],
  ['City of Parramatta','Public Toilets','https://services1.arcgis.com/NrOjMi9LSYL3MUze/arcgis/rest/services/Public%20Toilets/FeatureServer',0],
  ['City of Parramatta','Sporting Fields','https://services1.arcgis.com/NrOjMi9LSYL3MUze/arcgis/rest/services/Sporting%20Fields/FeatureServer',0],
  ['Northern Beaches','Toilets','https://services1.arcgis.com/LRvZf9YQitIniyDH/arcgis/rest/services/Toilets/FeatureServer',null],
  ['Woollahra','WMC Open Space and Reserves','https://services1.arcgis.com/zjbesynggtrdwb3p/arcgis/rest/services/WMC%20Open%20Space%20and%20Reserves/FeatureServer',0],
  ['Hornsby','Crown Reserves','https://services1.arcgis.com/VKqP0BP08pVXloHq/arcgis/rest/services/Crown%20Reserves_20231024/FeatureServer',0],
  ['Inner West','Active Inner West','https://services1.arcgis.com/dp2UIID5MUpTUFVA/arcgis/rest/services/Active%20Inner%20West/FeatureServer',null],
];

function get(url) {
  for (let a=0;a<2;a++){
    try {
      const out = execFileSync('curl',['-s','-m','30',url],{encoding:'utf8',maxBuffer:2e8});
      return JSON.parse(out);
    } catch(e){}
  }
  return null;
}

const out = [];
for (const [org, title, url, layerId] of TARGETS) {
  const svc = get(`${url}?f=json`);
  const layers = svc && svc.layers ? svc.layers : [];
  const layerIds = layerId === null ? layers.map(l=>l.id) : [layerId];
  for (const lid of layerIds) {
    const lyr = get(`${url}/${lid}?f=json`);
    if (!lyr) { out.push({org,title,layer:lid,note:'no-layer'}); continue; }
    const fields = (lyr.fields||[]).map(f=>f.name);
    out.push({ org, title, layer:lid, name:lyr.name, geometryType:lyr.geometryType, fieldCount:fields.length, fields });
    console.log(`${org}|${title}|L${lid}|${lyr.name}|fields=${fields.length}|${fields.slice(0,40).join(',')}`);
  }
}
writeFileSync('raw/schemas.json', JSON.stringify(out, null, 1));
console.log('\nSaved raw/schemas.json');
