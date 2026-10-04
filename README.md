# MD_reder · `mdrender`

**Convierte archivos Markdown (`.md`) en PDF y HTML desde la línea de comandos, en Windows y
Linux**, con ecuaciones LaTeX, diagramas Mermaid y la tipografía
[Inter](https://fonts.google.com/specimen/Inter).

```bash
mdrender informe.md            # → informe.pdf
```

Ejemplo: [`examples/ejemplo.md`](examples/ejemplo.md) → [`examples/ejemplo.pdf`](examples/ejemplo.pdf)

## Características

- 📄 **Markdown → PDF o HTML autocontenido** (fuentes, imágenes y diagramas incluidos).
- ➗ **Ecuaciones** `$…$` y `$$…$$` con KaTeX, dibujadas al convertir (sin JavaScript en la salida).
- 📊 **Diagramas Mermaid**: flujo, secuencia, clases, estados, ER, Gantt, torta, mapa mental…
- 🔤 **Inter** para el texto y **JetBrains Mono** para el código, incrustadas en el PDF.
- 🧩 **GFM**: tablas, listas de tareas, tachado, notas al pie, alertas `> [!NOTE]`,
  resaltado de código para ~35 lenguajes.
- 🖨️ Tamaño de página, márgenes, orientación, encabezado/pie con números de página,
  tabla de contenidos y marcadores del PDF.
- 🗂️ **Lotes**: varios archivos, carpetas completas o patrones `docs/**/*.md`.
- 🔁 **`--watch`** y **vista previa en vivo** en el navegador.
- 🎨 Temas **claro** y **oscuro**, o tu propio CSS.
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
mdrender documento.md -o salida/informe.pdf --page-size Letter --toc

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

# Tema oscuro, o un CSS propio que reemplaza el tema
mdrender documento.md --theme dark
mdrender documento.md --theme mi-tema.css

# Descargar un navegador si no tienes Chrome, Edge ni Chromium
mdrender setup
```

En Windows (PowerShell o CMD) los comandos son idénticos:

```powershell
mdrender "C:\Users\yo\Documentos\notas de clase.md" -o "C:\Users\yo\Desktop\notas.pdf"
```

Con varios archivos se usa un solo navegador para todos; si uno falla, el resto se convierte
igual. `mdrender preview` sirve la página en `http://127.0.0.1` (solo accesible desde tu
equipo); `--port` fija el puerto y `--no-open` no abre el navegador.

### Opciones

| Opción                       | Descripción                                                 | Por defecto        |
| ---------------------------- | ----------------------------------------------------------- | ------------------ |
| `-o, --output <ruta>`        | Archivo de salida, o carpeta con varios archivos            | junto al `.md`     |
| `-f, --format <pdf\|html>`   | Formato de salida                                           | `pdf`              |
| `--page-size <tamaño>`       | `A3`, `A4`, `A5`, `Letter`, `Legal`, `Tabloid`              | `A4`               |
| `--margin <valor>`           | Márgenes como en CSS: `20mm`, `15mm 20mm`, `1in 0.75in`…    | `20mm`             |
| `--landscape`                | Orientación horizontal                                      | —                  |
| `--toc`                      | Tabla de contenidos al inicio (o donde pongas `[[toc]]`)    | —                  |
| `--toc-depth <n>`            | Nivel de título más profundo en la tabla de contenidos      | `3`                |
| `--header <texto>`           | Encabezado de página (ver abajo)                            | —                  |
| `--footer <texto>`           | Pie de página (ver abajo)                                   | `{page} / {pages}` |
| `--no-page-numbers`          | Sin el pie con números de página                            | —                  |
| `--theme <light\|dark\|css>` | `light`, `dark` o un `.css` que reemplaza el tema           | `light`            |
| `--css <archivo.css>`        | CSS adicional (se puede repetir)                            | —                  |
| `--mermaid-theme <tema>`     | `default`, `neutral`, `dark`, `forest`, `base`              | `neutral` / `dark` |
| `--lang <código>`            | Idioma del documento; `en` para inglés (`pt`, `fr`, `de`…)  | `es`               |
| `--title <texto>`            | Título del documento (muestra un bloque de título)          | primer `# título`  |
| `--config <archivo>`         | Archivo de configuración                                    | el más cercano     |
| `--no-config`                | Ignorar `mdrender.config.json`                              | —                  |
| `--browser <ruta>`           | Ruta a Chrome/Edge/Chromium (o variable `MDRENDER_BROWSER`) | autodetección      |
| `--allow-remote`             | Permitir que el PDF descargue imágenes/CSS de internet      | bloqueado          |
| `-w, --watch`                | Regenerar al guardar                                        | —                  |
| `-q, --quiet`                | Mostrar solo advertencias y errores                         | —                  |
| `-v, --verbose`              | Mostrar también configuración, navegador y tiempos          | —                  |

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
page-size: Letter
header: "{title} | | {date}"
---
```

```json
{
  "lang": "es",
  "pageSize": "A4",
  "margin": "25mm 20mm",
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
ejecutable y valida `mdrender setup`. Al publicar una etiqueta `v*`, el flujo **Release**
construye los ejecutables, crea el GitHub Release con sus sumas SHA-256 y publica en npm si
el secreto `NPM_TOKEN` está configurado.

Plan completo y decisiones de diseño: [docs/PLAN_MAESTRO.md](docs/PLAN_MAESTRO.md) ·
cambios: [CHANGELOG.md](CHANGELOG.md).

## Licencia

[MIT](LICENSE). Inter y JetBrains Mono se distribuyen bajo la
[SIL Open Font License 1.1](https://openfontlicense.org); los ejecutables incluyen
`THIRD-PARTY-NOTICES.txt` con las licencias de todos los componentes.
