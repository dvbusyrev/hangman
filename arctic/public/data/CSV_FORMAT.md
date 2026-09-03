# CSV data format

The browser reads these files directly at startup. Save CSV as **UTF-8**. Semicolon (`;`) is recommended for Excel in the Russian locale, but comma and tab separators are also accepted.

## professions.csv

Columns:

- `name` — profession shown in the autocomplete field.

Example:

```csv
name
Программист
Инженер
Врач
```

## vacancies.csv

Columns:

- `id` — optional unique row id.
- `city_id` — required ready city id from `scenarios.json`. The current demo contains two cities in each of the nine regions.
- `building_id` — optional. If blank, the app randomly binds the row to a real OSM building close to the current random road walk. To pin a record manually, use a real `osm-way-*` building id.
- `profession` — must match a name from `professions.csv`.
- `position` — vacancy title.
- `company` — employer.
- `salary_from` — salary from, ₽/month.
- `salary_to` — salary to, ₽/month.
- `min_experience` — minimum required experience in years (number, e.g. `0`, `1`, `2.5`, `4`).
- `source` — optional source/reference text.

## rent.csv

Columns:

- `id` — optional.
- `city_id` — required.
- `building_id` — optional; blank = random automatic binding to a real OSM building close to the current road walk.
- `address` — display address.
- `area` — m².
- `price` — ₽/month.
- `rooms` — optional.
- `source` — optional.

## sale.csv

Same as rent.csv, but `price` is the full purchase price in ₽.

## Important

The OSM geometry and the commercial/job records are separate datasets. In the MVP, a CSV record is attached to one of the real OSM building footprints near the generated road walk. If `building_id` is left blank, the application chooses a suitable building randomly when the 3D city scene opens. Houses with attached cards are highlighted; the card opens automatically when the camera approaches the house.

After changing a CSV file during development, refresh the browser page. No database import is required.

Cities with `dataSource: "mock"` use the small local demo GeoJSON files and are translated to the
coordinates declared in `scenarios.json`. They are intended for quick UI and scenario testing;
the ready OSM cities continue to use their own downloaded building and road exports.
