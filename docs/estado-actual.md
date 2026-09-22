# Estado actual

Actualizado el 2026-09-22. Base de producto: `claude/soundcraft-ui24-assistant-kh8ezj`,
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
- **La tarea 1b, «un kind, una unidad», está construida el 2026-09-22:**
  [ADR-039](adr/ADR-039-el-freno-viaja-con-la-hoja-y-se-cuenta-en-octavas.md).
  El freno viaja con la hoja —la unidad de la magnitud queda y se agrega una
  **escala del movimiento**: octavas en frecuencia, octavas de ancho de banda en
  Q—, el acumulado suma en esa escala, y «poner la banda» se comprueba sobre el
  contenido y el orden. **El censo volvió a 930 exacto**, con su reparto por
  familia y un control que ejercita las 240 contra el tope.
- **Lo único que queda de ADR-039 es la exención del salto libre, y está
  apagada.** Hoy poner una banda lejos se rechaza por el tope aunque la forma
  sea correcta.

## Próxima sesión: la medición que enciende el salto libre, o la tarea 2

**La decisión es del usuario y hay dos caminos.** Los dos están en el
[plan de la pieza 2](pedidos/2026-09-20c-plan-de-la-pieza-2.md).

1. **Medir que una campana neutra se puede correr sin que la respuesta se
   mueva**, que es la condición que ADR-039 le puso a la exención. Es barata y
   usa el mismo banco del ítem 121. **Toca la consola**: leer
   [hardware](desarrollo/hardware.md) antes y preguntarle al usuario, que la
   tiene apagada. Sin esa medición la aplicación puede correr una banda de a un
   tercio de octava por paso, que alcanza para afinar y no para mudarla lejos.
2. **La tarea 2, decidir si la aplicación puede elegir qué canal analiza.** Es
   una escritura de clase nueva, le cambia una pantalla al operador y necesita
   decisión del usuario antes de construir nada. No toca la consola para
   decidirse.

Después siguen la decisión sobre selección del analizador, lector de espectro,
asistente, servicio, pantalla y biblioteca; el plan contiene sus condiciones.
Un hallazgo anotado entra cuando el campo o la tarea actual lo necesita.

## Equipo y comprobaciones

La 1b se construyó sin consola ni tablet. La medición de la campana neutra sí
las necesita, y el 2026-09-22 el usuario avisó que **la consola está apagada**:
se le pide que la encienda antes de esa medición, no antes. Para medir, cargar [hardware](desarrollo/hardware.md); contiene el banco y su
diagnóstico. Un dato de un cierre no sustituye leer el equipo en esa sesión.

Al comenzar, comprobar rama, cambios locales y diferencias con esta base. Para
editar, elegir pruebas según [CONTRIBUTING](../CONTRIBUTING.md). Una corrida
anterior vale sólo para el árbol que probó; un estado «verde» escrito aquí no
certifica los cambios siguientes. El próximo agente entrega el prompt en el chat
usando la [plantilla](templates/prompt-continuidad.md), sin copiar este archivo entero.
