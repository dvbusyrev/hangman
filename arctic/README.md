# Примерь жизнь в Арктике

Vite + vanilla JavaScript + CesiumJS.

Технический MVP-прототип: лендинг с заголовком, окно игры, выбор региона/города, Cesium-сцена города, движение по дороге, карточки вакансий и недвижимости, экраны природы и бонусов.

## Быстрый запуск

```bash
npm install
npm run dev
```

Vite выведет локальный адрес, обычно:

```text
http://127.0.0.1:5173
```

Если порт занят, Vite выберет следующий свободный порт.

## Проверка сборки

```bash
npm run build
```

Команда также копирует локальные Cesium assets в `public/cesium`.

## Данные

Основные данные лежат в `public/data/`:

```text
regions.geojson              — границы арктических регионов
russia-boundary.geojson      — контур России
cities.geojson               — точки городов
*-buildings.geojson          — локальные OSM-здания
*-roads.geojson              — локальные OSM-дороги
*-context.geojson            — локальная OSM-подложка города
scenarios.json               — конфигурация регионов и городов
config.json                  — настройки карты, маршрута и домов
professions.csv              — список профессий
vacancies.csv                — вакансии
rent.csv                     — аренда
sale.csv                     — покупка
nature.json                  — экран природы
benefits.json                — экран бонусов
```

CSV-файлы можно править вручную и обновлять страницу в браузере. Формат описан в `public/data/CSV_FORMAT.md`.

## Offline-режим

Для полной офлайн-подготовки:

```bash
npm install
npm run offline:sync
npm run offline:check
```

После этого приложение можно запускать через `npm run dev` или собирать через `npm run offline:build`. Сами GeoJSON/CSV читаются локально. В городе по умолчанию используется кастомная подложка из локальных `*-roads.geojson` и `*-buildings.geojson`; стандартные OSM-тайлы там выключены, чтобы дороги читались в едином стиле. Дороги дополнительно рисуются своим лёгким Cesium-слоем из того же GeoJSON. Для строго офлайн-показа карты регионов можно дополнительно отключить онлайн-тайлы:

```json
{
  "map": { "onlineOsm": false }
}
```

`offline:sync` копирует Cesium assets, выгружает границы регионов, OSM-дома, OSM-дороги и проверяет наличие файлов для подготовленных городов.

Стиль 3D-дорог настраивается в `public/data/config.json` в блоке `roads`: `casingColor`, `fillColor`, `majorFillColor`, `serviceFillColor`, `casingExtraWidth`, `widthScale` и `widths`. По умолчанию дороги прижаты к земле через `clampToGround`, поэтому 3D-дома должны закрывать дорожный слой, а не наоборот.

## Сборка для показа

После подготовки данных:

```bash
npm run offline:build
```

Команда создаёт `dist/` с локальными Cesium/data assets.

Затем билд можно поднять без Vite:

```bash
npm run offline:serve
```

Open:

```text
http://127.0.0.1:4173
```

## CSV вместо базы

Данные можно править в обычных UTF-8 CSV-файлах в `public/data/`:

```text
professions.csv   — profession autocomplete list
vacancies.csv     — jobs/salaries/experience
rent.csv          — rental offers
sale.csv          — purchase offers
```

Frontend читает их напрямую при старте. PostgreSQL/backend/import для MVP не нужны.

Рекомендуемый формат Excel: **CSV UTF-8**, разделитель `;`.

Колонки и примеры: `public/data/CSV_FORMAT.md`.

### Vacancies example

```csv
id;city_id;building_id;profession;position;company;salary_from;salary_to;min_experience;source
m-work-1;murmansk-city;;Программист;Java-разработчик;Арктик Софт;145000;165000;2;
```

`building_id` можно оставить пустым. Когда открывается 3D-город, строка привязывается к реальному OSM-дому рядом с маршрутом. Реальный `osm-way-*` id можно указать вручную, если карточку нужно закрепить за конкретным зданием.

### Real estate example

```csv
id;city_id;building_id;address;area;price;rooms;source
m-rent-1;murmansk-city;;просп. Ленина, 64;42;32000;1;
```

После правки CSV в режиме разработки достаточно обновить страницу.

## Маршрут в 3D-городе

При каждом открытии города:

- the app picks a random point near the configured city camera on the largest connected local OSM public-road network;
- the route controller uses the full local OSM road graph and keeps only the currently visited path in memory;
- `ArrowUp` / `ArrowDown` move forward and backward along the road;
- at branching road nodes the next street is chosen randomly from the OSM graph;
- the mouse wheel moves forward/backward along that generated walk;
- available CSV job/real-estate records are randomly attached to real OSM houses near the walk;
- only the nearest configured amount of 3D houses is rendered for performance;
- houses with a card are highlighted by type;
- when the camera comes close to a highlighted house, its card opens automatically;
- clicking the highlighted house also opens the card.

## Симуляция времени

Используется прототипное правило:

- selected horizon: `Сейчас`, `1 год`, `3 года`, `5 лет`;
- effective experience = current experience + selected horizon;
- available jobs are filtered by `min_experience`;
- average available salary is calculated from the matching vacancies;
- housing budget = 40% of average salary;
- rent is visible when monthly rent is within that budget;
- purchase is visible when the simplified monthly equivalent `price / 240` is within that budget.

Это сценарные допущения для MVP, не финансовый прогноз.

## OSM

OSM data is downloaded only during the explicit preparation command and stored locally for the demo.

© OpenStreetMap contributors, ODbL.
