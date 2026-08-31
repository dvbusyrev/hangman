export async function loadJson(url) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }

  return response.json();
}

export async function loadText(url) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }

  return response.text();
}

export async function loadCsv(url) {
  return parseCsv(await loadText(url));
}

/**
 * Small CSV parser for editable project data.
 * - accepts UTF-8 BOM;
 * - auto-detects semicolon/comma/tab separator;
 * - supports quoted values and escaped quotes;
 * - returns objects keyed by the first row.
 */
export function parseCsv(text) {
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      cell = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  if (!rows.length) return [];

  const headers = rows[0].map((header) => normalizeHeader(header));
  return rows.slice(1).map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? ""])
  ));
}

export async function loadCsvPrototypeData() {
  const [professionRows, vacancyRows, rentRows, saleRows] = await Promise.all([
    loadCsv("/data/professions.csv"),
    loadCsv("/data/vacancies.csv"),
    loadCsv("/data/rent.csv"),
    loadCsv("/data/sale.csv")
  ]);

  const professions = [...new Set(professionRows
    .map((row) => String(row.name || row.profession || "").trim())
    .filter(Boolean))];

  const work = vacancyRows
    .filter((row) => row.city_id && row.profession)
    .map((row, index) => {
      const salaryFrom = numberOrNull(row.salary_from || row.salary);
      const salaryTo = numberOrNull(row.salary_to || row.salary);
      const salary = midpoint(salaryFrom, salaryTo);
      return {
        id: row.id || `csv-work-${index + 1}`,
        cityId: row.city_id,
        buildingId: row.building_id || null,
        kind: "work",
        profession: row.profession,
        position: row.position || row.profession,
        company: row.company || "Работодатель",
        salary,
        salaryFrom,
        salaryTo,
        minExperience: numberOrZero(row.min_experience),
        source: row.source || null
      };
    });

  const rent = rentRows
    .filter((row) => row.city_id)
    .map((row, index) => ({
      id: row.id || `csv-rent-${index + 1}`,
      cityId: row.city_id,
      buildingId: row.building_id || null,
      kind: "rent",
      address: row.address || "Адрес не указан",
      area: numberOrZero(row.area),
      price: numberOrZero(row.price),
      rooms: numberOrNull(row.rooms),
      source: row.source || null
    }));

  const sale = saleRows
    .filter((row) => row.city_id)
    .map((row, index) => ({
      id: row.id || `csv-sale-${index + 1}`,
      cityId: row.city_id,
      buildingId: row.building_id || null,
      kind: "sale",
      address: row.address || "Адрес не указан",
      area: numberOrZero(row.area),
      price: numberOrZero(row.price),
      rooms: numberOrNull(row.rooms),
      source: row.source || null
    }));

  return { professions, offers: [...work, ...rent, ...sale] };
}

function detectDelimiter(firstLine) {
  const candidates = [";", ",", "\t"];
  return candidates
    .map((delimiter) => ({ delimiter, count: countOutsideQuotes(firstLine, delimiter) }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ";";
}

function countOutsideQuotes(line, delimiter) {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') quoted = !quoted;
    else if (!quoted && line[index] === delimiter) count += 1;
  }
  return count;
}

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("en-US")
    .replaceAll(" ", "_")
    .replaceAll("-", "_");
}

function numberOrZero(value) {
  return numberOrNull(value) ?? 0;
}

function numberOrNull(value) {
  const normalized = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function midpoint(from, to) {
  if (from != null && to != null) return Math.round((from + to) / 2);
  return from ?? to ?? 0;
}
