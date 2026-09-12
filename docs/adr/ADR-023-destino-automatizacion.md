# ADR-023 — El destino es la automatización, y se llega por niveles

**Estado:** Aceptada
**Fecha:** 2026-09-08
**Origen:** decisión de producto, sobre R-21. Cierra la pregunta que dejó abierta ADR-022.

## Contexto

El [documento de hallazgos](../hallazgos-firmware-y-contexto-musical.md) describe un producto que automatiza la mezcla: perfiles por canción, jerarquía vocal, efectos por rol, transiciones. La matriz de autonomía vigente describe otro: un asistente que mide, propone y casi no escribe, donde los efectos, los subgrupos y los VCA son «solo del usuario, fuera de alcance».

Los dos no pueden ser ciertos a la vez, y quedó anotado como R-21: **una decisión de alcance, no un detalle de implementación.**

Hasta acá el riesgo era construir hacia la automatización sin decirlo, terminar escribiendo parámetros que la matriz declara ajenos, y descubrirlo cuando ya hubiera algo encima.

## Decisión

**El destino del proyecto es la automatización.** No es un asistente de medición con automatización como extra: es un automatizador que todavía no se ganó el derecho a escribir.

**Y se llega por niveles.** Ningún escalón se sube porque el anterior funcione: se sube cuando se cumplen sus condiciones, que están escritas antes de intentarlo. La progresión `OBSERVE → SUGGEST → ASSISTED → AUTO` de ADR-010 no cambia; lo que agrega esta decisión es que su final ya no es «asistir», y que cada escalón tiene precondiciones nombradas en [la matriz de autonomía](../autonomy-matrix.md).

**Hoy no cambia nada.** La aplicación sigue en OBSERVE, sigue sin escribir, y los efectos, subgrupos y VCA siguen siendo del usuario. Esta ADR no autoriza ninguna escritura nueva: nombra el destino y el camino.

## Consecuencias

Se gana poder decidir con criterio lo que hasta ahora se decidía por defecto. Un puerto de contexto musical (ADR-022), un modelo de perfil por canción o un motor que reacciona a eventos dejan de ser «cosas que quizá hagan falta» y pasan a ser camino hacia un destino conocido. Se puede construir en esa dirección sin construir todavía.

Se pierde la coartada de «esto no es lo nuestro». Cuando llegue el momento de escribir cuatro faders a la vez habrá que rehacer INV-005 con el mismo cuidado con que se escribió, y no bastará con levantar el límite: hará falta una clase de transacción que garantice que se aplican los cuatro o ninguno, que se verifican por lectura y que se revierten juntos.

**Lo que no se mueve durante el show:** INV-010. **Reescrita por ADR-028 el 2026-09-12.** Ya no es «nunca»: el usuario autorizó el ajuste del nivel de monitores y se abrieron las 240 rutas `i.N.aux.M.value`, con techo y sin show. Lo que sigue cerrado es todo lo demás del envío --`mute`, `pan`, `post`, `postproc`-- y el fader del bus. Esta línea decía «no se mueve nunca» y «ningún envío de monitor recibe escrituras»; lo que se sostiene es la razón, no el nunca: un **automatizador** que altera lo que oye un músico en el escenario es un producto peligroso, y de ahí que el motor rechace el envío a monitor con la sesión en `SHOW`. Ajustar un monitor en soundcheck, con el operador mirando y con techo, es otra cosa. Si eso obliga a renunciar a apoyarse en el CUE nativo —lo dirá SPK-FW3— se renuncia al CUE, no a la invariante.

Queda un compromiso que viene del propio documento y se mantiene: **la aplicación nunca es necesaria para que pase audio.** Un automatizador que se cuelga en medio de un show y deja la consola en un estado a medias es peor que no automatizar.

## Alternativas descartadas

**Quedarse en asistente de medición.** Era la lectura conservadora de la matriz vigente. Se descarta porque no es lo que el proyecto quiere ser, y sostenerlo obligaría a decir que no a cada paso sin poder explicar hacia dónde se va.

**Ir a la automatización ya.** Se descarta por lo que todavía no se sabe: si la consola sostiene el ritmo de escritura que pide una transición (R-23), si un CUE toca los monitores (R-22), y si la mitad de los parámetros que haría falta escribir existen siquiera con la clave que suponemos. Automatizar sobre protocolo sin verificar es la primera regla que este repositorio se puso, y no cambia por conocer el destino.

**Levantar los límites de INV-005 sin más.** Sería confundir el síntoma con la causa. El límite de cuatro parámetros no es una traba arbitraria: es lo que hace que una transacción fallida se pueda entender y revertir. Lo que hace falta no es un número más grande sino una clase de transacción que dé las mismas garantías sobre un conjunto.
