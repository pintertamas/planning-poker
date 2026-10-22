import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseBlocks, renderMarkdown } from "./markdown";
import { isNumericCell, splitCells } from "./markdownTable";

function html(source: string): string {
  return renderToStaticMarkup(createElement("div", null, renderMarkdown(source)));
}

describe("table detection", () => {
  it("reads a header, a delimiter row and body rows", () => {
    expect(parseBlocks("| Name | Points |\n|---|---|\n| A | 3 |\n| B | 5 |")).toEqual([
      {
        type: "table",
        align: ["left", "left"],
        header: ["Name", "Points"],
        rows: [
          ["A", "3"],
          ["B", "5"],
        ],
      },
    ]);
  });

  it("reads column alignment from the delimiter row", () => {
    const [block] = parseBlocks("| a | b | c | d |\n| :--- | :---: | ---: | --- |\n| 1 | 2 | 3 | 4 |");
    expect(block).toMatchObject({ type: "table", align: ["left", "center", "right", "left"] });
  });

  it("accepts tables without outer pipes", () => {
    expect(parseBlocks("a | b\n--- | ---\n1 | 2")).toEqual([
      { type: "table", align: ["left", "left"], header: ["a", "b"], rows: [["1", "2"]] },
    ]);
  });

  it("accepts tables with outer pipes on some rows only", () => {
    expect(parseBlocks("| a | b\n|---|---\n1 | 2 |")).toEqual([
      { type: "table", align: ["left", "left"], header: ["a", "b"], rows: [["1", "2"]] },
    ]);
  });

  it("keeps escaped pipes inside cells as literal pipes", () => {
    expect(parseBlocks("| code | meaning |\n|---|---|\n| `a \\| b` | pipe \\| char |")).toEqual([
      {
        type: "table",
        align: ["left", "left"],
        header: ["code", "meaning"],
        rows: [["`a | b`", "pipe | char"]],
      },
    ]);
  });

  it("splits cells on unescaped pipes only", () => {
    expect(splitCells("| a \\| b | c |")).toEqual(["a | b", "c"]);
    expect(splitCells("a \\|")).toEqual(["a |"]);
  });

  it("pads short body rows and drops cells beyond the header count", () => {
    expect(parseBlocks("| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |")).toEqual([
      {
        type: "table",
        align: ["left", "left"],
        header: ["a", "b"],
        rows: [
          ["1", ""],
          ["1", "2"],
        ],
      },
    ]);
  });

  it("ends the table at a blank line and at a line without a cell separator", () => {
    expect(parseBlocks("| a |\n|---|\n| 1 |\nplain text")).toEqual([
      { type: "table", align: ["left"], header: ["a"], rows: [["1"]] },
      { type: "paragraph", lines: ["plain text"] },
    ]);
  });

  it("ends the table where another block starts", () => {
    expect(parseBlocks("| a | b |\n|---|---|\n| 1 | 2 |\n> quoted | here")).toEqual([
      { type: "table", align: ["left", "left"], header: ["a", "b"], rows: [["1", "2"]] },
      { type: "quote", blocks: [{ type: "paragraph", lines: ["quoted | here"] }] },
    ]);
  });

  it("keeps a prose line with pipes as a paragraph when no delimiter row follows", () => {
    expect(parseBlocks("Use a | b to pipe output\nNext line")).toEqual([
      { type: "paragraph", lines: ["Use a | b to pipe output", "Next line"] },
    ]);
  });

  it("does not treat a header with a mismatched delimiter width as a table", () => {
    expect(parseBlocks("a | b | c\n--- | ---")).toEqual([{ type: "paragraph", lines: ["a | b | c", "--- | ---"] }]);
    expect(parseBlocks("a | b\n---")).toEqual([{ type: "paragraph", lines: ["a | b"] }, { type: "rule" }]);
  });

  it("does not treat a delimiter-like line without any pipe as a table delimiter", () => {
    expect(parseBlocks("a | b\n:---:")).toEqual([{ type: "paragraph", lines: ["a | b", ":---:"] }]);
  });

  it("reads two tables separated by prose in one document", () => {
    expect(parseBlocks("| a |\n|---|\n| 1 |\n\nText between.\n\n| b | c |\n|:--|--:|\n| 2 | 3 |")).toEqual([
      { type: "table", align: ["left"], header: ["a"], rows: [["1"]] },
      { type: "paragraph", lines: ["Text between."] },
      { type: "table", align: ["left", "right"], header: ["b", "c"], rows: [["2", "3"]] },
    ]);
  });

  it("starts a table directly after a paragraph and ends it before a list", () => {
    expect(parseBlocks("Intro line\n| a | b |\n|---|---|\n| 1 | 2 |\n- item")).toEqual([
      { type: "paragraph", lines: ["Intro line"] },
      { type: "table", align: ["left", "left"], header: ["a", "b"], rows: [["1", "2"]] },
      { type: "list", ordered: false, start: 1, items: ["item"] },
    ]);
  });

  it("keeps a table that comes after a list item separate from the list", () => {
    expect(parseBlocks("- item\n| a |\n|---|\n| 1 |")).toEqual([
      { type: "list", ordered: false, start: 1, items: ["item"] },
      { type: "table", align: ["left"], header: ["a"], rows: [["1"]] },
    ]);
  });

  it("recognises numeric-looking cells", () => {
    expect(["12", "1,234.5", "-3", "45%", "£10", "+2"].every(isNumericCell)).toBe(true);
    expect(["abc", "12 apples", "", "1-2"].some(isNumericCell)).toBe(false);
  });
});

describe("table rendering", () => {
  it("wraps the table in a scrolling container with header scope and alignment classes", () => {
    const markup = html("| Name | Points |\n|:---|---:|\n| A | 3 |");
    expect(markup).toContain('<div class="tk-md-table"><table class="tk-md-table-grid"');
    expect(markup).toContain('<th scope="col" class="tk-md-table-right">Points</th>');
    expect(markup).toContain('<td class="tk-md-table-right tk-md-table-numeric">3</td>');
  });

  it("marks centre-aligned columns", () => {
    expect(html("| a |\n|:-:|\n| b |")).toContain('<td class="tk-md-table-center">b</td>');
  });

  it("leaves default-aligned text cells without a class", () => {
    expect(html("| a |\n|---|\n| text |")).toContain("<td>text</td>");
  });

  it("renders inline formatting inside cells", () => {
    const markup = html(
      "| x | y |\n|---|---|\n| **bold** *it* `code` | [docs](https://example.com) https://a.example.com/p. |\n| ![pic](https://img.example.com/a.png) | z |",
    );
    expect(markup).toContain("<td><strong>bold</strong> <em>it</em> <code>code</code></td>");
    expect(markup).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">docs</a>',
    );
    expect(markup).toContain(
      '<a href="https://a.example.com/p" target="_blank" rel="noopener noreferrer">https://a.example.com/p</a>.',
    );
    expect(markup).toContain(
      '<a href="https://img.example.com/a.png" target="_blank" rel="noopener noreferrer">pic</a>',
    );
  });

  it("keeps script tags and javascript links inert inside cells", () => {
    const markup = html(
      '| <script>alert(1)</script> | [x](javascript:alert(1)) |\n|---|---|\n| <img src=x onerror=alert(1)> | ![y](data:text/html,hi) |',
    );
    expect(markup).not.toContain("<script");
    expect(markup).not.toContain("<img");
    expect(markup).not.toMatch(/href="javascript/i);
    expect(markup).not.toMatch(/href="data:/i);
    expect(markup).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(markup).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("renders two tables and the paragraph between them", () => {
    const markup = html("| a |\n|---|\n| 1 |\n\nBetween\n\n| b |\n|---|\n| 2 |");
    expect(markup.match(/<table/g)).toHaveLength(2);
    expect(markup).toContain("<p>Between</p>");
  });
});
