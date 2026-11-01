import type { ReactNode } from 'react';

/**
 * **What the conversation wrote, formatted.** Claude answers in Markdown: paragraphs, lists and
 * bold. Shown as text, its marks read as noise ("**", "- "), so the little of it that the
 * conversation uses is turned into elements here. Anything else stays as written, and so does
 * a mark not yet closed while the answer is still arriving. Built as React elements, never as
 * HTML, so nothing written can become markup.
 */
export function Written({ text }: { text: string }) {
  return (
    <div className="space-y-3">
      {blocksOf(text).map((block, index) => {
        switch (block.kind) {
          case 'paragraph':
            return <p key={index}>{inline(block.lines.join('\n'))}</p>;
          case 'bullets':
            return (
              <ul key={index} className="list-disc space-y-1 pl-5 marker:text-muted">
                {block.items.map((item, at) => (
                  <li key={at}>{inline(item)}</li>
                ))}
              </ul>
            );
          case 'numbered':
            return (
              <ol key={index} className="list-decimal space-y-1 pl-5 marker:text-muted">
                {block.items.map((item, at) => (
                  <li key={at}>{inline(item)}</li>
                ))}
              </ol>
            );
        }
      })}
    </div>
  );
}

type List = { kind: 'bullets' | 'numbered'; items: string[] };
type Paragraph = { kind: 'paragraph'; lines: string[] };
type Block = List | Paragraph;

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  // What the next line may carry on: at most one of them is open.
  let list = null as List | null;
  let paragraph = null as Paragraph | null;

  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      list = paragraph = null;
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      const kind = bullet ? 'bullets' : 'numbered';
      if (list?.kind !== kind) {
        list = { kind, items: [] };
        blocks.push(list);
      }
      list.items.push(item[1] ?? '');
      paragraph = null;
      continue;
    }
    // A heading is set as a paragraph of its own, in bold: a conversation has no sections.
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: 'paragraph', lines: [`**${heading[1] ?? ''}**`] });
      list = paragraph = null;
      continue;
    }
    // An indented line under a list item carries that item on.
    if (list && /^\s/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    if (!paragraph) {
      paragraph = { kind: 'paragraph', lines: [] };
      blocks.push(paragraph);
    }
    paragraph.lines.push(line);
    list = null;
  }
  return blocks;
}

/** Bold (`**…**`) and emphasis (`*…*`), only where both marks are there. */
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const marks = /\*\*(.+?)\*\*|\*(\S(?:.*?\S)?)\*/g;
  let from = 0;
  for (const match of text.matchAll(marks)) {
    const at = match.index;
    if (at > from) {
      parts.push(text.slice(from, at));
    }
    parts.push(
      match[1] !== undefined ? (
        <strong key={at} className="font-semibold">
          {match[1]}
        </strong>
      ) : (
        <em key={at}>{match[2]}</em>
      ),
    );
    from = at + match[0].length;
  }
  if (from < text.length) {
    parts.push(text.slice(from));
  }
  return parts;
}
