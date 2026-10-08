# Park Pulse — The Generational Report

**What v2 bought, what v3 must fix, and why the third version is a different product**

Prepared 2026-10-10 · Companion to [AUDIT-2026-10.md](AUDIT-2026-10.md) and [PRD-v3-facilities-atlas.md](PRD-v3-facilities-atlas.md)

---

## 1. The honest summary

Park Pulse loads 2,023 locations, renders 418 map markers, and does it in 174 milliseconds with zero long tasks and a 15 MB heap. The engineering is genuinely good. The 13-phase v2 programme shipped all of it: zero `any` casts, zero suppression comments, 75 unit tests, 17 Playwright specs, a 157 kB gzip bundle.

Here is the uncomfortable part.

**A person cannot use Park Pulse if they use a keyboard.**

All twelve filter checkboxes in the sidebar sit behind `display: none` — [index.css:515](artifacts/park-pulse/src/index.css#L515). That removes them from the tab order entirely, not just visually. I verified it in the browser: calling `.focus()` on a filter input leaves focus sitting on the Filters button. Clicking the wrapping label *does* toggle the box, so the app works perfectly for a mouse user and is completely unusable for a keyboard user. This is WCAG 2.1 SC 2.1.1, and it gates the app's primary feature.

That single line is worth more than every performance metric in this report combined, and it is a one-line fix.

---

## 2. What the audit actually found

I ran the audit against the live dev server rather than the source, because a stylesheet can lie about what a browser does. Three things mattered.

**Contrast is failing in the dark theme — 109 times.** The size-classification chips (`.pp-size-tiny`, `-small`, `-med`, `-large`) hardcode light backgrounds and have *zero* `[data-theme]` overrides. So the Night Mode theme renders light-mode chips inside a dark interface. I recomputed all six failing ratios independently from the hex values and every one reproduced exactly:

| Pair | Ratio | Needs |
|---|---|---|
| `#888` on `#f0f0f0` | 3.11 | 4.5 |
| `#2980b9` on `#e8f4fd` | 3.85 | 4.5 |
| `#e67e22` on `#fdf4e7` | 2.61 | 4.5 |
| `#27ae60` on `#eafbf1` | 2.68 | 4.5 |
| `#fff` on `#3fb950` | 2.54 | 4.5 |

The reason this survived to today is more interesting than the bug: `contrast.spec.ts` exists and passes. It simply doesn't sample these selectors. A green test suite was telling you the contrast was fine while 109 failures sat on screen. **The coverage gap is the real defect** — it will keep hiding the next 109 too unless the test learns to fail.

**The data is mislabelled.** `public/data/meta.json` declares `"blacktown": "Blacktown City Council"`. All 1,605 features carry OpenStreetMap `@id` values (`way/4904026`) and OSM-shaped properties. The bounding box spans Cumberland and Parramatta too. So we are shipping OSM data under a council's name, without ODbL attribution, mislabelled as one LGA.

**The data is also worse than the public original.** The live City of Sydney toilets layer carries `Accessible`, `BabyChange`, `AdultChange`, `AllGender`, `DumpPoint`, `OpeningHours`, `KeyRequired`. Our local `toilets-sydney.json` flattened all of that into `n/lat/lng/t/h/a/b`. We shipped a lossy fork of a dataset that is strictly better than what we made.

---

## 3. The product diagnosis

Running the `product-lens` questions honestly:

**Who is this for?** Today, the app answers "where are the parks." That question is largely served by Google Maps. Nobody wakes up wanting a park polygon.

**What is the real pain?** Priya has a two-year-old and forty minutes on a Saturday afternoon. Her actual question is: *where can I find a playground and an accessible toilet with a baby-change facility, within reach of a station?* Park Pulse cannot answer that. Not because the UI is wrong, but because the data it needs exists publicly and we haven't loaded it.

**Why now?** Because the City of Sydney publishes **165 Feature Services** on ArcGIS. I verified the counts live, not from documentation. There are 162 playgrounds, 70 sports facilities, 890 seats, 1,761 bicycle-parking points, 82 bridges, 523 stairs, 11 libraries — roughly **3,570 additional features**, more than doubling what the app knows. The sports layer carries 22 sport columns (AFL, cricket, netball, tennis, pickleball, skate park…). Nobody in Australia is publishing "which parks have a pickleball court" from a search box.

**What's the 10-star version?** Not more pins on a map. A genuine activity index for Greater Sydney: *choose what you want to do, see everywhere that offers it, filtered by the things that actually decide whether you can go* — step-free access, open now, toilets, distance from transit.

### The ICE ranking

`product-lens` Mode 4, scored on impact × confidence ÷ effort:

| Feature | I | C | E | Score |
|---|---|---|---|---|
| Keyboard-accessible filters (A1) | 5 | 5 | 1 | **25.0** |
| Theme-aware badge colours (A2) | 4 | 5 | 1 | **20.0** |
| Lossless toilets schema | 5 | 5 | 2 | **12.5** |
| Sport-column lookup | 4 | 4 | 2 | **8.0** |
| Faceted filters (playground ∧ accessible-toilets) | 5 | 4 | 4 | **5.0** |
| Facility-first data model | 5 | 3 | 5 | **3.0** |

Read that table top to bottom and it *is* the roadmap. The two cheapest items are also the two most valuable. Accessibility is not a tax on the schedule here — at effort 1 it outranks everything.

---

## 4. Where the defensible ground is

The `competitive-report-structure` question is not "what features do we have" but "what is hard to copy."

Google Maps has every park polygon in Australia and cannot answer accessibility questions about them. AllTrails is good at trails and bad at "is there a toilet here." Council websites are authoritative, siloed per LGA, and hostile to comparison across suburb boundaries.

Our defensible position: **a cross-boundary, accessibility-aware activity index with visible provenance.** Three properties make it hard to copy:

1. **The accessibility join.** Mapping `BabyChange`, `AllGender`, `Accessible` and `OpeningHours` onto facilities and then onto parks is mechanical once the pipeline exists — and nobody else is publishing it.
2. **The 22 sport columns.** A park that supports AFLW, cricket and netball is a materially different answer to a parent's question than "it's a neighbourhood park, 2,300 m²."
3. **Provenance as a feature, not an apology.** Every layer showing its source, licence and retrieval date is a trust moat in a category where trust is the main complaint.

That third one is why fixing the Blacktown mislabelling matters strategically and not just legally. A coverage page that says *"we have verified data for these three LGAs, OSM-derived data for these, and nothing for the rest"* is more credible than a map that silently implies completeness it doesn't have.

---

## 5. The constraint nobody planned around

**There is no single authoritative source of Sydney's public facilities.**

| LGA | Status | Verified (2026-10-06 sweep) |
|---|---|---|
| City of Sydney | Rich, official — **two channels** | 165 ArcGIS Feature Services **+ 196 CKAN packages** (parks, playgrounds, sports, pools, dog-off-leash, stairs, seats, fountains, libraries, bridges, community gardens, venues for hire, bicycle parking, trees) |
| Parramatta | Rich, official | ArcGIS org `NrOjMi9LSYL3MUze`: playground equipment 144 · fountains 132 · sporting fields 90 · public toilets 62 · BBQs 42 · trees 66,351 |
| Northern Beaches | Official — **corrected from "nothing usable"** | ArcGIS org `LRvZf9YQitIniyDH`: MTB trails 2,855 · coast walks 501+250 · toilets 179; plus 54 CKAN packages (all flood studies) |
| Hornsby | Official — **corrected from "nothing usable"** | ArcGIS org `VKqP0BP08pVXloHq`: crown reserves 1,418 · walking tracks 232 · library points 129; 5 CKAN packages (vegetation mapping) |
| Woollahra, Inner West, Randwick, Bayside | Official | Woollahra parks map 294 (8 layers) · Inner West 359 · Randwick 16 services incl. leash-free geodatabase · Bayside parks 219, picnic tables 26 |
| Blacktown, Cumberland, Canterbury-Bankstown, Georges River, Sutherland | CKAN orgs exist — **but flood studies only** | 22 / 10 / 27 / 33 / 28 packages respectively, ~all floodplain-risk deliverables; no facility datasets found; Blacktown's shipped layer is OSM-derived (see §2) |
| Newcastle | Official (out of area, good template) | parks + playgrounds |

City of Sydney covers roughly 12% of Greater Sydney by population. "All of Sydney's public facilities" is not currently achievable from official sources, and pretending otherwise would put invented data on a map. The only cross-LGA official facility datasets in NSW are the **National Public Toilet Map** (Dept. of Health, Disability and Ageing, CC-BY, 25,624 facilities — which is where our toilets file actually comes from, mislabelled as "City of Sydney Open Data" in `meta.json`) and the **NPWS asset geodatabase**.

**Caveat resolved:** I had warned that my original "nothing usable" result came from guessed ArcGIS org names, and that a systematic sweep of each council's own open-data portal would likely find considerably more. That sweep is now done (evidence in [AUDIT-2026-10-DEEP-RESEARCH.md](AUDIT-2026-10-DEEP-RESEARCH.md) §D–§F, captures in `research/raw2/`): it found considerably more *packages* — but they are flood studies, not facilities. The prediction was right in quantity, wrong in kind. The corrected table above is the verified state of play; build the ingest pipeline against it, not against the original table.

---

## 6. What I'd change about how this gets built

Two structural observations from reading the code:

**`Explore.tsx` is 2,341 lines** with 28 `useEffect`s and 35 `useState`s — map init, marker reconciliation, six data loaders, filtering, sorting, geocoding, theming, and results rendering in one file. Every new facility dataset makes it worse. The next generation should split it by responsibility (map lifecycle / data loading / filter state / presentation) *before* the pipeline lands, not after.

**The bundle is a single 524 kB eager chunk.** No `React.lazy`, no `manualChunks`. A visitor landing on `/` downloads Leaflet and the entire Explore page without ever seeing a map. The 44 unused shadcn components are fully tree-shaken, so they cost nothing at runtime — but recharts, cmdk, vaul, embla, react-day-picker and framer-motion are still declared devDependencies, which is pure maintenance debt.

The good news in the runtime is real and worth stating plainly: `useCulledMarkerLayer` works. Zero long tasks across map zoom with thousands of points, bounded marker DOM, nearest-index lookups deferred to popup-open. Whoever built that pattern solved the hard performance problem, and adding ~3,570 features to it is a known quantity rather than a gamble.

---

## 7. The recommendation

**Ship Phase A this week.** Nine fixes, all small, all with acceptance criteria in the PRD. It fixes a keyboard trap, 109 contrast failures, a licence mislabelling, a theme-persistence bug that silently discards the user's choice, and a broken CSS selector. M1 is independently shippable and valuable on its own.

**Then build the pipeline, not the blobs.** A declarative `sources.config.json` listing item IDs, licences and jurisdictions, plus an ingest script. Adding a council becomes a config entry. Today `trees.geojson` is a committed 16.4 MB file — that model cannot absorb multi-LGA data with per-layer licensing.

**Then the capability that makes it a different product.** Faceted filtering — `playground ∧ accessible-toilets ∧ has-baby-change` — is the step-change. It is worth roughly three times more than any amount of additional map polish, and it only becomes possible after the lossless toilets schema exists.

**Decide the multi-LGA question before starting Phase B.** It changes what the app is, and it is genuinely yours to call. My recommendation is honest scoped coverage with visible gaps over an OSM gap-fill — authority beats completeness when the product promise is "find somewhere to actually do this."

---

## 8. What I did not verify

Stated plainly, because a report that hides its edges is worse than useless:

- **No pixel-level visual review.** Screenshot capture never composited in the browser webview. Every visual finding comes from computed styles, the accessibility tree, and the stylesheet. Colour, spacing and semantics findings are sound; fine visual polish issues could be missed.
- **2026 platform-advancement survey — now done (corrected).** The original claim that web search was unavailable in this environment was wrong; `web_search` works, and the survey was completed on 2026-10-06 (see [AUDIT-2026-10-DEEP-RESEARCH.md](AUDIT-2026-10-DEEP-RESEARCH.md) §I). Highlights: CSS Anchor Positioning and the Navigation API hit Baseline with Firefox 147 (Jan 2026, all major browsers); Chrome 144 added the `<geolocation>` element, the Temporal API, `::search-text` and `caret-shape`; WCAG 2.2 is a W3C Proposed Recommendation, so the 24×24 px touch-target findings are compliance issues against a current standard. Nothing in the wave changes the severity ranking — the keyboard trap still outranks everything.
- **One discarded measurement.** Scroll sampled at ~2 fps. That's headless throttling, not a defect. I threw it out and used `PerformanceObserver` long-task timing instead. Reporting it would have been a false positive.
- **One number I got wrong and corrected.** I first wrote "30+ unused shadcn components" from a truncated listing. The real count is 44. Fixed throughout before delivery — but worth naming, because an unverified estimate should never survive into a document someone acts on.

---

**The one-line version:** the app is fast, clean and well-tested, and it is unusable by keyboard users, wrong about where its data came from, and sitting on 3,570 public facilities it hasn't loaded. Fix the first thing this week.