import { escapeHtml } from "../html.js";
import { strings } from "../i18n.js";
import type { DocumentOptions, Margins } from "../options.js";
import { authorsHtml, shortAuthors, vancouverCitation, yearOf } from "./authors.js";
import { pageCss, type PageValues } from "./page-css.js";
import { abstractParagraphs, plainAuthor } from "./template.js";

/**
 * The open_access theme (theme-open-access.css has the look): an open access journal article.
 * Page 1 opens with a band (journal, article type) and, beside the title, authors and
 * abstract, a sidebar with the record: open access badge, suggested citation, editor, dates,
 * licence, correspondence and DOI. Every item appears only when its field is given.
 */

/** An open padlock, drawn for the badge (not any journal's or organisation's mark). */
const PADLOCK =
  '<svg viewBox="0 0 16 22" width="9" height="12" aria-hidden="true">' +
  '<path d="M3 10V6.5a5 5 0 0 1 9.6-2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
  '<circle cx="8" cy="15" r="5.5" fill="none" stroke="currentColor" stroke-width="2.4"/>' +
  '<circle cx="8" cy="15" r="1.6" fill="currentColor"/></svg>';

/** The authors' names: from `authors`, else from `author` split at commas and "y"/"and". */
export function authorNames(options: DocumentOptions): string[] {
  if (options.authors?.length) return options.authors.map((author) => author.name);
  if (!options.author) return [];
  return plainAuthor(options.author)
    .split(/\s*,\s*|\s+(?:y|and|e|et|und)\s+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

/** Running-head authors: `short-authors`, else "Pérez", "Pérez y Gómez" or "Pérez et al.". */
export const runningAuthors = (options: DocumentOptions): string | undefined =>
  options.shortAuthors ?? shortAuthors(authorNames(options), strings(options.lang).and);

/** Year of publication: of `published`, else of `date`. */
const year = (options: DocumentOptions) => yearOf(options.published) ?? yearOf(options.date);

/** The suggested citation: `citation`, else Vancouver style from the record. */
export function citation(options: DocumentOptions, title: string): string {
  return (
    options.citation ??
    vancouverCitation({
      names: authorNames(options),
      title,
      journal: options.journal,
      year: year(options),
      volume: options.volume,
      articleNumber: options.articleNumber,
    })
  );
}

const sideItem = (label: string, html: string) =>
  `<p><span class="oa-label">${escapeHtml(label)}</span>${html}</p>`;

/** Page 1: band, sidebar with the record, title, authors, affiliations, abstract, keywords. */
export function openAccessFront(options: DocumentOptions, title: string): string {
  const labels = strings(options.lang);
  const oa = labels.openAccess;
  const correspondence =
    options.correspondence ?? options.authors?.find((a) => a.corresponding && a.email)?.email;
  const dates = (
    [
      [oa.received, options.received],
      [oa.accepted, options.accepted],
      [oa.published, options.published],
    ] as const
  )
    .filter(([, value]) => value)
    .map(
      ([label, value]) => `<span class="oa-label">${escapeHtml(label)}</span>${escapeHtml(value!)}`,
    )
    .join("<br>");
  const holder = runningAuthors(options);
  const licenseYear = year(options);
  const license = options.license
    ? [
        licenseYear || holder
          ? `© ${[licenseYear, holder]
              .filter(Boolean)
              .map((part) => escapeHtml(part!))
              .join(" ")
              // "Pérez et al." already ends the sentence.
              .replace(/\.$/, "")}. `
          : "",
        escapeHtml(oa.licenseText.replace("{license}", options.license)),
      ].join("")
    : "";

  const side = [
    options.license ? `<p class="oa-badge">${PADLOCK} ${escapeHtml(oa.badge)}</p>` : "",
    sideItem(oa.citation, escapeHtml(citation(options, title))),
    options.editor ? sideItem(oa.editor, escapeHtml(options.editor)) : "",
    dates ? `<p>${dates}</p>` : "",
    license ? sideItem(oa.license, license) : "",
    correspondence ? sideItem(oa.correspondence, escapeHtml(correspondence)) : "",
    options.doi ? sideItem("DOI", escapeHtml(options.doi)) : "",
  ].filter(Boolean);

  const people = options.authors?.length
    ? authorsHtml(options.authors)
    : options.author
      ? escapeHtml(options.author).replace(/\^([^^\s][^^]*)\^/g, "<sup>$1</sup>")
      : "";
  const affiliations = [
    ...(options.affiliations ?? []).map(
      (text, i) => `<li><sup>${i + 1}</sup>${escapeHtml(text)}</li>`,
    ),
    ...(options.authors?.some((a) => a.corresponding)
      ? [`<li><sup>*</sup>${escapeHtml(labels.correspondingAuthor)}</li>`]
      : []),
  ];
  const keywords = options.keywords ?? [];
  const main = [
    `<h1 class="doc-title oa-title">${escapeHtml(title)}</h1>`,
    options.subtitle ? `<p class="doc-subtitle">${escapeHtml(options.subtitle)}</p>` : "",
    people ? `<p class="oa-authors">${people}</p>` : "",
    affiliations.length ? `<ol class="oa-affiliations">${affiliations.join("")}</ol>` : "",
    options.abstract
      ? `<section class="oa-abstract">\n<p class="oa-abstract-title">${escapeHtml(labels.abstract)}</p>\n` +
        abstractParagraphs(options.abstract).join("\n") +
        `\n</section>`
      : "",
    keywords.length
      ? `<p class="oa-keywords"><strong>${escapeHtml(labels.keywords)}:</strong> ` +
        keywords.map(escapeHtml).join("; ") +
        `</p>`
      : "",
  ].filter(Boolean);

  const band =
    options.journal || options.articleType
      ? `<div class="oa-band"><span class="oa-journal">${escapeHtml(options.journal ?? "")}</span>` +
        `<span class="oa-type">${escapeHtml(options.articleType ?? "")}</span></div>`
      : "";
  return [
    `<header class="doc-header oa-front">`,
    band,
    `<div class="oa-grid">`,
    `<aside class="oa-side">\n${side.join("\n")}\n</aside>`,
    `<div class="oa-main">\n${main.join("\n")}\n</div>`,
    `</div>`,
    `</header>`,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface OpenAccessInput {
  options: DocumentOptions;
  margin: Margins;
  title: string;
}

/**
 * Running head from page 2 (journal; short authors · short title) and footer (journal, year,
 * volume, article number and DOI; "n de N").
 */
export function openAccessPage({ options, margin, title }: OpenAccessInput): string {
  const labels = strings(options.lang);
  const journal = options.journal ?? "";
  const shortTitle = options.shortTitle ?? title;
  const authors = runningAuthors(options);
  const issue = [
    year(options) ?? "",
    options.volume ? `; ${options.volume}` : "",
    options.articleNumber ? `: ${options.articleNumber}` : "",
  ].join("");
  const record = [
    [journal, issue].filter(Boolean).join(" "),
    options.doi ? `doi.org/${options.doi}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const values: PageValues = {
    title,
    date: options.date,
    journal,
    running: [authors, shortTitle].filter(Boolean).join(" · "),
    record,
  };
  const pages = options.pageNumbers ? `{page} ${labels.pageOf} {pages}` : "";
  const accent = options.accent ? `:root { --oa-accent: ${options.accent}; }\n` : "";
  return (
    accent +
    pageCss({
      margin,
      header: options.header ?? `${journal ? "{journal}" : ""} | | {running}`,
      footer: options.footer ?? `${record ? "{record}" : ""} | | ${pages}`,
      values,
      first: { noHeader: true },
    })
  );
}
