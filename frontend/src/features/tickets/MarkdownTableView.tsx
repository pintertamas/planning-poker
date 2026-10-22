import type { CSSProperties, ReactNode } from "react";
import { isNumericCell, type TableAlign } from "./markdownTable";

type MarkdownTableProps = {
  keyPrefix: string;
  align: TableAlign[];
  header: string[];
  rows: string[][];
  renderCell: (text: string, key: string) => ReactNode;
};

const ALIGN_CLASS: Record<TableAlign, string> = {
  left: "",
  center: "tk-md-table-center",
  right: "tk-md-table-right",
};

function cellClass(align: TableAlign | undefined, text: string): string | undefined {
  const classes = [ALIGN_CLASS[align ?? "left"], isNumericCell(text) ? "tk-md-table-numeric" : ""].filter(
    (value) => value !== "",
  );
  return classes.length > 0 ? classes.join(" ") : undefined;
}

export function MarkdownTableView({ keyPrefix, align, header, rows, renderCell }: MarkdownTableProps) {
  return (
    <div className="tk-md-table">
      <table className="tk-md-table-grid" style={{ "--tk-md-cols": header.length } as CSSProperties}>
        <thead>
          <tr>
            {header.map((text, column) => (
              <th key={column} scope="col" className={cellClass(align[column], text)}>
                {renderCell(text, `${keyPrefix}-h${column}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((text, column) => (
                <td key={column} className={cellClass(align[column], text)}>
                  {renderCell(text, `${keyPrefix}-${rowIndex}-${column}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
