# Cambios

## 2.16.5 — 2026-11-21

- **Marca de agua visible en todas las páginas**: aun con la 2.16.3, la marca iba debajo del
  contenido, así que las figuras y las tablas la tapaban y en las páginas de texto denso se
  perdía: parecía cortada o no aparecía. Ahora va por encima, fundida con el contenido
  (`multiply` en las páginas claras, `screen` en las oscuras): tiñe el papel, las figuras y las
  tablas sin tapar el texto, que conserva su color. La portada de los temas de revista sigue
  limpia. El PDF sigue siendo vectorial.

## 2.16.4 — 2026-11-21

- **Tablas anchas en los temas de revista** (`tech_magazine` y `tech_magazine-dark`): desde la
  2.14.0, una tabla más ancha que su columna (por ejemplo, con rutas de código largas) se salía
  por el borde de la página. Ahora se mide al imprimir: si no cabe en su columna, ocupa las dos,
  como un diagrama; las que caben siguen en su columna. Si una tabla no cabe ni a todo el ancho,
  el código de sus celdas se parte en varias líneas, y las palabras sólo si no hay otro remedio.

## 2.16.3 — 2026-11-21

- **Marca de agua legible**: el texto de `--watermark` quedaba tan tenue (10 % de opacidad) que
  parecía cortado o no se veía: el cian del centro del degradado casi no se distinguía del
  papel. Ahora va al 18 % (22 % en los temas oscuros) y en negrita, y en las páginas claras el
  cian del degradado se oscurece hasta la luminosidad del azul y del violeta, de modo que la
  palabra se lee entera y pareja. Los campos de luz no cambian.

## 2.16.2 — 2026-11-20

- **Marca de agua**: el texto de `--watermark` se imprime tal como se escribe, respetando
  mayúsculas y minúsculas (antes se pasaba siempre a mayúsculas). El tamaño de la letra tiene
  en cuenta que las minúsculas son más estrechas, así que el texto sigue ocupando la diagonal.

## 2.16.1 — 2026-11-19

- **Epígrafes de figuras en `academic_basic`**: una imagen seguida, en la línea siguiente del
  mismo párrafo, de «**Figura N.** …» (`![alt](img.png)\` y debajo el epígrafe) se imprimía
  como un párrafo normal, sin el estilo de epígrafe. Ahora es una figura con ese epígrafe debajo
  de la imagen, tal como se escribe (sin el «Fig. N.» automático), en Inter al 90 % y centrado
  en su columna (o en el ancho completo con `#wide`).

## 2.16.0 — 2026-11-19

- **Epígrafes en `academic_basic`**:
  - un párrafo que empieza con «**Tabla N.**» justo antes o después de una tabla es su
    epígrafe: se imprime debajo de la tabla, a todo el ancho, y no se separa de ella;
  - un párrafo que empieza con «**Figura N.**» junto a un diagrama Mermaid se imprime debajo
    del diagrama, también a todo el ancho;
  - junto a una imagen, ese párrafo queda donde está, con el estilo de epígrafe;
  - se reconocen también `Table`, `Cuadro`, `Tabela`, `Tableau`, `Tabelle`, `Figure`, `Fig.`,
    `Gráfico`, `Gráfica`, `Diagrama`, `Abbildung`. El texto y el número quedan como se
    escriben;
  - todos los epígrafes, también los de las figuras, van en Inter al 90 % del tamaño del texto
    (antes, los de figura al 80 %) y centrados: los de tablas y diagramas en el ancho
    completo, los de figuras en su columna (o en el ancho completo con `#wide`).

## 2.15.0 — 2026-11-10

- **Revista `Introspect`**: el paquete trae la carpeta `tech_magazine/Introspect/`, con las
  mismas cuatro portadas y el mismo `magazine.json` (acento, tintas y velos) que
  `AlphaZeroChess`. `magazine-name: Introspect` ya tiene portada y pone «Introspect» en la
  cabecera y el pie. `AlphaZeroChess` no cambia y sigue siendo el valor por defecto.
- **Licencia de las portadas**: las portadas de revista del paquete (`tech_magazine/`, imágenes
  y `magazine.json`) se distribuyen desde esta versión bajo CC BY-NC-ND 4.0 (titular: Ivan
  Montenegro, IMMA AI Works), no bajo la MIT del código. Ver `tech_magazine/LICENSE.md`; el
  campo `license` de `package.json` pasa a `MIT AND CC-BY-NC-ND-4.0` y los ejecutables traen
  `LICENSE-tech_magazine.md`. Las versiones 2.14.1 y anteriores siguen bajo MIT.

## 2.14.1 — 2026-11-10

- **Figuras tan altas como la página** (temas `academic_basic`, `tech_magazine` y
  `tech_magazine-dark`), en el PDF:
  - la leyenda ya no queda sola en la página siguiente: la imagen se reduce lo justo para dejar
    sitio a su leyenda, que se mide al imprimir, sea de una línea o de varias;
  - en los temas de revista, una imagen recortada en altura ya no se estira a lo ancho: conserva
    sus proporciones, centrada y con sus esquinas redondeadas.

## 2.14.0 — 2026-11-10

- **Temas de revista a dos columnas** (`tech_magazine` y `tech_magazine-dark`), en el PDF:
  - el artículo se diagrama a dos columnas; la portada sigue sola en la página 1, a sangre y
    sin cambios. Los diagramas, las figuras anchas y los títulos `#` ocupan las dos columnas;
    las tablas, las notas, las citas destacadas y el código quedan en su columna, y las tablas
    no se parten;
  - un título nunca queda solo al pie de una columna o página, ni partido entre dos;
  - márgenes laterales de 16 mm (antes 24 mm). El HTML sigue a una sola columna.

## 2.13.0 — 2026-11-08

- **Ideas clave en los temas de revista** (`tech_magazine` y `tech_magazine-dark`): las notas
  `> [!NOTE]` son ahora una tarjeta teñida con el color de acento, con el texto grande en
  Fraunces seminegrita (Google Fonts, incluida en el paquete), alineado a la izquierda y sin
  partir palabras. Una primera línea solo en negrita sigue siendo la etiqueta. Las demás alertas
  conservan la tarjeta gris. Fraunces solo se incrusta en el PDF cuando hay una nota.

## 2.12.1 — 2026-11-08

- **Temas de revista** (`tech_magazine` y `tech_magazine-dark`): en el PDF, los párrafos se
  justifican, con las palabras partidas con guion, como en los demás temas. Las citas
  destacadas quedan alineadas a la izquierda. `--no-justify` vuelve a la columna sin justificar.

## 2.12.0 — 2026-11-08

- **Más acabado en los diagramas Mermaid**, en todos los temas:
  - las figuras, los actores y las notas se rellenan con un degradado vertical muy suave de su
    color, también el que pone el autor con `classDef` o `style`; los subgraphs mantienen su color
    liso. La transparencia de los rellenos se conserva en el PDF, que sigue siendo vectorial;
  - los subgraphs llevan un encabezado detrás del título: una franja algo más oscura que el resto
    del subgraph, o algo más clara cuando el subgraph es oscuro. Mermaid deja unos píxeles más
    alrededor del título para que la franja no toque los nodos.

## 2.11.1 — 2026-11-06

- **Diagramas Mermaid en los temas de revista** (`tech_magazine` y `tech_magazine-dark`): un
  diagrama tan alto como la página ya no deja su tarjeta vacía en una página y el dibujo en la
  siguiente. El diagrama se reduce ahora a la altura útil menos el relleno de la tarjeta, así que
  la tarjeta entera cabe en su página.

## 2.11.0 — 2026-11-06

- **Acabado de los diagramas Mermaid**, en todos los temas:
  - esquinas ligeramente redondeadas en todas las figuras: rectángulos, subgraphs, actores y
    notas, y también rombos, hexágonos, paralelogramos, trapecios y banderas, redibujados con
    las esquinas suavizadas;
  - títulos de los subgraphs en negrita, medidos así por Mermaid para que no se desborden;
  - rellenos de figuras y subgraphs con su color, pero al 72 % de opacidad, para que se vean el
    fondo y las marcas de agua. Se quitó la sombra del estilo de Mermaid 12, que agrisaba los
    rellenos translúcidos; los PDF con diagramas pesan menos, porque Chrome la guardaba como
    imagen.

## 2.10.0 — 2026-11-04

- **Tema de revista de tecnología** `--theme tech_magazine` (o `tech_magazine-dark`, con la
  página en negro), que no se usa por defecto:
  - con `title`, portada a sangre con una imagen de `tech_magazine/<magazine-name>/`, el nombre
    de la revista, la etiqueta, el título, la bajada y la firma;
  - Inter de 300 a 800 en una columna sin justificar, Newsreader en la bajada, la capitular y
    las citas destacadas; alertas como recuadros, tablas como fichas técnicas, código en
    tarjetas oscuras;
  - pie con la revista, la fecha y el número de página, sin pie en la portada.
- Front matter de la portada: `magazine-name` (por defecto `AlphaZeroChess`, con 4 portadas
  incluidas), `cover` (número de imagen; al azar si falta), `cover-text` (`top` o `bottom`),
  `cover-ink` (`dark` o `light`) y `accent`. Un `magazine.json` en la carpeta de la revista
  fija su acento y la tinta de cada portada.
- Nueva especificación del Markdown que esperan los temas `academic_basic` y `tech_magazine`:
  [docs/ESPECIFICACION_TEMAS.md](docs/ESPECIFICACION_TEMAS.md).

## 2.9.0 — 2026-10-29

- Los elementos de listas con viñetas y numeradas (también anidadas o dentro de citas y
  alertas) se justifican en el PDF como los demás párrafos, con partición de palabras. El
  código y las tablas dentro de una lista siguen alineados a la izquierda.

## 2.8.1 — 2026-10-29

- Tema `academic_basic`: márgenes laterales de 8 mm (antes 16 mm), con más ancho para las dos
  columnas. Los márgenes superior e inferior siguen en 18 mm.

## 2.8.0 — 2026-10-28

- **Tema académico** `--theme academic_basic` (o `theme: academic_basic`), con el aspecto de
  un artículo de revista científica:
  - texto en STIX Two Text (incrustada en el PDF) y títulos, leyendas y tablas en Inter;
  - en el PDF, dos columnas justificadas con sangría de párrafo; el bloque de título, las
    tablas, los diagramas y las figuras anchas ocupan las dos;
  - imágenes solas como figuras numeradas («Fig. 1.») con el texto alternativo como leyenda,
    y `#wide` al final de la ruta para que ocupen las dos columnas;
  - tablas con tres líneas, sin rejilla;
  - márgenes de 18 × 16 mm, texto de 9,5 pt e Inter por defecto.
- **Bloque de título para artículos**, con cualquier tema: `kicker` (etiqueta sobre el título),
  `affiliations` (numeradas), `abstract` y `keywords` en el front matter, y `^1,2^` en
  `author` para las afiliaciones en superíndice.

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
