# Banco sintético de autoajuste Mermaid

Veinte diagramas que reproducen los casos del estudio de autoajuste: cadenas horizontales,
diagramas verticales con subgrafos horizontales, etiquetas largas, diagramas que no caben en la
página, y tipos a los que el autoajuste no se aplica.

## 1. Cadena LR de 8 pasos

```mermaid
flowchart LR
  A[Recolectar partidas de autojuego] --> B[Generar tensores de entrenamiento]
  B --> C[Muestrear minibatch del buffer]
  C --> D[Calcular pérdida de política y valor]
  D --> E[Actualizar pesos con AdamW]
  E --> F[Evaluar contra la red anterior]
  F --> G[Promover si gana más del 55 %]
  G --> H[Publicar checkpoint]
```

## 2. Cadena LR de 5 pasos con etiquetas medianas

```mermaid
flowchart LR
  A[Tablero 8x8 codificado en 119 planos] --> B[Torso residual de 20 bloques]
  B --> C[Cabeza de política 4672 logits]
  B --> D[Cabeza de valor tanh escalar]
  C --> E[Máscara de jugadas legales]
```

## 3. Cadena LR con decisión

```mermaid
flowchart LR
  A[Estado del juego] --> B{¿Nodo expandido?}
  B -->|No| C[Evaluar con la red neuronal]
  B -->|Sí| D[Seleccionar hijo por PUCT]
  C --> E[Retropropagar valor]
  D --> F[Descender un nivel]
  F --> B
  E --> G[Actualizar visitas N y valor W]
```

## 4. Cadena graph LR de 6 pasos

```mermaid
graph LR
  P1[Cargar configuración YAML] --> P2[Inicializar semillas aleatorias]
  P2 --> P3[Construir red y optimizador]
  P3 --> P4[Restaurar último checkpoint]
  P4 --> P5[Lanzar trabajadores de autojuego]
  P5 --> P6[Bucle de entrenamiento principal]
```

## 5. Cadena RL de 6 pasos

```mermaid
flowchart RL
  A[Resultado final de la partida] --> B[Asignar valor z a cada posición]
  B --> C[Guardar tripletas estado-política-valor]
  C --> D[Comprimir y escribir en disco]
  D --> E[Rotar el buffer de repetición]
  E --> F[Notificar al entrenador]
```

## 6. Cadena LR de 7 pasos con etiquetas cortas

```mermaid
flowchart LR
  A[Entrada] --> B[Convolución 3x3] --> C[BatchNorm] --> D[ReLU] --> E[Convolución 3x3] --> F[Suma residual] --> G[Salida]
```

## 7. TD con subgrafos en paralelo

```mermaid
flowchart TD
  subgraph S1[Trabajador de autojuego 1]
    direction LR
    A1[Partida] --> B1[MCTS 800 simulaciones] --> C1[Jugada]
  end
  subgraph S2[Trabajador de autojuego 2]
    direction LR
    A2[Partida] --> B2[MCTS 800 simulaciones] --> C2[Jugada]
  end
  subgraph S3[Trabajador de autojuego 3]
    direction LR
    A3[Partida] --> B3[MCTS 800 simulaciones] --> C3[Jugada]
  end
```

## 8. TB con subgrafos horizontales

```mermaid
flowchart TB
  subgraph Entrada
    direction LR
    I1[Planos de piezas] --> I2[Planos de repetición] --> I3[Planos de enroque] --> I4[Contador de 50 jugadas]
  end
  subgraph Salida
    direction LR
    O1[Logits de política] --> O2[Softmax con temperatura] --> O3[Valor esperado]
  end
  Entrada --> Salida
```

## 9. TD ancho de varias ramas

```mermaid
flowchart TD
  R[Raíz de búsqueda] --> A[Apertura e4 con prior 0,31]
  R --> B[Apertura d4 con prior 0,27]
  R --> C[Apertura Cf3 con prior 0,14]
  R --> D[Apertura c4 con prior 0,12]
  R --> E[Apertura g3 con prior 0,05]
  R --> F[Apertura b3 con prior 0,03]
```

## 10. TD con etiquetas largas

```mermaid
flowchart TD
  A[Se generan partidas completas de autojuego usando la red actual con ruido de Dirichlet en la raíz para favorecer la exploración] --> B[Cada posición se guarda junto con la distribución de visitas del árbol de búsqueda y el resultado final de la partida]
  B --> C[El entrenador muestrea posiciones uniformemente del buffer y minimiza la suma de la entropía cruzada y el error cuadrático del valor]
  C --> D[La nueva red se evalúa contra la anterior en cuatrocientas partidas y se promueve solo si supera el umbral]
```

## 11. TD de comparación de arquitecturas

```mermaid
flowchart TD
  A[ResNet clásica con veinte bloques residuales y doscientos cincuenta y seis filtros por capa] --> C[Comparación en Elo tras un millón de pasos]
  B[Transformer con atención sobre las sesenta y cuatro casillas y codificación posicional aprendida] --> C
  C --> D[La ResNet gana en partidas cortas mientras el Transformer escala mejor con más cómputo]
```

## 12. TD de Gumbel con etiquetas largas

```mermaid
flowchart TD
  A[Muestrear k acciones sin reemplazo usando el truco de Gumbel-Top-k sobre los logits de la política] --> B[Asignar el presupuesto de simulaciones mediante Sequential Halving en varias rondas]
  B --> C[Descartar la mitad de las acciones con peor puntuación combinada de logit, ruido y valor estimado]
  C --> D{¿Queda una sola acción?}
  D -->|No| B
  D -->|Sí| E[Jugar la acción ganadora y construir el objetivo de política mejorada para el entrenamiento]
```

## 13. TD corto con explicación

```mermaid
flowchart TD
  A[La política mejorada se calcula con las Q completadas, sustituyendo el valor de las acciones no visitadas por la estimación de la red] --> B[El objetivo de entrenamiento es el softmax de los logits más una transformación monótona de esas Q completadas]
```

## 14. TD de cabezas de red

```mermaid
flowchart TD
  T[Torso compartido con bloques residuales y normalización por lotes en cada convolución] --> P[Cabeza de política: convolución de dos filtros seguida de una capa densa de 4672 salidas]
  T --> V[Cabeza de valor: convolución de un filtro, capa densa de 256 unidades y salida tanh]
  T --> M[Cabeza auxiliar de material: predice la diferencia de material en las próximas diez jugadas]
```

## 15. Arquitectura general grande

```mermaid
flowchart TD
  U[Usuario] --> CLI[Interfaz de línea de órdenes]
  CLI --> CFG[Cargador de configuración]
  CFG --> ORQ[Orquestador de entrenamiento]
  ORQ --> SP[Grupo de trabajadores de autojuego]
  ORQ --> TR[Entrenador en GPU]
  ORQ --> EV[Evaluador de candidatos]
  SP --> MCTS[Búsqueda en árbol de Monte Carlo]
  MCTS --> INF[Servidor de inferencia por lotes]
  INF --> NET[Red neuronal actual]
  SP --> BUF[Buffer de repetición en disco]
  BUF --> TR
  TR --> CK[Checkpoints]
  CK --> EV
  EV --> NET
  EV --> LOG[Métricas y registro de Elo]
  TR --> LOG
  LOG --> DASH[Panel de seguimiento]
```

## 16. Flujo de datos con etiquetas de código

```mermaid
flowchart TD
  A["games/selfplay_000123.pgn"] --> B["encode_board(board: chess.Board) -> np.ndarray[119, 8, 8]"]
  B --> C["policy_target = visits / visits.sum(axis=-1, keepdims=True)"]
  C --> D["ReplayBuffer.add(state, policy_target, value_target, weight=1.0)"]
  D --> E["sampler = PrioritizedSampler(alpha=0.6, beta=0.4, capacity=2_000_000)"]
  E --> F["batch = sampler.sample(batch_size=4096, device='cuda:0')"]
  F --> G["loss = cross_entropy(logits, pi) + mse(v, z) + c * l2(params)"]
  G --> H["optimizer.step(); scheduler.step(); ema.update(model)"]
  H --> I["torch.save(model.state_dict(), f'checkpoints/step_{step:08d}.pt')"]
  I --> J["evaluate(candidate, best, games=400, threshold=0.55)"]
  J --> K["promote(candidate) if score > threshold else discard(candidate)"]
```

## 17. Representación del tablero

```mermaid
graph TD
  subgraph Planos
    direction LR
    P1[Peones blancos] --- P2[Caballos blancos] --- P3[Alfiles blancos] --- P4[Torres blancas] --- P5[Damas blancas] --- P6[Rey blanco]
  end
  Planos --> X[Tensor de entrada]
```

## 18. Tipo no aplicable: torta

```mermaid
pie title Tiempo por etapa
  "Autojuego" : 62
  "Entrenamiento" : 28
  "Evaluación" : 10
```

## 19. Tipo no aplicable: secuencia

```mermaid
sequenceDiagram
  participant W as Trabajador
  participant S as Servidor de inferencia
  W->>S: Lote de posiciones
  S-->>W: Políticas y valores
```

## 20. Configuración del autor

```mermaid
%%{init: {"flowchart": {"wrappingWidth": 150}}}%%
flowchart LR
  A[El autor fijó su propio ancho de ajuste] --> B[mdrender lo respeta] --> C[Se dibuja una sola vez]
```
