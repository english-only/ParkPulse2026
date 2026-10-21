# ParkPulse Data Collection Requirements

**Purpose:** Consolidated list of all data sources needed to expand ParkPulse from City of Sydney to Greater Sydney (38+ LGAs).

---

## 📊 1. Municipal Boundary Data

### Council Area Boundaries
- **Format:** Polygon GeoJSON or Shapefile (shp/dbf/prj)
- **Source Options:**
  - **Sомер French / OpenGov** (most reliable):
    - Download URL: `https://www.somervillefrench.com/data/downloads/downloads.csv`
    - Use "local government area (lgas)" dataset
  - **OpenStreetMap (OSM):**
    - Use Overpass API to extract LGA boundaries
  - **NSW Government Open Data:**
    - Check `data.nsw.gov.au` for LGA polygons
- **Requirement:** Minimum 7,000 councils in NSW for full Greater Sydney
- **Critical Files Needed:**
  - `public/data/wgs84/boundaries/` — directory for GeoJSON boundary files

---

## 🌳 2. Community Tree Data

### 2.1 City of Sydney (Baseline)
- **Already Available:** Locally
- **Location:** `public/data/trees/`
- **Status:** 4×4 grid sharded (48,999 trees)

### 2.2 Other Greater Sydney Councils
- **Format:** FeatureCollection GeoJSON
- **Sources (per council):**
  - **ArcGIS Service Catalog (if org endpoint accessible):**
    - Download tree layer as GeoJSON
    - Example fetch: `<org-url>/sharing/rest/content/items/<item-id>/data?f=geojson`
  - **Council Public Web Portal:**
    - Search council website for "environment" → "trees" → "GIS data"
  - **Council Dataset Catalogs:**
    - Check `opendata.[council-name].nsw.gov.au` for tree inventories
  - **Datasets.australia:**
    - Search "tree inventory NSW councils"
- **Required Attributes (minimum):**
  - `geometry`: Point (lat, lon)
  - `properties.TreeID` or `properties.ID`
  - `properties.CommonName` or `properties.Species`
  - `properties.Circumference` or `properties.Diameter`
  - `properties.Height`
  - `properties.PlantingDate` (if available)
  - `properties.Council` or `properties.LGA` (fill with council name/filename)

**Council Data Sources to Research:**

| Council | Potential Source 1 | Potential Source 2 | Potential Source 3 |
|---------|-------------------|-------------------|-------------------|
| Bayside Council | `opendata.bayscouncil.nsw.gov.au` | ArcGIS Portal | Environment Dept |
| Blacktown City | `opendata.blacktown.nsw.gov.au` | ArcGIS Portal | Green Plan datasets |
| Bankstown City | `opendata.bankstown.nsw.gov.au` | ArcGIS Portal | GIS data download |
| Burwood Council | `opendata.burwood.nsw.gov.au` | ArcGIS Portal | Environmental GIS |
| Canada Bay Council | `opendata.canadabay.nsw.gov.au` | ArcGIS Portal | Parks & trees |
| Canterbury-Bankstown | `opendata.bankstown.nsw.gov.au` | ArcGIS Portal | Biodiversity GIS |
| Camden Council | `opendata.camden.nsw.gov.au` | ArcGIS Portal | Open data portal |
| Campbelltown City | `opendata.campbelltown.nsw.gov.au` | ArcGIS Portal | Open datasets |
| Cobar Council | `opendata.cobar.nsw.gov.au` | - | Environmental data |
| Cumberland Council | `opendata.cumberland.nsw.gov.au` | ArcGIS Portal | Green spaces |
| Fairfield City | `opendata.fairfield.nsw.gov.au` | ArcGIS Portal | Environment GIS |
| Gosford City | `opendata.gosford.nsw.gov.au` | ArcGIS Portal | Open data |
| Hawkesbury City | `opendata.hawkesbury.nsw.gov.au` | ArcGIS Portal | Green network datasets |
| Hornsby Shire | `opendata.hornsby.nsw.gov.au` | ArcGIS Portal | GIS data portal |
| Hunters Hill Council | `opendata.huntershill.nsw.gov.au` | ArcGIS Portal | Conservation GIS |
| Kambah Council | `opendata.kambah.nsw.gov.au` | ArcGIS Portal | Environmental data |
| Ku-ring-gai Council | `opendata.ku-ring-gai.nsw.gov.au` | ArcGIS Portal | Parks GIS |
| Lane Cove Council | `opendata.lanecove.nsw.gov.au` | ArcGIS Portal | Environment GIS |
| Leichhardt Council | `opendata.leichhardt.nsw.gov.au` | ArcGIS Portal | Green spaces |
| Liverpool City | `opendata.liverpool.nsw.gov.au` | ArcGIS Portal | Open datasets |
| Mosman Council | `opendata.mosman.nsw.gov.au` | ArcGIS Portal | Environmental GIS |
| North Sydney Council | `opendata.northsydney.nsw.gov.au` | ArcGIS Portal | Coastline & trees |
| Parramatta City | `opendata.parramatta.nsw.gov.au` | ArcGIS Portal | Open data portal |
| Canada Bay Council | `opendata.canadabay.nsw.gov.au` | ArcGIS Portal | Environment GIS |
| Penrith City | `opendata.penrith.nsw.gov.au` | ArcGIS Portal | GIS data |
| Rockdale City | `opendata.rockdale.nsw.gov.au` | ArcGIS Portal | Environmental data |
| Randwick City | `opendata.randwick.nsw.gov.au` | ArcGIS Portal | Coastal & parks |
| Canada Bay Council | `opendata.canadabay.nsw.gov.au` | - | (duplicate) |
| Strathfield Council | `opendata.strathfield.nsw.gov.au` | ArcGIS Portal | Environment GIS |
| Sutherland Shire | `opendata.sutherlandshire.nsw.gov.au` | ArcGIS Portal | Open data portal |
| Sydney City | `opendata.sydney.nsw.gov.au` | ArcGIS Portal (cNVyNtjGVZybOQWZ) - BASELINE
| Waverley Council | `opendata.waverley.nsw.gov.au` | ArcGIS Portal | Environmental GIS |
| Canada Bay Council | `opendata.canadabay.nsw.gov.au` | - | (duplicate) |
| Whitehaven | `opendata.whitehaven.nsw.gov.au` | ArcGIS Portal | Environmental data |
| Willoughby City | `opendata.willoughby.nsw.gov.au` | ArcGIS Portal | GIS data portal |
| Woollahra Council | `opendata.woollahra.nsw.gov.au` | ArcGIS Portal | Environment GIS |

---

## 🚇 3. Public Transport Data

### 3.1 GTFS Stop Locations (Already Available)
- **Location:** `public/data/public-transports.json`
- **Status:** 1,164 TfNSW GTFS stops ready
- **Format:** Flat array of stop objects
- **Action Required:** Convert to FeatureCollection GeoJSON

### 3.2 GTFS Routes / Bus Lines (Sprint 4)
- **Source:** TRANSTOP (Transport for NSW Data Portal)
- **Format:** GTFS Standard (f=t=public-transport)
- **Required Files:**
  - `routes.txt` — bus route definitions
  - `agency.txt` — transport agencies
  - Transfer data if available
- **Download URL:**
  - `https://transportnsw.info/data/gtfs-publictransport.zip`
- **Save Location:** `public/data/public-transports/routes/`

### 3.3 Transport Line Infrastructure (Optional)
- **Sources:**
  - TfNSW Tracks & Lines Open Data Portal
  - NSW Government Infrastructure GIS
- **Format:** MultiLineString GeoJSON
- **Purpose:** Spatial analysis of transport corridors

---

## 🏛️ 4. Council Park Facility Data

### 4.1 Park Feature Data (ArcGIS)
- **Format:** FeatureCollection (ESRI Shapefile preferred)
- **Sources:**
  - **ArcGIS Service Catalog:**
    - Use council org ID to find parks layer
    - Example: `<org-url>/sharing/rest/content/items/<item-id>/data?f=geojson`
  - **Council Parks Web Suites:**
    - NSW Environmental Planning web portals
  - **Transport for NSW Parks Portal:**
    - References for municipal parks locations
- **Required Attributes (minimum):**
  - `properties.ID` or `properties.ParkID`
  - `properties.Name` or `properties.ParkName`
  - `properties.Category` (e.g., "Sports Park", "Reserve")
  - `properties.Size` (hectares)
  - `properties.StreetAddress`
  - `geometry` (point or polygon)

### 4.2 Park Amenities/Features
- **Format:** FeatureCollection (optional)
- **Data Types:**
  - Playground facilities
  - Sports fields (pitches)
  - BBQ areas
  - Picnic tables
  - Parking facilities
  - Disability access points
- **Sources:** Same as above parks layer, specialized feature sub-layers

**Councils to Source First:**
1. **City of Sydney (Base POC)** — Already have ArcGIS endpoint (`cNVyNtjGVZybOQWZ`)
2. **Parramatta City** — Major urban hub
3. **Liverpool City** — Major council with rich open data
4. **Blacktown City** — Large population, accessible data portals

---

## 🚧 5. State Government Data Cross-Reference

### 5.1 NSW Government Open Data Catalog
- **URL:** `https://data.nsw.gov.au/story/our-open-data-guide`
- **Key Datasets:**
  - Government House trails
  - Parks and conservation estate
  - Corridor-based assessments
  - Environment and heritage resources

### 5.2 NPWS (National Parks & Wildlife Service)
- **URL:** `https://journey.nsw.gov.au/discover-states-parks/national-parks`
- **Data Types:**
  - National parks polygons
  - Walking trails
  - Conservation reserves
- **Format:** Shapefile or GeoJSON

### 5.3 Transport for NSW Open Data
- **URL:** `https://transportnsw.info/data/gtfs-publictransport`
- **Data Types:**
  - Bus routes, trains, ferries, light rail
  - Station locations
  - Transport network infrastructure
- **Format:** GTFS standard

---

## 🗺️ 6. Administrative Area Hierarchies

### 6.1 LG Areas by Region
- **Setup:** Group councils into regions (e.g., "Inner West Sydney", "Western Sydney")
- **Possible Sources:**
  - ABS (Australian Bureau of Statistics) regional data
  - SmartGrowth NSW regional groupings
  - Published regional cluster maps

### 6.2 LGA Name Mapping
- **Goal:** Map council names to unique identifiers for filtering
- **Example Mapping:**
  ```json
  {
    "City of Sydney": "cNVyNtjGVZybOQWZ",
    "Inner West Council": "dp2UIID5MUpTUFVA",
    "Parramatta City": "np-parramatta-id",
    ...
  }
  ```

---

## 📋 7. Data Processing Scripts Required

### 7.1 Manual Script Execution (non-sandbox)
These scripts must be run on a machine with network access:

- **`scripts/fetch-inner-west.mjs`**
  - Function: ArcGIS service discovery for Inner West Council
  - Requirement: Network access to council ArcGIS Enterprise/org
  - Output: `org-dp2UIID5MUpTUFVA-services.txt`

- **`node artifacts/park-pulse/scripts/shard-trees.mjs 10`**
  - Function: Shard 10×10 grid of merged tree data
  - Requirement: Multi-council tree GeoJSON in place of 48,999 City of Sydney trees
  - Input: `public/data/trees.geojson` (all councils merged)
  - Output: 100 shards in `public/data/trees/tile-{z}-{x}-y.{format}` pattern

### 7.2 Conversion Scripts (Temp Files)
- **`scripts/convert-tfns-to-geojson.mjs`**
  - Input: `public/data/public-transports.json` (flat array)
  - Output: FeatureCollection GeoJSON

- **`scripts/fetch-tfns-routes.mjs`** (Sprint 4)
  - Input: `public/data/public-transports/` directory with GTFS routes
  - Output: Bus route GeoJSON layer
  - Requirement: Network access to Transport for NSW

---

## 📦 8. Project Structure for Data Storage

```
public/data/
├── boundaries/                     # LGA polygon boundaries
│   ├── bayside-council.geojson
│   ├── blacktown-city.geojson
│   ├── bankstown-city.geojson
│   └── ...
├── trees/                          # Community tree data
│   ├── manifest.json               # Shard manifest (10×10 grid)
│   ├── overlay.geojson             # City of Sydney overlay (baseline)
│   └── tile-{z}-{x}-{y}.{format}   # Sharded tiles (after merge)
├── public-transports/              # GTFS transport data
│   ├── routes/
│   │   ├── routes.txt
│   │   └── ...
│   ├── stops.geojson               # Converted GTFS stops
│   └── bus-lines.geojson           # Sprint 4 bus routes
├── parks/                          # Park facility data
│   ├── city-of-sydney.geojson
│   ├── parramatta-city.geojson
│   └── ...
└── overlay/                        # Multi-layer aggregate data
    ├── trees-merged-overview.geojson
    └── parks-merged-overview.geojson
```

---

## 🎯 Prioritization for Next Steps

### Immediate (Sprint 2 - Weeks 3-4)
1. ✓ City of Sydney baseline confirmed
2. ✗ Multi-council tree data acquisition
3. ✗ ArcGIS service discovery valid org ID(s)
4. ✗ LGA boundary polygons library
5. ⬜ Multi-council park data acquisition (City of Sydney & 1-2 baselines)
6. ⬜ Council name → ArcGIS Org ID mapping

### Sprint 3 (Weeks 5-6)
7. ⬜ Council tree data for 3-5 additional LGAs (baseline council + major hubs)
8. ⬜ LGA boundary polygons for expanded council set
9. ⬜ Council park data for 3-5 LGAs

### Sprint 4 (Weeks 7-8)
10. ⬜ GTFS routes download (TRANSTOP)
11. ⬜ Convert GTFS stops to FeatureCollection GeoJSON
12. ⬜ Bus route spatial analysis setup

### Sprint 5 (Weeks 9-10)
13. ⬜ Tree/shard merge and 10×10 sharding execution
14. ⬜ Multi-source tree data validation
15. ⬜ Council transport layer expansion (bus stops + lines)

### Sprint 6 (Weeks 11-12)
16. ⬜ Full connectivity analysis
17. ⬜ 38+ LGA data consolidation
18. ⬜ Regional cluster mapping
19. ⬜ Final validation and documentation

---

## 📞 Data Collection Contacts/Known Sources

### NSW / Sydney-Specific
- **Transport for NSW Open Data Portal:** `https://transportnsw.info/data/gtfs-publictransport`
- **NSW Government Data Catalog:** `https://data.nsw.gov.au`
- **ArcGIS Online:** `https://www.arcgis.com/home/index.html` (search "council NSW park data")

### Research Approach for Each Council
1. Search the council domain for "opendata", "gis", "datasets", "environment"
2. Check if ArcGIS Portal link is in footer: `https://{council-name}.maps.arcgis.com`
3. Visit `opendata.{council-name}.nsw.gov.au` as primary data portal
4. Email council GIS/data team if official data portal is unknown
5. Download in GeoJSON or Shapefile format for compatibility

---

## ⚠️ Critical Notes

- **Network Constraints:** All fetch scripts (fetch-*.mjs) must run on a machine with active internet connection. Sandbox environment blocks outbound network.
- **Coordination:** If any council restricts data access, identify an alternative LGA with accessible ArcGIS data as the next POC target.
- **Schema Consistency:** All GeoJSON files should use `FeatureCollection` format with consistent property naming conventions (prioritize `properties.X` → map rename later if needed).
- **Quality Control:** Each exported council dataset should include a metadata JSON file with:
  - `"council_name": "..."`
  - `"data_source_url": "..."`
  - `"download_date": "YYYY-MM-DD"`
  - `"record_count": 12345`
  - `"source_data_license": "..."`
  - `"geometry_srid": 4326`

---

**Last Updated:** 2026-10-13
**Prepared By:** ParkPulse Scout
**Document Version:** 1.0