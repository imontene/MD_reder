---
title: Especificación de Markdown para los temas academic_basic y tech_magazine
subtitle: Qué debe cumplir un documento para verse bien con cada tema
author: mdrender
date: 2026-11-04
---

## 1. Alcance

Este documento define cómo escribir un archivo Markdown (`.md`) para convertirlo con mdrender
usando uno de estos temas:

| Tema             | Aspecto                                                  | Variante oscura      |
| ---------------- | -------------------------------------------------------- | -------------------- |
| `academic_basic` | Artículo de revista científica, a dos columnas           | no                   |
| `tech_magazine`  | Revista de divulgación tecnológica, con portada a sangre | `tech_magazine-dark` |

Ninguno de los dos es el tema por defecto: hay que pedirlo con `theme:` en el front matter, con
`--theme` en la línea de comandos o en `mdrender.config.json`.

Los términos **debe** y **no debe** indican requisitos: si no se cumplen, la conversión falla o
el resultado no tiene el aspecto del tema. **Conviene** indica una recomendación.

## 2. Reglas comunes a ambos temas

### 2.1 Codificación y estructura del archivo

- El archivo **debe** estar en UTF-8.
- El front matter, si existe, **debe** ser la primera cosa del archivo: un bloque YAML entre dos
  líneas `---`. Sus claves pueden escribirse en kebab-case (`magazine-name`), camelCase
  (`magazineName`) o con guion bajo (`magazine_name`).
- Los valores con dos puntos, comillas o que empiezan con un carácter especial **deben** ir
  entre comillas: `footer: "Pérez et al. | | {page}"`.
- Un valor no válido (por ejemplo `cover-ink: gris`) detiene la conversión con un error que
  nombra el campo. Las claves desconocidas se ignoran.

### 2.2 Prioridad de las opciones

**línea de comandos > front matter > `mdrender.config.json` > valores por defecto del tema >
valores por defecto de mdrender.** Los valores por defecto de cada tema (márgenes, tamaño de
letra, tipografía) se aplican solo si nadie más los fija.

### 2.3 Campos del bloque de título

Estos campos valen para ambos temas. El bloque de título (o la portada, en `tech_magazine`)
**solo aparece si hay `title` en el front matter**.

| Campo          | Tipo          | Uso                                                                                     |
| -------------- | ------------- | --------------------------------------------------------------------------------------- |
| `title`        | texto         | Título del documento. Activa el bloque de título y es el título del PDF                 |
| `subtitle`     | texto         | Bajada o subtítulo                                                                      |
| `author`       | texto         | Autores. `^1^`, `^1,2^` marcan afiliaciones en superíndice                              |
| `date`         | texto o fecha | Fecha libre: `2026-11-04` o `Noviembre de 2026`                                         |
| `kicker`       | texto         | Etiqueta sobre el título: «Artículo de investigación», «Reportaje · Hardware»           |
| `affiliations` | texto o lista | Afiliaciones, numeradas 1, 2… en el orden de la lista                                   |
| `abstract`     | texto         | Resumen. Los párrafos se separan con una línea en blanco (usar `>` o `\|` en YAML)      |
| `keywords`     | texto o lista | Palabras clave                                                                          |
| `lang`         | código BCP 47 | Idioma: rótulos («Resumen», «Palabras clave») y partición de palabras. Por defecto `es` |

Reglas:

- `abstract`, `subtitle`, `kicker` y las afiliaciones son **texto plano**: no interpretan
  Markdown ni LaTeX (`*cursiva*` o `$x$` se ven literalmente).
- En `author`, la marca `^…^` **debe** contener solo los números de afiliación. Las marcas se
  quitan del encabezado, el pie (`{author}`) y los metadatos del PDF.
- Sin `title`, mdrender toma el primer `# Título` del cuerpo como título del PDF, pero no
  dibuja bloque de título ni portada.

### 2.4 Encabezado y pie

`header` y `footer` aceptan texto con marcadores y hasta tres columnas separadas por `|`
(izquierda, centro, derecha): `"{title} | | {page} / {pages}"`. Marcadores: `{page}`,
`{pages}`, `{title}`, `{author}`, `{date}` y, solo en `tech_magazine`, `{magazine}`. Para un
`|` literal se escribe `\|`. `--no-page-numbers` (o `pageNumbers: false`) quita el número de
página del pie por defecto.

### 2.5 Elementos de Markdown admitidos

Ambos temas admiten todo lo que admite mdrender: párrafos, títulos `##` a `######`, énfasis,
enlaces, listas (también de tareas), citas, alertas `> [!NOTE]` (`TIP`, `IMPORTANT`, `WARNING`,
`CAUTION`), tablas GFM, código con resaltado, ecuaciones `$…$` y `$$…$$` (KaTeX), diagramas
` ```mermaid `, notas al pie `[^1]`, imágenes locales o en `data:` y `[[toc]]`. Cada tema da a
algunos de ellos un significado propio, descrito en las secciones 3 y 4.

### 2.6 Imágenes como figuras

En ambos temas, **una imagen sola en su párrafo** (con una línea en blanco antes y después) se
convierte en figura:

```markdown
![Texto de la leyenda, que puede llevar *énfasis*.](img/grafico.png)
```

- El **texto alternativo es la leyenda**. Sin texto alternativo, la figura no tiene leyenda.
- Terminar la ruta en `#wide` (`img/grafico.png#wide`) pide que la figura ocupe todo el ancho
  del texto; en `academic_basic`, las dos columnas.
- Una imagen dentro de una frase o junto a otro texto no es una figura: queda en línea.
- Las rutas son relativas al archivo `.md`. Formatos: PNG, JPEG, GIF, SVG, WebP, AVIF y BMP.
  Las imágenes remotas (`https://…`) solo se cargan con `--allow-remote`.
- Un SVG usado como imagen no puede usar las fuentes del documento: sus textos se dibujan con
  las fuentes del sistema.

## 3. Tema `academic_basic`

### 3.1 Uso previsto

Artículos de investigación, informes técnicos y documentos con aspecto de revista científica:
texto en STIX Two Text a dos columnas justificadas, títulos y leyendas en Inter.

### 3.2 Front matter

| Campo          | Requisito                     | Notas                                 |
| -------------- | ----------------------------- | ------------------------------------- |
| `theme`        | **debe** ser `academic_basic` | o `--theme academic_basic`            |
| `title`        | **conviene**                  | Sin él no hay bloque de título        |
| `author`       | conviene                      | Con `^n^` para las afiliaciones       |
| `affiliations` | conviene si hay `^n^`         | Una entrada por número, en orden      |
| `abstract`     | conviene                      | Se imprime en negrita a todo el ancho |
| `kicker`       | opcional                      | Sobre una línea roja, en mayúsculas   |
| `subtitle`     | opcional                      | En cursiva                            |
| `date`         | opcional                      | Junto a los autores                   |
| `keywords`     | opcional                      | Bajo el resumen                       |
| `footer`       | opcional                      | Por defecto `{page} / {pages}`        |

Valores por defecto del tema: márgenes de 18 mm arriba y abajo y 8 mm a los lados, texto de
9,5 pt, `font: inter` (títulos, leyendas y tablas) y párrafos justificados con partición de
palabras según `lang`.

### 3.3 Estructura del cuerpo

- Las secciones **deben** empezar con `##` (Introducción, Resultados, Discusión, Métodos…).
  `###` es una subsección (cursiva) y `####` a `######`, apartados menores.
- **No conviene** usar `#` en el cuerpo cuando hay `title`: un `#` se imprime como un título
  grande a todo el ancho, que compite con el del bloque de título.
- Los párrafos se separan con una línea en blanco. En el PDF no llevan espacio entre ellos:
  desde el segundo, la primera línea va sangrada.
- Para que una cifra y su unidad no se separen al final de una línea, se usa un espacio
  irrompible (U+00A0): `90 %`, `40 °C`.

### 3.4 Qué hace el tema con cada elemento

| Elemento                | Resultado en el PDF                                                         | Ancho        |
| ----------------------- | --------------------------------------------------------------------------- | ------------ |
| Bloque de título        | Etiqueta, título, subtítulo, autores, afiliaciones, resumen, palabras clave | dos columnas |
| Párrafos, listas, citas | Justificados, en STIX Two Text                                              | una columna  |
| Imagen sola             | Figura numerada: «**Fig. 1.** leyenda»                                      | una columna  |
| Imagen sola con `#wide` | Figura numerada                                                             | dos columnas |
| Tabla                   | Tres líneas (arriba, bajo el encabezado, abajo), sin rejilla                | dos columnas |
| Diagrama Mermaid        | Diagrama en tonos neutros                                                   | dos columnas |
| Ecuación `$$…$$`        | Centrada en su columna                                                      | una columna  |
| Bloque de código        | Fondo gris claro con una línea fina a la izquierda                          | una columna  |
| Alerta `> [!NOTE]`      | Línea a la izquierda y rótulo pequeño                                       | una columna  |
| Notas al pie `[^1]`     | Al final del documento, en letra pequeña                                    | una columna  |
| `[[toc]]` o `--toc`     | Índice entre dos líneas                                                     | dos columnas |

Reglas:

- Las figuras se numeran solas en el orden en que aparecen. Para citarlas en el texto se
  escribe el número a mano («como muestra la Fig. 2»).
- Las tablas **no** se numeran ni llevan leyenda propia: si hace falta, se escribe
  «Tabla 1» en el párrafo que la presenta.
- Las ecuaciones largas **deben** caber en una columna (unos 90 mm). Si no caben, conviene
  partirlas con `aligned` o `\\`.
- Las referencias bibliográficas se escriben como notas al pie o como una lista numerada en una
  sección `## Referencias`.

### 3.5 Limitaciones conocidas

- Chrome no ubica las figuras arriba o abajo de la página: quedan donde aparecen en el texto.
  Una figura, tabla o diagrama a dos columnas cierra las columnas anteriores y puede dejar un
  espacio libre antes de él.
- El HTML (`--format html`) se ve a una sola columna.
- No hay numeración automática de secciones, ecuaciones ni tablas, ni referencias cruzadas.

### 3.6 Plantilla mínima

```markdown
---
theme: academic_basic
kicker: Artículo de investigación
title: Título del artículo
author: Ana Pérez^1^, Luis Gómez^1,2^
affiliations:
  - Departamento de Química, Universidad de Ejemplo.
  - Instituto de Materiales Avanzados.
date: 4 de noviembre de 2026
abstract: >
  Resumen del artículo en uno o varios párrafos, separados por una línea en blanco.
keywords: [palabra clave, otra palabra clave]
footer: "Pérez et al. | | {page} / {pages}"
---

## Introducción

Texto del artículo con una cita a una nota[^1].

![Leyenda de la figura.](img/figura1.png)

## Resultados

| Muestra | Valor |
| :------ | ----: |
| A       |  1,00 |

[^1]: Texto de la nota.
```

Ejemplo completo: [`examples/articulo-academico.md`](../examples/articulo-academico.md).

## 4. Tema `tech_magazine`

### 4.1 Uso previsto

Reportajes y artículos de divulgación con aspecto de revista de tecnología: portada a sangre
con una imagen, Inter de 300 a 800 a dos columnas justificadas en el PDF, y la serifa Newsreader
en la bajada, la letra capitular y las citas destacadas. `tech_magazine-dark` imprime el
artículo sobre fondo negro.

### 4.2 Front matter

| Campo           | Requisito                    | Valores                                   | Por defecto                    |
| --------------- | ---------------------------- | ----------------------------------------- | ------------------------------ |
| `theme`         | **debe**                     | `tech_magazine` o `tech_magazine-dark`    | —                              |
| `title`         | **debe**, para tener portada | texto                                     | sin portada                    |
| `kicker`        | conviene                     | texto: «Reportaje · Hardware»             | —                              |
| `subtitle`      | conviene                     | texto: la bajada, de una a tres líneas    | —                              |
| `author`        | conviene                     | texto: «Texto de Laura Méndez»            | —                              |
| `date`          | conviene                     | texto: «Noviembre de 2026»                | —                              |
| `magazine-name` | opcional                     | nombre de una carpeta de `tech_magazine/` | `AlphaZeroChess`               |
| `cover`         | opcional                     | número de imagen: `2` o `"02"`            | una al azar en cada conversión |
| `cover-text`    | opcional                     | `top` o `bottom`                          | `top`                          |
| `cover-ink`     | opcional                     | `dark` o `light`                          | `light`                        |
| `accent`        | opcional                     | color CSS: `"#2f6bff"`, `rgb(…)`, `teal`  | el de la revista, o `#2f6bff`  |

Reglas:

- `magazine-name` **debe** ser solo un nombre de carpeta: no puede contener `/`, `\` ni `..`.
  Se imprime tal cual en la cabecera de la portada (en mayúsculas) y en el pie.
- `cover` **debe** ser un número entero. Si la revista no tiene esa imagen, mdrender avisa,
  lista los números disponibles y elige una al azar.
- `cover-ink` indica el color del texto de la portada: `dark` (texto oscuro) para imágenes
  claras en la zona del texto y `light` (texto blanco) para las oscuras. Si el `magazine.json`
  de la revista fija la tinta de esa portada, esa tinta prevalece sobre `cover-ink`.
- Sin `cover`, cada conversión puede elegir otra portada. Para un PDF reproducible, **conviene**
  fijar `cover`.
- La fecha aparece arriba a la derecha de la portada y en el pie: conviene que sea corta.

Valores por defecto del tema: márgenes de 20 mm arriba, 16 mm a los lados y 22 mm abajo (la
portada va a sangre, sin márgenes), texto de 10,5 pt, `font: inter`, párrafos justificados, dos
columnas en el PDF. Pie: «{magazine} · {date}» a la izquierda y
el número de página a la derecha, en todas las páginas menos la portada.

### 4.3 Carpeta de portadas

Las imágenes de portada de una revista **deben** estar en `tech_magazine/<magazine-name>/`.
mdrender busca esa carpeta primero junto al archivo `.md` y, si no existe, entre las que trae
incluidas (hoy, `AlphaZeroChess` con 4 portadas).

```text
mi-articulo.md
tech_magazine/
  MiRevista/
    portada01.jpg
    portada02.jpg
    magazine.json      (opcional)
```

- El **número** de una imagen es el último grupo de cifras de su nombre: `portada02.jpg` → 2,
  `2026-cover-3.png` → 3. Las imágenes sin cifras se ignoran.
- Formatos: PNG, JPEG, WebP, AVIF y SVG.
- **Conviene** que sean verticales, de al menos 1024 × 1536 px, y que dejen libre la zona del
  texto: el tercio superior con `cover-text: top`, el inferior con `bottom`. La imagen cubre la
  hoja entera, alineada arriba: si su proporción no es la de la hoja, se recorta por abajo (o
  por los lados).
- La imagen se incrusta tal cual: una PNG de 2 MB suma unos 2 MB al PDF. Un JPEG de buena
  calidad pesa mucho menos y se ve igual.

### 4.4 Archivo `magazine.json` (opcional)

Fija el acento de la revista y, para cada portada, la tinta y el velo (el degradado detrás del
texto, que lo hace legible sobre la imagen):

```json
{
  "accent": "#2f6bff",
  "covers": {
    "1": { "ink": "dark", "veil": "rgba(255, 255, 255, 0.6)" },
    "2": { "ink": "light", "veil": "rgba(8, 14, 28, 0.85)" }
  }
}
```

| Clave             | Tipo                 | Efecto                                                          |
| ----------------- | -------------------- | --------------------------------------------------------------- |
| `accent`          | color CSS            | Acento de la revista; `accent:` en el front matter lo reemplaza |
| `covers.<n>.ink`  | `"dark"` o `"light"` | Tinta de la portada `n`; prevalece sobre `cover-ink`            |
| `covers.<n>.veil` | color CSS            | Color del velo, que se desvanece hacia la mitad de la hoja      |

Sin `veil`, el velo es blanco al 60 % con tinta oscura y negro al 60 % con tinta clara. Un
`magazine.json` mal formado se ignora con un aviso. En `AlphaZeroChess`, las portadas 1 y 3
llevan tinta oscura y la 2 y la 4 tinta clara.

### 4.5 Estructura del cuerpo

- El cuerpo **debe** empezar con un párrafo de texto: es la entrada, impresa más grande y con
  letra capitular. Si empieza con un título o una imagen, no hay capitular.
- Las secciones empiezan con `##` (títulos grandes y gruesos). `###` es un antetítulo pequeño,
  en mayúsculas y en el color de acento, que conviene poner justo antes de un párrafo.
- **No conviene** usar `#` en el cuerpo: el título ya está en la portada.
- `---` separa partes del artículo y se imprime como «• • •».

### 4.6 Qué hace el tema con cada elemento

| Elemento           | Resultado en el PDF                                                                |
| ------------------ | ---------------------------------------------------------------------------------- |
| Bloque de título   | Portada a sangre: revista y fecha arriba; etiqueta, título, bajada y firma         |
| Primer párrafo     | Entrada en Inter Light grande, con capitular en Newsreader y en el color de acento |
| `## Título`        | Inter ExtraBold grande, con letras apretadas                                       |
| `### Título`       | Antetítulo pequeño en mayúsculas, en el color de acento                            |
| `> cita`           | Cita destacada en Newsreader cursiva, bajo una línea de acento                     |
| Alerta `> [!NOTE]` | Recuadro gris redondeado; su primera línea en negrita hace de título               |
| Tabla              | Ficha técnica: líneas finas, encabezado en mayúsculas, 1.ª columna en gris         |
| Imagen sola        | Figura con esquinas redondeadas y leyenda pequeña en gris                          |
| Bloque de código   | Tarjeta oscura redondeada                                                          |
| Diagrama Mermaid   | Sobre una tarjeta gris; tonos neutros, u oscuros en `tech_magazine-dark`           |
| `---`              | Separador «• • •» en el color de acento                                            |
| Notas al pie       | Al final, pequeñas, tras una línea corta                                           |

Reglas de las citas destacadas:

- El primer párrafo de la cita es la frase destacada. Un segundo párrafo, separado por una
  línea `>` vacía, es la atribución y se imprime en mayúsculas pequeñas:

  ```markdown
  > El mejor dato es el que nunca sale del teléfono.
  >
  > Ingeniera de hardware
  ```

- **Conviene** que la frase sea corta (una o dos líneas): ocupa unos dos tercios del ancho y se
  imprime grande.

Reglas de los recuadros:

- El rótulo de la alerta («Nota», «Consejo»…) no se imprime. Para darle título, la primera
  línea **debe** ser un párrafo con solo texto en negrita:

  ```markdown
  > [!NOTE]
  > **En corto**
  >
  > - Primer punto.
  > - Segundo punto.
  ```

Reglas de las tablas:

- La primera columna se imprime en gris como etiqueta y las demás en negrita como valores:
  conviene que la primera columna sea el nombre del dato («Memoria», «Consumo»).

### 4.7 Limitaciones conocidas

- La portada solo existe con `title`. Sin él, el documento empieza en la primera página con el
  primer párrafo, que lleva capitular.
- La portada no lleva encabezado ni pie; las demás páginas sí, porque mdrender dibuja márgenes,
  encabezado y pie desde la hoja de estilos.
- Chrome no ubica las figuras arriba o abajo de la página: quedan donde aparecen en el texto.
- En el HTML, la portada es una tarjeta redondeada al inicio de la página.

### 4.8 Plantilla mínima

```markdown
---
theme: tech_magazine
magazine-name: AlphaZeroChess
cover: 3
kicker: Reportaje · Inteligencia artificial
title: Título del reportaje
subtitle: Bajada de una a tres líneas que resume el artículo.
author: Texto de Laura Méndez
date: Noviembre de 2026
---

Primer párrafo del artículo: la entrada, con letra capitular.

## Primera sección

Texto de la sección.

> Una frase corta para destacar.

### Antetítulo

Más texto.

> [!NOTE]
> **En corto**
>
> - Un punto clave.
```

Ejemplo completo: [`examples/revista-tecnologia.md`](../examples/revista-tecnologia.md).

## 5. Lista de comprobación

Antes de convertir, conviene revisar:

| Comprobación                                                     | `academic_basic` | `tech_magazine` |
| ---------------------------------------------------------------- | :--------------: | :-------------: |
| `theme` en el front matter o en la línea de comandos             |        ✓         |        ✓        |
| `title` presente (bloque de título o portada)                    |        ✓         |        ✓        |
| Secciones con `##`, sin `#` en el cuerpo                         |        ✓         |        ✓        |
| Cada `^n^` de `author` tiene su entrada en `affiliations`        |        ✓         |        —        |
| Ecuaciones `$$…$$` que caben en una columna                      |        ✓         |        —        |
| El cuerpo empieza con un párrafo de texto                        |        —         |        ✓        |
| Existe `tech_magazine/<magazine-name>/` con imágenes numeradas   |        —         |        ✓        |
| `cover` fijo si el PDF debe salir siempre igual                  |        —         |        ✓        |
| Recuadros con la primera línea en negrita                        |        —         |        ✓        |
| Imágenes solas en su párrafo, con texto alternativo como leyenda |        ✓         |        ✓        |
| Cifras y unidades unidas con espacio irrompible (`90 %`)         |        ✓         |        ✓        |

Avisos que puede dar la conversión con estos temas (salen por la consola y el PDF se genera
igual): imagen no encontrada, número de portada inexistente, revista sin imágenes y
`magazine.json` no válido.
