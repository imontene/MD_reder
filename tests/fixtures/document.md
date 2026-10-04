---
title: Informe técnico
subtitle: Prueba de la Fase 3
author: Equipo mdrender
date: 2026-10-04
lang: es
toc: true
header: "{title} | | {date}"
---

## Introducción

Este documento prueba el resaltado de código, las alertas y las notas al pie[^1].

> [!NOTE]
> Las alertas usan la sintaxis de GitHub.

> [!WARNING]
> El título cambia con el idioma del documento.

## Código

```ts
// Comentario
export function saludar(nombre: string): string {
  const n = 42;
  return `Hola, ${nombre} (${n})`;
}
```

```python
def area(r: float) -> float:
    """Área de un círculo."""
    return 3.14159 * r ** 2
```

```bash
mdrender informe.md --toc --page-size Letter
```

### Lenguaje desconocido

```foo
sin resaltado <b>escapado</b>
```

## Notas

Otra referencia[^nota] al final.

[^1]: Una nota al pie simple.

[^nota]: Una nota con **formato**.
