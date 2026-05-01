import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = path.resolve("..");
const inputCsv = path.join(root, "tools", "lohnservice", "bmf_comparison_long.csv");
const outputDir = path.join(root, "outputs", "pap-comparison");
const outputXlsx = path.join(outputDir, "pap_comparison_long.xlsx");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (quoted && ch === '"' && next === '"') {
      cell += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (!quoted && ch === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const [headers, ...data] = rows.filter((r) => r.some((v) => v !== ""));
  return data.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}

function numericOrBlank(value) {
  if (value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

const csvText = await fs.readFile(inputCsv, "utf8");
const rows = parseCsv(csvText);
const rowsByCase = new Map();
for (const row of rows) {
  const key = `${row.income}|${row.stkl}`;
  if (!rowsByCase.has(key)) rowsByCase.set(key, {});
  rowsByCase.get(key)[row.name] = numericOrBlank(row.local_ts);
}

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Comparison");
sheet.showGridLines = false;

const headers = ["income", "stkl", "name", "bmf_api", "pap_cli", "pap_http", "local_ts"];
const matrix = [
  headers,
  ...rows.map((r) => headers.map((h) => (h === "name" ? r[h] : numericOrBlank(r[h])))),
];

sheet.getRangeByIndexes(0, 0, matrix.length, headers.length).values = matrix;
sheet.getRange("A1:G1").format = {
  fill: "#1F2937",
  font: { bold: true, color: "#FFFFFF" },
};
sheet.getRange("A1:G1").format.rowHeightPx = 28;
sheet.getRange(`A2:G${matrix.length}`).format = {
  font: { color: "#111827" },
};
sheet.getRange(`A2:B${matrix.length}`).format.numberFormat = "0";
sheet.getRange(`D2:G${matrix.length}`).format.numberFormat = "#,##0";
sheet.getRange("A:G").format.columnWidthPx = 100;
sheet.getRange("C:C").format.columnWidthPx = 120;
sheet.freezePanes.freezeRows(1);

const redFormat = {
  fill: "#FEE2E2",
  font: { color: "#B91C1C", bold: true },
};
const referenceFormat = {
  fill: "#ECFDF5",
  font: { color: "#065F46", bold: true },
};
const neutralCalcFormat = {
  fill: "#FFFFFF",
  font: { color: "#111827", bold: false },
};

for (let i = 0; i < rows.length; i++) {
  const excelRow = i + 2;
  const ref = Number(rows[i].bmf_api);
  if (rows[i].bmf_api === "" || !Number.isFinite(ref)) {
    sheet.getRange(`E${excelRow}:G${excelRow}`).format = neutralCalcFormat;
    continue;
  }

  sheet.getRange(`D${excelRow}`).format = referenceFormat;
  for (const col of ["E", "F", "G"]) {
    const key = col === "E" ? "pap_cli" : col === "F" ? "pap_http" : "local_ts";
    if (rows[i][key] === "") continue;
    const candidate = Number(rows[i][key]);
    if (Number.isFinite(candidate) && candidate !== ref) {
      sheet.getRange(`${col}${excelRow}`).format = redFormat;
    }
  }
}

const note = workbook.worksheets.add("Year Check");
note.showGridLines = false;
note.getRange("A1:D1").values = [["source", "observed year", "where it comes from", "status"]];
note.getRange("A2:D5").values = [
  ["bmf_api", "2026", "validate_bmf.test.ts uses code=LSt2026ext", "reference"],
  ["pap_cli", "2026", "LoService calls Lohnsteuer.getInstance(); current session date selects Lohnsteuer2026", "same year as reference"],
  ["pap_http", "2026", "LoServiceServer uses the same Lohnsteuer.getInstance() path", "same year as reference"],
  ["local_ts", "2026", "src/lib/pap.ts now includes UPTAB26 constants; validate_bmf.test.ts passes year 2026", "same year as local Java"],
];
note.getRange("A1:D1").format = {
  fill: "#1F2937",
  font: { bold: true, color: "#FFFFFF" },
};
note.getRange("A2:D5").format = { font: { color: "#111827" } };
note.getRange("A:D").format.columnWidthPx = 190;
note.getRange("C:C").format.columnWidthPx = 520;
note.freezePanes.freezeRows(1);

const glossary = workbook.worksheets.add("Glossary");
glossary.showGridLines = false;
glossary.getRange("A1:E1").values = [["name", "meaning", "unit", "available from", "note"]];
glossary.getRange("A2:E24").values = [
  ["RE4", "Annual gross wage input", "EUR in local_ts; cents in BMF/Java wrapper input", "input", "The harness converts income EUR to RE4 cents for BMF and Java."],
  ["STKL", "German wage tax class", "class number", "input", "Current matrix uses tax classes 1 to 4."],
  ["ZKF", "Child allowance count", "count", "input", "Current matrix uses 0."],
  ["LZZ", "Payroll period", "code", "input", "1 means annual payroll period in this harness."],
  ["VFRB", "Consumption of tax-free amounts for DBA/progression-reservation output", "EUR", "BMF, pap_cli, pap_http, local_ts", "Official DBA output field; for these inputs it matches the employee allowance component."],
  ["WVFRB", "Additional taxable base after basic allowance for DBA/progression-reservation output", "EUR", "BMF, pap_cli, pap_http, local_ts", "Official DBA output field; computed as max(ZVE - GFB, 0) for these inputs."],
  ["tax / LSTLZZ", "Wage tax for the payroll period", "EUR", "BMF, pap_cli, pap_http, local_ts", "With LZZ=1, this is annual wage tax."],
  ["ZTABFB", "Fixed table allowances before pension/insurance allowance", "EUR", "local_ts only", "Internal PAP intermediate. BMF and generated Java public getters do not expose it."],
  ["VSP", "Vorsorgepauschale, pension/insurance allowance", "EUR", "local_ts only", "Internal PAP intermediate. BMF and generated Java public getters do not expose it."],
  ["ZVE", "Taxable income used by the tariff", "EUR", "local_ts result object", "Internal value: RE4 - ZTABFB - VSP, floored at zero."],
  ["GFB", "Basic allowance / Grundfreibetrag", "EUR", "local_ts result object", "2026 value in this implementation is 12,348 EUR."],
  ["ANP", "Employee allowance / Arbeitnehmer-Pauschbetrag", "EUR", "local_ts result object", "Part of ZTABFB; capped at 1,230 EUR for these regular-wage cases."],
  ["EFA", "Single-parent relief amount / Entlastungsbetrag fuer Alleinerziehende", "EUR", "local_ts result object", "Applied in this harness for STKL=2."],
  ["SAP", "Special expenses allowance / Sonderausgaben-Pauschbetrag", "EUR", "local_ts result object", "36 EUR in the 2026 PAP path used here."],
  ["KFB", "Child allowance / Kinderfreibetrag", "EUR", "local_ts result object", "Driven by ZKF; current matrix uses ZKF=0."],
  ["ZRE4VP", "Wage base used for Vorsorgepauschale", "EUR", "local_ts result object", "Base for pension, health, care, and unemployment allowance pieces."],
  ["VSP_RENTEN", "Pension-insurance partial amount", "EUR", "local_ts result object", "Uses the 2026 employee pension contribution rate and the pension contribution ceiling."],
  ["VSP_KRANKEN_PFLEGE", "Health and long-term-care insurance partial amount", "EUR", "local_ts result object", "For statutory insurance: health base rate plus half Zusatzbeitrag plus care rate."],
  ["VSP_ALV", "Unemployment-insurance partial amount", "EUR", "local_ts result object", "Used for the alternate capped VSP calculation path."],
  ["VSPHB", "Capped health/care plus unemployment amount", "EUR", "local_ts result object", "Capped at 1,900 EUR in the PAP path used here."],
  ["VSPN", "Alternate capped Vorsorgepauschale", "EUR", "local_ts result object", "If VSPN exceeds the direct VSP amount, PAP uses VSPN."],
  ["baseTax", "Tariff tax before solidarity/church additions", "EUR", "local_ts result object", "For the comparison matrix, solidarity and church are disabled."],
  ["SOLZ", "Solidarity surcharge", "EUR", "local_ts result object", "Optional in local_ts; disabled in the comparison matrix."],
];
glossary.getRange("A1:E1").format = {
  fill: "#1F2937",
  font: { bold: true, color: "#FFFFFF" },
};
glossary.getRange("A2:E24").format = { font: { color: "#111827" }, wrapText: true };
glossary.getRange("A:A").format.columnWidthPx = 110;
glossary.getRange("B:B").format.columnWidthPx = 340;
glossary.getRange("C:C").format.columnWidthPx = 150;
glossary.getRange("D:D").format.columnWidthPx = 230;
glossary.getRange("E:E").format.columnWidthPx = 460;
glossary.freezePanes.freezeRows(1);

const assumptions = workbook.worksheets.add("Assumptions");
assumptions.showGridLines = false;
assumptions.getRange("A1:D1").values = [["topic", "current default", "why it matters", "webapp input recommendation"]];
assumptions.getRange("A2:D10").values = [
  ["Statutory pension", "KRV=0, employee rate 9.3%, cap 101,400 EUR", "Feeds VSP_RENTEN and therefore ZVE/tax.", "Expose pension-insurance status; keep default statutory."],
  ["Health insurance", "Statutory insurance, base employee rate 7.0%, KVZ=0 by default", "Real users usually have a Zusatzbeitrag; half of it is added to employee health rate.", "Ask for Zusatzbeitrag percentage or provide a current default setting."],
  ["Long-term care insurance", "PVS=0, PVZ=0, PVA=0; default employee rate 1.8%", "Saxony, childless surcharge, and child reductions change VSP_KRANKEN_PFLEGE.", "Ask Saxony yes/no, childless surcharge yes/no, and child reduction if needed."],
  ["Private insurance", "PKV=0; private premiums not used by default", "Private basic health/care premiums replace the statutory health/care partial amount path.", "Support monthly private premium and employer subsidy inputs."],
  ["Unemployment insurance", "ALV=0, employee rate 1.3%, cap 101,400 EUR", "Feeds VSP_ALV and the capped VSPHB/VSPN path.", "Expose unemployment-insurance status; keep default statutory."],
  ["Children", "ZKF=0 in this comparison matrix", "Affects child allowance KFB and may affect care-insurance assumptions separately.", "Separate tax child allowance count from care-insurance child settings."],
  ["Payroll period", "LZZ=1 annual", "Monthly/weekly/daily payroll periods need annualization and apportionment.", "For graphs, annual mode is easiest; later add payroll-period selector."],
  ["Public outputs vs internals", "BMF/Java public outputs omit ZTABFB and VSP", "Only local_ts can show every internal step unless you fork/modify generated Java internals.", "Use local_ts result object for detailed UI, BMF only for validation."],
  ["Remote BMF API", "Validation only", "BMF states the external interface is for checking calculations, not live app computation.", "Run local PAP in browser/backend; use BMF sparingly in tests."],
];
assumptions.getRange("A1:D1").format = {
  fill: "#1F2937",
  font: { bold: true, color: "#FFFFFF" },
};
assumptions.getRange("A2:D10").format = { font: { color: "#111827" }, wrapText: true };
assumptions.getRange("A:A").format.columnWidthPx = 180;
assumptions.getRange("B:B").format.columnWidthPx = 280;
assumptions.getRange("C:C").format.columnWidthPx = 380;
assumptions.getRange("D:D").format.columnWidthPx = 420;
assumptions.freezePanes.freezeRows(1);

const checks = workbook.worksheets.add("Checks");
checks.showGridLines = false;
checks.getRange("A1:H1").values = [["income", "stkl", "check", "expected", "actual", "diff", "status", "formula"]];
const checkRows = [];
for (const [key, values] of rowsByCase.entries()) {
  const [income, stkl] = key.split("|").map(Number);
  const addCheck = (name, expected, actual, formula) => {
    const e = Number(expected);
    const a = Number(actual);
    const diff = Number.isFinite(e) && Number.isFinite(a) ? a - e : "";
    checkRows.push([
      income,
      stkl,
      name,
      Number.isFinite(e) ? e : "",
      Number.isFinite(a) ? a : "",
      diff,
      diff === 0 ? "PASS" : "FAIL",
      formula,
    ]);
  };

  addCheck("ZTABFB = ANP + EFA + SAP + KFB", 1230 + (stkl === 2 ? 4260 : 0) + 36 + 0, values.ZTABFB, "ANP + EFA + SAP + KFB");
  addCheck("ZVE = income - ZTABFB - VSP", income - values.ZTABFB - values.VSP, values.ZVE, "income - ZTABFB - VSP");
  addCheck("VSPHB = min(VSP_ALV + VSP_KRANKEN_PFLEGE, 1900)", Math.min(values.VSP_ALV + values.VSP_KRANKEN_PFLEGE, 1900), values.VSPHB, "min(VSP_ALV + VSP_KRANKEN_PFLEGE, 1900)");
  addCheck("VSPN = ceil(VSP_RENTEN + VSPHB)", Math.ceil(values.VSP_RENTEN + values.VSPHB), values.VSPN, "ceil(VSP_RENTEN + VSPHB)");
  addCheck("VSP = max(direct VSP, VSPN)", Math.max(Math.ceil(values.VSP_RENTEN + values.VSP_KRANKEN_PFLEGE), values.VSPN), values.VSP, "max(ceil(VSP_RENTEN + VSP_KRANKEN_PFLEGE), VSPN)");
  addCheck("WVFRB = max(ZVE - GFB, 0)", Math.max(values.ZVE - 12348, 0), values.WVFRB, "max(ZVE - GFB_2026, 0)");
  addCheck("tax = baseTax + SOLZ + church", values.baseTax + values.SOLZ + values.church, values.tax, "baseTax + SOLZ + church");
}
checks.getRangeByIndexes(1, 0, checkRows.length, 8).values = checkRows;
checks.getRange("A1:H1").format = {
  fill: "#1F2937",
  font: { bold: true, color: "#FFFFFF" },
};
checks.getRange(`A2:H${checkRows.length + 1}`).format = { font: { color: "#111827" }, wrapText: true };
checks.getRange(`A2:F${checkRows.length + 1}`).format.numberFormat = "#,##0";
checks.getRange("C:C").format.columnWidthPx = 320;
checks.getRange("H:H").format.columnWidthPx = 360;
checks.getRange("A:B").format.columnWidthPx = 90;
checks.getRange("D:G").format.columnWidthPx = 100;
checks.freezePanes.freezeRows(1);
for (let i = 0; i < checkRows.length; i++) {
  const excelRow = i + 2;
  if (checkRows[i][6] === "FAIL") {
    checks.getRange(`A${excelRow}:H${excelRow}`).format = redFormat;
  }
}

const rendered = await workbook.render({
  sheetName: "Comparison",
  range: "A1:G25",
  scale: 1,
  format: "png",
});
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, "pap_comparison_preview.png"), new Uint8Array(await rendered.arrayBuffer()));

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputXlsx);
console.log(outputXlsx);
