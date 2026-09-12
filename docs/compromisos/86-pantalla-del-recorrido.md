# Compromisos: la pantalla del recorrido guiado

**Escrito antes de implementar**, según `docs/protocolo-de-verificacion.md`.

**Segunda versión.** La primera la auditó el auditor de procedencia y encontró
quince problemas — antes de que existiera una línea de código, que es para lo
que sirve el flujo nuevo. Lo que cambió está anotado al final.

El núcleo del orden ya está construido (`packages/domain/src/rules/recorrido.ts`,
commits `1a0f703` y `94e9c5b`); falta la pantalla.

## Qué falta hoy

`ordenPropuesto`, `aplicarOrdenGuardado`, `LEY_MEDIDA` y `ETAPAS_EN_ORDEN` **no
los llama nadie** — verificado con `grep` sobre el árbol: ningún uso fuera de su
archivo y su test. No hay ruta de recorrido en `app.routes.ts`, `BandProfile` no
tiene campo de orden, y **no existe ningún lugar donde el orden del usuario se
persista**, aunque un docblock de `1a0f703` decía que quedaba guardado.

## Los compromisos

| # | Compromiso observable | Qué lo haría fallar | Procedencia |
|---|---|---|---|
| C1 | El recorrido muestra **una fila por asignación de canal de la banda**, en el orden que devuelve `ordenPropuesto` | Que falte una asignación, o que el orden difiera del que fija `recorrido.test.ts` | **Derivación**: `ordenPropuesto` mapea todas las asignaciones y el test fija el orden |
| C2 | Se llega al recorrido **sólo con la sesión en `CHANNEL_SETUP`**, y en cualquier otro estado la pantalla dice por qué no | Llegar desde otro estado, o llegar y no poder hacer nada sin explicación | **Regla externa**: INV-006 (`safety-invariants.md:223`) confina la ganancia a ese estado |
| C3 | Arrastrar una fila a otra posición cambia su puesto en la lista, y **sólo el de ella** | Que no mueva nada, que mueva otra, o que un toque sin desplazamiento la mueva | **Pedido del usuario**, registrado en `docs/pedidos/2026-09-11-recorrido.md` |
| C4 | Al guardar, el orden queda en `BandProfile`, y al reabrir se muestra ése y no el propuesto | Que al reabrir vuelva el propuesto | **Decisión ya tomada** en `alcance-mvp.md:52-56` y `orden-del-soundcheck.md:5-6` |
| C5 | Una asignación agregada después de guardar el orden aparece **al final** y no desaparece | Que no esté en la lista, o que no quede última | **Derivación**: `aplicarOrdenGuardado` y su test lo cubren |
| C6 | Cada fila muestra **seis** etapas, y **las cinco cuya ley no está medida se ven distintas** de la que sí | Que las seis se vean igual, o que se insinúe que la app puede ajustar las cinco | Los números son **derivación** (`ETAPAS_EN_ORDEN`, `LEY_MEDIDA`); la prohibición es **regla externa** (ADR-006, `capability-matrix.md:24`); **cómo** se ven distintas es decisión propia |
| C7 | La etapa de ganancia navega a `sesion/ganancia`, que ya existe | Que duplique esa pantalla, o que lleve a una pantalla congelada por estado | **Decisión propia** (navegar en vez de duplicar), con la dependencia de C2 |
| C8 | **La pantalla no presenta el orden como prescrito por el oficio**: dice que es una propuesta y que seis de sus trece puestos son decisión del proyecto | Cualquier texto que atribuya el orden a una autoridad externa sin la salvedad | **Pedido del usuario** (que la propuesta no sea al azar), y el error ya cometido en `94e9c5b` |
| C9 | El recorrido **no llama a la consola**: navega y registra | Cualquier escritura originada en esta pantalla | **Obligación, no decisión**: `CONTRIBUTING.md` «Reglas que no se negocian» punto 4, verificada por `npm run validate:limites` |
| C11 | Se puede **sacar un canal del recorrido** y volver a traerlo; lo sacado se guarda junto con el orden | Que no se pueda sacar, o que al reabrir vuelva a estar adentro | **Decisión del usuario**, `docs/pedidos/2026-09-11-recorrido.md` |
| C12 | El orden se guarda **al soltar la fila**, y un arrastre que vuelve al mismo lugar **no escribe nada** | Salir sin guardar y perder el orden; o que un arrastre nulo deje la pantalla sucia | **Decisión del usuario**, mismo archivo |
| C13 | Se arrastra **desde un asidero**, y la fila entera sigue sirviendo para desplazar la lista | Que arrastrar la fila 3 desplace la página, o que no se llegue a la fila 20 de 24 | **Decisión del usuario**, mismo archivo |
| C14 | «Restaurar el orden propuesto» **olvida** el orden guardado, no lo congela | Que después de restaurar, corregir la clasificación de un canal no mueva el orden | **Decisión del usuario**, mismo archivo |
| C15 | **Guardar el orden no pisa nada ni se pierde**, en las dos direcciones: ni la asignación de canales borra el orden, ni el arrastre borra un cambio hecho en perfiles | Guardar un orden, ir a canales sin reiniciar, volver, y que el orden no esté; o editar la banda en perfiles durante una sesión, arrastrar, y perder el nombre | **Derivación de un defecto verificado**: `band.service.ts` hace spread sobre su propia señal cacheada |
| C10 | El paso nuevo entra en el camino de usuario verificado (`tools/visual/flujo.mjs`, hoy 27 pasos) y en el registro estructurado de `docs/logging.md` | Que el flujo visual no lo recorra, o que no quede registro de qué se recorrió | **Obligación**: `CONTRIBUTING.md`, definición de terminado |

## De dónde sale el orden, y qué es decisión

`docs/orden-del-soundcheck.md` ya hizo la separación: la tabla de familias sale
de **una sola fuente**, esa fuente **no da ningún motivo**, otra de las citadas
**la contradice** en toms y aéreos, y **seis de los trece puestos** —cajón,
djembe, conga, maraca, shaker y línea— son decisión del proyecto.

**Advertencia de procedencia.** Todo eso está verificado contra el documento, no
contra las fuentes vivas: es **concordancia interna**. Ese mismo documento ya
falló una vez por exactamente este motivo, y una de las tres páginas sólo se
pudo comprobar contra una captura de 2019. C8 existe por eso.

## Dependencia que el alcance declara y este contrato asume

`alcance-mvp.md:36-38` dice que el escenario va **antes** del recorrido a
propósito, porque lo que la aplicación sabe del espacio cambia lo que puede
**explicar**. Esta pantalla no usa el escenario todavía, y eso es un límite
declarado, no un olvido.

*(La tabla de `alcance-mvp.md:22` marca el paso 5 como «falta entero» y está
desactualizada: el editor del escenario existe desde `9916425`.)*

## Decisiones pendientes del usuario

**Resuelta por el usuario**: entra todo lo asignado y se puede sacar a mano
(C11). Lo que sigue queda como registro de por qué la pregunta estaba mal
planteada.

**`isLive` y qué canales entran al recorrido.** El campo existe y el recorrido lo
ignora. **La justificación con la que planteé esta duda en la primera versión era
falsa**: dije que las asignaciones viejas se recorren igual, y no es cierto —
`ordenPropuesto` recorre `BandProfile.asignaciones`, que sólo tiene los canales
asignados. Y `isLive` no significa «canal viejo»: `musical.ts:115-123` lo define
como marca de seguridad para el modo soundcheck (INV-029), y `false` es el valor
normal de un canal al que nadie tildó la casilla.

Reformulada sobre la semántica real: **INV-029 no aplica al recorrido**, así que
hoy no hay motivo para excluir nada. La pregunta que queda es de producto: ¿tiene
sentido que el recorrido muestre de algún modo qué canales están marcados en
vivo? Se decide con el usuario; mientras tanto no se excluye a nadie.

**Un kit de batería son varios canales y un solo paso de soundcheck.** El
recorrido es fila por canal. **Esto no está declarado en ningún documento** — la
primera versión de este contrato decía que sí, citando el documento del orden,
que habla de otro límite (que redoblante, toms y aéreos no están en el catálogo).
Queda como límite conocido de este contrato.

## Lo que este contrato NO promete

- Que el orden propuesto sirva para cualquier formación. Para un coro, una obra
  de teatro o un grupo de percusión, la mayoría de los canales cae en «no
  clasificado» y **el orden propuesto es el de canal**. C1 se evalúa sobre una
  formación cuyo catálogo clasifica —ahí el orden propuesto difiere del de
  canal—; sobre una que no, coincidir con el canal es el comportamiento correcto.
- Que la app ajuste nada más que la ganancia.
- Que el orden dentro de una familia sea otra cosa que el número de canal.
- Que el orden pueda ser distinto por local. Se guarda por banda, y puede quedar
  corto: una banda podría ordenarse distinto en otra sala.

## Qué cambió respecto de la primera versión

Todo esto lo encontró el auditor de procedencia antes de implementar:

1. **C1 mezclaba derivación con decisión.** «Desde una sesión activa se llega al
   recorrido» no deriva del núcleo, y **«sesión activa» no es ninguno de los
   trece estados** del dominio. Ahora son C1 y C2, y C2 nombra el estado real.
2. **C3 decía «pedido del usuario» y era inferencia** —la palabra «implica» lo
   delataba—. Y lo que afirmaba ya estaba decidido en otros dos documentos que no
   citaba. Ahora es C4, clasificado como decisión ya tomada, con su cita.
3. **Se contradecía consigo mismo**: C3 daba por hecho lo que la duda 1 llamaba
   «una decisión, no un hecho».
4. **C5 llamaba decisión a dos datos**: que las etapas sean seis y que falten
   cinco sale del núcleo, no de una elección. Y la regla de no construir sobre
   ley no medida **es una regla escrita** (ADR-006), no una decisión de esta
   pantalla.
5. **C7 se atribuía como mérito una obligación.** Que una pantalla no llame a la
   consola está prohibido por `CONTRIBUTING.md` y verificado automáticamente.
6. **Faltaba el compromiso más importante del pedido**: que la propuesta no sea
   al azar existía sólo en prosa, sin modo de falla y por lo tanto sin forma de
   comprobarlo. Es ahora C8, y es la parte con más historia de error.
7. **Faltaban tres obligaciones del repositorio**: el camino de usuario
   verificado, el registro estructurado, y la guarda de estado de la ganancia.
8. **Una duda se apoyaba en una premisa falsa** (`isLive`) y **otra citaba un
   documento que no dice lo que se le atribuía** (el kit de batería).
9. **La migración que decía hacer falta no hace falta**: `band_profile` guarda el
   documento entero en una columna JSON.

### Y lo que cambió después del contraste

**C15 estaba mal enunciado.** Decía «hay un solo camino de escritura» y **hay
tres**: este servicio dos veces, y el repositorio directamente desde dos
pantallas de perfiles. El defecto que el compromiso nombraba estaba cerrado; el
mismo defecto **en la dirección inversa** estaba abierto, y el compromiso escrito
así lo habría dado por cubierto. Reescrito como lo que de verdad se promete:
que guardar el orden no pise nada ni se pierda, en las dos direcciones.
