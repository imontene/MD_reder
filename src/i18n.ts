export type AlertType = "note" | "tip" | "important" | "warning" | "caution";

export interface Strings {
  toc: string;
  /** Title-block labels (front matter `abstract` and `keywords`). */
  abstract: string;
  keywords: string;
  /** Labels of numbered captions ("Figura 1:", "Tabla 2:"). */
  figure: string;
  table: string;
  /** Note on the author marked "*" (`corresponding: true` in `authors`). */
  correspondingAuthor: string;
  /** Joins two authors in a running head ("Pérez y Gómez"). */
  and: string;
  /** "de" in "3 de 8", the page count of a footer. */
  pageOf: string;
  /** The open_access theme's first page: badge and labels of the sidebar. */
  openAccess: OpenAccessStrings;
  alerts: Record<AlertType, string>;
}

export interface OpenAccessStrings {
  badge: string;
  citation: string;
  editor: string;
  received: string;
  accepted: string;
  published: string;
  license: string;
  correspondence: string;
  /** The licence statement; {license} is the licence's name. */
  licenseText: string;
}

const STRINGS: Record<string, Strings> = {
  en: {
    toc: "Contents",
    abstract: "Abstract",
    keywords: "Keywords",
    figure: "Figure",
    table: "Table",
    correspondingAuthor: "Corresponding author.",
    and: "and",
    pageOf: "of",
    openAccess: {
      badge: "Open access",
      citation: "Citation",
      editor: "Editor",
      received: "Received",
      accepted: "Accepted",
      published: "Published",
      license: "License",
      correspondence: "Correspondence",
      licenseText:
        "Open access article distributed under the {license} license, which permits use, distribution and reproduction provided the authors are credited.",
    },
    alerts: {
      note: "Note",
      tip: "Tip",
      important: "Important",
      warning: "Warning",
      caution: "Caution",
    },
  },
  es: {
    toc: "Contenido",
    abstract: "Resumen",
    keywords: "Palabras clave",
    figure: "Figura",
    table: "Tabla",
    correspondingAuthor: "Autor para correspondencia.",
    and: "y",
    pageOf: "de",
    openAccess: {
      badge: "Acceso abierto",
      citation: "Cita",
      editor: "Editor",
      received: "Recibido",
      accepted: "Aceptado",
      published: "Publicado",
      license: "Licencia",
      correspondence: "Correspondencia",
      licenseText:
        "Artículo de acceso abierto bajo la licencia {license}, que permite su uso, distribución y reproducción citando a los autores.",
    },
    alerts: {
      note: "Nota",
      tip: "Consejo",
      important: "Importante",
      warning: "Advertencia",
      caution: "Precaución",
    },
  },
  pt: {
    toc: "Sumário",
    abstract: "Resumo",
    keywords: "Palavras-chave",
    figure: "Figura",
    table: "Tabela",
    correspondingAuthor: "Autor correspondente.",
    and: "e",
    pageOf: "de",
    openAccess: {
      badge: "Acesso aberto",
      citation: "Citação",
      editor: "Editor",
      received: "Recebido",
      accepted: "Aceito",
      published: "Publicado",
      license: "Licença",
      correspondence: "Correspondência",
      licenseText:
        "Artigo de acesso aberto sob a licença {license}, que permite uso, distribuição e reprodução desde que os autores sejam citados.",
    },
    alerts: {
      note: "Nota",
      tip: "Dica",
      important: "Importante",
      warning: "Aviso",
      caution: "Cuidado",
    },
  },
  fr: {
    toc: "Sommaire",
    abstract: "Résumé",
    keywords: "Mots-clés",
    figure: "Figure",
    table: "Tableau",
    correspondingAuthor: "Auteur correspondant.",
    and: "et",
    pageOf: "sur",
    openAccess: {
      badge: "Accès libre",
      citation: "Citation",
      editor: "Éditeur",
      received: "Reçu",
      accepted: "Accepté",
      published: "Publié",
      license: "Licence",
      correspondence: "Correspondance",
      licenseText:
        "Article en accès libre sous licence {license}, qui autorise l’utilisation, la diffusion et la reproduction en citant les auteurs.",
    },
    alerts: {
      note: "Remarque",
      tip: "Astuce",
      important: "Important",
      warning: "Avertissement",
      caution: "Attention",
    },
  },
  de: {
    toc: "Inhalt",
    abstract: "Zusammenfassung",
    keywords: "Schlüsselwörter",
    figure: "Abbildung",
    table: "Tabelle",
    correspondingAuthor: "Korrespondierender Autor.",
    and: "und",
    pageOf: "von",
    openAccess: {
      badge: "Open Access",
      citation: "Zitierweise",
      editor: "Herausgeber",
      received: "Eingegangen",
      accepted: "Angenommen",
      published: "Veröffentlicht",
      license: "Lizenz",
      correspondence: "Korrespondenz",
      licenseText:
        "Open-Access-Artikel unter der Lizenz {license}, die Nutzung, Verbreitung und Vervielfältigung unter Nennung der Autoren erlaubt.",
    },
    alerts: {
      note: "Hinweis",
      tip: "Tipp",
      important: "Wichtig",
      warning: "Warnung",
      caution: "Vorsicht",
    },
  },
};

/** Default document language: Spanish. English and others are available with `lang`. */
export const DEFAULT_LANG = "es";

/** UI strings for a BCP 47 language tag ("es-AR" uses "es"); Spanish as fallback. */
export function strings(lang: string): Strings {
  return STRINGS[lang.toLowerCase().split("-")[0]!] ?? STRINGS[DEFAULT_LANG]!;
}
