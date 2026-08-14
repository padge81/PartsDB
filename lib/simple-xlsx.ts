import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export type WorkbookRows = Record<string, string[][]>;

const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

function columnName(index: number) {
  let name = "";
  for (let value = index; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  return name;
}

function sheetXml(rows: string[][]) {
  const body = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => {
    const reference = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
    return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  }).join("")}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

export function createXlsx(sheets: WorkbookRows): Uint8Array {
  const entries = Object.entries(sheets);
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${entries.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${entries.map(([name], index) => `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRels),
    "xl/styles.xml": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf xfId="0"/></cellXfs></styleSheet>'),
  };
  entries.forEach(([, rows], index) => { files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheetXml(rows)); });
  return zipSync(files, { level: 6 });
}

function parseXml(bytes: Uint8Array | undefined, label: string) {
  if (!bytes) throw new Error(`Excel workbook is missing ${label}.`);
  const document = new DOMParser().parseFromString(strFromU8(bytes), "application/xml");
  if (document.querySelector("parsererror")) throw new Error(`Excel workbook contains invalid ${label}.`);
  return document;
}

function columnIndex(reference: string) {
  return [...(reference.match(/[A-Z]+/i)?.[0].toUpperCase() ?? "")].reduce((total, character) => total * 26 + character.charCodeAt(0) - 64, 0) - 1;
}

export function readXlsx(bytes: Uint8Array): WorkbookRows {
  const files = unzipSync(bytes); const workbook = parseXml(files["xl/workbook.xml"], "workbook metadata");
  const relationships = parseXml(files["xl/_rels/workbook.xml.rels"], "workbook relationships");
  const targets = new Map([...relationships.getElementsByTagName("Relationship")].map((item) => [item.getAttribute("Id") ?? "", item.getAttribute("Target") ?? ""]));
  const sharedDocument = files["xl/sharedStrings.xml"] ? parseXml(files["xl/sharedStrings.xml"], "shared strings") : null;
  const sharedStrings = sharedDocument ? [...sharedDocument.getElementsByTagName("si")].map((item) => [...item.getElementsByTagName("t")].map((text) => text.textContent ?? "").join("")) : [];
  const result: WorkbookRows = {};
  for (const sheet of [...workbook.getElementsByTagName("sheet")]) {
    const name = sheet.getAttribute("name") ?? ""; const relationshipId = sheet.getAttribute("r:id") ?? sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? "";
    const target = targets.get(relationshipId); if (!name || !target) continue;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    const document = parseXml(files[path], `sheet ${name}`); const rows: string[][] = [];
    for (const rowElement of [...document.getElementsByTagName("row")]) {
      const rowNumber = Number(rowElement.getAttribute("r") ?? rows.length + 1); const row: string[] = [];
      for (const cell of [...rowElement.getElementsByTagName("c")]) {
        const index = columnIndex(cell.getAttribute("r") ?? ""); const type = cell.getAttribute("t");
        const raw = type === "inlineStr" ? [...cell.getElementsByTagName("t")].map((item) => item.textContent ?? "").join("") : cell.getElementsByTagName("v")[0]?.textContent ?? "";
        row[index] = type === "s" ? sharedStrings[Number(raw)] ?? "" : raw;
      }
      rows[rowNumber - 1] = row;
    }
    result[name] = rows;
  }
  return result;
}
