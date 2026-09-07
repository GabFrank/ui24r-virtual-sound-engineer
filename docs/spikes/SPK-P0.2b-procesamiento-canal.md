# SPK-P0.2b — Matriz de procesamiento de canal

**Estado:** Pendiente · **Timebox:** 8 días · **Control:** G-C
**Depende de:** SPK-P0.2a, S-02.6 · **Bloquea a:** S-06.7, S-06.6
**Montaje:** Ui24R, un canal de prueba sin señal, navegador oficial, laptop. Solo consola: puede correr en paralelo con el primer entregable.

## Pregunta que responde

¿Cómo se codifican el filtro pasa altos, el ecualizador, el compresor, la puerta y el deesser, y se pueden escribir con seguridad?

Ninguno de estos tiene interfaz tipada en la biblioteca. Sus claves existen en el modelo de estado, pero el escalado es desconocido. Escribir un valor mal convertido produce un cambio extremo en un canal en vivo.

## Pasos

1. Para cada parámetro, mover el control en la interfaz oficial y anotar al menos siete pares de valor crudo y valor mostrado, cubriendo todo el rango.
2. Alternativamente, extraer las tablas de conversión del código que la propia consola sirve por HTTP.
3. Construir la entrada correspondiente en la tabla de mapeo con su función en ambos sentidos.
4. **Preparar el canal de prueba**: sin señal, fader a menos infinito, silenciado, fuera de todos los auxiliares, verificado por lectura, y con el general silenciado a mano por el operador, que lo confirma.
5. Escribir cada parámetro al 10, 50 y 90 por ciento de su rango físico y verificar por lectura.
6. Comprobar que ninguna otra ruta del estado cambió.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Pasa altos: frecuencia y pendiente | bloqueante | 7 puntos o más por parámetro | | ⬜ |
| 2 | Ecualizador paramétrico: ganancia, factor de calidad y frecuencia de cada banda | bloqueante | 7 puntos o más por parámetro | | ⬜ |
| 3 | Compresor: umbral, relación, ataque, relajación y ganancia | bloqueante | 7 puntos o más por parámetro | | ⬜ |
| 4 | Puerta: umbral y profundidad | bloqueante | 7 puntos o más | | ⬜ |
| 5 | Deesser: frecuencia, relación y umbral | informativo | 7 puntos o más | | ⬜ |
| 6 | Ida y vuelta de la conversión | bloqueante | error del 1 % del rango o menos | | ⬜ |
| 7 | Escritura en canal de prueba con las precondiciones cumplidas | bloqueante | lectura coincide dentro del 1 % en 10, 50 y 90 % | | ⬜ |
| 8 | Ninguna otra ruta del estado cambió | bloqueante | la diferencia del estado es exactamente la ruta escrita | | ⬜ |
| 9 | Nunca ejecutado con la sesión en estado de show | bloqueante | verificado | | ⬜ |

## Evidencia a entregar

- `evidence/raw-tables/` con un archivo por parámetro.
- `evidence/write-verification.jsonl` y las diferencias de estado.

## Acción ante fallo

Los parámetros que no se puedan mapear se marcan como no mapeados: se permite leerlos, se prohíbe escribirlos. Las recomendaciones sobre ellos se emiten con valor absoluto sugerido, sin valor actual ni delta, para aplicar a mano. No afecta al primer nivel de aplicación asistida, que usa ganancia y fader, ambos tipados.
