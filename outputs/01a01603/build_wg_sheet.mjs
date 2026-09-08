import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const remoteScript = String.raw`
const db = new Database('/fredy/db/listings.db', { readonly: true });
const rows = db.prepare(` + "`" + `
  SELECT id, created_at, title, price, size, rooms, address, description, link
  FROM listings
  WHERE provider = 'wgGesucht' AND is_active = 1 AND manually_deleted = 0
  ORDER BY created_at DESC, id
` + "`" + `).all();
const activeAll = db.prepare('SELECT count(*) AS count FROM listings WHERE is_active = 1 AND manually_deleted = 0').get().count;
process.stdout.write(JSON.stringify({ activeAll, rows }));
db.close();
`;

const encodedRemoteScript = Buffer.from(remoteScript, "utf8").toString("base64");
const raw = execFileSync(
  "ssh",
  [
    "-o",
    "BatchMode=yes",
    "root@152.53.101.9",
    `docker exec fredy node --input-type=module -e "const Database=(await import('better-sqlite3')).default; eval(Buffer.from('${encodedRemoteScript}','base64').toString())"`,
  ],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
const snapshot = JSON.parse(raw);
const sourceRows = snapshot.rows;

const tidy = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
const canonicalLink = (value) => {
  try {
    const url = new URL(value);
    const assetId = url.searchParams.get("asset_id");
    if (assetId) return `wg-gesucht:${assetId}`;
    url.search = "";
    url.hash = "";
    return url.href.replace(/\/$/, "").toLowerCase();
  } catch {
    return tidy(value);
  }
};

const explicitCommercial = /\b(?:immobilienmakler(?:in)?|maklerbüro|maklercourtage|gewerbliche[rsn]?\s+anbieter|gewerblich\s+(?:vermietet|angeboten)|hausverwaltung|immobilienverwaltung|vermietungsagentur|rental\s+agency|property\s+management|vermittlungsgebühr|verwaltungsgebühr|booking\s+fee|service\s+fee|housinganywhere|wunderflats|homelike|habyt|spotahome|uniplaces|flatio|coming\s+home|crocodilian|rentberry)\b/i;

const descriptionLinks = new Map();
for (const row of sourceRows) {
  const description = tidy(row.description);
  if (description.length < 120) continue;
  if (!descriptionLinks.has(description)) descriptionLinks.set(description, new Set());
  descriptionLinks.get(description).add(canonicalLink(row.link));
}
const templatedCommercialDescriptions = new Set(
  [...descriptionLinks.entries()].filter(([, links]) => links.size >= 3).map(([description]) => description),
);

function parseYear(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 2026;
  return n < 100 ? 2000 + n : n;
}

function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

function dateRangeUnderMonth(text) {
  const patterns = [
    /\b(\d{1,2})[.\/]\s*(\d{1,2})(?:[.\/]\s*(\d{2,4}))?\.?\s*(?:-|–|—|bis|to|until|till)\s*(\d{1,2})[.\/]\s*(\d{1,2})(?:[.\/]\s*(\d{2,4}))?\.?/gi,
    /\b(?:vom|von|from)?\s*(\d{1,2})[.\/]\s*(\d{1,2})(?:[.\/]\s*(\d{2,4}))?\.?\s*(?:bis|to|until|till|-|–|—)\s*(\d{1,2})[.\/]\s*(\d{1,2})(?:[.\/]\s*(\d{2,4}))?\.?/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      let startYear = parseYear(match[3] ?? match[6]);
      let endYear = parseYear(match[6] ?? match[3]);
      let start = validDate(startYear, Number(match[2]), Number(match[1]));
      let end = validDate(endYear, Number(match[5]), Number(match[4]));
      if (!start || !end) continue;
      if (end < start && match[6] == null) {
        endYear += 1;
        end = validDate(endYear, Number(match[5]), Number(match[4]));
      }
      if (!end) continue;
      const days = Math.round((end - start) / 86400000);
      if (days >= 0 && days < 30) return true;
    }
  }
  return false;
}

function explicitlyUnderMonth(row) {
  const title = String(row.title ?? "");
  const text = `${title} ${String(row.description ?? "")}`;
  const duration = /\b(?:for|für|nur|only|minimum|min\.?|mindestens|available\s+for|vermiet(?:e|et)\s+(?:ich\s+)?(?:es\s+)?für)?\s*(?:ca\.?\s*)?([1-9]|[12]\d)\s*(?:tag|tage|tagen|days?)\b|\b(?:for|für|nur|only|minimum|min\.?|mindestens|available\s+for|vermiet(?:e|et)\s+(?:ich\s+)?(?:es\s+)?für)?\s*(?:ca\.?\s*)?([1-3])\s*(?:woche|wochen|weeks?)\b/i;
  const titleDuration = /\b(?:[1-9]|[12]\d)\s*(?:tag|tage|days?)\b|\b[1-3]\s*(?:woche|wochen|weeks?)\b/i;
  return titleDuration.test(title) || duration.test(text) || dateRangeUnderMonth(text);
}

const stats = { sourceActiveAllSites: snapshot.activeAll, sourceActiveWg: sourceRows.length, commercial: 0, short: 0, duplicates: 0 };
const candidates = [];
for (const row of sourceRows) {
  const text = `${row.title ?? ""} ${row.description ?? ""}`;
  if (explicitCommercial.test(text) || templatedCommercialDescriptions.has(tidy(row.description))) {
    stats.commercial += 1;
    continue;
  }
  if (explicitlyUnderMonth(row)) {
    stats.short += 1;
    continue;
  }
  candidates.push(row);
}

const seenLinks = new Set();
const seenFallbacks = new Set();
const kept = [];
for (const row of candidates) {
  const linkKey = canonicalLink(row.link);
  const fallbackKey = [tidy(row.title), Number(row.price) || 0, Number(row.size) || 0, tidy(row.address)].join("|");
  if (seenLinks.has(linkKey) || seenFallbacks.has(fallbackKey)) {
    stats.duplicates += 1;
    continue;
  }
  seenLinks.add(linkKey);
  seenFallbacks.add(fallbackKey);
  kept.push(row);
}
stats.final = kept.length;

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("WG-Gesucht");
sheet.showGridLines = false;
sheet.freezePanes.freezeRows(1);

const headers = ["Добавлено", "Заголовок", "Цена, €", "Площадь, м²", "Комнаты", "Адрес", "Описание", "Ссылка"];
const values = kept.map((row) => [
  new Date(Number(row.created_at)),
  row.title ?? "",
  Number(row.price) || null,
  Number(row.size) || null,
  Number(row.rooms) || null,
  row.address ?? "",
  row.description ?? "",
  row.link ?? "",
]);
sheet.getRangeByIndexes(0, 0, values.length + 1, headers.length).values = [headers, ...values];

const used = sheet.getRangeByIndexes(0, 0, values.length + 1, headers.length);
used.format = {
  font: { name: "Arial", size: 10, color: "#202124" },
  verticalAlignment: "center",
};
sheet.getRange("A1:H1").format = {
  fill: "#E8EAED",
  font: { name: "Arial", size: 10, bold: true, color: "#202124" },
  verticalAlignment: "center",
  borders: { bottom: { style: "thin", color: "#BDC1C6" } },
};
sheet.getRange(`A2:A${values.length + 1}`).format.numberFormat = "yyyy-mm-dd hh:mm";
sheet.getRange(`C2:C${values.length + 1}`).format.numberFormat = "#,##0";
sheet.getRange(`D2:E${values.length + 1}`).format.numberFormat = "0.0";
sheet.getRange(`A1:H${values.length + 1}`).format.rowHeightPx = 36;
sheet.getRange("A1:H1").format.rowHeightPx = 30;
sheet.getRange(`A2:F${values.length + 1}`).format.wrapText = true;
sheet.getRange(`G2:G${values.length + 1}`).format.wrapText = false;
sheet.getRange(`H2:H${values.length + 1}`).format.wrapText = false;

const widths = [135, 300, 85, 95, 75, 250, 420, 310];
for (let col = 0; col < widths.length; col += 1) {
  sheet.getRangeByIndexes(0, col, values.length + 1, 1).format.columnWidthPx = widths[col];
}

const table = sheet.tables.add(`A1:H${values.length + 1}`, true, "WGGesuchtListings");
table.style = "TableStyleLight1";
table.showFilterButton = true;
table.showBandedColumns = false;

const outputDir = "/Users/damirahavaashova/Desktop/fredy/outputs/01a01603";
await fs.mkdir(outputDir, { recursive: true });
const preview = await workbook.render({ sheetName: "WG-Gesucht", range: "A1:H16", scale: 1, format: "png" });
await fs.writeFile(`${outputDir}/wg_gesucht_preview.png`, new Uint8Array(await preview.arrayBuffer()));

const check = await workbook.inspect({
  kind: "table",
  range: "WG-Gesucht!A1:H8",
  include: "values,formulas",
  tableMaxRows: 8,
  tableMaxCols: 8,
  maxChars: 8000,
});
console.log(check.ndjson);
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/wg_gesucht_filtered.xlsx`);
await fs.writeFile(`${outputDir}/stats.json`, JSON.stringify(stats, null, 2));
console.log(JSON.stringify({ stats, output: `${outputDir}/wg_gesucht_filtered.xlsx` }));
