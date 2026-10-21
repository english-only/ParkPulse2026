# ParkPulse Data Inventory

**Last Updated:** 2026-10-14
**Data Collected By:** User
**Total Datasets:** 18 files (combined ~1.4 GB)

---

## 📊 DATASET DESCRIPTIONS

### 1. **LGA Boundary Files (4 files)**

#### 1.1 NSW Local Government Areas Map.json
- **File Size:** ~small
- **Format:** GeoJSON FeatureCollection
- **Description:** Multi-feature GeoJSON containing NSW Local Government Area boundaries
- **Usage:** Regional zoning, council selection, cross-council spatial analysis
- **Status:** ✓ Ready for use

#### 1.2 The City of Sydney Local Government Area.json
- **File Size:** ~9 KB
- **Format:** JSON metadata (NSW Government Data Portal response)
- **Description:** Metadata record from `data.nsw.gov.au` for City of Sydney LGA
- **Key Info:** Dataset ID `eb2f6e0f-190e-4968-aaf7-8473f467f0e0`, organization: city-of-sydney
- **Status:** ✓ Reference only - SVG/GeoJSON boundary file needed

#### 1.3 NSW Administrative Boundaries Theme - Local Government Area.json
- **File Size:** ~small
- **Format:** GeoJSON
- **Description:** Official NSW Government administrative boundary layer for LGAs
- **Usage:** Official regional mapping, compliance verification
- **Status:** ✓ Ready for use

#### 1.4 LGAs_Sydney_and_surrounds.json
- **File Size:** ~small
- **Format:** GeoJSON FeatureCollection
- **Description:** Combined LGA boundaries for Sydney and surrounding areas
- **Usage:** Immediate park-pulse regional filtering, council comparison
- **Status:** ✓ Ready for use
- **CRITICAL NOTE:** Contains polygon coordinates - need to map council names to valid IDs for Filtering functionality

---

### 2. **Community Tree Data (2 files)**

#### 2.1 Trees_-5653523654356919709.geojson
- **File Size:** ~unknown
- **Format:** GeoJSON FeatureCollection
- **Description:** City of Sydney tree inventory (baseline dataset)
- **Source:** Unknown (GitHub User raghav2k25)
- **Required Processing:**
  - Asset ID extraction
  - Parse tree coordinates from Jason's app response (JSON only, no features)
  - Convert Jason's app response to FeatureCollection format
  - Extract specs from Jason's app response
  - Extract planting dates from Jason's app response
  - Fill in Council/LGA name as filename
- **Status:** ⚠️ Needs conversion to FeatureCollection & attribute extraction

#### 2.2 City of Sydney 10×10 Tree Shards (via shard-trees.mjs 10)
- **Architecture:** 100 tiles = 10 × 10 grid sharded city-wide
- **File Pattern:** `public/data/trees/tile-{z}-{x}-{y}.json` or `.geojson`
- **Format:** GeoJSON FeatureCollection per tile
- **Tiles per council:** 100 shards per LGA
- **Status:** ⚠️ Requires shard-trees.mjs script after merging all council data
- **Usage:** Web performance optimization, browser-level fetching, offline support, faster tile loads

---

### 3. **Parks Facility Data (2 files)**

#### 3.1 Parks.geojson (City of Sydney - Original)
- **File Size:** ~1.5 MB
- **Format:** GeoJSON FeatureCollection
- **Description:** Complete City of Sydney park facilities inventory
- **Features Count:** Large number of parks
- **Attributes:**
  - `OBJECTID` - ESRI internal ID
  - `Asset_ID` - Local park identifier (e.g., "PK24")
  - `Type` - Park classification (Pocket, Neighbourhood, Sportsfield, Iconic, Civic)
  - `Name` - Park name
  - `Playgrounds` - Yes/No flag
  - `Shape__Area` - Area in square meters
  - `Shape__Length` - Perimeter in meters
  - Added attributes: `ESRI_OID`
  - `geometry` - MultiPolygon for park boundaries
- **Status:** ✓ Ready for use - This is the baseline!

---

### 4. **Canopy Cover Data (4 files - 4 GB total)**

One GeoTIFF per LGA, organised by LGA directory name. **Verified 2026-10-16** by reading the tiles (see `Data/council-sources.md` §6):

- **Resolution:** ~0.48 m binary mask (`{0, 1}`), *not* 30 m — each tile carries 10 overview levels, level 6 ≈ 31 m, level 5 ≈ 15.36 m.
- **Projection:** GDA2020 / MGA zone 56 (EPSG:7856); tiles for far-west LGAs would use zones 55/54.
- **Extent:** 33 tiles total (one per council of our 35 except Central Coast and Unincorporated).
- **Converted:** ✓ `node artifacts/park-pulse/scripts/canopy-extract.mjs --all` → `public/data/canopies/{lga_id}.geojson` + `index.json`, scalar merged into `councils-index.json` (`canopy_percent` 33/35). GDAL is absent in this environment (TBD-6), so the FR5.1 documented fallback (GeoTIFF.js + proj4) is the shipped, tested path.

#### 4.1 canopy-lgas-a-e-gda2020.zip (222 MB)
- **LGAs Included (9, verified):** Bayside, Blacktown, Blue Mountains, Burwood, Camden, Campbelltown, Canada Bay, Canterbury-Bankstown, Cumberland
- **Files:**
  - `Bayside/BAYSIDE_2024_Canopy.tif` (8.3 MB)
  - `Blacktown/BLACKTOWN_2024_Canopy.tif` (38 MB)
  - `Blue Mountains/BLUE_MOUNTAINS_2024_Canopy.tif` (131 MB)
  - `Burwood/BURWOOD_2024_Canopy.tif` (1.4 MB)
  - `Camden/CAMDEN_2024_Canopy.tif` (27 MB)
  - `Campbelltown/CAMPBELLTOWN_2024_Canopy.tif` (38 MB)
  - `Canada Bay/CANADA_BAY_2024_Canopy.tif` (4.1 MB)
  - `Canterbury-Bankstown/CANTERBURY-BANKSTOWN_2024_Canopy.tif` (19 MB)
  - `Cumberland/CUMBERLAND_2024_Canopy.tif` (13 MB)
  - Metadata PDFs included
- **Purpose:** Calculate % canopy cover per LGA, assess green-blue infrastructure connectivity
- **Status:** ✓ Converted per council by `scripts/canopy-extract.mjs` (fallback path — GDAL absent, TBD-6)
- **Key Metrics:**
  - Raster type: binary canopy mask, values {0, 1} (verified; a 0–100 continuous layer was the earlier guess)
  - Projection: GDA2020 / MGA Zone 56 (EPSG:7856)
  - Resolution: ~0.48 m with 10 overview levels (level 5 ≈ 15.36 m, level 6 ≈ 31 m)
  - Date: 2024
  - Origin: NSW Government (Planning Portal open data, CC BY-NC-ND 4.0)
  - Results: per-LGA percentages in `Data/council-sources.md` §6 (provisional, TBD-11)

#### 4.2 canopy-lgas-f-j-gda2020.zip (229 MB)
- **LGAs Included (6, verified):** Fairfield, Georges River, Hawkesbury, Hornsby, Hunters Hill, Inner West
- **Files:**
  - `Fairfield/Fairfield_2024_Canopy.tif`
  - `Georges River/Georges_River_2024_Canopy.tif`
  - `Hawkesbury/HAWKESBURY_2024_Canopy.tif` (233 MB — the largest tile)
  - `Hornsby/Hornsby_2024_Canopy.tif`
  - `Hunters Hill/Hunters_Hill_2024_Canopy.tif`
  - `Inner West Council/Inner_West_Council_2024_Canopy.tif`
  - Metadata PDFs included
- **Status:** ✓ Converted per council by `scripts/canopy-extract.mjs`

#### 4.3 canopy-lgas-k-s-gda2020.zip (217 MB)
- **LGAs Included (13, verified):** Ku-ring-gai, Lane Cove, Liverpool, Mosman, Northern Beaches, North Sydney, Parramatta, Penrith, Randwick, Ryde, Strathfield, Sutherland Shire, Sydney
- **Status:** ✓ Converted per council by `scripts/canopy-extract.mjs` (earlier “duplicate councils / Kogarah” note was wrong — the listing above is what the zip contains)

#### 4.4 canopy-lgas-t-z-gda2020.zip (216 MB)
- **LGAs Included (5, verified):** The Hills Shire, Waverley, Willoughby, Wollondilly, Woollahra
- **Status:** ✓ Converted per council by `scripts/canopy-extract.mjs`

---

### 5. **Public Transit Data (1 file - 277 MB)**

#### 5.1 full_greater_sydney_gtfs_static_0.zip (277 MB)
- **Format:** GTFS Static (v2 GTFS standard)
- **File Count:** 11 files
- **Description:** Complete for Greater Sydney GTFS static files
- **Size:** 1.44 GB uncompressed

**Files:**
1. `agency.txt` (58 KB) - Transport agencies
2. `stops.txt` (17 MB) - Transit stop locations (**171,214** records; see §5.1 note)
3. `routes.txt` (12 MB) - Bus route definitions & route types
4. `calendar.txt` (150 KB) - Service calendar (Monday-Sunday)
5. `calendar_dates.txt` (825 KB) - Exception dates
6. `shapes.txt` (979 MB) - Route geometry shapes (very large!)
7. `trips.txt` (27 MB) - Trip-level information
8. `stop_times.txt` (420 MB) - Stop-to-trip connections (very large!)
9. `notes.txt` (72 KB) - Documentation
10. `levels.txt` (162 B) - Track levels
11. `pathways.txt` (485 KB) - Pedestrian pathways

**Key Data Points:**
- **Agency:** Transport for NSW (commercially-sponsored)
- **Stops:** 171,214 GTFS stop records statewide (feed is NSW-wide, not Sydney-only); **26,198 stations** fall inside the 35 council boundaries after conversion
- **Routes:** All bus routes + train lines + ferry routes
- **Shapes:** 979 MB - full route geometries for spatial analysis
- **Stop Times:** 420 MB - precise timing of each stop visit
- **Format:** CSV tables, ready for tooling processing

**Required Processing:**
1. ✓ Extract stop locations (stops.txt) for mapping
2. ✓ Convert stops to FeatureCollection GeoJSON — `scripts/gtfs-convert.mjs --stops` → `public/data/transport/stops.geojson` (26,198 features, deterministic; scope rule + TBD-4a in `Data/council-sources.md` §5)
3. ⚠️ Map route geometries (shapes.txt) to route lines — `--routes --sample` verified offline; full 979 MB run is a connected-machine gate (FR4.2)
4. ✓ Consolidate bus stops + train stops + ferry stops (`route_types[]` per stop)
5. ⚠️ Generate routes.geojson layer for routing connectors
- **Status:** ✓ Stops converted and shipping in the app; routes layer sample-validated only

---

### 6. **Special Purpose Parks Data (2 files)**

#### 6.1 Dog_off-leash_parks.geojson
- **File Size:** ~unknown
- **Format:** GeoJSON FeatureCollection
- **Description:** Areas where dogs can be off-leash
- **Usage:** User preference layer show/drag_xlim for off-leash zones
- **Status:** ✓ Ready for use

#### 6.2 Alcohol_free_zones.geojson
- **File Size:** ~unknown
- **Format:** GeoJSON FeatureCollection
- **Description:** Designated alcohol-free zones
- **Usage:** Policy layer, user awareness
- **Status:** ✓ Ready for use

---

### 7. **Unknown/Testing Datasets (1 file)**

#### 7.1 test.json
- **File Size:** Large (appears to be mainland Australia)
- **Format:** GeoJSON FeatureCollection
- **Description:** Test file - possibly a complete Australia coastline or container
- **Usage:** None identified
- **Status:** ⚠️ Testing file - review for potential use
- **Observation:** Contains Polygon coordinates spanning mainland Australia

---

## 📈 DATA COMPLETENESS OVERVIEW

### Completed Datasets
- ✓ City of Sydney Parks (baseline)
- ✓ City of Sydney LGA boundaries (metadata)
- ✓ NSW Administrative Boundaries
- ✓ Greater Sydney LGA Set (partial)
- ✓ Dog Off-Leash Zones
- ✓ Alcohol-Free Zones
- ✓ GTFS Stop Locations (converted: 26,198 stations in-scope; source has 171,214 records)
- ✓ GTFS Structure (agency, routes, shapes, trips, stop_times)
- ✓ City of Sydney Trees (raw, needs format conversion)

### Partially Completed Data
- ⚠️ Canopy Cover (4 GB - ready for conversion)
- ⚠️ GTFS Partial (shapes/stop_times are huge - review requirements)

### Missing Data (Council-Specific)
- ❌ Inner West Council parks & trees
- ❌ Parramatta City parks & trees
- ❌ Liverpool City parks & trees
- ❌ Northern Beaches Council parks & trees
- ❌ Campbelltown City parks & trees
- ❌ Camden Council parks & trees
- ❌ Randwick City parks & trees
- ❌ Hornsby Shire parks & trees
- ❌ Remaining 30+ Greater Sydney Councils (Bayside, Blacktown, Burwood, Fairfield, Georges River, Hawkesbury, Ku-ring-gai, Lane Cove, Leichhardt, Mosman, North Sydney, Penrith, Rockdale, Strathfield, Sutherland Shire, Waverley, Willoughby, Woollahra)

---

## 🎯 IMMEDIATE PROCESSING PRIORITIES

### Phase 1: Baseline Setup (Days 1-3)
1. Convert `Parks.geojson` to FeatureCollection format if not already
2. Extract City of Sydney tree data from `Trees_-5653523654356919709.geojson`
3. Create LGA council name mapping from `LGAs_Sydney_and_surrounds.json`
4. Validate City of Sydney tree coordinates (Jason's app response - need app URL or alternative)

### Phase 2: Public Transit Processing (Days 4-6)
1. Extract GTFS stop locations → `public/data/transport/stops.geojson`
2. Extract GTFS route geometries → `public/data/transport/routes.geojson`
3. Validate stop coordinates (lat/lon format, CRS consistency)

### Phase 3: Canopy Cover Conversion (Days 7-10)
1. Convert each TIFF raster to GeoJSON:
   - Use GDAL `gdal_translate` with `-of JSON` or `-of GeoJSON`
   - Or use QGIS Export Feature to GeoJSON
   - Or use `gdaldem` to get % canopy cover values
2. Calculate % canopy cover per council layer
3. Create summary statistics per LGA

### Phase 4: Council Data Acquisition (Ongoing)
1. Target 7 priority councils:
   - Parramatta City (major urban hub)
   - Liverpool City (major council)
   - Blacktown City (large population, accessible data)
   - Northern Beaches Council (coastal, distinct character)
   - Campbelltown City (growth area)
   - Camden Council (regional hub)
   - Randwick City (coastal, diverse)

2. Council Data Sources:
   - `opendata.{council-name}.nsw.gov.au` (first choice)
   - ArcGIS Portal: `{council-name}.maps.arcgis.com`
   - NSW Data Catalog: `data.nsw.gov.au`
   - Direct council website search → "environment" → "GIS data" or "datasets"

---

## 📋 DATA STORAGE RECOMMENDATIONS

### Current Structure: `public/data/`
```
public/data/
├── trees/
│   ├── manifest.json               # Shard manifest (10×10 grid)
│   ├── overlay.geojson             # City of Sydney baseline
│   └── shard-[lga-name]/           # Future: multi-council tiles
│       ├── tile-0-0.json
│       └── ...
├── parks/
│   ├── city-of-sydney.geojson      # Baseline parks layer
│   └── shard-[lga-name]/           # Future: multi-council parks
├── transport/
│   ├── stops.geojson               # GTFS stops (needs conversion)
│   ├── routes.geojson              # GTFS routes (needs conversion)
│   └── network-layer.geojson       # Future: combined transit network
├── canopies/
│   ├── bayside-canopy.geojson      # Processed canopy % layer
│   ├── blacktown-canopy.geojson
│   ├── inner-west-canopy.geojson
│   └── ...                          # All 18 LGAs with 30m raster converted
├── boundaries/
│   ├── nsw-lgas.geojson            # From LGAs_Sydney_and_surrounds.json
│   └── council-specific.geojson    # Future: council boundary maps
└── special/
    ├── dog-off-leash.geojson      # From Dog_off-leash_parks.geojson
    └── alcohol-free.geojson       # From Alcohol_free_zones.geojson
```

---

## ⚠️ CRITICAL NOTES

### Network Constraints
- All fetch scripts (`fetch-*.mjs`) must run on machine with internet access
- Sandbox environment blocks outbound network
- Council data web scraping requires external machine

### Data Quality Concerns
1. **Geographic Projection Mix:**
   - Canopy rasters: GDA2020 / MGA Zone 54-56
   - Leaves unconverted GeoJSONs: Likely WGS84 (EPSG:4326)
   - **Action Required:** Reproject canopy layers to WGS84 for consistency

2. **Council Name Mapping:**
   - Need exact mapping from file names to council IDs
   - Some files may be shires (e.g., "Georges River" — not an LGA)
   - Some files appear in multiple zip archives (potential duplicates)

3. **Large File Handling:**
   - GTFS `shapes.txt` (979 MB) and `stop_times.txt` (420 MB) are large
   - **Action Required:** Write processing scripts to filter only required fields
   - Only export: Agency, Stop, Route, and basic geometry — not full files

4. **Canopy Raster Data:**
   - 30m spatial resolution may limit single-tree identification
   - **Action Required:** Document that data represents regional canopy % at LGA resolution
   - Avoid suggesting precise tree-by-tree extraction from canopy rasters

5. **Missing Attributes:**
   - Council tree data may have inconsistent naming (TreeID vs ID vs objectId)
   - Council tree data may lack date fields (planting year)
   - Council tree data may not provide species names
   - **Action Required:** Write standardization script to map all attributes

---

## 🚀 NEXT STEPS SUMMARY

### Immediate (Today)
1. Create `DATA_INVENTORY.md` (creates now)
2. Create `FINAL_PRD_V5.md` (creates now)
3. Review `test.json` - determine if it's reusable

### Tomorrow (Processing)
1. Convert GTFS stops.txt → `public/data/transport/stops.geojson`
2. Validate tree coordinates extraction
3. Start canopy raster conversion for 3 priority LGAs

### Days 3-7
1. Continue canopy raster conversion (all 18 archives)
2. Extract City of Sydney tree data from raw GeoJSON
3. Begin council data acquisition for 5 priority councils

### Week 2-3
1. Complete council data acquisition (target 30 councils)
2. Cross-triangulate council boundary names → GIS IDs
3. Merge all parks and tree layers by council

### Week 4
1. Run shard-trees.mjs 10 (after merged data is ready)
2. Create oracle_search index for council datasets
3. Write test suite for sharding logic

### Week 5+
1. Implement Explore page layer toggles
2. Build council-shard selection UI
3. Deploy to Netlify/Cloudflare
4. User testing for edge cases

---

**Prepared for:** ParkPulse Project Team
**Status:** Data Collected ✓ | Processing Started ⚠️
**Data Source:** NSW Government, Transport for NSW, Council Open Data Portals, User Collection
**License Notes:**
- NSW Government Use with attribution, check specific licence terms
- GTFS Open data, use per GTFS license
- Council Check specific council Open Data licence terms
---

## Phase 2 Council Acquisition — Status Sync (2026-10-15)

Source of truth for per-council status is [`Data/council-manifest.json`](./council-manifest.json); the research log is [`Data/council-sources.md`](./council-sources.md). This section mirrors it (kept in sync manually — `/update-docs` convention).

| Council | Parks | Trees | Canopy |
|---|---|---|---|
| City of Sydney (baseline) | ✓ downloaded (418, in-repo) | ✓ downloaded (48,999, sharded) | ✓ local TIFF (extraction gated TBD-6) |
| City of Parramatta | ✓ downloaded (1,594 — **licence TBD-12**) | ✓ downloaded (66,345 — **licence TBD-12**) | ✓ local TIFF (TBD-6) |
| Liverpool | ✗ missing (portal probed, 0 datasets) | ✗ missing | ✓ local TIFF (TBD-6) |
| Blacktown | ✓ downloaded (1,605, in-repo — provenance TBD-12) | ✗ missing (no public inventory) | ✓ local TIFF (TBD-6) |
| Northern Beaches | ✗ missing (map-only viewer) | ✗ missing | ✓ local TIFF (TBD-6) |
| Campbelltown | ✗ missing (portal = 7 unrelated datasets) | ✗ missing | ✓ local TIFF (TBD-6) |
| Camden | ✗ missing | ✗ missing | ✓ local TIFF (TBD-6) |
| Randwick | ✗ missing | ✗ missing (significant-tree subset only) | ✓ local TIFF (TBD-6) |

**New tooling (this repo, `artifacts/park-pulse/scripts/`):**

- `lib/arcgis.mjs` — pure ArcGIS→GeoJSON conversion + normalisation (ring winding, target schema, object-id paging).
- `fetch-council-arcgis.mjs` — generic FeatureServer fetcher CLI (already produced the two Parramatta downloads).
- `fetch-council-opendatasoft.mjs` — Opendatasoft catalogue probe CLI (verified Liverpool publishes nothing relevant).
- `validate-geojson.mjs` — structural GeoJSON validator (FeatureCollection, EPSG:4326 range, non-empty), used by the fetchers and runnable standalone.
- Fixture tests: `artifacts/park-pulse/src/utils/councilFetch.test.ts` (24 tests, offline).

**Downloads produced** (untracked, > 100 KB, kept out of git per repo policy):

- `Data/council-downloads/parramatta/parks.geojson` — 1,594 features, validated.
- `Data/council-downloads/parramatta/trees.geojson` — 66,345 features, validated (6 source points had unparsable geometry and were dropped, not faked).
- `Data/council-downloads/liverpool/catalog-report.json` — probe evidence of absence.

**Open gates carried forward:** TBD-4 (38+ LGA roster is a definitional question — the official 33-LGA region is already complete in the index), TBD-6 (GDAL for canopy extraction), TBD-12 (licences for Parramatta parks/trees and Blacktown parks; CC BY-NC-ND on canopy blocks publishing derived percentages until legal review).
