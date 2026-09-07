# Pruebas de campo

Una prueba de campo cierra cada versión. No es una demostración: es una medición con criterio de éxito y de fracaso definido de antemano.

## Criterio por versión

| Historia | Qué se mide | Éxito | Fracaso, obliga a repetir |
|---|---|---|---|
| S-03.10 · MVP0 | Tiempo por canal, recomendaciones de ganancia, alertas del monitor | 80 % de canales en 5 min o menos; 50 % de recomendaciones aceptadas o valoradas en 4 o más; ninguna falsa alarma de saturación confirmada; ninguna escritura en el registro | Cualquier escritura; más de una caída; más de dos falsas alarmas de red |
| S-06.9 · MVP1 | Tiempo por canal, sugerencias de filtro, ecualización y dinámica, calibración | 70 % de recomendaciones valoradas en 4 o más tras aplicarlas a mano; calibración válida toda la sesión | Dos o más recomendaciones fuera de los límites de INV-004; calibración inválida sin explicación |
| S-07.8 · Room-Observe | Hallazgos frente a una medición de referencia externa, en las mismas posiciones y con el mismo micrófono | Los tres hallazgos principales coinciden en banda, dentro de un tercio de octava, y en signo, en las dos salas; medición rápida en 15 min o menos | Un hallazgo de exceso global que la referencia no muestra; coherencia media por debajo de 0,7 en más del 30 % de las bandas |
| S-08.7 · Mix-Live | Construcción progresiva de mezcla, recomendaciones de fader | 15 min o menos; 60 % de recomendaciones valoradas en 4 o más; ninguna recomendación de ecualización o ganancia desde el asistente de mezcla | Más de una recomendación fuera de límites |
| S-10.6 · Room-Correct | Comparación antes y después, aplicada a mano | Mejora de 1 dB o más en la desviación al objetivo y del puntaje por encima de la tolerancia, en al menos una de dos salas; ningún realce mayor de 2 dB; ningún filtro sobre un mínimo | El puntaje empeora en las dos salas |
| S-11.6 · Mix-A/B | Repetibilidad | Tres pasadas dentro de tolerancia; alineación de 2 muestras o menos; A y B distinguibles con confianza media o mayor; ningún canal en vivo afectado | Alineación fallida en más de una pasada; cualquier canal en vivo silenciado |
| S-13.5 · MVP4a | Diez aplicaciones asistidas o más | 10 de 10 aplicadas o en conflicto explicado; ningún cambio sin verificar en silencio; retroceso probado dos veces con verificación | Cualquier incidente de seguridad |
| S-14.4 · MVP4b | Lazo cerrado en dos salas | Converge o se detiene con motivo en las dos; ningún incidente; la invariante de pantalla bloqueada verificada a propósito | Oscilación entre conservar y revertir dos veces o más |
