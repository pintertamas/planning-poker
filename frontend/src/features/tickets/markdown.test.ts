import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseBlocks, parseInline, renderMarkdown } from "./markdown";

function html(source: string): string {
  return renderToStaticMarkup(createElement("div", null, renderMarkdown(source)));
}

describe("parseBlocks", () => {
  it("reads the three heading levels", () => {
    expect(parseBlocks("# One\n## Two\n### Three")).toEqual([
      { type: "heading", level: 1, text: "One" },
      { type: "heading", level: 2, text: "Two" },
      { type: "heading", level: 3, text: "Three" },
    ]);
  });

  it("groups unordered and ordered list items and keeps the ordered start number", () => {
    expect(parseBlocks("- a\n* b\n\n3. x\n4. y")).toEqual([
      { type: "list", ordered: false, start: 1, items: ["a", "b"] },
      { type: "list", ordered: true, start: 3, items: ["x", "y"] },
    ]);
  });

  it("folds indented continuation lines into the previous list item", () => {
    expect(parseBlocks("- first\n  more\n- second")).toEqual([
      { type: "list", ordered: false, start: 1, items: ["first more", "second"] },
    ]);
  });

  it("keeps fenced code verbatim, including lines that look like markdown", () => {
    expect(parseBlocks("```\n# not a heading\n- not a list\n```\nafter")).toEqual([
      { type: "code", text: "# not a heading\n- not a list" },
      { type: "paragraph", lines: ["after"] },
    ]);
  });

  it("treats an unterminated fence as code to the end of the text", () => {
    expect(parseBlocks("```\nopen")).toEqual([{ type: "code", text: "open" }]);
  });

  it("nests blockquote content as blocks", () => {
    expect(parseBlocks("> quoted\n> # heading inside")).toEqual([
      {
        type: "quote",
        blocks: [
          { type: "paragraph", lines: ["quoted"] },
          { type: "heading", level: 1, text: "heading inside" },
        ],
      },
    ]);
  });

  it("recognises horizontal rules", () => {
    expect(parseBlocks("---\n* * *")).toEqual([{ type: "rule" }, { type: "rule" }]);
  });

  it("joins soft line breaks inside a paragraph and splits on blank lines", () => {
    expect(parseBlocks("one\ntwo\n\nthree")).toEqual([
      { type: "paragraph", lines: ["one", "two"] },
      { type: "paragraph", lines: ["three"] },
    ]);
  });

  it("returns no blocks for blank input", () => {
    expect(parseBlocks("  \n\n")).toEqual([]);
  });
});

describe("parseInline", () => {
  it("parses bold, italic and inline code", () => {
    expect(parseInline("**bold** and *it* and `code`")).toEqual([
      { type: "strong", children: [{ type: "text", value: "bold" }] },
      { type: "text", value: " and " },
      { type: "em", children: [{ type: "text", value: "it" }] },
      { type: "text", value: " and " },
      { type: "code", value: "code" },
    ]);
  });

  it("keeps markdown syntax inside code spans literal", () => {
    expect(parseInline("`**not bold**`")).toEqual([{ type: "code", value: "**not bold**" }]);
  });

  it("turns https links into links", () => {
    expect(parseInline("[docs](https://example.com/a)")).toEqual([
      { type: "link", href: "https://example.com/a", label: "docs" },
    ]);
  });

  it("renders links with other schemes as plain text", () => {
    const nodes = parseInline("[click](javascript:alert(1))");
    expect(nodes.some((node) => node.type === "link")).toBe(false);
    expect(nodes[0]).toEqual({ type: "text", value: "click" });
  });

  it("auto-links bare https URLs without the trailing punctuation", () => {
    expect(parseInline("see https://example.com/a.")).toEqual([
      { type: "text", value: "see " },
      { type: "link", href: "https://example.com/a", label: "https://example.com/a" },
      { type: "text", value: "." },
    ]);
  });

  it("does not auto-link plain http URLs", () => {
    expect(parseInline("http://example.com")).toEqual([{ type: "text", value: "http://example.com" }]);
  });

  it("represents images as links to the image", () => {
    expect(parseInline("![diagram](https://img.example.com/a.png)")).toEqual([
      { type: "image", href: "https://img.example.com/a.png", alt: "diagram" },
    ]);
  });

  it("falls back to plain text for images with other schemes", () => {
    expect(parseInline("![pic](javascript:alert(1))")).toEqual([
      { type: "text", value: "pic" },
      { type: "text", value: ")" },
    ]);
  });
});

describe("renderMarkdown", () => {
  it("shows a muted placeholder for an empty description", () => {
    expect(html("   ")).toBe('<div><p class="pp-muted">No description</p></div>');
  });

  it("renders headings, lists and code as elements", () => {
    const markup = html("## Scope\n\n- one\n- two\n\n```\nx\n```");
    expect(markup).toContain("<h4>Scope</h4>");
    expect(markup).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(markup).toContain("<pre><code>x</code></pre>");
  });

  it("opens external links in a new tab without opener access", () => {
    expect(html("[docs](https://example.com)")).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">docs</a>',
    );
  });

  it("keeps script tags inert text", () => {
    const markup = html("<script>alert(1)</script>");
    expect(markup).not.toContain("<script");
    expect(markup).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("never emits a javascript or data href", () => {
    const markup = html("[x](javascript:alert(1)) ![y](data:text/html,hi) <a href=\"javascript:evil\">z</a>");
    expect(markup).not.toMatch(/href="javascript/i);
    expect(markup).not.toMatch(/href="data:/i);
    expect(markup).not.toContain("<a href=\"javascript");
  });

  it("does not let raw HTML attributes through as attributes", () => {
    const markup = html("<img src=x onerror=alert(1)>");
    expect(markup).not.toContain("<img");
    expect(markup).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});
