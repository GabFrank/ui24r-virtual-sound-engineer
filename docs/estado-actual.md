# Estado actual

Actualizado el 2026-09-21, en la tarde. Base de producto: `claude/soundcraft-ui24-assistant-kh8ezj`,
que ya incorpora la corrección del flujo de `fix/flujo-de-desarrollo-ligero`
(mezclada sin conflictos). Consultar `git log` para los commits posteriores.
Este archivo reemplaza la cadena de cierres como entrada de sesión.

**Del flujo:** `a3f171b` aligera la verificación y la selecciona por impacto;
`a280aab` agrega pruebas sobre servicios reales; `e8ca255` y `ab1df20` registran
el informe y su publicación
([informe](backlog/auditorias/2026-09-21-flujo-de-desarrollo.md)). El bundle
anterior queda como respaldo, no como paso pendiente.

## Producto y siguiente tarea

- **Pieza 1, monitores: cerrada y probada contra el aparato.** Conservarla.
- **Pieza 2, ecualizador de canal:** criterio decidido en
  [ADR-038](adr/ADR-038-el-criterio-del-ecualizador-de-canal.md): curva nombrada,
  corrección por medición del canal y curva aprobada que vuelve a la biblioteca.
- Las doce hojas de las cuatro bandas están medidas:
  [ítem 121](compromisos/121-la-frecuencia-y-el-q-de-las-bandas-2-3-y-4.md).
  No repetir esa medición por arrastrar un prompt viejo.
- **La tarea 1b, «un kind, una unidad», está decidida y sin implementar:**
  [ADR-039](adr/ADR-039-el-freno-viaja-con-la-hoja-y-se-cuenta-en-octavas.md),
  del usuario, tres preguntas con tres opciones. La aplicación mueve las tres
  hojas de una banda; el freno viaja con la hoja —la unidad de la magnitud queda,
  se agrega una **escala del movimiento**: octavas en frecuencia, octavas de
  ancho de banda en Q—; poner una banda se hace con la campana en cero y **la
  ganancia se escribe primero**. El censo permitido está en 690 y tiene que
  volver a 930 exacto al implementar.

## Próxima sesión: construir la 1b

1. Leer ADR-039 entera, incluido el recuadro inicial con lo que encontró la
   auditoría, y los cuatro pasos de la 1b en el
   [plan de la pieza 2](pedidos/2026-09-20c-plan-de-la-pieza-2.md).
2. Implementar en `packages/domain` y `packages/safety`: escala del movimiento
   por hoja con la familia por omisión; la operación «poner la banda» comprobada
   sobre el contenido y el orden de la transacción; acumulado en la escala del
   movimiento. Leer el tope por hoja cambia la interfaz pública de `@vse/domain`
   (el contexto del cambio no lleva la ruta) y toca siete sitios, tres en
   `packages/assistants`.
3. **La exención del salto libre no se enciende** hasta medir que una campana
   neutra se puede correr por el tramo sin que la respuesta se mueva. Lo demás
   se construye sin eso. Esa medición toca la consola: leer
   [hardware](desarrollo/hardware.md) antes.

Después siguen la decisión sobre selección del analizador, lector de espectro,
asistente, servicio, pantalla y biblioteca; el plan contiene sus condiciones.
Un hallazgo anotado entra cuando el campo o la tarea actual lo necesita.

## Equipo y comprobaciones

Construir la 1b no requiere consola ni tablet; la medición de la campana
neutra sí. Para medir, cargar [hardware](desarrollo/hardware.md); contiene el banco y su
diagnóstico. Un dato de un cierre no sustituye leer el equipo en esa sesión.

Al comenzar, comprobar rama, cambios locales y diferencias con esta base. Para
editar, elegir pruebas según [CONTRIBUTING](../CONTRIBUTING.md). Una corrida
anterior vale sólo para el árbol que probó; un estado «verde» escrito aquí no
certifica los cambios siguientes. El próximo agente entrega el prompt en el chat
usando la [plantilla](templates/prompt-continuidad.md), sin copiar este archivo entero.
