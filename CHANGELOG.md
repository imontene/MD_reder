# Cambios

## Sin publicar

- Los elementos de listas con viñetas y numeradas (también anidadas o dentro de citas y
  alertas) se justifican en el PDF como los demás párrafos, con partición de palabras. El
  código y las tablas dentro de una lista siguen alineados a la izquierda.

## 2.7.0 — 2026-10-23

- `--watermark-field` pone ahora dos campos de luz en cada página: arriba a la izquierda (antes
  arriba a la derecha) y uno nuevo abajo a la derecha. El campo junto al título de la primera
  página no cambia.

## 2.6.1 — 2026-10-22

- **PDF mucho más livianos con los campos de luz.** Chrome convertía los degradados CSS del
  campo en varias imágenes por página. Ahora el campo es un SVG que queda en el PDF como
  sombreado vectorial, con el mismo aspecto:
  - con `--watermark-field`, el README pasa de 3,0 MB a 0,41 MB (antes unos 290 KB más por
    página, ahora unos 7 KB en total);
  - con el tema Anti-Gravity, el campo junto al título ya no añade ~140 KB a cada documento
    con título (el ejemplo pasa de 332 KB a 195 KB).

## 2.6.0 — 2026-10-22

- **Marcas de agua** con el degradado Anti-Gravity, solo en el PDF y desactivadas por defecto:
  - `--watermark <texto>` (o `watermark:`): texto en diagonal en cada página, ajustado al
    tamaño y la orientación de la hoja;
  - `--watermark-field` (o `watermarkField: true`): campo de luz en la esquina de cada página.

  Van detrás del contenido y funcionan con cualquier tema.

## 2.5.0 — 2026-10-22

- **Nuevo estilo por defecto: Anti-Gravity**, tomado del design system del mismo nombre y
  llevado a páginas. Incluye:
  - colores del sistema y títulos en Manrope 600 con interletrado negativo;
  - etiquetas en JetBrains Mono, en mayúsculas: autor y fecha sobre el título, índice,
    encabezado y pie;
  - código, tablas, citas y alertas como superficies suaves;
  - diagramas Mermaid con los mismos colores;
  - un campo de luz tenue junto al título de la primera página.
- `--theme antigravity-dark` es su versión oscura. **Para conservar el aspecto anterior:**
  `--theme light` (o `theme: light` en `mdrender.config.json`); `--theme dark` sigue
  disponible.

## 2.4.0 — 2026-10-22

- **Párrafos justificados en el PDF**: los del texto, las citas y las alertas, con partición de
  palabras según el idioma del documento (español, inglés, portugués, francés, alemán e
  italiano). Listas, tablas, notas al pie, índice y diagramas siguen alineados a la izquierda,
  y el HTML no cambia. `--no-justify` (o `justify: false`) lo desactiva. El texto del PDF solo
  lleva el guion donde una palabra se corta: copiar y buscar siguen funcionando.

## 2.3.0 — 2026-10-16

- **Manrope es la nueva tipografía por defecto** del texto, el encabezado, el pie y los
  diagramas Mermaid. `--font inter` (o `font: inter`) conserva Inter, la de versiones
  anteriores. Manrope no tiene cursivas (el navegador inclina la normal) y toma de Inter los
  símbolos que le faltan (`→`, `✓`, `≤`…).

## 2.2.0 — 2026-10-15

- **Autoajuste de diagramas de flujo Mermaid** (`flowchart`/`graph`): cada diagrama se dibuja
  con varios anchos de ajuste de etiquetas y se elige el que imprime el texto más grande (a igual
  legibilidad, el más bajo), nunca más pequeño que tal como está escrito. Si sigue por debajo del
  75 % de su tamaño, se prueba el otro eje (`LR` → `TB`, `TD` → `LR`) y se gira si gana al menos
  15 puntos. En el banco de pruebas, la escala media del texto pasa de 0,80 a 0,98 y ningún
  diagrama queda por debajo de 0,6.
  - `--mermaid-flip never` (`mermaidFlip`) conserva la dirección; `--no-mermaid-autofit`
    (`mermaidAutofit: false`) lo desactiva. Se respetan los diagramas con `%%{init}%%` o
    `config:` propios.
  - `-v` informa la elección por diagrama; aviso si un diagrama se imprime por debajo del 50 %.
- Un título seguido de un diagrama o una imagen ya no queda solo al pie de una página: pasa con
  ellos a la siguiente.
- `npm run bench:mermaid [-- archivo.md]` compara los diagramas de un documento con y sin
  autoajuste.

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
