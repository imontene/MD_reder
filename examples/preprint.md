---
theme: preprint
preprint-stamp: "preprint:2026.0042v1  [química física]  22 nov 2026"
title: Cinética de conversión catalítica a baja temperatura
author: Ana Pérez^1^, Luis Gómez^1,2^, Marta Ruiz^2^
affiliations:
  - Departamento de Química, Universidad de Ejemplo, Santiago, Chile. ana.perez@ejemplo.org
  - Instituto de Materiales Avanzados, Valparaíso, Chile.
date: 22 de noviembre de 2026
abstract: >
  Medimos la conversión de un sustrato modelo con dos catalizadores heterogéneos entre 20 y
  60 °C. Ambos siguen una cinética de primer orden, pero el catalizador A alcanza el 90 % de
  conversión en menos de la mitad del tiempo que el B. Un modelo de dos parámetros reproduce
  todas las curvas con un error menor al 2 %, lo que permite elegir el catalizador según la
  ventana de operación.
keywords: [catálisis heterogénea, cinética, modelos de primer orden]
lang: es
---

## Introducción

La conversión catalítica a baja temperatura es clave para procesos que no toleran calor, como
la síntesis de compuestos sensibles o el tratamiento de efluentes [1, 2]. Elegir un catalizador
suele requerir largas campañas de ensayo; un modelo cinético simple acorta ese camino y permite
comparar candidatos con pocos experimentos[^1].

En este trabajo comparamos dos catalizadores comerciales y mostramos que un modelo de primer
orden, con una constante de velocidad que sigue la ley de Arrhenius, basta para describir la
conversión en todo el rango estudiado. Esto contrasta con trabajos anteriores que proponían
modelos de orden fraccionario para sistemas parecidos [3].

## Modelo cinético

### Conversión en el tiempo

Suponemos que la velocidad de conversión es proporcional a la fracción de sustrato que aún no
reacciona. Integrando, la fracción convertida $X(t)$ resulta

$$
X(t) = X_\infty \left(1 - e^{-k t}\right),
$$

donde $X_\infty$ es la conversión final y $k$ la constante de velocidad.

### Dependencia con la temperatura

La constante de velocidad sigue la ley de Arrhenius,

$$
k(T) = A\, e^{-E_a / R T},
$$

de modo que dos mediciones a temperaturas distintas bastan para estimar la energía de
activación $E_a$:

$$
E_a = \frac{R \ln (k_2 / k_1)}{1/T_1 - 1/T_2}.
$$

## Resultados

La fracción convertida crece de forma monótona con el tiempo y se aproxima a uno para ambos
catalizadores (Figura 1). El catalizador A es claramente más rápido: llega al 50 % de
conversión en 1,5 h, frente a 3,1 h del B.

![Conversión en función del tiempo a 40 °C. La línea continua corresponde al catalizador A y la discontinua al B; cada curva es el promedio de tres ensayos.](img/curva.svg)

Los parámetros ajustados con la ecuación (1) aparecen en la Tabla 1. La menor energía de
activación del catalizador A explica su ventaja, que además crece al bajar la temperatura.

Table: Parámetros del modelo ajustados para cada catalizador.

| Catalizador | $X_\infty$ | $k$ a 40 °C (h⁻¹) | $E_a$ (kJ/mol) | $R^2$ |
| :---------- | ---------: | ----------------: | -------------: | ----: |
| A           |       1,00 |              0,45 |           38,2 | 0,998 |
| B           |       0,86 |              0,22 |           44,7 | 0,995 |

## Discusión

El modelo de primer orden describe bien ambos sistemas, sin necesidad de términos adicionales.
La diferencia en $X_\infty$ indica que el mecanismo de desactivación, y no solo la velocidad,
debe considerarse al elegir un catalizador [2].

## Conclusiones

Un modelo de dos parámetros reproduce la conversión de ambos catalizadores con un error menor
al 2 %. Para procesos continuos conviene el catalizador A; para operaciones por lotes cortas,
la diferencia es menor y el costo puede decidir.

## Referencias

1. Autor A, Autor B. Título de un artículo citado como ejemplo. Revista de Ejemplo. 2024;12(3):45–56.
2. Autor C. Título de un libro de ejemplo. 2.ª ed. Ciudad: Editorial de Ejemplo; 2023.
3. Autor D, Autor E, Autor F. Otro artículo citado como ejemplo. Revista de Ejemplo. 2022;10(1):1–12.

[^1]: Los datos y el código del ajuste están disponibles a pedido.
