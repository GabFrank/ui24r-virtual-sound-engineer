# Puntajes de sala y de mezcla

Un puntaje sin fórmula es un número que nadie puede explicar ni testear. Estas son las definiciones, con ejemplos numéricos.

Ambos van de 0 a 100, donde 100 es el ideal teórico y **no es alcanzable ni deseable**: una sala perfectamente plana no existe y una mezcla no tiene un óptimo único.

## Puntaje de sala

Cuatro componentes con peso:

| Componente | Peso | Qué mide | Cómo se calcula |
|---|---|---|---|
| Desviación al objetivo | 45 | Cuánto se aleja la respuesta promedio de la curva objetivo | 100 − 8 × RMS de la desviación en decibeles, por bandas de tercio de octava con coherencia suficiente, acotado a 0 |
| Consistencia espacial | 30 | Cuánto se parecen las posiciones entre sí | 100 − 10 × mediana de la desviación típica entre posiciones, por banda |
| Suavidad espectral | 15 | Cuánto oscila la respuesta, con resonancias estrechas | 100 − 6 × RMS de la diferencia entre la respuesta con suavizado de doceavo y con suavizado de tercio |
| Ruido de fondo | 10 | Margen entre el sistema y el ruido del lugar | 100 si la relación señal a ruido supera 40 dB; baja 5 puntos por cada decibel que falte |

Solo entran las bandas con coherencia por encima de 0,7 y al menos 16 promedios. Las bandas descartadas se informan: un puntaje calculado sobre la mitad del espectro se marca como parcial.

**Ejemplo.** Desviación RMS al objetivo de 3,2 dB da 74,4. Desviación típica entre posiciones con mediana de 2,8 dB da 72. Rugosidad de 1,1 dB da 93,4. Relación señal a ruido de 44 dB da 100.
Puntaje = (74,4×45 + 72×30 + 93,4×15 + 100×10) / 100 = **79**.

## Puntaje de mezcla

| Componente | Peso | Qué mide | Cómo se calcula |
|---|---|---|---|
| Cumplimiento de objetivos de rol | 40 | Si cada fuente está donde su rol pide | 100 − 12 × RMS del error en decibeles frente al objetivo relativo de su rol |
| Margen | 25 | Si hay espacio antes de saturar | 100 si el pico del general está entre −12 y −3 dBFS; baja 10 por decibel fuera de ese rango |
| Ausencia de saturación | 20 | Eventos de saturación en canales durante la captura | 100 menos 20 por canal con saturación |
| Equilibrio espectral del general | 15 | Desviación del espectro del general frente a la curva objetivo del lugar | igual que la desviación al objetivo del puntaje de sala |

**Ejemplo.** Error de rol de 1,4 dB da 83,2. Pico del general en −6 dBFS da 100. Un canal saturando da 80. Desviación espectral de 2,5 dB da 80.
Puntaje = (83,2×40 + 100×25 + 80×20 + 80×15) / 100 = **86**.

## Reglas comunes

- Un puntaje siempre se muestra **con su desglose**. Un número solo no dice qué arreglar.
- Un puntaje calculado con estado de calibración inválido se muestra tachado y no se guarda en el histórico.
- La comparación entre dos puntajes solo tiene sentido si ambos se midieron con la misma configuración de análisis y el mismo estado de calibración.
- La tolerancia del lazo cerrado no es un número fijo: es el mayor entre dos veces la desviación típica del puntaje medida en SPK-REPEAT para ese lugar, y dos puntos (INV-023).
