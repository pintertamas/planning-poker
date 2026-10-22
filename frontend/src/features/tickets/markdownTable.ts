export type TableAlign = "left" | "center" | "right";

export type TableBlock = {
  type: "table";
  align: TableAlign[];
  header: string[];
  rows: string[][];
};

const CELL_SEPARATOR = /(?:^|[^\\])\|/;
const DELIMITER_CELL = /^:?-+:?$/;
const NUMERIC_CELL = /^[+\-−]?[£$€]?\d[\d,]*(\.\d+)?%?$/;

export function hasCellSeparator(line: string): boolean {
  return CELL_SEPARATOR.test(line);
}

export function splitCells(line: string): string[] {
  let body = line.trim();
  if (body.startsWith("|")) body = body.slice(1);
  if (body.endsWith("|") && !body.endsWith("\\|")) body = body.slice(0, -1);

  const cells: string[] = [];
  let cell = "";
  for (let index = 0; index < body.length; index += 1) {
    const char = body.charAt(index);
    if (char === "\\" && body.charAt(index + 1) === "|") {
      cell += "|";
      index += 1;
    } else if (char === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

export function isNumericCell(text: string): boolean {
  return NUMERIC_CELL.test(text.trim());
}

function readAlignment(line: string): TableAlign[] | null {
  if (!hasCellSeparator(line)) return null;
  const cells = splitCells(line);
  if (!cells.every((cell) => DELIMITER_CELL.test(cell))) return null;
  return cells.map((cell): TableAlign => {
    const leading = cell.startsWith(":");
    const trailing = cell.endsWith(":");
    if (leading && trailing) return "center";
    if (trailing) return "right";
    return "left";
  });
}

function fitCells(cells: string[], width: number): string[] {
  return Array.from({ length: width }, (_, index) => cells[index] ?? "");
}

export function parseTable(
  lines: string[],
  index: number,
  interrupts: (line: string) => boolean,
): { block: TableBlock; next: number } | null {
  const headerLine = lines[index];
  const delimiterLine = lines[index + 1];
  if (headerLine === undefined || delimiterLine === undefined || !hasCellSeparator(headerLine)) return null;

  const align = readAlignment(delimiterLine);
  if (align === null) return null;

  const header = splitCells(headerLine);
  if (header.length !== align.length) return null;

  const rows: string[][] = [];
  let next = index + 2;
  while (next < lines.length) {
    const line = lines[next] ?? "";
    if (line.trim() === "" || !hasCellSeparator(line) || interrupts(line)) break;
    rows.push(fitCells(splitCells(line), header.length));
    next += 1;
  }

  return { block: { type: "table", align, header, rows }, next };
}
