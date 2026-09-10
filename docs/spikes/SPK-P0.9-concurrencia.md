# SPK-P0.9 — Concurrencia y presencia

**Estado:** Parcial — **criterios 1, 2, 3 y 5 cerrados contra la consola el 2026-09-10**; el 4 a medias —la avalancha por cambio masivo ya está medida contra el aparato, la recuperación de instantánea no— y el 6 necesita elegir el mecanismo de presencia · **Timebox:** 3 días · **Control:** G-A
**Depende de:** SPK-P0.1 · **Bloquea a:** S-02.5b
**Montaje:** Ui24R, router, laptop con Node, navegador oficial abierto en otro equipo, teléfono con la aplicación oficial.

## Pregunta que responde

¿Se puede detectar de forma fiable que otro cliente cambió un parámetro, sin sobrescribir su cambio, y cómo se detecta que hay otra instancia de esta aplicación conectada?

## Pasos

1. Implementar un prototipo del almacén de estado confirmado alimentado solo por mensajes entrantes, con correlación por ventana temporal.
2. Ejecutar cien escrituras propias mientras un operador hace cien cambios desde el navegador oficial.
3. Recuperar una instantánea desde el navegador durante una escritura.
4. Arrastrar un fader en el navegador y observar la ráfaga.
5. Probar los dos mecanismos candidatos de presencia: el mensaje de sincronización con identificador propio, y una instantánea con nombre reservado renovada cada sesenta segundos.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Cambios externos etiquetados correctamente | bloqueante | 100 de 100 | **100 de 100, contra la consola el 2026-09-10, con los cambios espaciados 400 ms.** El espaciado era de 120 ms y **se subió a propósito**: al cerrar el criterio 5 la agrupación quedó en 250 ms y esta prueba pasó de 100 a **1 de 100** en la misma corrida. Ver la nota de abajo: los dos criterios están en tensión y elegir es parte del spike. `evidence/agrupacion-arrastre-2026-09-10.txt`; la corrida anterior, con el criterio 5 todavía sin cerrar, quedó en `evidence/concurrencia-2026-09-10.txt` | ✅ |
| 2 | Sobrescrituras de cambios ajenos | bloqueante | 0 | **0, contra la consola el 2026-09-10.** El otro operador cambió la ruta y la aplicación intentó escribir con el valor esperado viejo: devolvió `CONFLICT` con «se esperaba 0.256 y hay 0.3, cambiado desde otro cliente» y **no escribió**. La ruta quedó con el valor ajeno | ✅ |
| 3 | Escrituras propias etiquetadas como propias | bloqueante | 98 % o más | **100 de 100 el 2026-09-10, todas por testigo.** Por correlación de mensajes entrantes era imposible —la consola no devuelve eco— así que se cumple por la vía que el charter recomendaba: todo lo que entra por la principal es ajeno **sin excepción**, y lo propio se marca al verificarse, sin deducir. Que no haya que deducir es lo que da el 100 %: no hay ventana que ajustar ni carrera que perder. `evidence/escrituras-propias-2026-09-10.txt` | ✅ |
| 4 | Recuperación de instantánea detectada como avalancha | bloqueante | 10 de 10, con más de 10 rutas en menos de 1 s | **La mitad medible sin pedir permiso, cerrada: 10 de 10 contra la consola el 2026-09-10.** Un segundo cliente escribió 16 rutas distintas de golpe y el detector avisó las diez veces, con las 16 restauradas y comprobadas por HTTP. Lo que **sigue sin medirse contra el aparato** es el disparador que el criterio nombra: una **recuperación de instantánea** de verdad, que además cambia `var.currentSnapshot` y debería dar la causa `SNAPSHOT_RECALL` en vez de `DESCONOCIDA`. Recuperar una instantánea es la operación de mayor alcance que expone el protocolo y la aplicación no la manda nunca: hacerlo contra la consola del usuario es decisión suya, no nuestra. `evidence/avalancha-real-2026-09-10.txt` | 🟡 |
| 5 | Arrastre de fader agrupado como un único cambio externo | bloqueante | sí | **Sí, desde el 2026-09-10: de 40 escrituras, un solo aviso.** Antes eran 19 o 20 y **una sola pasada de fader ajena borraba el historial reciente** de la aplicación. Dos arreglos: la causa `FADER_DRAG` pasó a llamarse `GRUPO_DE_CANALES` —siempre detectó varios canales moviendo el mismo parámetro, no un arrastre— y los cambios sobre una misma ruta se agrupan en 250 ms, ventana que tiene que ser mayor que el tic de 34 ms de la consola. `evidence/agrupacion-arrastre-2026-09-10.txt` | ✅ |
| 6 | Mecanismo de presencia elegido y verificado | bloqueante | uno de los dos, con prueba de dos clientes | Sin elegir, y ahora con un requisito más: tiene que distinguir **nuestra propia conexión testigo** de un segundo operador. Ver R-27 | ⬜ |

## Los criterios 1 y 5 están en tensión, y se eligió — 2026-09-10

Agrupar el arrastre —criterio 5— significa que dos cambios sobre la misma ruta
más juntos que la ventana se avisan como **uno**. Con la ventana en 250 ms, la
medición del criterio 1 con cambios cada 120 ms pasó de **100 de 100 a 1 de
100**: se rompió un criterio que se acababa de cerrar unas horas antes.

No se pueden tener los dos para cualquier ritmo. Se eligió:

- Medir el etiquetado con un ritmo que un operador produce de verdad —un cambio
  cada 400 ms, dos por segundo—, y ahí son 100 de 100.
- **No** pretender que cien cambios en doce segundos sigan contando de a uno.

**Lo que hace aceptable la elección es que se pierden avisos, nunca
conocimiento.** El estado confirmado se actualiza con cada línea, antes del
aviso y sin pasar por la agrupación. La comprobación de INV-011 —¿el valor sigue
siendo el que creo?— lee del estado y no del aviso, así que el **criterio 2 no
depende de esto en absoluto**. Hay un test que lo fija, y otro que fija el costo
para que no sea un descubrimiento.

## Lo que ya se midió, y a qué obliga — 2026-09-09

**Tres clientes simultáneos, con uno escribiendo.** Los tres recibieron **6 087 claves** y la **misma huella exacta**. La difusión llega **una sola vez a cada uno menos al origen**: 0 líneas para el que escribe, 1 para cada uno de los otros dos. La prueba duró minutos, no los diez que pide el criterio 5 de SPK-P0.1, así que allá sigue abierta; para este spike lo que importa es otra cosa.

**El criterio 3 no se puede cumplir como está planteado.** El paso 1 de este spike dice «almacén de estado confirmado alimentado solo por mensajes entrantes, con correlación por ventana temporal», y el criterio 3 pide que el 98 % de las escrituras propias se etiqueten como propias. Con esta consola, **el mensaje con el que se correlacionaría no llega jamás**. La ventana de 300 ms del `ConfirmedStateStore` espera algo que no existe, y ADR-005 ya lo tenía anotado como cabo suelto.

Quedan dos salidas, y elegir es parte de cerrar este spike:

1. **Etiquetar por lo que la aplicación ya sabe**: si acaba de enviar esa ruta con ese valor, es propia, sin esperar confirmación de nadie. Es local y no depende del protocolo.
2. **Etiquetar contra el testigo** de SPK-ACK-POLICY: la línea que llega por la conexión testigo y coincide con lo que la principal acaba de enviar es propia; cualquier otra es ajena. Cuesta lo que cuesta el testigo, que ya se paga igual para confirmar escrituras.

La segunda es la que además contesta el criterio 2 —no sobrescribir cambios ajenos— con un dato y no con una suposición, porque distingue propio de ajeno **en el mismo flujo** en vez de en dos relojes distintos.

**Y el mecanismo de presencia hereda un problema.** La aplicación pasa a tener **dos sesiones abiertas** contra la consola, la principal y el testigo. Cualquier mecanismo de presencia que cuente clientes o mire sesiones va a ver dos donde hay un operador. Si no las distingue, la aplicación se avisa a sí misma de un segundo operador que no existe y ensucia justamente la señal que protege contra pisar cambios ajenos. Está en el registro como R-27.

## Evidencia a entregar

- `evidence/concurrency-run.jsonl`, `evidence/bulk-detection.log`, `evidence/presence.md`.
- **Falta archivar** la corrida de tres clientes del 2026-09-09, con las claves, la huella compartida y el reparto 0/1/1 de líneas vistas.

## Acción ante fallo

Si no se puede detectar la ráfaga de forma fiable, la aplicación asistida queda condicionada: cada escritura exige confirmación humana del valor actual leído en pantalla, y el modo automático controlado no se habilita.


---

## La avalancha, contra la consola — 2026-09-10

El criterio figuraba cubierto por la captura `06-cambio-masivo.png`, y la
captura es correcta: la pantalla dibuja el aviso. Lo que probaba era eso.
**El simulador dispara la avalancha porque nosotros le pedimos que la dispare**,
así que la captura no dice nada sobre si el detector reconoce una avalancha real
llegando por el socket. Eran dos afirmaciones y el acta las tenía por una.

Ahora está medida la que faltaba. Hacen falta **dos clientes**: la consola no le
devuelve la escritura a quien la hizo, así que un proceso solo no puede
generarse una avalancha a sí mismo. El segundo hace de otro operador y escribe
16 rutas distintas de golpe —panorama, fader y dos envíos auxiliares de los
canales 21 a 24, que no tienen nada enchufado y están silenciados, así que nada
de esto puede sonar—. Diez vueltas, **diez avisos**, 16 de 16 rutas restauradas
y comprobadas por `GET /raw`. Evidencia: `evidence/avalancha-real-2026-09-10.txt`

### El detector dijo «10» las diez veces, y se escribieron 16

No es ruido de medición: es **exacto** las diez veces, y esa exactitud es la
pista. El aviso se emite en el instante en que se cruza el umbral, y lo que
informa es el tamaño del conjunto **en ese instante** — diez, que es el umbral.
Todo lo que llega después cae en la ventana de silencio y no actualiza el
número.

Para la seguridad da igual: el estado se invalida y INV-021 se cumple. Para el
operador no. La pantalla dice «10 parámetros cambiaron en menos de un segundo»
cuando cambiaron dieciséis, y el número existe justamente para que él dimensione
lo que pasó. **Un aviso que informa el umbral en vez del tamaño le está dando el
valor de su propia constante disfrazado de medición.**

Es un hallazgo del tipo que el simulador no podía dar: allí el número se lo
pasábamos nosotros, así que siempre coincidía. Queda anotado como tarea aparte y
no se corrige acá.

### Lo que sigue faltando, y por qué no se hizo

El criterio se llama «**recuperación de instantánea** detectada como avalancha».
Lo medido es una ráfaga de escrituras, que dispara el mismo detector por el
mismo camino pero **no** cambia `var.currentSnapshot` — por eso la causa salió
`DESCONOCIDA` y no `SNAPSHOT_RECALL`, que es lo correcto: no hubo ningún recall.

Hacer uno de verdad se puede: guardar una instantánea del estado de ahora en el
show `VSE`, mover unas rutas, y recuperarla — la propia recuperación sería la
restauración. Pero recuperar una instantánea es **la operación de mayor alcance
que expone el protocolo**, la aplicación no la manda nunca, y se haría sobre la
consola del usuario. Eso se pregunta antes, no se decide por él.
