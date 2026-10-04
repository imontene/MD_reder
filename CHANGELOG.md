# Cambios

## 1.0.0 — 2026-10-04

Primera versión estable.

- Markdown → PDF y HTML autocontenido con Inter (texto) y JetBrains Mono (código).
- GFM: tablas, listas de tareas, tachado, enlaces automáticos, notas al pie, alertas
  `> [!NOTE]`, resaltado de código.
- Ecuaciones LaTeX con KaTeX (`$…$`, `$$…$$`, ` ```math `) y diagramas Mermaid.
- Página: tamaño, márgenes, orientación, encabezado/pie con números de página, tabla de
  contenidos, marcadores y PDF etiquetado.
- Front matter YAML y `mdrender.config.json`; idioma por defecto español.
- Lotes (archivos, carpetas, patrones), `--watch`, `mdrender preview` con recarga en vivo.
- Temas claro, oscuro o CSS propio.
- `mdrender setup` descarga Chrome Headless Shell si no hay navegador.
- Seguridad: sin JavaScript del documento, sin descargas de red salvo `--allow-remote`.
- `--quiet` y `--verbose`.
- Ejecutables independientes para Windows x64 y Linux x64/arm64; paquete npm
  `@imontene/mdrender`.
