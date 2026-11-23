---
title: Plan de implementación de los temas preprint y open_access
subtitle: Dos temas de artículo científico para mdrender, a partir de los prototipos aprobados
author: mdrender
date: 2026-11-23
---

## 1. Objetivo y alcance

Agregar a mdrender dos temas integrados, ninguno por defecto:

| Tema          | Aspecto                                                                     | Prototipo                                                 |
| ------------- | --------------------------------------------------------------------------- | --------------------------------------------------------- |
| `preprint`    | Preprint al estilo arXiv: clase `article` de LaTeX, Computer Modern         | [`docs/prototipos/preprint/`](prototipos/preprint/)       |
| `open_access` | Revista de acceso abierto: barra lateral de metadatos, resumen estructurado | [`docs/prototipos/open_access/`](prototipos/open_access/) |

El diseño es el de los prototipos tal como están (PDF, CSS y Markdown en `docs/prototipos/`).
Este plan no cambia nada del diseño. Define cómo llevarlo al código, en qué orden, con qué
pruebas y con qué criterios de aceptación.

Decisiones ya tomadas:

1. Nombres: `preprint` y `open_access`.
2. En `preprint`, las secciones se numeran automáticamente por defecto.
3. El sello lateral de `preprint` es opcional y su texto lo da el autor.
4. Sin logotipos ni nombres de arXiv, PLOS, eLife, MDPI ni ORCID como marca propia; los ejemplos
   usan datos claramente ficticios (revista «Ciencia Abierta», DOI `10.0000/…`, «Autor A»).

Fuera de alcance (posibles versiones futuras): citas bibliográficas automáticas (`[@clave]` con
BibTeX), referencias cruzadas («véase la ecuación (2)» calculado), numeración de ecuaciones dentro
de entornos de varias líneas (`align`) y variantes oscuras.

## 2. Punto de partida en el código

Lo que ya existe en `main` (2.16.6) y se reutiliza:

| Pieza existente                    | Archivo                                                                                             | Uso en los temas nuevos                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Temas integrados y sus defaults    | `src/options.ts` (`BUILTIN_THEMES`, `THEME_DEFAULTS`)                                               | Registrar `preprint` y `open_access`                   |
| Hojas de estilo y fuentes por tema | `src/render/template.ts` (`THEME_FILES`, `builtinThemeCss`), `src/assets.ts`, `src/render/fonts.ts` | CSS y fuentes nuevas                                   |
| Bloque de título                   | `src/render/template.ts` (`titleBlock`)                                                             | Base del título de `preprint`; `open_access` lo amplía |
| Márgenes, encabezado y pie por CSS | `src/render/magazine.ts` (`marginBoxes`, `@page`)                                                   | Generalizar para los tres temas (sección 4.1)          |
| Figuras desde imágenes solas       | `src/markdown/figures.ts`                                                                           | Activarlo en ambos temas                               |
| Leyendas con rótulo en negrita     | `src/markdown/captions.ts` («**Tabla 1.** …»)                                                       | Activarlo en ambos temas, junto a `Table:` (4.4)       |
| Notas al pie, KaTeX, Mermaid       | `src/markdown/*`                                                                                    | Sin cambios                                            |
| Generación de avisos de licencias  | `scripts/build-sea.mjs`                                                                             | Reconocer `OFL.txt` (sección 3)                        |

## 3. Fase 0: dependencias y licencias

| Tarea                                | Detalle                                                                                                                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fuente CMU (Computer Modern Unicode) | Agregar el paquete npm `computer-modern` (0.1.x). Usar sus `woff2` estáticos: `cmu-serif-500-roman`, `-500-italic`, `-700-roman`, `-700-italic` y `cmu-typewriter-text-500-roman`. Licencia: SIL OFL (`OFL.txt` en el paquete; su `package.json` dice MIT, pero las fuentes son OFL). |
| Source Serif 4                       | Agregar `@fontsource/source-serif-4` (OFL-1.1): 400, 400 itálica, 600 y 700, todos los subconjuntos con su `unicode-range`.                                                                                                                                                           |
| Avisos de licencias                  | `scripts/build-sea.mjs` busca `LICENSE`/`COPYING`; ampliar la expresión para que también tome `OFL.txt`, o el aviso de `computer-modern` saldría vacío.                                                                                                                               |
| Manifiesto de recursos               | Añadir las fuentes nuevas a `assetManifest()` para que viajen en el ejecutable.                                                                                                                                                                                                       |
| README                               | Licencia de CMU y Source Serif 4 en la sección de licencias.                                                                                                                                                                                                                          |

**Aceptación:** `npm run build:exe` incluye las fuentes; `THIRD-PARTY-NOTICES.txt` contiene el
texto OFL de `computer-modern`.

## 4. Fase 1: infraestructura común

Funciones nuevas que necesitan ambos temas. Cada una se activa por tema, sin cambiar el aspecto
de los temas existentes.

### 4.1 Página dibujada por la hoja de estilos

Hoy `magazine.ts` imprime con márgenes 0 en Chrome y dibuja márgenes, encabezado y pie con
`@page` y cajas de margen. Los dos temas nuevos lo necesitan: `preprint` para el encabezado en
CMU Serif y el sello lateral girado, y `open_access` para su pie «n de N».

- Extraer de `magazine.ts` un módulo `src/render/page-css.ts` con: márgenes en `@page`, cajas de
  margen desde las especificaciones `header`/`footer` (marcadores `{page}`, `{pages}`, `{title}`,
  `{author}`, `{date}` y los que agregue cada tema), reglas de `@page :first` y el estilo de cada
  caja.
- `magazine.ts` pasa a usar ese módulo (refactor sin cambio visible: las pruebas de revista deben
  seguir iguales).
- `convert.ts`: una función `drawsOwnPage(theme)` reemplaza la comprobación `isMagazineTheme` al
  decidir márgenes 0, plantillas de encabezado y avisos de espacio.
- Caja `@left-middle` en `@page :first` con `writing-mode: vertical-rl` y `rotate(180deg)` para el
  sello (comprobado en el prototipo con Chrome 153).

### 4.2 Numeración de secciones

- Plugin `src/markdown/numbering.ts`: con `env.numberSections`, antepone a cada `##` y `###` un
  `<span class="secnum">1.2</span>` real (no un contador CSS), para que el número aparezca en el
  índice (`[[toc]]`) y en los marcadores del PDF.
- Formato por tema: `1` / `1.1` en `preprint`, `1.` / `1.1.` en `open_access`.
- Opción nueva `numberSections` (`number-sections: false` para desactivarla), con valor por
  defecto por tema.
- Los títulos después de `[[backmatter]]` (4.5) no se numeran.

### 4.3 Numeración de ecuaciones

- Contador CSS en cada `.math-display` con «(n)» alineado a la derecha, como en el prototipo.
- Una ecuación con `\tag{…}` no suma al contador ni muestra el número automático: el plugin de
  matemáticas marca esos bloques con una clase (`math-tagged`) al detectar `\tag` en la fuente,
  porque KaTeX dibuja la etiqueta él mismo.
- `\notag` o `\nonumber` en la fuente: bloque sin número (misma clase de exclusión).
- Ecuaciones dentro de `align` con varias líneas: un solo número para el bloque (limitación
  documentada).

### 4.4 Leyendas de figuras y tablas

Dos formas de escribir una leyenda, ambas válidas en los dos temas:

| Sintaxis                                                 | Número                    | Origen                                        |
| -------------------------------------------------------- | ------------------------- | --------------------------------------------- |
| `Table: Texto de la leyenda` antes o después de la tabla | automático (Tabla 1, 2…)  | Pandoc; la propuesta de los prototipos        |
| `**Tabla 1.** Texto` antes o después de la tabla         | el escrito por el autor   | `captions.ts` (ya existe en `academic_basic`) |
| Imagen sola, texto alternativo como leyenda              | automático (Figura 1, 2…) | `figures.ts` (ya existe)                      |
| `**Figura 2.** Texto` junto a una imagen o un diagrama   | el escrito por el autor   | `captions.ts` (ya existe)                     |

- Ampliar `captions.ts` para reconocer `Table:` (y `: ` de Pandoc) como leyenda sin número
  escrito; el número lo pone el tema con un contador CSS.
- Rótulos traducidos: «Figura»/«Tabla» en español, «Figure»/«Table» en inglés, etc. Se añaden a
  `src/i18n.ts` y se pasan al CSS como variables (`--label-figure`, `--label-table`), para que
  `content: var(--label-figure) " " counter(figure) ":"` siga el idioma del documento.
- Posición: «Figura n:» bajo la figura en ambos temas; «Tabla n:» sobre la tabla en ambos (como
  en los prototipos).
- Las tablas cortas no se parten entre páginas (`break-inside: avoid`, como en el prototipo de
  `open_access`).

### 4.5 Marcador `[[backmatter]]`

Como `[[toc]]`, una línea `[[backmatter]]` marca el comienzo de las secciones finales:

- Lo que sigue se envuelve en `<div class="backmatter">`.
- Sus títulos no se numeran.
- En `open_access` se imprimen en letra más pequeña sobre una línea (Contribuciones,
  Financiamiento, Disponibilidad de datos, Conflictos de interés, Referencias).
- Una lista numerada dentro del final es la lista de referencias: «[1]» con sangría francesa en
  `preprint`, «1.» en `open_access`.
- Sin el marcador, la última sección cuyo título sea «Referencias», «References», «Bibliografía»
  o «Bibliography» recibe el mismo trato para la lista de referencias (comodidad, no obligación).

### 4.6 Autores estructurados

Campo nuevo `authors`, compatible con el `author` de texto actual:

```yaml
authors:
  - name: Ana Pérez
    affiliations: [1]
    orcid: 0000-0000-0000-0001
    email: ana.perez@ejemplo.org
    corresponding: true
  - name: Luis Gómez
    affiliations: [1, 2]
```

- Validador en `options.ts`: lista de objetos con `name` obligatorio; `affiliations` números que
  existan en `affiliations`; `orcid` con formato `0000-0000-0000-000X`; `email` texto.
- Con `authors`, el bloque de título genera los superíndices, el asterisco de correspondencia y
  la marca ORCID (texto «ORCID» enlazado a `https://orcid.org/<id>`, sin el logotipo).
- `{author}` en encabezado y pie: «Pérez et al.» con tres o más autores, «Pérez y Gómez» con
  dos; o el valor de `short-authors` si se da.
- `author` (texto) sigue funcionando igual en todos los temas.

**Aceptación de la fase 1:** pruebas unitarias de cada pieza; los temas existentes producen el
mismo HTML que antes (pruebas actuales sin cambios, salvo las del refactor de `magazine.ts`).

## 5. Fase 2: tema `preprint`

### 5.1 Archivos

| Archivo                                           | Contenido                                                                                                                                                                        |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/assets/theme-preprint.css`                   | El CSS del prototipo, sin textos fijos (encabezado y sello salen de las opciones)                                                                                                |
| `src/options.ts`                                  | `preprint` en `BUILTIN_THEMES`; `THEME_DEFAULTS.preprint = { margin: "30mm 32mm 28mm", fontSize: "10pt", numberSections: true, justify: true }`; opción `preprint-stamp` (texto) |
| `src/render/template.ts`, `fonts.ts`, `assets.ts` | Hojas del tema y fuentes CMU (Serif y Typewriter)                                                                                                                                |
| `src/convert.ts`                                  | Activar figuras, leyendas, numeración y página dibujada por CSS                                                                                                                  |
| `examples/preprint.md` y `.pdf`                   | El artículo del prototipo, con la sintaxis final                                                                                                                                 |

### 5.2 Comportamiento

- Bloque de título centrado: título, autores (`author` o `authors`) con superíndices, fecha,
  afiliaciones en cursiva, «Resumen» centrado sobre el resumen angosto y palabras clave.
- Encabezado por defecto desde la página 2: «PREPRINT — {date}» en versalitas espaciadas, a la
  derecha; sin fecha, solo «PREPRINT». Se reemplaza con `header`.
- Pie por defecto: número de página centrado (`--no-page-numbers` lo quita).
- Sello: solo si hay `preprint-stamp`, en el margen izquierdo de la página 1, gris, de abajo
  hacia arriba. Sin valor por defecto.
- Ecuaciones numeradas, figuras «Figura n:», tablas «Tabla n:» con tres líneas, referencias
  «[n]», notas al pie al final, código en CMU Typewriter.
- Las fuentes de KaTeX no cambian: ya son de la familia Computer Modern.

### 5.3 Pruebas

- `options.test.ts`: defaults del tema y validación de `preprint-stamp`.
- `template.test.ts`: fuentes CMU incrustadas en `woff2`, CSS del tema.
- `pdf.test.ts`: PDF con `CMUSerif-Roman`, `CMUSerif-Bold`, `KaTeX_Main` y sin fuentes del sistema;
  texto «1 Introducción» y «(1)»; sello presente solo con `preprint-stamp`; encabezado ausente en
  la página 1.
- `markdown.test.ts`: numeración de secciones, exclusión tras `[[backmatter]]`, `Table:`.

**Aceptación:** el ejemplo se ve como `docs/prototipos/preprint/articulo.pdf`, sin HTML escrito
a mano en el Markdown.

## 6. Fase 3: tema `open_access`

### 6.1 Front matter nuevo

| Campo                               | Tipo           | Uso                                                      |
| ----------------------------------- | -------------- | -------------------------------------------------------- |
| `journal`                           | texto          | Nombre de la revista: franja de la página 1 y encabezado |
| `article-type`                      | texto          | «Artículo de investigación», a la derecha de la franja   |
| `volume`                            | texto o número | Para la cita y el pie                                    |
| `article-number`                    | texto          | Número de artículo (`e0042`)                             |
| `doi`                               | texto          | Barra lateral y pie (`doi.org/…`)                        |
| `license`                           | texto          | Por defecto `CC BY 4.0`, con su texto explicativo        |
| `received`, `accepted`, `published` | texto o fecha  | Fechas de la barra lateral                               |
| `editor`                            | texto          | «Editora» o «Editor» en la barra lateral                 |
| `correspondence`                    | texto          | Si falta, el `email` del autor con `corresponding: true` |
| `citation`                          | texto          | Reemplaza la cita generada                               |
| `short-title`                       | texto          | Título abreviado del encabezado                          |
| `short-authors`                     | texto          | Autores abreviados del encabezado y la cita              |
| `abstract`                          | texto o mapa   | Con un mapa, resumen estructurado (ver abajo)            |
| `accent`                            | color CSS      | Acento; por defecto `#00677f`, como el prototipo         |

Resumen estructurado: un mapa YAML conserva el orden y cada clave es el rótulo:

```yaml
abstract:
  Antecedentes: Elegir un catalizador para procesos a baja temperatura…
  Métodos: Medimos la conversión de un sustrato modelo…
  Resultados: El catalizador A alcanza el 90 % de conversión…
  Conclusiones: Un modelo de dos parámetros basta…
```

Cita generada (estilo Vancouver, sin depender de un gestor bibliográfico):
`{autores abreviados}. {title}. {journal}. {año de published};{volume}:{article-number}.`
Los autores se abrevian a «Apellido Inicial» a partir de `authors`; si los nombres no se pueden
abreviar con seguridad (un solo nombre, partículas), se usan tal cual. `citation` siempre gana.

### 6.2 Archivos

| Archivo                               | Contenido                                                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `src/assets/theme-open-access.css`    | El CSS del prototipo, sin textos fijos                                                                                |
| `src/render/open-access.ts`           | Primera página (franja, barra lateral, título, autores, resumen) desde las opciones; cita; textos de encabezado y pie |
| `src/render/template.ts`              | `titleBlock` delega en `open-access.ts` cuando el tema lo pide                                                        |
| `src/options.ts`                      | Tema, defaults (`margin: "20mm"`, `fontSize: "10pt"`, `numberSections: true`) y los campos de 6.1                     |
| `src/i18n.ts`                         | Rótulos de la barra lateral («Acceso abierto», «Cita», «Recibido»…) en es, en, pt, fr, de                             |
| `examples/acceso-abierto.md` y `.pdf` | El artículo del prototipo con la sintaxis final                                                                       |

### 6.3 Comportamiento

- Página 1: franja con `journal` y `article-type`; barra lateral de 44 mm con insignia «Acceso
  abierto» (candado dibujado en SVG propio), cita, editor, fechas, licencia, correspondencia y
  DOI; a la derecha, título, autores con «*» y ORCID, afiliaciones, resumen en caja de color y
  palabras clave. Cada dato de la barra aparece solo si su campo existe.
- Encabezado desde la página 2: `journal` a la izquierda (acento), «{short-authors} ·
  {short-title}» a la derecha.
- Pie: «{journal} {año}; {volume}: {article-number} · doi.org/{doi}» a la izquierda y «n de N» a
  la derecha.
- Secciones «1. Introducción», «2.1. …» en Inter y en el acento; texto en Source Serif 4
  justificado; ecuaciones numeradas; «**Figura n.**» y «**Tabla n.**» en negrita.
- Secciones finales tras `[[backmatter]]` en letra pequeña y sin numerar.
- Si falta `title`, no hay primera página especial: el documento empieza con el cuerpo, con
  encabezado y pie normales.

### 6.4 Pruebas

- `options.test.ts`: validación de cada campo (fechas, DOI como texto, `abstract` como mapa,
  `accent`).
- `open-access.test.ts` (nuevo): barra lateral solo con los campos dados, cita generada y
  reemplazada por `citation`, correspondencia desde `authors`, encabezado y pie, idioma de los
  rótulos.
- `pdf.test.ts`: fuentes Source Serif 4 e Inter, texto «Acceso abierto», «1 de N» en el pie,
  sin encabezado en la página 1.

**Aceptación:** el ejemplo se ve como `docs/prototipos/open_access/articulo.pdf`, sin HTML escrito
a mano en el Markdown.

## 7. Fase 4: documentación y publicación

| Tarea            | Detalle                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Especificación   | Añadir a `docs/ESPECIFICACION_TEMAS.md` las secciones de `preprint` y `open_access`, y `[[backmatter]]`, `authors`, `Table:` y la numeración en las reglas comunes |
| README           | Temas nuevos en la lista de temas, la tabla de opciones y la sección de temas, con enlaces a los ejemplos                                                          |
| CHANGELOG        | Entrada «Sin publicar» y luego la versión                                                                                                                          |
| `--help` del CLI | Temas nuevos en la ayuda de `--theme`                                                                                                                              |
| Versión          | Minor: 2.17.0 (funciones nuevas, compatibles)                                                                                                                      |
| Verificación     | `npm run check`, `npm run build:exe` y conversión de los dos ejemplos con el ejecutable fuera del repositorio                                                      |

## 8. Orden de trabajo y tamaño estimado

| Paso | Contenido                                      | Tamaño | Depende de |
| ---- | ---------------------------------------------- | ------ | ---------- |
| 0    | Dependencias, avisos de licencias              | S      | —          |
| 1a   | `page-css.ts` y refactor de `magazine.ts`      | M      | 0          |
| 1b   | Numeración de secciones y ecuaciones           | S      | —          |
| 1c   | `Table:`, rótulos traducidos, `[[backmatter]]` | M      | —          |
| 1d   | `authors` estructurado                         | M      | —          |
| 2    | Tema `preprint`                                | M      | 0, 1a–1c   |
| 3    | Tema `open_access`                             | L      | 0, 1a–1d   |
| 4    | Documentación, ejemplos y publicación          | S      | 2, 3       |

Se puede publicar `preprint` antes que `open_access` (pasos 0, 1a–1c, 2 y 4) si conviene
entregarlo por partes.

## 9. Riesgos

| Riesgo                                                                                  | Mitigación                                                                                            |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| El refactor de `page-css.ts` cambia sin querer los temas de revista                     | Hacerlo como paso aislado (1a), con las pruebas de revista sin modificar como red                     |
| Números de sección como contadores CSS no aparecerían en el índice ni en los marcadores | Insertarlos como texto real desde el plugin (4.2)                                                     |
| Doble numeración de ecuaciones con `\tag`                                               | Clase de exclusión detectada en la fuente (4.3)                                                       |
| Abreviar nombres para la cita falla con nombres compuestos                              | Usarlos tal cual cuando no se puedan abreviar; `citation` y `short-authors` como salida manual        |
| La barra lateral no cabe si hay muchos metadatos                                        | Letra de 7 pt y campos opcionales; si desborda, continúa bajo el título (prueba con todos los campos) |
| Paquete `computer-modern` sin mantenimiento activo                                      | Las fuentes son archivos estáticos OFL; si hiciera falta, se copian al repositorio con su licencia    |
| Diferencias de Chrome en cajas de margen giradas                                        | Probado en Chrome 153; la prueba de PDF lo vigila en CI (Windows y Linux)                             |

## 10. Decisiones sobre las preguntas abiertas (23 de noviembre de 2026)

1. `open_access` numera las secciones por defecto, como el prototipo.
2. `preprint` se publica primero, en la 2.17.0 (pasos 0, 1a–1c, 2 y 4). `open_access` y el
   campo `authors` estructurado (1d, 3) van en una versión posterior.
3. La cita generada de `open_access` usa el estilo Vancouver.

## 11. Estado

- `preprint`: publicado en la 2.17.0 (23 de noviembre de 2026).
- `open_access` y `authors` estructurado: implementados para la versión siguiente.
