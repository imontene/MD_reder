# Calibración del criterio (§5.3–§5.4)

Generado por `calibrar.mts` con 49 votos (43 con preferencia, 6 «iguales»).

## Coincidencia con el autor

Condiciones obligatorias (letra ≥ 0.5, flechas que tocan su forma, ninguna arista a través de una caja, sin solapes): deciden 6 pares y aciertan en 6.

| Conjunto de medidas (después de las condiciones obligatorias)              | λ    | Margen | Coincidencia, dejando cada par fuera |
| -------------------------------------------------------------------------- | ---- | ------ | ------------------------------------ |
| todas las medidas                                                          | 3    | 0.1    | 63 %                                 |
| las de los motivos del autor (economía, legibilidad, equilibrio, retornos) | 3    | 0.1    | 61 %                                 |
| **solo economía**                                                          | 0.03 | 0.2    | 69 %                                 |

**Regla escalonada** (condiciones obligatorias; luego el más compacto si los altos impresos difieren en más de 0.05 de la página; luego el mejor centrado si el equilibrio difiere en más de 0.2; si no, iguales): **71 %** dejando cada par fuera, también al elegir los dos umbrales (73 % con todos los pares).

| Criterio                                                                                        | Coincidencia |
| ----------------------------------------------------------------------------------------------- | ------------ |
| **Calibrado**, dejando cada par fuera al ajustar (tres opciones: A, B, iguales)                 | **69 %**     |
| Calibrado, solo pares con preferencia, dejando cada par fuera                                   | 68 %         |
| Calibrado, 25 % de pares reservados (12 pares)                                                  | 58 %         |
| Referencia: gana la letra más grande (el piso anterior)                                         | 20 %         |
| Referencia: gana el más bajo                                                                    | 57 %         |
| Referencia: pesos iguales, mejor margen                                                         | 39 %         |
| Referencia: siempre `classic` (solo pares `classic`–`smart`)                                    | 68 %         |
| Referencia: condiciones obligatorias y, si no deciden, `classic` (solo pares `classic`–`smart`) | 68 %         |

## Pesos

Regularización λ = 0.03 (elegida dejando cada par fuera: 0.03 → 68 %, 0.1 → 68 %, 0.3 → 68 %, 1 → 68 %, 3 → 68 %). Margen para «iguales»: 0.2 en la escala estandarizada.

Conjunto elegido: solo economía.

| Medida            | Usada | Peso (unidades de la medida) | Peso estandarizado |
| ----------------- | ----- | ---------------------------- | ------------------ |
| Legibilidad       | no    | —                            | —                  |
| Economía          | sí    | 4.956                        | 1.58               |
| Proporción        | no    | —                            | —                  |
| Equilibrio        | no    | —                            | —                  |
| Contacto          | no    | —                            | —                  |
| Salidas limpias   | no    | —                            | —                  |
| Retornos          | no    | —                            | —                  |
| Cruces y quiebres | no    | —                            | —                  |

No se quitó ninguna medida.

## Pares en que la regla escalonada no coincide

| Par | Tipo              | Diagrama                                                          | Voto       | Regla      |
| --- | ----------------- | ----------------------------------------------------------------- | ---------- | ---------- |
| p07 | smart-alternativa | 13. TD corto con explicación                                      | iguales    | smart      |
| p10 | smart-alternativa | R5. Defecto: la red no absorbe la mejora que la busqueda le ofre… | smart      | smartAlt   |
| p12 | classic-smart     | 4. Cadena graph LR de 6 pasos                                     | iguales    | smart      |
| p13 | classic-smart     | 11. TD de comparación de arquitecturas                            | classic    | iguales    |
| p19 | classic-smart     | 6. Cadena LR de 7 pasos con etiquetas cortas                      | classic    | smart      |
| p20 | classic-smart     | E3. Caso 8 con look handDrawn                                     | classic    | smart      |
| p25 | classic-smart     | E1. Formas, classDef y style                                      | classic    | smart      |
| p29 | classic-girado    | 5. Cadena RL de 6 pasos                                           | iguales    | classicAlt |
| p31 | classic-smart     | 8. TB con subgrafos horizontales                                  | classic    | smart      |
| p32 | classic-girado    | 14. TD de cabezas de red                                          | classicAlt | iguales    |
| p35 | classic-smart     | 5. Cadena RL de 6 pasos                                           | classic    | smart      |
| p45 | classic-smart     | R5. Defecto: la red no absorbe la mejora que la busqueda le ofre… | classic    | smart      |
| p47 | classic-girado    | 11. TD de comparación de arquitecturas                            | classicAlt | iguales    |

## Pares en que el modelo de pesos no coincide

| Par | Tipo              | Diagrama                                                          | Voto       | Puntuación |
| --- | ----------------- | ----------------------------------------------------------------- | ---------- | ---------- |
| p07 | smart-alternativa | 13. TD corto con explicación                                      | iguales    | -0.55      |
| p10 | smart-alternativa | R5. Defecto: la red no absorbe la mejora que la busqueda le ofre… | smart      | 0.88       |
| p11 | classic-smart     | R4. entrada del bloque, 256 x 8 x 8…                              | classic    | 0.00       |
| p12 | classic-smart     | 4. Cadena graph LR de 6 pasos                                     | iguales    | -1.25      |
| p13 | classic-smart     | 11. TD de comparación de arquitecturas                            | classic    | 0.00       |
| p19 | classic-smart     | 6. Cadena LR de 7 pasos con etiquetas cortas                      | classic    | -1.96      |
| p20 | classic-smart     | E3. Caso 8 con look handDrawn                                     | classic    | 0.25       |
| p25 | classic-smart     | E1. Formas, classDef y style                                      | classic    | 1.82       |
| p29 | classic-girado    | 5. Cadena RL de 6 pasos                                           | iguales    | 2.23       |
| p31 | classic-smart     | 8. TB con subgrafos horizontales                                  | classic    | -0.33      |
| p32 | classic-girado    | 14. TD de cabezas de red                                          | classicAlt | 0.12       |
| p35 | classic-smart     | 5. Cadena RL de 6 pasos                                           | classic    | -1.56      |
| p44 | classic-smart     | 14. TD de cabezas de red                                          | classic    | 0.01       |
| p45 | classic-smart     | R5. Defecto: la red no absorbe la mejora que la busqueda le ofre… | classic    | 0.30       |
| p47 | classic-girado    | 11. TD de comparación de arquitecturas                            | classicAlt | 0.11       |
