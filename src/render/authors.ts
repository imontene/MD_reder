import { escapeHtml } from "../html.js";
import type { Author } from "../options.js";

/**
 * Authors of `authors:` in the title block, running heads and citations. Names are written as
 * the author gives them ("Ana Pérez"); the surname is the last word.
 */

/** "Ana Pérez<sup>1,*</sup> ORCID, Luis Gómez<sup>1,2</sup>", escaped. */
export function authorsHtml(authors: Author[]): string {
  return authors
    .map((author) => {
      const marks = [
        ...(author.affiliations ?? []).map(String),
        ...(author.corresponding ? ["*"] : []),
      ];
      const sup = marks.length ? `<sup>${marks.join(",")}</sup>` : "";
      const orcid = author.orcid
        ? ` <a class="orcid" href="https://orcid.org/${escapeHtml(author.orcid)}">ORCID</a>`
        : "";
      return `<span class="doc-author">${escapeHtml(author.name)}${sup}${orcid}</span>`;
    })
    .join(", ");
}

const words = (name: string): string[] => name.trim().split(/\s+/).filter(Boolean);

/** The surname: the last word of the name. */
export const surname = (name: string): string => words(name).at(-1) ?? name;

/** "Pérez", "Pérez y Gómez", "Pérez et al.": the authors of a running head. */
export function shortAuthors(names: string[], and: string): string | undefined {
  if (names.length === 0) return undefined;
  if (names.length === 1) return surname(names[0]!);
  if (names.length === 2) return `${surname(names[0]!)} ${and} ${surname(names[1]!)}`;
  return `${surname(names[0]!)} et al.`;
}

/**
 * A name in Vancouver style, "Pérez A". Only two-word names
 * are abbreviated ("Ana Pérez" → "Pérez A"): with more words the surname cannot be told from
 * the given names, so the name is kept as written.
 */
export function vancouverName(name: string): string {
  const parts = words(name);
  if (parts.length !== 2) return name.trim();
  const [given, family] = parts as [string, string];
  const initials = given
    .split("-")
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return `${family} ${initials}`;
}

export interface CitationParts {
  names: string[];
  title: string;
  journal?: string;
  year?: string;
  volume?: string;
  articleNumber?: string;
}

/**
 * Suggested citation in Vancouver style:
 * "Pérez A, Gómez L, Ruiz M. Title. Journal. 2026;4:e0042." Up to six authors, then "et al.".
 */
export function vancouverCitation(parts: CitationParts): string {
  const names = parts.names.map(vancouverName);
  const authors = names.length > 6 ? [...names.slice(0, 6), "et al"].join(", ") : names.join(", ");
  const title = parts.title.trim().replace(/[.?!]$/, "");
  const issue = [
    parts.year ?? "",
    parts.volume ? `;${parts.volume}` : "",
    parts.articleNumber ? `:${parts.articleNumber}` : "",
  ].join("");
  return [authors, title, parts.journal, issue]
    .filter((part) => part && part.length > 0)
    .map((part) => `${part!.replace(/\.$/, "")}.`)
    .join(" ");
}

/** The year in a date written in any way ("22 de noviembre de 2026" → "2026"). */
export const yearOf = (date: string | undefined): string | undefined =>
  date ? /\b(\d{4})\b/.exec(date)?.[1] : undefined;
