import { Fragment, type ReactNode } from "react";
import { MarkdownTableView } from "./MarkdownTableView";
import { parseTable, type TableBlock } from "./markdownTable";
import { isHttpUrl } from "./ticketHelpers";
import { parseIssueUrl, type IssueLookup } from "./issueLinks";
import { IssueChip, IssueLookupContext } from "./IssueChip";

export type Inline =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; label: string }
  | { type: "image"; href: string; alt: string };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; ordered: boolean; start: number; items: string[] }
  | { type: "code"; text: string }
  | { type: "quote"; blocks: Block[] }
  | { type: "rule" }
  | TableBlock;

const HEADING = /^(#{1,3})\s+(.*\S)\s*$/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const FENCE = /^\s*```/;
const QUOTE = /^\s*>\s?(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)\.\s+(.*)$/;
const INLINE =
  /`([^`\n]+)`|!\[([^\]\n]*)\]\(([^)\s]+)\)|\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^\n]+?)\*\*|\*([^*\s][^*\n]*?)\*|https:\/\/[^\s<>]+/g;
const URL_TRAILING_PUNCTUATION = /[.,;:!?)\]'"]+$/;
const HTTPS_PREFIX = "https://";

export function parseInline(source: string): Inline[] {
  const nodes: Inline[] = [];
  const pattern = new RegExp(INLINE.source, "g");
  let consumed = 0;
  let match: RegExpExecArray | null;

  const pushText = (end: number) => {
    if (end > consumed) nodes.push({ type: "text", value: source.slice(consumed, end) });
  };

  while ((match = pattern.exec(source)) !== null) {
    const start = match.index;
    let end = start + match[0].length;
    let token: Inline | null = null;

    if (match[1] !== undefined) {
      token = { type: "code", value: match[1] };
    } else if (match[2] !== undefined && match[3] !== undefined) {
      token = isHttpUrl(match[3])
        ? { type: "image", href: match[3], alt: match[2] }
        : { type: "text", value: match[2].trim() || "Image" };
    } else if (match[4] !== undefined && match[5] !== undefined) {
      token = isHttpUrl(match[5]) ? { type: "link", href: match[5], label: match[4] } : { type: "text", value: match[4] };
    } else if (match[6] !== undefined) {
      token = { type: "strong", children: parseInline(match[6]) };
    } else if (match[7] !== undefined) {
      token = { type: "em", children: parseInline(match[7]) };
    } else {
      const href = match[0].replace(URL_TRAILING_PUNCTUATION, "");
      if (href.length > HTTPS_PREFIX.length) {
        end = start + href.length;
        pattern.lastIndex = end;
        token = { type: "link", href, label: href };
      }
    }

    if (token === null) continue;
    pushText(start);
    nodes.push(token);
    consumed = end;
  }

  pushText(source.length);
  return nodes;
}

function startsBlock(line: string): boolean {
  return (
    HEADING.test(line) ||
    RULE.test(line) ||
    FENCE.test(line) ||
    QUOTE.test(line) ||
    BULLET.test(line) ||
    NUMBERED.test(line)
  );
}

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    if (FENCE.test(line)) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index] ?? "")) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = (heading[1] ?? "#").length as 1 | 2 | 3;
      blocks.push({ type: "heading", level, text: heading[2] ?? "" });
      index += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (index < lines.length && QUOTE.test(lines[index] ?? "")) {
        body.push(QUOTE.exec(lines[index] ?? "")?.[1] ?? "");
        index += 1;
      }
      blocks.push({ type: "quote", blocks: parseBlocks(body.join("\n")) });
      continue;
    }

    const numbered = NUMBERED.exec(line);
    if (numbered || BULLET.test(line)) {
      const ordered = numbered !== null;
      const pattern = ordered ? NUMBERED : BULLET;
      const start = numbered ? Number(numbered[1]) : 1;
      const items: string[] = [];
      while (index < lines.length) {
        const current = lines[index] ?? "";
        if (RULE.test(current)) break;
        const item = pattern.exec(current);
        if (item) {
          items.push((ordered ? item[2] : item[1]) ?? "");
          index += 1;
          continue;
        }
        if (items.length > 0 && /^\s+\S/.test(current)) {
          const last = items.length - 1;
          items[last] = `${items[last] ?? ""} ${current.trim()}`;
          index += 1;
          continue;
        }
        break;
      }
      blocks.push({ type: "list", ordered, start, items });
      continue;
    }

    const table = parseTable(lines, index, startsBlock);
    if (table) {
      blocks.push(table.block);
      index = table.next;
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length) {
      const next = lines[index] ?? "";
      if (next.trim() === "" || startsBlock(next) || parseTable(lines, index, startsBlock)) break;
      paragraph.push(next.trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", lines: paragraph });
  }

  return blocks;
}

function renderInline(nodes: Inline[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.type) {
      case "text":
        return <Fragment key={key}>{node.value}</Fragment>;
      case "code":
        return <code key={key}>{node.value}</code>;
      case "strong":
        return <strong key={key}>{renderInline(node.children, key)}</strong>;
      case "em":
        return <em key={key}>{renderInline(node.children, key)}</em>;
      case "link": {
        const identifier = parseIssueUrl(node.href);
        if (identifier !== null) return <IssueChip key={key} href={node.href} identifier={identifier} />;
        return (
          <a key={key} href={node.href} target="_blank" rel="noopener noreferrer">
            {node.label}
          </a>
        );
      }
      case "image":
        return (
          <a key={key} href={node.href} target="_blank" rel="noopener noreferrer">
            {node.alt.trim() || "Image"}
          </a>
        );
    }
  });
}

function renderBlocks(blocks: Block[], keyPrefix: string): ReactNode[] {
  return blocks.map((block, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (block.type) {
      case "heading": {
        const children = renderInline(parseInline(block.text), key);
        if (block.level === 1) return <h3 key={key}>{children}</h3>;
        if (block.level === 2) return <h4 key={key}>{children}</h4>;
        return <h5 key={key}>{children}</h5>;
      }
      case "paragraph":
        return (
          <p key={key}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                {renderInline(parseInline(line), `${key}-${lineIndex}`)}
              </Fragment>
            ))}
          </p>
        );
      case "list": {
        const items = block.items.map((item, itemIndex) => (
          <li key={itemIndex}>{renderInline(parseInline(item), `${key}-${itemIndex}`)}</li>
        ));
        return block.ordered ? (
          <ol key={key} start={block.start}>
            {items}
          </ol>
        ) : (
          <ul key={key}>{items}</ul>
        );
      }
      case "code":
        return (
          <pre key={key}>
            <code>{block.text}</code>
          </pre>
        );
      case "quote":
        return <blockquote key={key}>{renderBlocks(block.blocks, key)}</blockquote>;
      case "rule":
        return <hr key={key} />;
      case "table":
        return (
          <MarkdownTableView
            key={key}
            keyPrefix={key}
            align={block.align}
            header={block.header}
            rows={block.rows}
            renderCell={(text, cellKey) => renderInline(parseInline(text), cellKey)}
          />
        );
    }
  });
}

export function renderMarkdown(source: string, issueLookup?: IssueLookup): ReactNode {
  if (source.trim() === "") return <p className="pp-muted">No description</p>;
  const body = <div className="tk-md">{renderBlocks(parseBlocks(source), "b")}</div>;
  if (issueLookup === undefined) return body;
  return <IssueLookupContext.Provider value={issueLookup}>{body}</IssueLookupContext.Provider>;
}
