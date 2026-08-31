# Примерь жизнь в Арктике — offline + CSV + random road walk

Vite + vanilla JavaScript + CesiumJS.

This version is designed so the **presentation runtime does not need internet access**.

Runtime reads only local files:

- local Cesium JS/assets;
- local Russia/region/city GeoJSON;
- local OSM building footprints;
- local OSM public roads;
- local OSM road network (the walking route is generated randomly in the browser);
- local CSV with professions, vacancies and real estate;
- local JSON with nature/benefits/scenarios.

There are **no runtime calls to OSM tiles, Nominatim or Overpass**.

## 1. Prepare once while internet is available

```bash
npm install
npm run offline:sync
```

`offline:sync`:

1. copies Cesium browser assets locally;
2. downloads region boundaries to local GeoJSON;
3. downloads real OSM buildings and public roads for prepared cities;
4. stores the local OSM road network (a compatibility route file is also exported);
5. verifies all files required for offline use.

Generated city files look like:

```text
public/data/murmansk-buildings.geojson
public/data/murmansk-roads.geojson
public/data/murmansk-route.json

public/data/anadyr-buildings.geojson
public/data/anadyr-roads.geojson
public/data/anadyr-route.json
...
```

## 2. Verify offline readiness

```bash
npm run offline:check
```

The command exits with an error and lists missing files if something is not ready.

## 3. Development / presentation on the same prepared laptop

Internet can now be disabled:

```bash
npm run dev
```

The browser uses local data only.

## 4. Optional: make a presentation build

While the project is prepared:

```bash
npm run offline:build
```

This creates `dist/` with all local Cesium/data assets.

Then it can be served without Vite/network requests using the built-in Node server:

```bash
npm run offline:serve
```

Open:

```text
http://127.0.0.1:4173
```

## CSV instead of a database

The data team can edit ordinary UTF-8 CSV files in `public/data/`:

```text
professions.csv   — profession autocomplete list
vacancies.csv     — jobs/salaries/experience
rent.csv          — rental offers
sale.csv          — purchase offers
```

The frontend parses them directly at startup. PostgreSQL/backend/import is not required for the MVP.

Recommended Excel format: **CSV UTF-8**, separator `;`.

Detailed columns and examples: `public/data/CSV_FORMAT.md`.

### Vacancies example

```csv
id;city_id;building_id;profession;position;company;salary_from;salary_to;min_experience;source
m-work-1;murmansk-city;;Программист;Java-разработчик;Арктик Софт;145000;165000;2;
```

`building_id` may be empty. When the 3D city opens, the row is randomly assigned to a real OSM building near the generated walk. A real `osm-way-*` id can still be supplied to pin a card to a specific building.

### Real estate example

```csv
id;city_id;building_id;address;area;price;rooms;source
m-rent-1;murmansk-city;;просп. Ленина, 64;42;32000;1;
```

After editing CSV during development, simply refresh the browser.

## Random walk in the 3D city

Each time a city scene opens:

- the app picks a random point on the largest connected local OSM public-road network;
- a road walk is generated in both directions from that spawn point;
- at intersections the next street is selected randomly, while immediate U-turns/tiny loops are avoided when alternatives exist;
- the mouse wheel moves forward/backward along that generated walk;
- available CSV job/real-estate records are randomly attached to real OSM houses near the walk;
- houses with a card are highlighted by type;
- when the camera comes close to a highlighted house, its card opens automatically;
- clicking the highlighted house also opens the card.

The browser still makes no network calls during the presentation. The randomness uses only already-downloaded local roads/buildings.

## Time simulation

The app still uses the prototype rule:

- effective experience = current experience + selected horizon (1/3/5 years);
- available jobs are filtered by `min_experience`;
- average available salary is calculated from the matching vacancies;
- rental budget = 30% of average salary;
- conditional purchase budget = average salary × 60.

These are scenario assumptions for the MVP, not a financial forecast.

## OSM

OSM data is downloaded only during the explicit preparation command and stored locally for the demo.

© OpenStreetMap contributors, ODbL.
