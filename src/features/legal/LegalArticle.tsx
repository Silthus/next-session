import { Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { Eyebrow } from "../../ui/Eyebrow";
import type { Block, Inline, LegalDocument } from "./legalDocument";

export function LegalArticle({ document }: { document: LegalDocument }) {
  return (
    <article>
      {document.effectiveDate && <Eyebrow>Updated {document.effectiveDate}</Eyebrow>}
      <h1 className="mt-2 font-display text-4xl font-extrabold">{document.title}</h1>
      <div className="mt-6 flex flex-col gap-4">{document.intro.map(renderBlock)}</div>
      <div className="mt-8 flex flex-col gap-8">
        {document.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-3">
            <h2 className="font-display text-xl font-bold">{section.heading}</h2>
            {section.blocks.map(renderBlock)}
          </section>
        ))}
      </div>
    </article>
  );
}

function renderBlock(block: Block, index: number) {
  switch (block.kind) {
    case "paragraph":
      return (
        <p key={index} className="leading-relaxed text-ink-2">
          {block.lines.map((line, lineIndex) => (
            <Fragment key={lineIndex}>
              {lineIndex > 0 && <br />}
              {renderInlines(line)}
            </Fragment>
          ))}
        </p>
      );
    case "list":
      return (
        <ul key={index} className="list-disc space-y-1 pl-5 leading-relaxed text-ink-2">
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInlines(item)}</li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div key={index} className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2">
              <tr>
                {block.header.map((cell, cellIndex) => (
                  <th key={cellIndex} scope="col" className="px-3 py-2 font-semibold text-ink">
                    {renderInlines(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-line align-top">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-3 py-2 leading-relaxed text-ink-2">
                      {renderInlines(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

const linkClassName = "text-accent underline underline-offset-2 hover:text-accent-strong";

function renderInlines(inlines: Inline[]) {
  return inlines.map((inline, index) => {
    switch (inline.kind) {
      case "text":
        return <Fragment key={index}>{inline.text}</Fragment>;
      case "strong":
        return (
          <strong key={index} className="font-semibold text-ink">
            {inline.text}
          </strong>
        );
      case "code":
        return (
          <code key={index} className="rounded-sm bg-surface-2 px-1 font-mono text-[0.85em]">
            {inline.text}
          </code>
        );
      case "link":
        return inline.href.startsWith("/") ? (
          <Link key={index} to={inline.href} className={linkClassName}>
            {inline.text}
          </Link>
        ) : (
          <a
            key={index}
            href={inline.href}
            target="_blank"
            rel="noreferrer"
            className={linkClassName}
          >
            {inline.text}
          </a>
        );
    }
  });
}
