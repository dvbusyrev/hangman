# Примерь жизнь в Арктике

Технический прототип первого RAD-витка MVP.

Сейчас реализован только первый вертикальный сценарий:

1. стартовый экран;
2. выбор профессии и опыта;
3. переход к Cesium-карте;
4. отображение 4 арктических регионов из OSM GeoJSON;
5. выбор Мурманской области;
6. flyTo к региону;
7. выбор Мурманска;
8. flyTo к городу;
9. загрузка нескольких экструдированных mock-зданий.

Следующие витки пока не реализованы намеренно: scroll-route, карточки работы/недвижимости, timeline, природа и бонусы.

## Запуск

```bash
npm install
npm run dev
```

После запуска откройте URL, который покажет Vite. Обычно это:

```text
http://127.0.0.1:5173/
```

Для работы Cesium нужен браузер с включенным WebGL. Если Cesium не появляется, сначала проверьте страницу в обычном desktop-браузере, а не в headless-режиме.

## Проверяемый сценарий

1. На стартовом экране выбрать профессию, например `Программист`.
2. Выбрать опыт работы.
3. Нажать `Начать`.
4. На карте выбрать `Мурманская область`.
5. После приближения выбрать `Мурманск`.
6. Дождаться перехода в городскую сцену.
7. Проверить, что видны mock-здания и в боковой панели перечислены `building-001`, `building-002`, `building-003` и другие.

## Где лежат данные

Основные сценарии городов и камер:

```text
public/data/scenarios.json
```

OSM-геометрия России и арктических регионов:

```text
public/data/russia-boundary.geojson
public/data/regions.geojson
```

Mock-здания:

```text
public/data/murmansk-buildings.geojson
public/data/anadyr-buildings.geojson
```

Чтобы заменить mock-здания на настоящий OSM GeoJSON, сохраните новый GeoJSON в `public/data/` и поменяйте `buildingsUrl` у нужного города в `public/data/scenarios.json`.

Важно сохранить стабильные id зданий в свойствах:

```json
{
  "buildingId": "building-001",
  "height": 46
}
```

`buildingId` потом будет использоваться для привязки вакансий, аренды и покупки.

## OSM-границы

Контур России и границы 4 арктических регионов выгружаются из OpenStreetMap через Nominatim:

```bash
npm run data:osm-boundaries
```

Результат:

```text
public/data/russia-boundary.geojson
public/data/regions.geojson
```

В `regions.geojson` сохраняются те же `regionId`, которые использует приложение: `murmansk`, `nenets`, `chukotka`, `yakutia`.

Для GIS-обмена можно дополнительно собрать shapefile-архивы:

```bash
npm run data:shapes
```

Результат:

```text
data/osm-boundaries/russia-boundary-shapefile.zip
data/osm-boundaries/arctic-regions-shapefile.zip
```

Для экспорта shapefile нужен установленный `ogr2ogr`.

## Команды

```bash
npm run dev
npm run build
npm run data:osm-boundaries
npm run data:shapes
```

`npm run build` также копирует локальные ассеты Cesium в `public/cesium`. Эта папка не коммитится.
