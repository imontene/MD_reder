/**
 * The Anti-Gravity gradient field: three soft lights (field-blue, field-cyan, field-violet),
 * each an ellipse fading to transparent inside its box.
 *
 * Drawn as an SVG image rather than CSS radial-gradient()s: Chrome rasterizes CSS gradients that
 * fade to transparent into several bitmaps per page (about 70 KB each, repeated on every page),
 * while SVG gradients with stop-opacity go into the PDF as small vector shadings.
 */

export const FIELD_COLORS = { blue: "#4f7cff", cyan: "#22c3e6", violet: "#8c6cf0" };

/** Field opacity on light pages and on dark ones (the design system's opacity-field tokens). */
export const FIELD_OPACITY = { light: 0.16, dark: 0.22 };

/** Each light: centre and radii in % of the box (as `radial-gradient(rx ry at cx cy)`). */
const LIGHTS = [
  { color: FIELD_COLORS.blue, cx: 58, cy: 45, rx: 28, ry: 38 },
  { color: FIELD_COLORS.cyan, cx: 78, cy: 58, rx: 16, ry: 26 },
  { color: FIELD_COLORS.violet, cx: 40, cy: 32, rx: 25, ry: 30 },
];

/** The field as an SVG stretched over its box (viewBox in %, no aspect ratio kept). */
export function fieldSvg(opacity: number): string {
  const gradients = LIGHTS.map(
    ({ color, cx, cy, rx, ry }, i) =>
      `<radialGradient id="f${i}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" ` +
      `gradientTransform="translate(${cx} ${cy}) scale(${rx} ${ry})">` +
      `<stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/>` +
      `<stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`,
  ).join("");
  const fills = LIGHTS.map((_, i) => `<rect width="100" height="100" fill="url(#f${i})"/>`).join(
    "",
  );
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">` +
    `<defs>${gradients}</defs>${fills}</svg>`
  );
}

/**
 * CSS `url(…)` of the field image. The SVG has only double quotes, which the encoding escapes, so
 * the value is safe inside single quotes, also in a style="…" attribute.
 */
export function fieldImage(dark: boolean): string {
  const svg = fieldSvg(dark ? FIELD_OPACITY.dark : FIELD_OPACITY.light);
  return `url('data:image/svg+xml,${encodeURIComponent(svg)}')`;
}
