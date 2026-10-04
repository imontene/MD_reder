export type AlertType = "note" | "tip" | "important" | "warning" | "caution";

export interface Strings {
  toc: string;
  alerts: Record<AlertType, string>;
}

const STRINGS: Record<string, Strings> = {
  en: {
    toc: "Contents",
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
