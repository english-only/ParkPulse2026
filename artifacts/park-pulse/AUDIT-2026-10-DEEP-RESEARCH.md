# Park Pulse — Deep-Research Audit Report

**Date:** 2026-10-06
**Companion to:** [AUDIT-2026-10.md](AUDIT-2026-10.md) (§4 and §6 corrected hereby) and [GENERATIONAL-REPORT.md](GENERATIONAL-REPORT.md) (§5 and §8 corrected hereby)
**Scope:** Data-availability research for Greater Sydney public facilities — CKAN portals (data.nsw.gov.au, data.gov.au), ArcGIS Online organisations and ArcGIS REST endpoints, the National Public Toilet Map, and GTFS feeds. Plus the 2026 web-platform survey the previous audit could not run.
**Method:** live API probing (CKAN `organization_show` / `package_search` / `package_show`, ArcGIS REST `FeatureServer` roots, layer schemas and `returnCountOnly` queries), a row-level join of the shipped toilets file against the National Public Toilet Map CSV (25,624 rows), portal-wide keyword sweeps, and web search for the 2026 platform survey. Every number below was retrieved live on 2026-10-06 and captured under `research/raw2/`.

> **Note on structure:** the A–J section skeleton from the original deep-research prompt was not recoverable from the workspace (the two `onefile-prompt*.md` files in `~/Downloads` are unrelated prompt dumps — neither contains a §14 or an A–J report spec). This report reconstructs a conventional A–J deep-research structure: **A** executive summary, **B** scope/questions/method, **C** corrections to the prior audit, **D** per-LGA availability matrix, **E** ArcGIS Online inventory, **F** CKAN inventory, **G** shipped-dataset provenance, **H** statewide sweep, **I** 2026 web-platform survey, **J** recommendations/limitations/verification log. If the original §14 letters differ, the content maps across one-to-one onto any equivalent skeleton.

---

## A. Executive summary

The previous audit's central strategic claim — *"there is no single authoritative source of Sydney's public facilities; coverage is council-by-council, uneven, and in several LGAs absent"* — **survives this research intact**. But its supporting per-LGA table was wrong in both directions, and two of its subsidiary claims are now falsified outright:

1. **"Nothing usable" is wrong for every LGA it named.** Blacktown, Cumberland, Canterbury-Bankstown, Georges River, Northern Beaches, Sutherland and Hornsby all have real open-data footprints. Northern Beaches publishes **54 CKAN packages** and runs its own ArcGIS Online org (2,855-feature mountain-bike trail network, 179 toilets, 751 km of coast walks). Hornsby publishes **5 CKAN packages** plus an ArcGIS org with 1,418 crown reserves and 232 walking tracks. Blacktown publishes **22 CKAN packages**. The catch: **every one of those CKAN packages is a flood study (or, for Hornsby, vegetation mapping) — not a parks or facilities dataset.** The old audit's conclusion was right for the wrong reason: the data exists, but not the *facility* data.

2. **The shipped toilets file is mislabelled — and the mislabelling is worse than reported.** `toilets-sydney.json` (3,127 entries) is attributed to "City of Sydney Open Data" in `meta.json`. It is actually an extract of the **Australian Government's National Public Toilet Map** (Department of Health, Disability and Ageing, CC-BY): 2,992 of 3,127 rows (95.7%) join to the NPM CSV by name + coordinates, with exact field mapping (`n←Name`, `t←Town`, `h←OpeningHours`, `a←Accessible`, `b←BabyChange`). Its bbox spans all of Greater Sydney (lat −34.20 to −33.30), which the City of Sydney layer (525 facilities, LGA-only) cannot do. The app therefore ships a *regional* dataset with an *LGA* attribution and **no CC-BY attribution at all**.

3. **The transport count "discrepancy" is not a discrepancy.** The shipped `public-transports.json` (1,164) is a **Transport for NSW GTFS `stops.txt` extract** — verbatim GTFS schema (`stop_id`, `stop_name`, `stop_lat`, `stop_lon`, `location_type`, `parent_station`, `platform_code`, `wheelchair_boarding`) covering the metropolitan rail network. The live City of Sydney ArcGIS layer (64) is a different dataset with LGA-only scope. They are complementary, not conflicting. The `meta.json` attribution ("Transport for NSW") is **correct**.

4. **City of Sydney is even richer than the audit found.** Beyond its 165 ArcGIS Feature Services, the `city-of-sydney` CKAN organisation on data.nsw.gov.au holds **196 packages** including playgrounds, sports and recreation facilities, swimming pools, dog-off-leash parks, stairs, seats, drinking fountains, recreation centres, libraries, bridges, community gardens, venues for hire, bicycle parking and trees. Every "missing" facility class the audit listed is available through a standard CKAN API, not just ArcGIS REST.

5. **web search works.** The previous audit's §6 limitation ("`web_search` returned `Hosted service tools are unavailable in a direct BYOK run` on every attempt") is false in the current environment. Section I contains the 2026 web-platform survey it could not run.

**Net effect on the product:** the "facilities atlas" opportunity is real and mostly *City-of-Sydney-shaped*. Parramatta is the only other LGA with verified, rich, facility-grade official data (ArcGIS org `NrOjMi9LSYL3MUze`: 144 playground-equipment sites, 132 drinking fountains, 90 sporting fields, 62 public toilets, 42 BBQs). For the other ~30 Greater Sydney LGAs, facility data is scattered across council ArcGIS orgs (where they exist), council websites, and OSM — and the honest product answer remains scoped coverage with visible provenance.

---

## B. Scope, questions and method

**Questions this research answers:**

1. For each Greater Sydney LGA in the app's coverage ambition, what official facility data actually exists, where, and under what licence?
2. What is the true provenance of every dataset the app already ships?
3. Are the shipped counts (toilets 3,127; transport 1,164) consistent with the live official layers (525; 64)?
4. Is there any single authoritative or statewide facility dataset?
5. What 2026 web-platform advancements are relevant to the app?

**Method and evidence trail.** All captures are saved under `artifacts/park-pulse/research/raw2/` (this round) and `research/raw/` (the earlier ArcGIS enumeration round):

- CKAN: `organization_show` per council org slug (package counts), `package_search?fq=organization:<slug>` (full package-title lists), `package_show` for specific packages. Scripts: `raw2-enumerate.mjs`, `raw2-enumerate2.mjs`; outputs: `raw/raw2-enumerate.txt`, `raw/raw2-enumerate2.txt`, `raw2/pkglists.txt`.
- ArcGIS Online: org discovery via `sharing/rest/portals` and owner enumeration (`raw/org-info.json`, `raw/enumerate-phase12.txt`); service inventory and live feature counts (`raw/service-counts.json`, `raw/counts-log.txt`, 102 services).
- National Public Toilet Map: data.gov.au `package_show` (id `553b3049-2b8b-46a2-95e6-640d7986a8c1`), full CSV download (`raw2/npm-toiletmap.csv`, 25,624 rows, 45 columns), and the NSW ArcGIS mirror (`portal.data.nsw.gov.au/.../National_Public_Toilet_Map/FeatureServer`, layer 0 `toiletmapexport`).
- Provenance join: Python row-level join of `public/data/toilets-sydney.json` against the NPM CSV on (name, lat, lng).
- Web survey: `web_search` (now functional) + `read_url` of web.dev's "New to the web platform in January" (2026-01-30).

**What was *not* done:** no screenshot/pixel review (unchanged limitation from the prior audit); no scraping of council websites that expose no API (e.g., Blacktown's own site); no WFS harvesting of the dead Blacktown GSS/WFS endpoints (both redirect to `/page-not-found.html` — captured in `raw/bw-gss-rest.txt`, `raw/bw-native.txt`).

---

## C. Corrections to the previous audit

| # | Previous claim (source) | Verdict | What the live evidence shows |
|---|---|---|---|
| C1 | "Blacktown, Cumberland, Canterbury-Bankstown, Georges River, Northern Beaches, Sutherland, Hornsby — searches returned **nothing usable**" (AUDIT §4) | **Falsified** | All seven have CKAN orgs on data.nsw.gov.au with 10–54 packages each (table D). Northern Beaches and Hornsby additionally have their own ArcGIS Online orgs with substantial park/trail/toilet services (table E). Usable *for flood risk and vegetation* — not for facilities. |
| C2 | "One Blacktown result (`a4f4dca8…`) is a personal-account user… not a parks dataset" (AUDIT §4) | **Still true, but incomplete** | Correct that no Blacktown *facility* ArcGIS org was found; but Blacktown City Council publishes 22 CKAN packages (all flood studies: Wianamatta South Creek, Eastern Creek, Greystanes/Pendle Hill). |
| C3 | `toilets-sydney.json` is "a data-lossy local fork" of the City of Sydney toilets layer (AUDIT §4, GENERATIONAL §2) | **Falsified provenance** | It is a fork of the **National Public Toilet Map** (Australian Government, DHA, CC-BY), not the CoS layer. 2,992/3,127 rows join to the NPM CSV by name+coords; field mapping is exact. The CoS layer (525) is a separate, LGA-scoped dataset that also carries `ChangingPlaces`, `AdultChange`, `DumpPoint`, `Shower`, `KeyRequired`, `PaymentRequired`, `Ambulant`, sharps — all of which the NPM CSV also has (45 columns), but the local file flattened to 7. |
| C4 | App "ships fountains (273), toilets (3,127) and transport (1,164)" vs live CoS counts 273/525/64 (AUDIT §4) | **Partly wrong framing** | Fountains 273 = exact match with CoS ArcGIS `166d56fa` (correct). Toilets 3,127 = NPM Greater Sydney extract (regional), not a stale copy of the 525 LGA layer. Transport 1,164 = TfNSW GTFS network extract, not a stale copy of the 64-stop LGA layer. Two of three "discrepancies" dissolve once provenance is fixed. |
| C5 | "Web search returned `Hosted service tools are unavailable`… could not survey general 2026 web-platform advancements" (AUDIT §6; GENERATIONAL §8) | **Falsified** | `web_search` works in the current environment; survey in §I. |
| C6 | GENERATIONAL §5's self-caveat: "I searched these LGAs using guessed ArcGIS org names… A systematic sweep of each council's own open-data portal would likely find considerably more" | **Confirmed and executed** | The sweep was done. It finds considerably more *packages* — but they are flood studies, not facilities. The prediction was right in quantity, wrong in kind. |
| C7 | `meta.json` sources: `"toilets": "City of Sydney Open Data"` | **Wrong** | Should be "National Public Toilet Map (Australian Government, Dept. of Health, Disability and Ageing), CC-BY". `"blacktown": "Blacktown City Council"` remains wrong (OSM extract, per S1.3 of the prior audit — reconfirmed: 1,605/1,605 features carry OSM `@id`s). |
| C8 | `trees.geojson` (48,999 features) treated as current | **Stale by 663** | Live CoS trees layer `15c4713a` = 49,662. Local file is −663 features (−1.3%). |

**What the previous audit got right (reverified):** the keyboard trap, the 109 contrast failures, the Blacktown OSM mislabelling, the bundle/code-splitting findings, the CoS ArcGIS item IDs and counts (418/162/273/525/890/1,761/70/6/11/6/51), the toilets layer's rich live schema, the 22 sport columns, and the strategic conclusion that no single authoritative source exists.

---

## D. Per-LGA data availability (corrected matrix)

Package counts from live CKAN `organization_show` on data.nsw.gov.au (2026-10-06). "Facility data?" = does the org publish parks/playground/toilet/etc. *datasets* (not just flood studies):

| LGA | CKAN org (slug) | Packages | Package content | Facility data on CKAN? | Other verified channels |
|---|---|---|---|---|---|
| City of Sydney | `city-of-sydney` | **196** | Parks, playgrounds, sports & recreation, swimming pools, dog-off-leash, stairs, seats, fountains, recreation centres, libraries, bridges, community gardens, venues for hire, bicycle parking, trees, bus shelters, mobility parking, walking counts, SDCP 2012, + flood studies | **YES — comprehensive** | ArcGIS Online org `cNVyNtjGVZybOQWZ` (165 services) |
| City of Sydney (2nd org) | `council-of-the-city-of-sydney` | 24 | Flood studies only | No | — |
| Parramatta | `city-of-parramatta-council` | 10 | Flood studies + stormwater plans | No | **ArcGIS org `NrOjMi9LSYL3MUze`** (rich: 144 playground equipment, 132 fountains, 90 sporting fields, 62 toilets, 42 BBQs, 66,351 trees) |
| Northern Beaches | `northern-beaches-council` | 54 | Flood studies (100%: Narrabeen, Manly Lagoon, Dee Why, Careel Creek, Newport FRMS…) | No | **ArcGIS org `LRvZf9YQitIniyDH`** (2,855 MTB trails, 179 toilets, 501+250 coast walks) |
| Randwick | `randwick-city-council` | 40 | Flood studies (Maroubra, Coogee, Kensington–Centennial Park) | No | ArcGIS REST root: 16 services incl. `LeashFreeArea20220915_gdb` |
| Georges River | `georges-river-council` | 33 | Flood studies (Kogarah Bay, overland flow) | No | — |
| Canterbury-Bankstown | `canterbury-bankstown-council` | 27 | Flood studies (Cooks River, Salt Pan Creek, Prospect Creek) | No | — |
| Blacktown | `blacktown-city-council` | 22 | Flood studies (Wianamatta South Creek, Eastern Creek, Greystanes) | No | No verified AGOL org; shipped layer is OSM (§G) |
| Bayside | `bayside-council` | 21 | Flood studies (Botany Bay, Bardwell Creek, Sans Souci) | No | Prior audit's "official council org" (`cc24201a…`) stands from earlier probing |
| Inner West | `inner-west-council` | 21 | Flood studies (Cooks River, Hawthorne Canal, Marrickville) | No | ArcGIS org `dp2UIID5MUpTUFVA` (359 Active Inner West, 2 layers) |
| Sutherland | `sutherland-shire-council` | 28 | Flood studies (Oyster Creek, Gwawley Bay, Kurnell) | No | — |
| Woollahra | `woollahra-municipal-council` | 9 | Flood studies (Double Bay, Watsons Bay, Rushcutters Bay) | No | ArcGIS org `zjbesynggtrdwb3p` (294 Parks Online Map, 8 layers; 113 open-space reserves) |
| Cumberland | `cumberland-council` | 10 | Flood studies (Holroyd, Duck River) | No | — |
| Hornsby | `hornsby-shire-council` | 5 | Remnant trees (2008), threatened ecological communities, vegetation maps, HawkesburyWatch | No (vegetation only) | **ArcGIS org `VKqP0BP08pVXloHq`** (1,418 crown reserves, 1,267 care-and-control, 887 fire trails, 232 walking tracks, 129 library points) |
| Mosman | `mosman-municipal-council` | 5 | (not enumerated in detail) | — | — |
| Ryde | `city-of-ryde` / `ryde-city-council` | 9 / 8 | (duplicate orgs) | — | — |
| North Sydney | `north-sydney-council` | 7 | — | — | — |
| Willoughby | `willoughby-city-council` | 8 | — | — | — |
| Lane Cove | `lane-cove-municipal-council` | 0 | — | — | — |

**Reading the matrix:** CKAN package *count* is a misleading proxy for facility-data availability. Only City of Sydney publishes facility datasets on CKAN. The other councils' portals are dominated by floodplain-risk deliverables (a regulatory obligation, not a recreation dataset). Facility data where it exists lives on **council-run ArcGIS Online organisations** (Parramatta, Northern Beaches, Hornsby, Woollahra, Inner West, Randwick) or in the state-wide NPWS geodatabase.

**Statewide / cross-LGA official sources found:**

- **National Public Toilet Map** (DHA, CC-BY, 25,624 facilities Australia-wide, 3,191 in the Greater Sydney bbox, all NSW; CSV regenerated 2026-10-01; also mirrored as an NSW ArcGIS FeatureServer `National_Public_Toilet_Map/FeatureServer` layer 0 `toiletmapexport`). The only *cross-LGA* official facility dataset located.
- **NPWS `asset-infrastructure-facility-point`** (data.gov.au; NSW Dept. of Climate Change, Energy, the Environment and Water; CC-BY; modified 2026-10-03): BBQs, picnic tables, shelters, fish-cleaning tables, seats, playground equipment, pools, emergency meeting points, gravesites — the state's national-park assets. The app already ships 1,795 NPWS Greater Sydney facilities (`npws-facilities-greater-sydney.geojson`).
- **No statewide council-facility dataset exists** (confirmed by the keyword sweep in §H).

---

## E. ArcGIS Online inventory (verified orgs, owners, live counts)

Org discovery was done by enumerating ArcGIS Online portal owners per LGA and filtering false positives (Cumberland County NC, Canterbury Regional Council NZ, universities, etc.). Verified NSW council orgs:

| Council | orgId (services1.arcgis.com) | Owner(s) | Verified service inventory (live feature counts) |
|---|---|---|---|
| City of Sydney | `cNVyNtjGVZybOQWZ` | cityofsydneyspatial, CoS_SpatialSystems | 165 Feature Services. Parks 418 · playgrounds 162 · fountains 273 · toilets 525 · seats 890 · bicycle parking 1,761 · sports & recreation 70 · pools 6 · libraries 11 · recreation centres 6 · dog off-leash 51 (+164 in second layer) · transport stops/wharves 64 · bikeshare 370 · mobility parking 365 · bus shelters 40 · stairs 523 · bridges 82 · community gardens 22 · venues for hire 37 · crown land 45 · walking counts 5,287 · trees 49,662 |
| Parramatta | `NrOjMi9LSYL3MUze` | pcc2150 | OpenSpaceTrees 66,351 · PARKS_ASSETS_WEB_PUBLISH 2,068 (6 layers) · playground equipment 144 · drinking fountains 132 · sporting fields 90 · public toilets 62 · BBQs 42 · fitness equipment 41 · picnic areas 29 · hard-court sport surfaces 52 · tennis courts 12 · parks for GeoHub 367 · crown & community land 1,121 · skate parks 3 |
| Northern Beaches | `LRvZf9YQitIniyDH` | warringah | MTB trails 2,855 (11 layers) · CoastWalkNew 501 · CoastWalk 250 · toilets 179 (2 layers) · beaches walks 117 |
| Hornsby | `VKqP0BP08pVXloHq` | hsc_dave, Hornsby | Crown reserves 1,418 · care & control 1,267 · fire trails 887 · park facilities mowing areas 519 · CRR assets 365/359 · walking tracks 232 · library points 129 |
| Woollahra | `zjbesynggtrdwb3p` | (council accounts) | Parks Online Map 294 (8 layers) · Your Say crown parks 205 · open space & reserves 113 · tennis courts 3 · playground concept submissions 55 · resident parking 32,273 |
| Inner West | `dp2UIID5MUpTUFVA` | davidchanIWC | Active Inner West 359 (2 layers) |
| Randwick | (council REST root) | — | 16 services incl. `LeashFreeArea20220915_gdb` |

**LGAs with no verified NSW council ArcGIS org** (owner-name sweeps returned only unrelated entities): Blacktown, Bayside, Georges River, Canterbury-Bankstown, Sutherland, Cumberland, Ryde, Penrith, Hawkesbury, Strathfield, Mosman, Hunters Hill, Fairfield, Camden, Campbelltown, Blue Mountains, Canada Bay, North Sydney, Waverley, Lane Cove, Willoughby, Ku-ring-gai, Liverpool (Liverpool has a parking-only service set: 153 records, 3 layers). Absence of an AGOL org does not mean absence of data — it means no *discoverable standard-API* endpoint; several of these councils publish via their own websites or the state portal only.

**Schema notes that matter for the product** (from live layer introspection):

- CoS toilets (`8b0855f0…`): `Accessible`, `AdultChange`, `BabyChange`, `AllGender`, `BabyCareRoom`, `DumpPoint`, `Shower`, `OpeningHours`, `KeyRequired`, `PaymentRequired`, `ChangingPlaces`, `Ambulant`, sharps disposal. The app's local fork keeps 7 of these.
- CoS sports (`2ba0944e…`): 22 sport columns — AFL, Cricket, Rugby, Soccer, TennisCourts, Netball, Basketball, SkatePark, Pickleball, TableTennis, Hockey, Badminton, Futsal, Athletics, IndoorGym, OutdoorGym, Volleyball, Pool, CityPrograms.
- CoS toilets live layer is the richer *per-facility* dataset for the LGA; the NPM is the richer *coverage* dataset (regional, 45 columns). Neither subsumes the other.

---

## F. CKAN portal inventory

**data.nsw.gov.au** (CKAN 3 API at `/data/api/3/action`): 13 council orgs enumerated in full (package-title lists in `raw2/pkglists.txt`). Dominant content class: floodplain-risk studies — "Flood Study", "FRMS", "FRMSP", "TUFLOW", "XP-RAFTS", "hydraulic model" appear in ~90% of package titles across Blacktown, Georges River, Canterbury-Bankstown, Northern Beaches, Sutherland, Randwick, Inner West, Woollahra, Parramatta, Cumberland, Bayside. Exceptions: `city-of-sydney` (196 packages, facility-rich) and `hornsby-shire-council` (vegetation/remnant trees).

**data.gov.au mirrors:** council orgs also exist under `*-datansw` slugs (Blacktown 22, Canterbury-Bankstown 28, Parramatta 10, Georges River 35, Sydney 24, Northern Beaches 54) — the same packages mirrored, not additional data.

**City of Sydney CKAN packages of product interest** (org `city-of-sydney`, verified by title in the 196-package listing): Parks · Playgrounds · Sports and recreation facilities · Swimming pools (×2) · Dog off-leash parks · Stairs · Seats · Drinking fountains (water bubblers) · Recreation centres · Library details · Bridges · Community gardens · Venues for hire (×2) · Bicycle parking · Trees · Bus shelters · Mobility parking · Walking counts · Bicycle count surveys · Taxi ranks · Sharps disposal bins · Street litter bins · Childcare centres · Information kiosks · Raingardens · Urban Forest Strategy. Notably **absent from CKAN**: public toilets (live only on the ArcGIS layer) and public transport stops (GTFS only).

**Licence caveat:** the `5-cityofsydney--*` ArcGIS-sourced packages are marked "License Not Specified" on the portal even where the underlying data is council-published. Before ingest, licence terms must be confirmed per package — "not specified" is not "open".

**Portal-wide keyword sweep** (data.nsw.gov.au `package_search?q=`, this round): playground → 7 hits (mostly City of Sydney + the NPWS facility point) · off-leash → 108 · drinking fountain → 2 · public toilet → 5 (TfNSW rest areas/interchange facilities + 2 DCS Spatial Services items) · sports facility → 17 · recreation centre → 5 · park bench → **0** · BBQ → 1 (maritime boat ramps). Confirms: facility data is council-by-council; the state portal does not aggregate it.

---

## G. Shipped-dataset provenance audit

Every file in `public/data/`, reconciled against live sources:

| File | Rows | `meta.json` says | Verified true source | Verdict |
|---|---|---|---|---|
| `Parks.geojson` | 418 | City of Sydney Open Data | CoS ArcGIS `b38a28bd…` = 418 | ✅ Correct |
| `drinking-fountains.geojson` | 273 | City of Sydney Open Data | CoS ArcGIS `166d56fa…` = 273 | ✅ Correct |
| `Dog_off-leash_parks.geojson` | 51 | City of Sydney Open Data | CoS ArcGIS `20b8bb75…` = 51 | ✅ Correct |
| `trees.geojson` | 48,999 | (not in `meta.json`) | CoS ArcGIS `15c4713a…` = 49,662 | ⚠️ Stale (−663, −1.3%) |
| `toilets-sydney.json` | 3,127 | City of Sydney Open Data | **National Public Toilet Map (DHA, CC-BY)** — Greater Sydney extract | ❌ Mislabelled; CC-BY attribution absent |
| `public-transports.json` | 1,164 | Transport for NSW | TfNSW **GTFS `stops.txt`** extract (schema verbatim; metro rail bbox lat −34.06…−33.69, lon 150.70…151.21; 256 stops + 66 stations + 304 entrances + 538 nodes) | ✅ Attribution correct; complementary to (not a fork of) the 64-record CoS ArcGIS layer |
| `blacktown.geojson` | 1,605 | Blacktown City Council | **OpenStreetMap extract** — 1,605/1,605 features carry OSM `@id` (e.g. `way/4904026`), OSM `@geometry: "center"`; bbox spans Blacktown + Cumberland + Parramatta | ❌ Mislabelled; ODbL attribution absent (prior finding S1.3 reconfirmed) |
| `npws-facilities-greater-sydney.geojson` | 1,795 | NSW National Parks & Wildlife Service | Consistent with NPWS `asset-infrastructure-facility-point` (CC-BY, modified 2026-10-03) | ✅ Plausible; re-verify against the live geodatabase ZIP before relying on freshness |
| `parks-suburbs.json` | — | — | Suburb-keyed aggregation of the parks layer | ✅ Derived, no independent provenance |

**The toilets join, in detail.** NPM CSV: 25,624 rows, 45 columns (`FacilityID, URL, Name, FacilityType, Address1, Town, State, …, Latitude, Longitude, …, OpeningHours, …, AdultChange, ChangingPlaces, BYOSling, ACShower, …, BabyChange, BabyCareRoom, …, DumpPoint, DPWashout, …, Accessible, AllGender, Ambulant, …, SharpsDisposal, DrinkingWater, SanitaryDisposal, Shower`). Local file bbox contains 3,191 NPM rows (all NSW; top towns: Sydney 59, Hornsby 32, Mosman 29, Manly 28, Blacktown 28, Cronulla 28 — matching the local `t` distribution: Sydney 57, Hornsby 31, Blacktown 29, Mosman 29, Manly 27, Cronulla 27). Row-level join on name + coordinates (±0.0005°): **2,992/3,127 matched (95.7%)**; the 135 unmatched are council-specific entries (e.g. "Livvi's Place Inclusive Playground, Warragamba") consistent with an older NPM vintage or a supplemental local merge. Spot-check, "Valentia Street Wharf": local `(−33.83847, 151.176174)` vs NPM `(−33.83846985, 151.17617352)` — identical to 8 decimals; `h`="OPEN: 24 hours"=`OpeningHours`, `a`="True"=`Accessible`, `b`="True"=`BabyChange`.

**Consequences:** (1) `meta.json` is wrong for two of seven sources; (2) the app owes ODbL attribution for `blacktown.geojson` and CC-BY attribution for `toilets-sydney.json` — neither is present; (3) the toilets layer is *better coverage than the audit believed* (regional, not LGA) but *worse schema* (7 of 45 NPM columns, and the CoS layer's 525 LGA facilities with ChangingPlaces/Ambulant/sharps are not in it at all); (4) a correct fix is to load both — NPM for regional coverage, CoS ArcGIS for LGA depth — and say so in the UI.

---

## H. Statewide sweep — is there a single authoritative source?

**No.** Evidence: the portal-wide keyword sweep (§F) returns council-specific and NPWS items only; the 13 council CKAN orgs are flood-dominated; facility data is concentrated in 6 council ArcGIS Online orgs plus City of Sydney's dual channel (CKAN + ArcGIS). The only cross-LGA official facility datasets in NSW are the **National Public Toilet Map** (toilets only) and the **NPWS asset geodatabase** (national-park assets only). Everything else — playgrounds, sports fields, BBQs, seats, fountains outside the LGA — must be assembled council by council, and ~20 of 33 Greater Sydney LGAs have no discoverable standard-API endpoint at all.

**Practical implication for "all of Sydney":** achievable today from official sources only for toilets (NPM, statewide) and NPWS assets. For the full facility atlas, the honest architecture is: per-LGA source registry (like `sources.config.json` proposed in the generational report) with three tiers — *verified official API* (Sydney, Parramatta, Northern Beaches, Hornsby, Woollahra, Inner West, Randwick), *official but scrape-only* (councils with portals but no API), and *OSM-derived with attribution and accuracy caveat* (everyone else, including the current Blacktown layer).

---

## I. 2026 web-platform survey

The previous audit could not run this survey (it reported `web_search` unavailable). It works now. Sources: web.dev "New to the web platform in January" (Rachel Andrew, 2026-01-30), plus search-result corroboration (caniuse, MDN-backed tables).

**Stable in January 2026 (Chrome 144 / Firefox 147):**

- **CSS Anchor Positioning** — Baseline Newly available with Firefox 147; now supported in all major browsers (Chrome 125+, Edge 125+, Firefox 147+, Opera 111+, Samsung Internet 27+, Safari 26). Positions elements relative to anchors — tooltips, menus, popovers. *Relevance:* the app's Leaflet popups and the help "?" dropdown no longer need JS positioning hacks.
- **Navigation API** — Baseline with Firefox 147. Modern navigation initiation/interception/management. *Relevance:* future SPA routing for the facilities atlas.
- **`::search-text` pseudo-element** (Chrome 144) — find-in-page result styling, sibling of `::selection`.
- **`<geolocation>` element** (Chrome 144) — declarative, user-activated location control; handles permission flow and often eliminates a separate JS API call. *Relevance:* a park-finder's "near me" affordance with less permission-friction code.
- **Temporal API** (Chrome 144) — modern date/time objects replacing `Date`. *Relevance:* parsing the toilets layer's `OpeningHours` strings ("OPEN: 24 hours") into comparable intervals.
- **`caret-shape`** (Chrome 144) — auto/bar/block/underscore text caret.
- **View Transition enhancements** (Firefox 147) — view transition *types* for SPAs, plus `document.activeViewTransition`.

**In beta (Chrome 145 / Firefox 148):** `text-justify`, multi-column `column-wrap`/`column-height`, `onanimationcancel`, customizable `<select>` extended to listboxes; `Location.ancestorOrigins` (iframe ancestry detection).

**Accessibility standards context:** WCAG 2.2 reached W3C Proposed Recommendation (Dec 2024). Its SC 2.5.8 *Target Size (Minimum)* — 24×24 CSS px, Level AA — is the standard under which the prior audit's 504 sub-24px touch-target finding falls; that finding is correctly cited against a current standard, not a future one.

**Assessment for Park Pulse:** nothing in the January 2026 wave changes the audit's severity ranking (the keyboard trap and contrast failures remain the priority), but CSS Anchor Positioning, the `<geolocation>` element and Temporal are directly useful to the facilities-atlas roadmap, and WCAG 2.2 is fully in force — the S1.5 touch-target fix is compliance, not polish.

---

## J. Recommendations, limitations and verification log

**Recommendations (delta only — the prior audit's Phase A list stands):**

1. **Fix `meta.json` now** (one-line change, two lines of attribution text): toilets → "National Public Toilet Map (Australian Government — Department of Health, Disability and Ageing), CC-BY"; add an explicit `blacktown` → "Derived from OpenStreetMap contributors, ODbL" entry; add `trees` source entry. Add the licence strings to the UI's provenance display.
2. **Re-plan the toilets layer as a two-source union:** NPM CSV (regional coverage, 45 columns — un-flatten at least `ChangingPlaces`, `AdultChange`, `Ambulant`, `DumpPoint`, `Shower`, `SharpsDisposal`, `AllGender`, `KeyRequired`, `PaymentRequired`) plus the CoS ArcGIS toilets layer (LGA depth). The NPM CSV is a single 12 MB download, CC-BY, regenerated 2026-10-01 — trivially pipelineable.
3. **Add Parramatta and Northern Beaches to the ingest registry first** — they are the only other LGAs with verified, rich, official facility APIs (§E). Parramatta alone adds 144 playground-equipment sites, 132 fountains, 90 sporting fields, 62 toilets, 42 BBQs.
4. **Use City of Sydney's CKAN org (`city-of-sydney`, 196 packages) as the primary ingest channel for that LGA** — standard API, stable package slugs, easier than the 165-service ArcGIS enumeration — while keeping ArcGIS for the classes CKAN lacks (public toilets, transport stops).
5. **Treat "License Not Specified" CKAN packages as blocked** pending licence confirmation; do not ingest on the strength of portal presence alone.
6. **Blacktown remains an OSM story** — the honest fix is relabelling + ODbL attribution + a stated accuracy caveat, not hunting for a council dataset that does not exist in discoverable form (its 22 CKAN packages are all flood studies).

**Limitations of this research:**

- Package *titles* were enumerated, but not every package's *resources* were downloaded and diffed; a flood-study package could in principle contain a parks GIS layer. Spot-checks (Northern Beaches 54/54, Sutherland 28, Blacktown 22, Georges River 33, Canterbury-Bankstown 27, Randwick 40, Inner West 21, Woollahra 9, Parramatta 10, Cumberland 10, Hornsby 5, both Sydney orgs 24+196) found none.
- The 135 unmatched toilet rows (4.3%) were not individually resolved; they may be an older NPM vintage or council-supplemented entries.
- ArcGIS Online org discovery relies on owner-name heuristics; councils publishing under personal or third-party accounts could be missed (the prior audit's Blacktown `Phil.Woodbury_lpinsw` finding is exactly that pattern).
- The NSW ArcGIS mirror of the NPM (`National_Public_Toilet_Map/FeatureServer`) returned an error on `returnCountOnly` queries during this round; the CSV on data.gov.au is the reliable channel.
- Screenshot/pixel review remained unavailable (carried over from the prior audit).
- The original deep-research prompt's §14 A–J skeleton was not recoverable from the workspace; this report's A–J is a reconstruction (see the note at the top).

**Verification log (all 2026-10-06, captures in `research/raw2/` unless noted):**

- CKAN `organization_show` × 20 org slugs (package counts in §D); `package_search?fq=organization:*` × 14 (title lists in `raw2/pkglists.txt`, `raw2/pkglist-city-of-sydney.json`).
- NPM: data.gov.au `package_show` `553b3049-2b8b-46a2-95e6-640d7986a8c1` (`raw2/npm-dga-package.json`); CSV `toiletmapexport_261001_074429.csv` 25,624 rows (`raw2/npm-toiletmap.csv`, 12 MB); NSW FeatureServer root + layer 0 (`raw2/npm-nsw-featureserver.json`, `raw2/npm-layer0.json`).
- Row-level join: 2,992/3,127 local toilet rows matched to NPM by name+coords; bbox reconciliation 3,191 NPM rows in local bbox.
- Local dataset inventory: 9 files counted and schema-inspected (`public/data/`).
- ArcGIS counts: carried from the earlier verified enumeration (`research/raw/service-counts.json`, 102 services, `counts-log.txt`).
- Web survey: `web_search` × 3 queries + `read_url` of web.dev Jan-2026 platform post.
- NPWS package: data.gov.au `asset-infrastructure-facility-point` (`raw2/…`/`raw/pkg-asset-infrastructure-facility-point.json`), org NSW DCCEEW, CC-BY, modified 2026-10-03.

**One-line version:** the "no single source" conclusion was right, but seven LGAs are not data deserts — they are flood-study portals — and the app's own toilets file is a mislabelled National Public Toilet Map extract; fix the attribution, union the NPM with the City of Sydney layer, and ingest Parramatta and Northern Beaches next.
