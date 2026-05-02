# 🌿 Park Pulse

> Discover Sydney's parks, dog parks, playgrounds, and green spaces — all in one interactive map.

Park Pulse is a fast, mobile-friendly web app that aggregates open government data from the NSW Government, City of Sydney, and National Parks & Wildlife Service into a single explorer. Filter by park type, find off-leash dog areas, locate NPWS facilities, search by suburb, and get directions — all without an account or app install.

---

## Features

- **Interactive map** — 2,000+ parks rendered with viewport culling for smooth performance
- **5 visual themes** — Light, Dark, Nature, Satellite, and Contrast; persisted across sessions
- **Dog parks layer** — 29 off-leash areas with hours, restrictions, and descriptions
- **NPWS facilities layer** — 1,795 clustered BBQs, shelters, picnic tables, and playgrounds from National Parks & Wildlife Service
- **Quick filter pills** — instantly show playgrounds, sports parks, drinking fountains, toilets, and public transport nearby
- **Debounced search** — type a suburb or park name; falls back to geocoding via OpenStreetMap if no local match is found
- **Locate Me** — one-tap GPS location with the 20 nearest parks highlighted
- **Recently viewed parks** — last 5 parks you opened, remembered across sessions
- **Share button** — copies a direct link to any park
- **URL-synced filters** — every filter and search state is reflected in the URL for easy sharing
- **Toast notifications** — non-intrusive feedback for copy, GPS, and error events
- **Themed footer & navbar** — every UI element adapts to the active theme
- **Mobile optimised** — 44 px touch targets, reduced-motion support, GPU-accelerated transitions

---

## Screenshots

| Home | Explore | Dark Theme |
|------|---------|------------|
| ![Home page](.github/screenshots/home.png) | ![Explore map](.github/screenshots/explore.png) | ![Dark theme](.github/screenshots/dark.png) |

> Add your own screenshots to `.github/screenshots/` to populate this section.

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI framework | React 19 |
| Build tool | Vite 7 |
| Language | TypeScript |
| Routing | Wouter |
| Maps | Leaflet.js + leaflet.markercluster |
| Styling | Tailwind CSS v4 |
| Map tiles | CARTO / OpenStreetMap |
| Geocoding | Nominatim (OpenStreetMap) |
| Data | NSW Open Government datasets (GeoJSON / JSON) |

---

## Data Sources

| Dataset | Source |
|---|---|
| City of Sydney Parks | [City of Sydney Open Data](https://data.cityofsydney.nsw.gov.au/datasets/cityofsydney::parks-1) |
| Blacktown City Parks | [Blacktown City Council](https://www.blacktown.nsw.gov.au/) |
| NPWS Facilities | [SEED NSW](https://datasets.seed.nsw.gov.au/) |
| Off-Leash Dog Parks | [City of Sydney Open Data](https://data.cityofsydney.nsw.gov.au/) |
| Drinking Fountains | [City of Sydney Open Data](https://data.cityofsydney.nsw.gov.au/) |
| Public Transport Stops | [Transport for NSW Open Data](https://opendata.transport.nsw.gov.au/) |
| Toilets | [NSW Open Data Portal](https://data.nsw.gov.au/) |

All datasets are open government data published under Creative Commons or similar licences.

---

## Running Locally

### Option A — Pre-built static files (no Node required*)

Download `park-pulse-static.zip` from the [Releases](../../releases) page, unzip it, then:

```bash
# Using Node (recommended — handles all routes correctly)
npx serve -s .

# Using Python
python3 -m http.server 3000
```

Open **http://localhost:3000** in your browser.

> *`npx` requires Node.js. Download it free from [nodejs.org](https://nodejs.org).  
> With the Python option, always start from the root URL and use the in-app navigation — direct deep links (e.g. `/explore`) won't resolve.

---

### Option B — Development server (full source)

**Prerequisites:** [Node.js](https://nodejs.org) and [pnpm](https://pnpm.io)

```bash
# 1. Clone the repo
git clone https://github.com/your-username/park-pulse.git
cd park-pulse

# 2. Install dependencies
pnpm install

# 3. Start the dev server
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/park-pulse run dev
```

Open **http://localhost:3000**.

---

### Option C — Production build from source

```bash
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/park-pulse run build
```

Output lands in `artifacts/park-pulse/dist/public/`. Serve that folder with any static file host.

---

## Project Structure

```
artifacts/park-pulse/
├── public/
│   ├── data/                  # All GeoJSON & JSON datasets (bundled, offline)
│   │   ├── Parks.geojson
│   │   ├── Dog_off-leash_parks.geojson
│   │   ├── npws-facilities-greater-sydney.geojson
│   │   └── ...
│   └── favicon.svg
└── src/
    ├── components/            # Navbar, Footer, ParkModal, ToastProvider
    ├── context/               # ToastContext
    ├── hooks/                 # useTheme
    ├── pages/                 # Home, Explore, About
    └── index.css              # Design tokens, 5 themes, utility classes
```

---

## Internet Requirement

An active internet connection is needed for:

- **Map tiles** — rendered by CARTO and OpenStreetMap
- **Geocoding fallback** — suburb/place search via Nominatim

All park data (2,000+ parks, facilities, dog parks, fountains, toilets, transport stops) is bundled locally and works offline once the page has loaded.

---

## Licence

This project is open source under the [MIT Licence](LICENSE).

Park data is sourced from open government datasets and remains subject to their respective licences (Creative Commons Attribution).

---

## Acknowledgements

Built with open data from the **NSW Government**, **City of Sydney**, **Blacktown City Council**, **National Parks & Wildlife Service**, and **Transport for NSW**.

Map tiles by [CARTO](https://carto.com) and [OpenStreetMap](https://www.openstreetmap.org) contributors.
