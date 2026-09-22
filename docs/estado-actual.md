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

## Próxima sesión: medir la campana neutra

**Elegido por el usuario el 2026-09-22**, entre esa medición, la tarea 2 y las
dos juntas.

Correr una campana que está en ganancia cero a lo largo del tramo medido
—115,2 Hz a 10 943,9 Hz— y comprobar que la respuesta no se mueve. Es la
condición que ADR-039 le puso a la exención del salto libre, y es lo que
permite que la aplicación **mude** una banda encima de una resonancia en vez de
sólo afinarla de a un tercio de octava por paso.

**Toca la consola**: leer [hardware](desarrollo/hardware.md) antes, y pedirle al
usuario que la encienda —el 2026-09-22 la tenía apagada—. El banco es el del
ítem 121, y ese ítem dejó avisado que **el instrumento puentea el compresor del
canal y se lleva la ganancia de salida que ese preajuste tenga cargada**: son
28 dB en el canal del bombo, y costó tres corridas fallidas.

Con la medición hecha, encender la exención es un cambio chico y acotado: la
forma de «poner la banda» ya se comprueba, y lo que falta es que la frecuencia y
el ancho de una transacción bien formada no pasen por el tope. Están marcados
los dos huecos que hay que resolver ahí, en «qué queda abierto» de ADR-039.

Después sigue **la tarea 2**, decidir si la aplicación puede elegir qué canal
analiza: escritura de clase nueva, le cambia una pantalla al operador, y se
decide antes de construir nada.

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
