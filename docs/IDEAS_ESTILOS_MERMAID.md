---
title: Ideas para más estilos de diagramas Mermaid
subtitle: Ideación aparcada, para retomar con el tema de libros divulgativos
author: mdrender
date: 2026-11-27
---

> **Estado: aparcado.** Nada de esto está implementado ni decidido. Es el resultado de una
> ideación, con un prototipo desechable, para retomarlo más adelante.

## 1. Motivación

El acabado actual de los diagramas (`src/render/mermaid-style.ts`) es minimalista y funciona bien:
esquinas redondeadas, rellenos algo transparentes, un degradado suave y una banda bajo el título de
los subgrafos. Pero es uno solo, y lo comparten todos los temas de página; solo cambian los colores.

Para un futuro **tema de libros divulgativos** convienen opciones más creativas. La idea es tener
varios estilos de diagrama y que cada tema elija el suyo según lo necesite.

## 2. Qué aporta mermaid-cli

Revisamos el [README de mermaid-cli](https://github.com/mermaid-js/mermaid-cli/blob/master/README.md)
buscando ideas para implementar aquí desde cero. Documenta muy poco sobre estilo:

| Opción        | Qué hace                                                     | ¿Lo tenemos?                     |
| ------------- | ------------------------------------------------------------ | -------------------------------- |
| `-t`          | Tema de Mermaid (el README solo muestra `dark`)              | Sí, `--mermaid-theme`            |
| `-b`          | Fondo (el README solo muestra `transparent`)                 | El fondo lo da el tema de página |
| `--cssFile`   | CSS que se pasa tal cual a `themeCSS` de Mermaid             | Sí, `MERMAID_THEME_CSS`          |
| `--iconPacks` | Paquetes de íconos de Iconify (p. ej. `@iconify-json/logos`) | **No**: es lo único nuevo        |

La idea que sí vale la pena tomar es que **un estilo es un paquete de varias piezas**: tema de
Mermaid, configuración y CSS. Nosotros podemos sumar dos piezas que mermaid-cli no tiene: el
post-proceso del SVG (como el `finishDiagram` actual) y el marco del diagrama en la página.

## 3. Lo que Mermaid 12 ya trae y no usamos

El proyecto depende de `mermaid` 12.1, que trae bastante más de lo que exponemos:

- **Temas nuevos**: `neo`, `neo-dark`, `redux`, `redux-dark`, `redux-color` y
  `redux-dark-color`. `MERMAID_THEMES` en `src/options.ts` solo ofrece los 5 clásicos (`default`,
  `neutral`, `dark`, `forest`, `base`).
- **`look: handDrawn`**: trazo a mano alzada (Rough.js), con rellenos sólidos o de rayado.
  `handDrawnSeed` fija el trazo; sin semilla, cada conversión dibuja uno distinto.
- **`look: neo`**: el aspecto «moderno» de Mermaid. Deja una sombra bajo las formas, que hoy
  anulamos en `MERMAID_THEME_CSS` porque se ve a través de los rellenos transparentes.
- **ELK** como motor de diagramación, ya incluido en el paquete.

Ya hoy un autor puede pedir `look: handDrawn` en el frontmatter de un diagrama. Pero entonces
`authorConfigured` lo deja fuera del autofit, y el diagrama no recibe una letra ni una paleta
pensadas para ese aspecto.

## 4. Prototipos

Galería: [`docs/prototipos/estilos_mermaid/galeria.png`](prototipos/estilos_mermaid/galeria.png).
Muestra el mismo diagrama de flujo (el ciclo del agua) y el mismo diagrama de secuencia (una
sinapsis) en ocho estilos. Script: [`galeria.mts`](prototipos/estilos_mermaid/galeria.mts) (cómo
ejecutarlo está en su cabecera).

| #   | Estilo                | Cómo se hace                                                                  | Para qué                                        |
| --- | --------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- |
| 0   | Actual (Anti-Gravity) | Referencia: el acabado de hoy completo                                        | —                                               |
| 1   | Neo                   | Solo configuración: `theme: neo`, `look: neo`                                 | Variante barata para cualquier tema             |
| 2   | Redux color           | Solo configuración: `theme: redux-color`, `look: neo`                         | Ídem, con más color                             |
| 3   | **Cuaderno de campo** | `handDrawn` con semilla + paleta cálida + letra Kalam                         | Divulgación cercana, ciencia para todos         |
| 4   | **Pizarra**           | `handDrawn` + letra Caveat + marco oscuro con borde de madera                 | Aire de clase; gasta mucha tinta al imprimir    |
| 5   | **Tinta y trama**     | Post-proceso: tramas de puntos y rayado en vez de colores; etiquetas en serif | Libros impresos en blanco y negro o a una tinta |
| 6   | **Pop / sticker**     | CSS (contorno grueso) + post-proceso (sombra dura desplazada)                 | Infografía, público joven                       |
| 7   | **Plano técnico**     | CSS + cuadrícula en el marco; monoespaciada en versalitas                     | Divulgación de ingeniería o tecnología          |

Límites del prototipo:

- Solo el estilo 0 lleva el acabado completo de hoy (`finishDiagram`). No se probó cómo se
  combinan los estilos nuevos con las esquinas redondeadas, los degradados, las bandas de los
  subgrafos ni el autofit.
- Se miró en pantalla, no en el PDF. Falta comprobar el paso a PDF (Chrome, por ejemplo, descarta
  `fill-opacity` en rellenos con degradado; las tramas `<pattern>` y las sombras duplicadas
  podrían tener sorpresas similares).
- Solo se probaron diagramas de flujo y de secuencia.

## 5. Observaciones

- **Fuentes manuscritas**: Kalam y Caveat tienen licencia OFL y están en Fontsource, igual que las
  fuentes que ya empaquetamos. Se pueden incrustar sin romper el funcionamiento sin conexión. Hay
  que revisar que tengan los acentos y signos del español (en la galería se ven bien: «¿Dónde
  cae?», «Señal», «iónico»).
- **Reproducibilidad**: con `handDrawn` hay que fijar `handDrawnSeed`. Si no, cada conversión
  cambia el PDF.
- **Tamaño de letra**: las manuscritas se ven más pequeñas a igual tamaño nominal (en la galería,
  Kalam a 15 px y Caveat a 19 px frente a Manrope a 14 px). Cada estilo necesita su propio ajuste.
- **Tinta y trama** es la opción más interesante para imprenta: distingue categorías sin depender
  del color, así que funciona en blanco y negro y con daltonismo.
- **Pizarra** y **Plano técnico** dependen del marco (fondo oscuro o cuadrícula), que es CSS del
  tema de página, no del SVG. Ya existe un punto de apoyo: la tarjeta de `tech_magazine` y la
  variable `--diagram-frame`.

## 6. Propuesta de arquitectura (borrador)

Introducir un concepto de **estilo de diagrama**, separado del tema de página. Cada estilo
reuniría:

1. **Mermaid**: `theme`, `look` y `handDrawnSeed`.
2. **Colores**: `themeVariables`, derivadas de los tokens del tema de página cuando sea posible,
   como hace hoy `mermaidThemeVariables` en `src/render/antigravity.ts`.
3. **CSS**: el `themeCSS` del estilo (hoy, `MERMAID_THEME_CSS`).
4. **Letra**: la familia y el tamaño de las etiquetas, con sus fuentes empaquetadas.
5. **Post-proceso**: una lista de pasos sobre el SVG. El `finishDiagram` actual sería uno; las
   tramas y la sombra dura serían otros.
6. **Marco**: el CSS de `.mermaid-diagram` en la página, con su `--diagram-frame`.

Cómo se elegiría:

- Cada tema de página fija su estilo por defecto. El acabado actual sería el estilo por defecto
  de los temas existentes, así que no cambia nada para quien no lo pida.
- `--diagram-style <nombre>` en la línea de comandos y `diagramStyle` en `mdrender.config.json`.
- Quizás también diagrama por diagrama, en su frontmatter (pregunta abierta, ver §8).

## 7. Ideas sin prototipar

- **Íconos** de Iconify dentro de los nodos (lo que mermaid-cli ofrece con `--iconPacks`).
  Tendrían que ir empaquetados (`@iconify-json/*`) para seguir funcionando sin conexión.
- **Círculos numerados** (①, ②, ③) en los nodos, que el texto del libro pueda citar: «ver ③».
- **Un color directo del libro** en lugar de la paleta de Mermaid: todo en tinta negra más un
  único color de acento.
- **Textura de papel** sutil en el marco del estilo Cuaderno.
- **Leyenda automática** de las tramas del estilo Tinta y trama.
- Exponer los temas `neo` y `redux*` en `--mermaid-theme` sin más cambios: es lo más barato y
  podría hacerse por separado.

## 8. Preguntas abiertas para retomar

1. ¿Qué estilos usará el tema de libros divulgativos? La recomendación de la ideación es
   **Cuaderno de campo** como estilo principal y **Tinta y trama** para ediciones impresas.
2. ¿El estilo va fijo con el tema de página, o se puede elegir para cada diagrama?
3. ¿Los estilos nuevos conservan el autofit y el acabado actual (esquinas, degradados), o cada
   estilo decide qué pasos de post-proceso usa?
4. ¿Qué tipos de diagrama deben quedar bien en cada estilo? Además de flujo y secuencia: clases,
   estados, ER, Gantt, torta, mapa mental…

## 9. Siguiente paso propuesto al retomar

Llevar uno o dos estilos (Cuaderno y Tinta y trama) al pipeline real detrás de una opción
experimental, convertir `examples/ejemplo.md` a PDF con cada uno y revisar el resultado impreso
antes de diseñar la arquitectura completa.
