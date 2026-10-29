import { isDarkTheme } from "../options.js";

/**
 * Anti-Gravity design system tokens needed outside the stylesheets (theme-antigravity.css):
 * Mermaid draws its diagrams in a page of its own, and Chrome renders page headers and footers
 * apart from the document, so neither sees the CSS variables.
 */
const TOKENS = {
  light: {
    canvas: "#ffffff",
    surfaceSubtle: "#f6f8fb",
    ink: "#0f1419",
    inkSecondary: "#454e5c",
    inkMuted: "#636c7a",
    hairline: "#e6e9ef",
    hairlineStrong: "#c9d0db",
    accent: "#2456d3",
    accentSoft: "#ecf1fd",
  },
  dark: {
    canvas: "#0b0e13",
    surfaceSubtle: "#10141b",
    ink: "#eef1f6",
    inkSecondary: "#b6bdc9",
    inkMuted: "#8f98a7",
    hairline: "#232a35",
    hairlineStrong: "#3a4352",
    accent: "#7ea4ff",
    accentSoft: "#16213b",
  },
};

export const isAntigravityTheme = (theme: string): boolean => theme.startsWith("antigravity");

const tokensFor = (theme: string) => (isDarkTheme(theme) ? TOKENS.dark : TOKENS.light);

/**
 * Mermaid "base" theme variables for an Anti-Gravity page: nodes on accent-soft outlined in
 * accent, edges and arrows in ink-muted, groups on surface-subtle. Undefined for other themes.
 */
export function mermaidThemeVariables(theme: string): Record<string, string | boolean> | undefined {
  if (!isAntigravityTheme(theme)) return undefined;
  const t = tokensFor(theme);
  return {
    darkMode: isDarkTheme(theme),
    background: t.canvas,
    primaryColor: t.accentSoft,
    primaryBorderColor: t.accent,
    primaryTextColor: t.ink,
    secondaryColor: t.surfaceSubtle,
    secondaryBorderColor: t.hairlineStrong,
    secondaryTextColor: t.ink,
    tertiaryColor: t.canvas,
    tertiaryBorderColor: t.hairlineStrong,
    tertiaryTextColor: t.ink,
    mainBkg: t.accentSoft,
    nodeBorder: t.accent,
    nodeTextColor: t.ink,
    lineColor: t.inkMuted,
    textColor: t.ink,
    titleColor: t.ink,
    clusterBkg: t.surfaceSubtle,
    clusterBorder: t.hairlineStrong,
    edgeLabelBackground: t.canvas,
    noteBkgColor: t.surfaceSubtle,
    noteBorderColor: t.hairlineStrong,
    noteTextColor: t.ink,
    actorBkg: t.accentSoft,
    actorBorder: t.accent,
    actorTextColor: t.ink,
    actorLineColor: t.hairlineStrong,
    signalColor: t.inkMuted,
    signalTextColor: t.ink,
    labelBoxBkgColor: t.surfaceSubtle,
    labelBoxBorderColor: t.hairlineStrong,
    labelTextColor: t.ink,
  };
}

export interface HeaderFooterStyle {
  color: string;
  /** Set in the mono family, uppercase and tracked, like the system's slide footers. */
  mono: boolean;
}

/** How page headers and footers look for a page theme. */
export function headerFooterStyle(theme: string): HeaderFooterStyle {
  if (isAntigravityTheme(theme)) return { color: tokensFor(theme).inkMuted, mono: true };
  if (theme === "academic_basic") return { color: "#4a4a4a", mono: false };
  return { color: "#59636e", mono: false };
}
