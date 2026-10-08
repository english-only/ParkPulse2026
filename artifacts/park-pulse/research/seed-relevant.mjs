#!/usr/bin/env node
// Filter SEED packages for parks/playgrounds/toilets/sports relevance.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const ORGS = [
  'bayside-council','blacktown-city-council','blue-mountains-city-council','burwood-council',
  'camden-council','campbelltown-city-council','canterbury-bankstown-council','city-of-canada-bay-council',
  'city-of-parramatta-council','council-of-the-city-of-sydney','cumberland-council','fairfield-city-council',
  'georges-river-council','hawkesbury-city-council','hornsby-shire-council','inner-west-council',
  'ku-ring-gai-council','liverpool-city-council','mosman-municipal-council','northern-beaches-council',
  'north-sydney-council','penrith-city-council','randwick-city-council','ryde-city-council',
  'strathfield-municipal-council','sutherland-shire-council','woollahra-municipal-council'
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

const KW = /park|playground|toilet|reserv|open.?space|sport|recrea|picnic|bbq|barbecue|fountain|drinking|seating|bench|trail|cycle|bike|walk|court|skate|swim|pool|libra|community|amenit|accessib|disab|all.?gender|baby.?change|dog|leash|shelter|shoot|fitness|gym|tennis|basket|netball|soccer|football|cricket|rugby|aesthetic|beaut|bush|canoe|kayak|fishing|barbecue/i;

const relevant = [];
for (const org of ORGS) {
  let start = 0;
  while (true) {
    const r = get(`https://datasets.seed.nsw.gov.au/api/3/action/package_search?fq=organization%3A${org}&rows=100&start=${start}`);
    if (!r || !r.result) break;
    const res = r.result;
    for (const p of (res.results||[])) {
      const text = `${p.title} ${p.name} ${p.notes||''}`;
      if (KW.test(text)) {
        relevant.push({
          org, name:p.name, title:p.title,
          notes:(p.notes||'').replace(/\s+/g,' ').slice(0,300),
          metadata_modified:p.metadata_modified,
          resources:(p.resources||[]).map(x=>({ id:x.id, name:x.name, format:x.format, url:(x.url||'').slice(0,160), last_modified:x.last_modified }))
        });
      }
    }
    if (start + 100 >= (res.count||0)) break;
    start += 100;
    if (start > 500) break;
  }
}
console.log(`Relevant packages: ${relevant.length}`);
// Print compact summary
for (const p of relevant) {
  const fmts = [...new Set(p.resources.map(r=>r.format))].join(',');
  console.log(`${p.org} | ${p.title} | res:${p.resources.length} | ${fmts} | mod:${(p.metadata_modified||'').slice(0,10)}`);
}
writeFileSync('raw/seed-relevant.json', JSON.stringify(relevant, null, 1));
console.log('Saved raw/seed-relevant.json');
