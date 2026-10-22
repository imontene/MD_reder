# MD_reder · `mdrender`

**Convierte archivos Markdown (`.md`) en PDF y HTML desde la línea de comandos, en Windows y
Linux**, con ecuaciones LaTeX, diagramas Mermaid y la tipografía
[Manrope](https://fonts.google.com/specimen/Manrope) (o [Inter](https://fonts.google.com/specimen/Inter)).

```bash
mdrender informe.md            # → informe.pdf
```

Ejemplo: [`examples/ejemplo.md`](examples/ejemplo.md) → [`examples/ejemplo.pdf`](examples/ejemplo.pdf)

## Características

- 📄 **Markdown → PDF o HTML autocontenido** (fuentes, imágenes y diagramas incluidos).
- ➗ **Ecuaciones** `$…$` y `$$…$$` con KaTeX, dibujadas al convertir (sin JavaScript en la salida).
- 📊 **Diagramas Mermaid**: flujo, secuencia, clases, estados, ER, Gantt, torta, mapa mental…
- 🔤 **Manrope** para el texto (o **Inter** con `--font inter`) y **JetBrains Mono** para el
  código, incrustadas en el PDF.
- 🧩 **GFM**: tablas, listas de tareas, tachado, notas al pie, alertas `> [!NOTE]`,
  resaltado de código para ~35 lenguajes.
- 🖨️ Tamaño de página, márgenes, orientación, encabezado/pie con números de página,
  tabla de contenidos y marcadores del PDF.
- 🗂️ **Lotes**: varios archivos, carpetas completas o patrones `docs/**/*.md`.
- 🔁 **`--watch`** y **vista previa en vivo** en el navegador.
- 🎨 Estilo **Anti-Gravity** por defecto (con variante oscura), los temas clásicos **claro** y
  **oscuro**, o tu propio CSS.
- 🔌 **Sin conexión**: todo va empaquetado; por defecto no descarga nada de internet.
- 💻 **Windows 10/11 y Linux** (x64; arm64 en Linux), probado en ambos en cada cambio.

## Instalación

mdrender usa un navegador basado en Chromium para dibujar el PDF. **Microsoft Edge** ya viene
en Windows 10/11; en Linux sirve **Google Chrome**, **Chromium**, **Edge** o **Brave**. Se
detecta automáticamente. ¿No tienes ninguno? Ejecuta `mdrender setup` y se descarga Chrome
Headless Shell (~100 MB) en tu carpeta de usuario.

### Opción 1: ejecutable (sin instalar Node.js)

Descarga el archivo de tu sistema desde [Releases](../../releases):

| Sistema     | Archivo                                 |
| ----------- | --------------------------------------- |
| Windows x64 | `mdrender-<versión>-win-x64.zip`        |
| Linux x64   | `mdrender-<versión>-linux-x64.tar.gz`   |
| Linux arm64 | `mdrender-<versión>-linux-arm64.tar.gz` |

Descomprímelo y deja `mdrender` (o `mdrender.exe`) en una carpeta que esté en el `PATH`.
`SHA256SUMS.txt` permite verificar la descarga.

### Opción 2: npm (Node.js 22.12 o superior)

```bash
npm install -g @imontene/mdrender
mdrender --version

# o sin instalar
npx @imontene/mdrender documento.md
```

### Opción 3: desde el código fuente

```bash
git clone https://github.com/imontene/MD_reder.git
cd MD_reder
npm install
npm run build
npm link        # deja disponible el comando `mdrender`
```

## Uso

```bash
# Básico: genera documento.pdf junto al .md
mdrender documento.md

# Elegir salida, tamaño de página y tabla de contenidos
mdrender documento.md -o salida/informe.pdf --page-size A4 --toc

# HTML autocontenido
mdrender documento.md --format html

# Varios archivos, carpetas (recursivo) o patrones; -o es entonces una carpeta
mdrender capitulo1.md capitulo2.md -o pdf/
mdrender docs/ -o pdf/            # conserva la estructura de subcarpetas
mdrender "docs/**/*.md" -o pdf/   # los patrones funcionan también en Windows

# Regenerar al guardar (Ctrl+C para salir)
mdrender docs/ -o pdf/ --watch

# Vista previa en el navegador que se recarga sola al guardar
mdrender preview documento.md

# Más contenido por página
mdrender documento.md --density compact --font-size 10pt

# Variante oscura de Anti-Gravity, el estilo clásico, o un CSS propio que reemplaza el tema
mdrender documento.md --theme antigravity-dark
mdrender documento.md --theme light
mdrender documento.md --theme mi-tema.css

# Descargar un navegador si no tienes Chrome, Edge ni Chromium
mdrender setup

# Diagnóstico: instalación, navegador, configuración y una conversión de prueba
mdrender doctor
```

### Si algo no funciona: `mdrender doctor`

Revisa la versión y el Node.js, si `mdrender` está en el `PATH`, qué navegador se usa (y por
qué), lo arranca y convierte un documento de prueba con una ecuación y un diagrama, e indica
qué `mdrender.config.json` se aplica, con sus opciones mal escritas y los valores efectivos.
Cada problema viene con su solución sugerida; termina con código 1 si encuentra alguno.

```text
[ok]   mdrender         2.0.0, npm package (/usr/lib/node_modules/@imontene/mdrender)
[ok]   Node.js          22.23.3
[warn] PATH             the mdrender command is not in any PATH folder
                        -> add its folder to PATH (for npm: the output of `npm prefix -g`…)
[ok]   Browser          C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
[ok]   Test conversion  PDF with an equation and a Mermaid diagram in 1840 ms
```

`--quick` omite el arranque del navegador y la conversión; `--json` produce el informe en JSON
para compartirlo.

En Windows (PowerShell o CMD) los comandos son idénticos:

```powershell
mdrender "C:\Users\yo\Documentos\notas de clase.md" -o "C:\Users\yo\Desktop\notas.pdf"
```

Con varios archivos se usa un solo navegador para todos; si uno falla, el resto se convierte
igual. `mdrender preview` sirve la página en `http://127.0.0.1` (solo accesible desde tu
equipo); `--port` fija el puerto y `--no-open` no abre el navegador.

### Opciones

| Opción                         | Descripción                                                                                      | Por defecto           |
| ------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------- |
| `-o, --output <ruta>`          | Archivo de salida, o carpeta con varios archivos                                                 | junto al `.md`        |
| `-f, --format <pdf\|html>`     | Formato de salida                                                                                | `pdf`                 |
| `--page-size <tamaño>`         | `Letter`, `A4`, `Legal` (también `A3`, `A5`, `Tabloid`)                                          | `Letter`              |
| `--margin <valor>`             | Las cuatro márgenes como en CSS: `10mm`, `15mm 20mm`…                                            | `10mm`                |
| `--margin-top <medida>`        | Margen superior, p. ej. `15mm` (prevalece sobre `--margin`)                                      | `10mm`                |
| `--margin-right <medida>`      | Margen derecho                                                                                   | `10mm`                |
| `--margin-bottom <medida>`     | Margen inferior                                                                                  | `10mm`                |
| `--margin-left <medida>`       | Margen izquierdo                                                                                 | `10mm`                |
| `--orientation <orientación>`  | `portrait` (vertical) o `landscape` (horizontal)                                                 | `portrait`            |
| `--landscape`                  | Atajo de `--orientation landscape`                                                               | —                     |
| `--toc`                        | Tabla de contenidos al inicio (o donde pongas `[[toc]]`)                                         | —                     |
| `--toc-depth <n>`              | Nivel de título más profundo en la tabla de contenidos                                           | `3`                   |
| `--header <texto>`             | Encabezado de página (ver abajo)                                                                 | —                     |
| `--footer <texto>`             | Pie de página (ver abajo)                                                                        | `{page} / {pages}`    |
| `--no-page-numbers`            | Sin el pie con números de página                                                                 | —                     |
| `--font <manrope\|inter>`      | Tipografía del texto (ver abajo)                                                                 | `manrope`             |
| `--no-justify`                 | Párrafos alineados a la izquierda en el PDF (ver abajo)                                          | justificado           |
| `--watermark <texto>`          | Marca de agua en diagonal en cada página del PDF, con el degradado Anti-Gravity                  | —                     |
| `--watermark-field`            | Campo de luz con el degradado en la esquina de cada página del PDF                               | —                     |
| `--density <densidad>`         | `normal` o `compact` (menos espacio entre líneas y bloques)                                      | `normal`              |
| `--font-size <tamaño>`         | Tamaño del texto en `pt` o `px`, de 6 a 24 pt; p. ej. `10pt`                                     | `10.5pt`              |
| `--theme <tema\|css>`          | `antigravity`, `antigravity-dark`, `light`, `dark` o un `.css` que reemplaza el tema (ver abajo) | `antigravity`         |
| `--css <archivo.css>`          | CSS adicional (se puede repetir)                                                                 | —                     |
| `--mermaid-theme <tema>`       | `default`, `neutral`, `dark`, `forest`, `base`                                                   | el del tema de página |
| `--mermaid-flip <auto\|never>` | Si el autoajuste puede girar un diagrama de flujo de eje (ver abajo)                             | `auto`                |
| `--no-mermaid-autofit`         | Dibujar los diagramas de flujo tal como están escritos                                           | —                     |
| `--lang <código>`              | Idioma del documento; `en` para inglés (`pt`, `fr`, `de`…)                                       | `es`                  |
| `--title <texto>`              | Título del documento (muestra un bloque de título)                                               | primer `# título`     |
| `--config <archivo>`           | Archivo de configuración                                                                         | el más cercano        |
| `--no-config`                  | Ignorar `mdrender.config.json`                                                                   | —                     |
| `--browser <ruta>`             | Ruta a Chrome/Edge/Chromium (o variable `MDRENDER_BROWSER`)                                      | autodetección         |
| `--allow-remote`               | Permitir que el PDF descargue imágenes/CSS de internet                                           | bloqueado             |
| `-w, --watch`                  | Regenerar al guardar                                                                             | —                     |
| `-q, --quiet`                  | Mostrar solo advertencias y errores                                                              | —                     |
| `-v, --verbose`                | Mostrar también configuración, navegador y tiempos                                               | —                     |

**Página**: por defecto hoja **Letter vertical con márgenes de 10 mm**. Las medidas aceptan
`mm`, `cm`, `in` o `px`. `--margin` fija las cuatro márgenes a la vez y `--margin-top`,
`--margin-right`, `--margin-bottom` y `--margin-left` ajustan una sola, por encima de
`--margin`. Ejemplo: `--page-size A4 --orientation landscape --margin 15mm --margin-left 25mm`.
El encabezado y el pie se dibujan dentro de las márgenes superior e inferior: con menos de
10 mm pueden tocar el texto y mdrender lo advierte.

**Temas**: por defecto los documentos usan el estilo **Anti-Gravity**, tomado del design system
del mismo nombre y llevado de diapositivas a páginas:

- Manrope 600 en títulos con interletrado negativo, Manrope 400 en el texto.
- Etiquetas en JetBrains Mono, en mayúsculas: autor y fecha sobre el título, el índice, el
  encabezado y el pie.
- Un único azul de acento para enlaces y etiquetas, superficies suaves sin bordes gruesos, y
  alertas como tarjetas.
- Los diagramas Mermaid llevan los mismos colores.
- En la primera página, junto al título, un campo de luz muy tenue en azul, cian y violeta.

`--theme antigravity-dark` es su versión oscura. `--theme light` conserva el estilo de las
versiones anteriores y `--theme dark` su variante oscura. El design system pide texto alineado
a la izquierda: con este tema, usa `--no-justify` si quieres seguirlo al pie de la letra.

**Marca de agua**: dos marcas con el degradado azul → cian → violeta del design system
Anti-Gravity, cada una por separado y solo en el PDF:

```bash
mdrender informe.md --watermark "Borrador"     # texto en diagonal en cada página
mdrender informe.md --watermark-field          # campo de luz en la esquina de cada página
```

También como `watermark: Borrador` y `watermarkField: true` en el front matter o en
`mdrender.config.json`. Van muy tenues y detrás del contenido: no tapan el texto, y las
imágenes, tablas y tarjetas quedan por encima. El texto de la marca no entra en el texto del
PDF, así que no aparece al copiar ni al buscar. Funcionan con cualquier tema y son algo más
intensas en los oscuros.

**Tipografía**: el texto usa [Manrope](https://fonts.google.com/specimen/Manrope);
`--font inter` (o `font: inter` en el front matter o en `mdrender.config.json`) vuelve a
[Inter](https://fonts.google.com/specimen/Inter), la tipografía de las versiones anteriores.
Ambas van incrustadas en el PDF, también en el encabezado, el pie y los diagramas. Manrope no
tiene cursivas (el navegador inclina la normal) ni algunos símbolos como `→`, `✓` o `≤`, que
se toman de Inter.

**Párrafos justificados**: en el PDF, los párrafos del texto, de las citas y de las alertas
se justifican, y las palabras largas se parten con guion al final de la línea según el idioma
del documento (`lang`: español, inglés, portugués, francés, alemán o italiano; en otros idiomas
se justifica sin partir palabras). Listas, tablas, notas al pie, el índice y los diagramas
quedan alineados a la izquierda, igual que el HTML. El texto del PDF solo lleva el guion donde
la palabra se corta, así que copiar y buscar funcionan con las palabras completas.
`--no-justify` (o `justify: false`) vuelve a alinear a la izquierda.

**Aprovechar la página**: `--density compact` reduce interlineado, espacios entre párrafos y
títulos, y `--font-size 10pt` achica el texto (los diagramas Mermaid siguen el mismo tamaño).
Juntos ahorran entre un 15 y un 25 % de páginas. Además, siempre:

- Los bloques de código largos continúan en la página siguiente (con al menos 4 líneas a cada
  lado del corte) en lugar de saltar enteros y dejar un hueco; los de hasta 12 líneas no se
  parten.
- Las imágenes y diagramas más altos que la página se reducen para caber en una sola.
- Los diagramas de secuencia no repiten los actores al pie.

**Encabezado y pie**: texto con marcadores `{page}`, `{pages}`, `{title}`, `{author}` y
`{date}`; `|` separa columnas izquierda, centro y derecha. Ejemplos:
`--header "{title} | | {date}"`, `--footer "Confidencial | {page} de {pages}"`.

### Front matter y configuración

Las mismas opciones pueden ir en un bloque YAML al inicio del `.md` o en un archivo
`mdrender.config.json` (se busca junto al `.md` y en las carpetas superiores). Prioridad:
**línea de comandos > front matter > archivo de configuración > valores por defecto**.

```markdown
---
title: Informe técnico
subtitle: Resultados del trimestre
author: Ana Pérez
date: 2026-10-04
toc: true
page-size: A4
orientation: landscape
margin-left: 25mm
header: "{title} | | {date}"
---
```

```json
{
  "lang": "es",
  "pageSize": "Letter",
  "margin": "15mm",
  "marginLeft": "25mm",
  "density": "compact",
  "fontSize": "10pt",
  "css": "estilos/empresa.css"
}
```

Con `title` en el front matter se muestra un bloque de título (título, subtítulo, autor y
fecha). Las rutas de `css` y `theme` son relativas al archivo donde aparecen.

## Ecuaciones y diagramas

| Sintaxis                          | Resultado                               |
| --------------------------------- | --------------------------------------- |
| `$e^{i\pi}+1=0$`                  | Ecuación en línea                       |
| `$$ ... $$` (una o varias líneas) | Ecuación en bloque, centrada            |
| ` ```math `                       | Ecuación en bloque (sintaxis de GitHub) |
| ` ```mermaid `                    | Diagrama Mermaid, incrustado como SVG   |

- Las fórmulas usan [KaTeX](https://katex.org/docs/supported) (`aligned`, `matrix`, `cases`,
  `\def`, `\newcommand`…). Las macros valen para todo el documento.
- `Cuesta $5 y $10` no se interpreta como fórmula; para un `$` literal usa `\$`.
- Si una fórmula o diagrama tiene un error, el documento se genera igual con una caja roja en
  su lugar, se informa `error: archivo.md:LÍNEA: mensaje` y el comando termina con código `2`.

**Autoajuste de diagramas de flujo**: en el PDF, un diagrama más ancho que la columna o más alto
que la página se reduce entero, y su texto puede quedar diminuto. Por eso mdrender dibuja cada
`flowchart`/`graph` con varios anchos de ajuste de las etiquetas y se queda con el que imprime el
texto más grande; a igual legibilidad, el que ocupa menos alto. Nunca lo imprime más pequeño que
tal como está escrito.

- Si el diagrama sigue por debajo del 75 % de su tamaño, prueba además el otro eje (`LR` → `TB`,
  o `TD` → `LR`) y lo gira si gana al menos 15 puntos. Una cadena horizontal de 8 cajas, por
  ejemplo, pasa de imprimirse al 37 % a su tamaño real. `--mermaid-flip never` (o
  `mermaidFlip: never`) conserva siempre la dirección escrita.
- No se tocan los diagramas con configuración propia (`%%{init: …}%%` o `config:` en su front
  matter) ni los de otros tipos (secuencia, torta, clases…).
- `-v` informa la elección de cada diagrama; si alguno queda por debajo del 50 %, mdrender avisa:
  conviene partirlo o acortar sus etiquetas.
- `--no-mermaid-autofit` (o `mermaidAutofit: false`) lo desactiva.

Un título seguido de un diagrama o una imagen pasa con ellos a la página siguiente cuando no
caben, en lugar de quedar solo al pie de la anterior.

## Más Markdown

- **Alertas** estilo GitHub: `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`,
  `[!CAUTION]`, con el título traducido según el idioma.
- **Notas al pie**: `Texto[^1]` y `[^1]: La nota.`
- **Imágenes locales** (`![](img/foto.png)` o `<img src="img/foto.png" width="200">`) con rutas
  relativas al `.md`, aunque tengan espacios o acentos: se incrustan en el resultado.

## Seguridad

- El PDF se genera con JavaScript desactivado: un `<script>` dentro del Markdown no se ejecuta.
- Por defecto no se descarga nada de internet; las imágenes remotas se omiten con una
  advertencia (`--allow-remote` lo permite). Los archivos locales solo entran al documento
  como imágenes referenciadas desde el `.md`.
- Mermaid corre en una página aparte, sin contenido del usuario, con `securityLevel: "strict"`.
- La vista previa solo escucha en `127.0.0.1`.
- Nunca sobrescribe un `.md` de entrada, y escribe cada PDF/HTML en un archivo temporal que
  renombra al final: si algo falla, el archivo anterior queda intacto.
- Las opciones mal escritas en `mdrender.config.json` generan una advertencia con la opción
  correcta sugerida.
- En Ubuntu 23.10+ el navegador descargado con `mdrender setup` no puede usar el sandbox de
  Chrome (restricción de AppArmor); mdrender lo inicia entonces sin sandbox, lo que es seguro
  aquí porque las páginas no ejecutan JavaScript del documento ni acceden a la red
  (`--verbose` lo indica). Con Chrome o Chromium instalados desde paquete no ocurre.

## Códigos de salida

| Código | Significado                                              |
| ------ | -------------------------------------------------------- |
| `0`    | Éxito                                                    |
| `1`    | Error de uso (argumentos, opciones, archivo inexistente) |
| `2`    | Error de renderizado (fórmula o diagrama inválido)       |
| `3`    | Navegador no encontrado (ejecuta `mdrender setup`)       |

## Desarrollo

Requisitos: Node.js 22.12+ y npm.

```bash
npm install
npm run dev -- documento.md   # ejecutar desde el código fuente (tsx)
npm test                      # pruebas (Vitest)
npm run test:coverage         # pruebas con cobertura (mínimo 80 %)
npm run check                 # formato + lint + tipos + pruebas, como en CI
npm run build                 # compila a dist/
npm run build:exe             # ejecutable independiente en build/sea/
```

El CI (GitHub Actions) prueba en **Windows y Linux** con Node 22 y 24, construye y prueba el
ejecutable y valida `mdrender setup`. Para publicar una versión, sube una etiqueta `v*` o
lanza a mano **Actions → Release → Run workflow** con la versión (debe coincidir con
`package.json`): construye los ejecutables, crea la etiqueta y el GitHub Release con sus sumas
SHA-256, y publica en npm. Requiere el secreto de repositorio `NPM_TOKEN`; si falta, la
publicación se detiene al inicio, antes de publicar nada.

Plan completo y decisiones de diseño: [docs/PLAN_MAESTRO.md](docs/PLAN_MAESTRO.md) ·
cambios: [CHANGELOG.md](CHANGELOG.md).

## Licencia

[MIT](LICENSE). Manrope, Inter y JetBrains Mono se distribuyen bajo la
[SIL Open Font License 1.1](https://openfontlicense.org); los ejecutables incluyen
`THIRD-PARTY-NOTICES.txt` con las licencias de todos los componentes.
