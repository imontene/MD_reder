# Cambios

## 2.1.0 — 2026-10-15

- `mdrender doctor`: revisa instalación (versión, Node.js, `PATH`), navegador (cuál y por qué,
  arranque y versión, sandbox), una conversión real de prueba, el `mdrender.config.json`
  aplicado (errores, opciones mal escritas, valores efectivos), la caché de `setup` y el proxy.
  `--quick`, `--json`; código 1 si encuentra un problema.
- Mejor uso de la página:
  - Los bloques de código largos se parten entre páginas (al menos 4 líneas a cada lado) en
    vez de saltar enteros y dejar hasta media página en blanco; los de hasta 12 líneas siguen
    juntos.
  - `--density compact` (o `density: compact`): interlineado y espacios más ajustados.
  - `--font-size <tamaño>` (o `fontSize`): tamaño del texto, por defecto 10.5pt.
  - Mermaid usa el tamaño de letra del documento (antes 16 px) y los diagramas de secuencia no
    repiten los actores al pie.
  - Imágenes y diagramas más altos que la página se reducen para caber en una sola.

## 2.0.0 — 2026-10-13

- Márgenes por lado: `--margin-top`, `--margin-right`, `--margin-bottom`, `--margin-left`
  (también `marginTop`… en front matter y `mdrender.config.json`), por encima de `--margin`.
- Orientación con `--orientation portrait|landscape` (`--landscape` sigue funcionando).
- **Cambian los valores por defecto**: hoja **Letter** (antes A4) y márgenes de **10 mm**
  (antes 20 mm). Para el formato anterior: `--page-size A4 --margin 20mm`, o ponerlo en
  `mdrender.config.json`.
- El proceso de publicación falla al inicio, con un error claro, si falta `NPM_TOKEN`.
- Nunca sobrescribe el `.md` de entrada: `mdrender doc.md -o doc.md` termina con un error.
- Avisa de opciones desconocidas en `mdrender.config.json` y sugiere la correcta
  (`"margn"` → `"margin"`).
- Escritura segura: el PDF/HTML se escribe en un archivo temporal y se renombra al final; un
  fallo no deja archivos a medias y conserva la versión anterior. Mensaje claro si el archivo
  está abierto en otro programa.
- Avisa si un encabezado o pie no cabe (margen superior o inferior menor de 10 mm).

## 1.0.1 — 2026-10-12

- Corrige un error EPIPE sin capturar cuando la salida se corta con una tubería
  (por ejemplo `mdrender --help | head`); ahora el comando termina normalmente.
- El flujo de publicación se puede lanzar a mano con la versión
  (Actions → Release → Run workflow).

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
