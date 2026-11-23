export type AlertType = "note" | "tip" | "important" | "warning" | "caution";

export interface Strings {
  toc: string;
  /** Title-block labels (front matter `abstract` and `keywords`). */
  abstract: string;
  keywords: string;
  /** Labels of numbered captions ("Figura 1:", "Tabla 2:"). */
  figure: string;
  table: string;
  alerts: Record<AlertType, string>;
}

const STRINGS: Record<string, Strings> = {
  en: {
    toc: "Contents",
    abstract: "Abstract",
    keywords: "Keywords",
    figure: "Figure",
    table: "Table",
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
