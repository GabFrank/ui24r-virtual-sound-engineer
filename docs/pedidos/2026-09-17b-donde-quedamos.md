# Dónde quedamos — segundo cierre del 2026-09-17

**Para quien retome, en cualquier sesión.** Reemplaza a
[`2026-09-17-donde-quedamos.md`](2026-09-17-donde-quedamos.md) en lo que cambió, y
lo deja en pie en lo que sigue valiendo: el estado del banco, el hallazgo del
servicio de audio de la Mac, y lo que el usuario pidió sobre cómo trabajar.

## El estado del equipo del usuario

**Comprobado al cerrar, contra el volcado tomado al abrir esta sesión:**

| | |
|---|---|
| Claves del volcado | **6665 al abrir y 6665 al cerrar** |
| Diferencias | **cero**, clave por clave |
| Filtros plantados en el supresor | **0** — las doce ranuras con ganancia cero |
| Supresor | **encendido** (`m.afs.enabled = 1`), seis fijos declarados, doce en total |
| Grabador y reproductor | ninguna sesión abierta |
| Escrituras a la consola en toda la sesión | **ninguna**: sólo se le pidió el estado |
| Procesos sueltos | ninguno |

**El banco sigue como el 2026-09-16**: salida de la Scarlett → canal 10, master 1
→ entrada 1, aux 5 → entrada 2, perilla en 10 dB. Nadie lo tocó: esta sesión no
midió nada.

### Una corrección al documento anterior, chica y de la clase que importa

El cierre anterior afirmó **«6625 claves antes y 6625 ahora»**. Ese archivo de
comparación no quedó en el repositorio, así que la cifra no se podía auditar. Al
recuperar el retrato de aquella sesión y contarlo, **da 6665 por cualquiera de
los dos métodos que se probaron**, igual que hoy.

**Lo que la comparación sí dice, y es lo que importa, se sostiene**: la consola
está idéntica. Lo que no se sostiene es el número, y es exactamente el defecto que
`validate-cifras-medidas` existe para cazar —una cifra citada sin un archivo
detrás—, esta vez en un documento de cierre, que el validador no mira.

**Queda como tarea pendiente**, abajo.

## Lo que se hizo, en cinco commits empujados

La rama es `claude/soundcraft-ui24-assistant-kh8ezj` y está sincronizada. El árbol
está limpio. **No se abrió ningún PR**: nadie lo pidió.

### 1. `feat(safety)` — el motor separa poner el nivel de una cuña de retocarla

**Es la primera de las tres piezas que le faltaban a la pantalla de monitor**, y
la que la hoja de ruta ponía primero. Implementa el motor de
[ADR-034](../adr/ADR-034-poner-el-nivel-de-monitor-y-retocarlo.md).

El problema era al revés de lo que parecía: no faltaba código de asistente,
**sobraban topes**. Con 4 dB de presupuesto por sesión, levantar una cuña desde el
piso del tramo medido —más de veinte decibeles— era imposible, y el paso 3 del
soundcheck del usuario no se podía dar.

Lo que hace ahora:

- **Mientras la ruta no tiene nivel establecido**, el presupuesto acumulado se
  suspende y lo reemplaza un **techo absoluto en 0 dB, nominal**. Siguen rigiendo
  los 2 dB por paso y la exigencia de una medición entre un paso y el siguiente.
- **El techo rige también al retocar.** Es una **segunda decisión del usuario**
  del mismo día, elegida entre tres opciones, porque ADR-034 dejaba el retoque sin
  techo y una cuña establecida en −1 dB lo cruzaba sola.
- **Establecido el nivel**, vuelve el presupuesto de ADR-028 **medido desde el
  ancla**: establecerlo pone el acumulado de esa ruta en cero.
- **El ancla no la declara quien propone**: sale del diario, vía
  `EntradaDiario.nivelEstablecidoEn`, y la reconstruye `historialDeLaSesion`.
- **La suspensión sólo se concede a un tipo que declare techo.** Cambiar un freno
  por otro exige que el otro exista.

### 2. `fix(safety)` — un número que no es un número pasaba todos los topes

**Apareció al ir a construir el asistente y se tapó antes de seguir**, por
decisión del usuario entre tres opciones. Toda comparación con `NaN` da `false`,
así que un cambio que declarara `NaN` en su magnitud pasaba INV-004 entera —el
tope por transacción, el acumulado y el techo nuevo— **y además**
`verificarAtadura` devolvía `atada: true` **con cualquier crudo**, que es
justamente el escenario que esa función existe para cerrar.

No estaba expuesto: los dos servicios de producción calculan magnitudes finitas.
Se tapó **sólo `NaN`**; un delta infinito lo sigue rechazando el tope por
transacción, que es lo correcto hasta que alguien construya el salto desde el
silencio.

### 3. `docs(adr)` — fmalcher SÍ tiene una rampa

**Corrección de una afirmación propia, y es la cuarta vez con la misma forma.**
ADR-034 escribió que ninguno de los cuatro repositorios «tiene presupuesto, techo
ni rampa». `fmalcher/soundcraft-ui` **sí tiene una rampa, y sobre este mismo
parámetro**: `AuxChannel extends SendChannel extends Channel`, y `Channel` trae
`fadeTo` y `fadeToDB`.

No cambia la decisión —su rampa es una transición automática y suave, sin escuchar
en el medio, y **recorta** en vez de negarse— pero sí cambia qué se puede afirmar:
la mecánica ya está hecha por otro, y lo que este proyecto agrega es **cuándo
parar y con permiso de quién**.

Y apareció el precedente del pedazo que falta: cómo trata fmalcher el borde del
silencio, que va en dirección contraria a la nuestra. Está en
[`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md),
con `fmalcher` vuelto a mirar en `2fc297f`.

### 4 y 5. Lo que salió de las auditorías

`fix(safety)` cierra el agujero del ancla y tres más; `docs(docs)` corrige once
afirmaciones de la jornada que no eran ciertas. Están contados abajo, en la
sección de las auditorías, porque **es lo más importante que pasó hoy**.

## Las dos auditorías, que son lo más importante de esta sesión

**El usuario las pidió antes de cerrar**, preguntando si se había lanzado alguna.
No se había. Se lanzaron dos sobre el trabajo del día: una adversarial contra el
motor y una de fidelidad contra lo escrito. **Encontraron doce cosas, y todas se
arreglaron antes de cerrar** (commits `4f92cfa` y `f81aeae`).

### Lo que hay que aprender de esto, que no es el agujero

**Las dos auditorías encontraron la misma cosa por dos caminos: se escribieron
garantías antes de que existieran.**

- `ContextoSeguridad` argumentaba que el ancla «no la declara quien propone»
  citando de precedente a `correspondeExencionDeSistema` —que **sí** cruza lo
  declarado contra lo que la transacción toca—. El cruce no estaba. La
  autodeclaración no se había eliminado: se había mudado de quien propone la
  transacción a quien escribe el diario.
- `journal.ts` razonaba largo sobre por qué desestablecer un nivel sería
  peligroso, y no impedía ni eso ni volver a establecerlo, que hacía lo mismo.
- El `CHANGELOG` le prometía al usuario una función que no existe.
- Y se le atribuyó a `fmalcher` una función, `linkTo`, **que no existe en su
  árbol** —en el documento escrito justamente para que eso no pase—.

Ninguna de las cuatro la hubiera encontrado la suite: todas estaban verdes.

### El costo medido del agujero grave

Con `nivelEstablecidoEn` sin cruzar, el auditor movió **30 dB de ganancia de
previo** en pasos de 3, con el motor viendo el presupuesto siempre en cero. El
ancla es de monitores y le sacaba el presupuesto a cualquier parámetro.

### Lo que sí salió bien

**Las pruebas resistieron la mutación.** El auditor mutó nueve guardas, una por
una, y **las nueve quedaron cazadas**. No hay ninguna prueba que pasaría igual sin
su corrección. Lo único que encontró fue un hueco de cobertura —ningún test le
proponía al motor una magnitud no numérica— y se cerró.

## Tres cosas que las auditorías encontraron y NO se arreglaron

Están acá porque son reales, medidas, y quedan como tareas:

1. **El tope de 2 dB por paso es evadible mintiendo de dónde venía.** El motor
   calcula el movimiento como «a dónde va menos de dónde venía», y **de dónde
   venía no está atado a nada**: ni al crudo, ni a lo que la consola tiene. Un
   salto de 31 dB en la cuña de un músico, declarando que venía de un decibel más
   abajo, pasa. **Es anterior a esta sesión** y hoy importa más, porque con el
   presupuesto suspendido durante la rampa **los 2 dB por paso son el único freno
   sobre la brusquedad**, y es lo que el `CHANGELOG` le promete al usuario.
2. **El techo de nominal es, en el cable, 0,42 dB.** La holgura con que se ata la
   magnitud al crudo es el 1 % del recorrido —42,14 dB—, así que un crudo que vale
   0,41 dB declarado como 0,0 pasa. Es más que el escalón del medidor. Inaudible,
   pero el techo se presenta como exacto y no lo es.
3. **El acumulado dejó de ser insensible al orden.** Antes era una suma con signo
   y daba igual el orden; el rebase del ancla lo volvió dependiente. Hoy no se
   dispara porque el diario en memoria ordena por fecha, y es un riesgo para el
   diario persistente que INV-020 todavía no tiene.

## Lo que falta de la pieza 1, en orden

**La pantalla de monitor sigue sin terminar.** Lo que queda:

1. **El asistente que sepa subir.** Hoy `puedeBajarEnvioAMonitor` rechaza de plano
   cualquier pedido de subir, y el nombre lo dice. Hay que decidir si se extiende o
   si convive con uno nuevo. **Incluye el primer paso desde el silencio**, que es
   el único pedazo de ADR-034 que el motor todavía no hace: un salto desde −∞ tiene
   delta infinito y el tope de 2 dB lo rechaza, que es lo correcto mientras nadie
   sepa proponerlo. El destino tiene que ser el mínimo escribible de la ley medida,
   leído de la ley y **no escrito a mano**.
2. **La pantalla, por músico** —decisión del usuario—: se elige a alguien y se ve
   su cuña con todo lo que le llega, su propio instrumento primero. **Y es la que
   trae el acto de marcar «así está bien»**, que es lo que hoy no existe.

### El hueco que esto deja abierto mientras tanto, dicho con todas las letras

**Nadie marca todavía un nivel como establecido**, porque eso lo hace la pantalla.
Hasta que exista, **toda cuña vive permanentemente en la primera operación**: sin
presupuesto acumulado, acotada por el techo de nominal, los 2 dB por paso y la
escucha obligatoria entre uno y otro.

No está expuesto —ninguna pantalla llama al servicio de monitor— y **la pantalla es
justamente lo que sigue**: llega con el acto de marcar el nivel, o llega abriendo
el hueco.

## Tareas nuevas que aparecieron y quedaron anotadas

- **Las tres de las auditorías**, arriba.
- **Archivar un retrato de la consola en el repositorio.** Hoy la comparación se
  hizo contra un archivo temporal de otra sesión, que podría no estar la próxima
  vez. Es corto y no toca el equipo del usuario. Ver la corrección de arriba.
- **Los márgenes de ganancia por instrumento merecen una revisión contra
  fuentes** (viene del cierre anterior). `channel-profiles.ts` le da al cajón
  menos margen que a la voz, y eso va contra el sentido común de los transitorios.
- **El recorrido deja reordenar instrumentos pero no etapas** (viene del cierre
  anterior), y el usuario ecualiza antes de la puerta mientras el orden propuesto
  hace lo contrario.

## Cómo arrancar la próxima sesión

El prompt para pegar después de un `/clear` está en
[`2026-09-17b-prompt-para-retomar.md`](2026-09-17b-prompt-para-retomar.md).

## Lo que sigue valiendo del cierre anterior

- **El servicio de audio de la Mac se traba y el síntoma se lee como un permiso
  denegado.** Se cura con `sudo killall coreaudiod`, lanzable por SSH. Los tres
  pasos para distinguirlo están en
  [el hallazgo](../backlog/hallazgo-el-audio-de-la-mac-se-traba-y-parece-un-permiso.md).
- **El usuario opera la MacBook a distancia**, por SSH y AnyDesk. No se puede mover
  ningún cable del banco ni tocar la perilla de la Scarlett hasta que vuelva.
- **Antes de meter tonos sostenidos, mirar `m.afs.enabled`**, que hoy está en 1.
- **Nunca borrar los snapshots guardados.** Es la única prohibición absoluta.
- **Cómo el usuario pide que se trabaje**: preguntas siempre interactivas,
  explicaciones en lenguaje de producto, trabajo previo buscado y dicho
  explícitamente, una tarea un commit empujado, y aviso cuando la sesión se alarga.
