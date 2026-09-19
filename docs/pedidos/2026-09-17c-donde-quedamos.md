# Dónde quedamos — tercer cierre del 2026-09-17

**Para quien retome, en cualquier sesión.** Reemplaza a
[`2026-09-17b-donde-quedamos.md`](2026-09-17b-donde-quedamos.md) en lo que cambió
—las listas de tareas de aquel documento **siguen siendo las buenas** y este
apunta a ellas en vez de copiarlas— y deja en pie lo que sigue valiendo: el
estado del banco, el hallazgo del servicio de audio de la Mac, y lo que el
usuario pidió sobre cómo trabajar.

## El estado del equipo del usuario

**Comprobado al cerrar contra el volcado tomado al abrir esta sesión**, con los
dos archivos ordenados y comparados línea por línea:

| | |
|---|---|
| Claves del volcado | **6665 al abrir y 6665 al cerrar** |
| Diferencias | **cero**, clave por clave |
| Filtros plantados en el supresor | **0** — las doce ranuras con ganancia cero |
| Supresor | **encendido** (`m.afs.enabled = 1`) |
| Escrituras a la consola en toda la sesión | **ninguna**: sólo se le pidió el estado, dos veces |
| Procesos sueltos | ninguno |

**El banco sigue como el 2026-09-16**: salida de la Scarlett → canal 10, master 1
→ entrada 1, aux 5 → entrada 2, perilla en 10 dB. Nadie lo tocó: esta sesión no
midió nada con audio.

**Los dos volcados quedaron en el directorio temporal de la sesión, no en el
repositorio**, y por qué está abajo, en la corrección a la tarea de archivar el
retrato.

## Lo que se hizo: dos tareas, dos commits empujados

La rama es `claude/soundcraft-ui24-assistant-kh8ezj` y está sincronizada. El árbol
está limpio. **No se abrió ningún PR**: nadie lo pidió.

Las dos son del motor de seguridad, las dos salieron de auditorías anteriores, y
**las dos tapan agujeros sobre el mismo freno**: el tope por paso, que desde
ADR-034 es el único que rige mientras se sube una cuña.

### 1. `c92bf0c` — el tope por paso medía desde donde le decían

**Elegido por el usuario entre cuatro opciones**, por delante del asistente que
sigue, con el argumento de que el asistente iba a apoyarse en ese freno.

Los topes de INV-004 no acotan el destino: acotan el **movimiento**. El destino
estaba atado al crudo desde el 2026-09-13; el punto de partida no estaba atado a
nada, y una auditoría lo midió: **31 dB declarando que venía de un decibel más
abajo**. Ahora lo ata `verificarAtaduraDelOrigen`, con código propio
`ORIGEN_NO_ATADO`.

**Lo que se aprendió, y es más importante que el arreglo:**

- **La garantía va enunciada sobre el cable, no sobre el veredicto.** Se escribió
  en cinco lugares que «la cadena queda entera» y es falso: el motor no lee la
  consola, compara dos números del mismo llamador, y mentirlos los dos de forma
  coherente sigue dando `permitido: true`. Quien ata el crudo al estado confirmado
  es el adaptador, **después**. Lo que se sostiene es que **ninguna escritura sale
  con el movimiento mal medido**.
- **La guarda se cayó abierta por el operando de al lado.** `atar` exigía que la
  magnitud fuera finita y **nunca miraba el crudo**: con `valorEsperado` en `NaN`,
  la cuña se movió **31 dB con la transacción `APLICADA`**, medido de punta a
  punta. El mismo `NaN` que el repositorio ya había tapado dos veces. Cerrado con
  `CRUDO_NO_NUMERICO`.
- **Se probó el eslabón nuevo y el viejo quedó suelto.** Borrando entera la guarda
  del destino, las 136 pruebas quedaban en verde.

### 2. `27a72e5` — el tope se cobraba por cambio, no por lo que se mueve

**Elegido por el usuario como lo más grave de los cuatro hallazgos.**

El motor juzga cada cambio contra un contexto que no se actualiza entre uno y
otro, así que N cambios encadenados sobre la misma ruta cobran cada uno el
presupuesto entero. **Medido: cuatro pasos honestos de 2 dB en una transacción
mueven la cuña 8 dB, con el tope en 2, sin mentir ningún número.** Ahora se
rechaza con `RUTA_REPETIDA`.

**Se rechaza en vez de acumular**, y la razón es de producto: dentro de una
transacción no hay dónde medir, así que acumular dejaría pasar una rampa entera
sin escuchar.

**Lo que se aprendió:**

- **El test estaba calibrado por encima de la regla.** Ejercía cuatro
  repeticiones —el caso del hallazgo— y **la frontera son dos**: los mutantes
  «tolerá dos» y «tolerá tres» sobrevivían con la suite verde. Es la trampa que la
  disciplina tiene escrita y que INV-005 ya pagó una vez.
- **«Lo único que llega al aire es el último» era falso.** El ejecutor escribe
  **todos** los cambios, separados por ~101 ms. El hallazgo no era un salto de
  8 dB sino **una rampa de 312 ms en la cuña de un músico sin una sola escucha**.
  Peor, y mejor argumento para rechazar.

## Las tres auditorías

Se lanzó una por tarea —adversarial y de fidelidad—, y **las tres encontraron
defectos reales con la suite entera en verde**. Es la tercera jornada seguida en
que pasa, y ya no es una anécdota: **es la forma en que este proyecto encuentra
sus errores.** Las pruebas verdes no son evidencia de nada.

**Lo que las tres tienen en común:** ninguna encontró un defecto de lógica. Las
tres encontraron **afirmaciones escritas antes de ser ciertas**, guardas que se
caen abiertas por el operando que nadie miró, y tests calibrados por encima de la
regla que dicen comprobar.

## Lo que queda abierto

**Las listas viven en [`2026-09-17b-donde-quedamos.md`](2026-09-17b-donde-quedamos.md)
y están actualizadas ahí**, con cada tarea medida y con su número. Este documento
no las repite —cada número repetido es un número que se pudre— y sólo dice qué
hay y dónde:

| Dónde | Qué |
|---|---|
| «Tres cosas que las auditorías encontraron: una arreglada, dos abiertas» | Las **dos** que siguen abiertas: el techo de nominal que en el cable son 0,42 dB, y el acumulado que dejó de ser insensible al orden |
| «Tareas nuevas que aparecieron y quedaron anotadas» | Medir la ley de la ganancia del previo; archivar el retrato; los márgenes por instrumento; reordenar etapas |
| «Y cuatro que dejó la auditoría adversarial» | Una arreglada —la ruta repetida— y **tres abiertas**: el `NaN` de `coincideConEsperado`, el diario que anota el movimiento declarado, y el ancla del techo |
| «Y tres más que dejó la auditoría de la ruta repetida» | La escucha entre transacciones que nadie comprueba, el alias con ceros sobre la ganancia, y las familias distintas sobre el mismo parlante |

**Ocho tareas abiertas, todas medidas.** La que el usuario tenía primera en la
lista al cerrar es **la escucha entre transacciones**, porque es la que le da
sentido al freno que se acaba de poner: hoy alcanza con que algo deje anotado que
se midió, sin fecha y sin cruzarlo contra nada, y anotándola **quince
transacciones mueven 28,5 dB en 19 ms**. No está expuesto porque nadie llena ese
campo; **el día que la pantalla de monitor lo llene, los 8 dB vuelven como 28,5**.

### El hilo que une a la mitad de ellas, y conviene verlo antes de atacarlas una por una

**El tope se cuenta por clave y el oído es por parlante.** El alias con ceros, el
enlace estéreo de `fmalcher`, y las familias distintas sobre el mismo canal son
**la misma tarea vista desde tres lados**, y arreglarlas por separado es
arreglarla tres veces. Vale la pena una decisión escrita antes de tocar código.

## Una corrección a la tarea de archivar el retrato

El cierre anterior la describió como «corta y no toca el equipo del usuario».
**Lo segundo es cierto, lo primero no.**

El volcado crudo **no puede ir al repositorio**, que es público: trae los valores
enteros de la consola y el identificador de la unidad. El inventario existente ya
resolvió esto y su propio README lo dice —los originales van a una carpeta
privada, fuera del árbol— y hay dos herramientas para producir lo publicable,
`tools/inventario/recolector.mjs` y `entregables.mjs`.

Así que la tarea no es copiar un archivo: es **correr esa cadena y decidir qué
queda dentro**. Se dejó abierta a propósito en vez de improvisar otra política al
final de una sesión larga.

## Lo que falta de la pieza 1, y lo que cambió para quien la tome

**Sigue igual en el qué**: el asistente que sepa subir, y después la pantalla por
músico, que es la que marca «así está bien».

**Cambió en el cuánto, por lo hecho hoy, y hay que leerlo antes de empezar.**
Salir del silencio necesitaba una excepción al tope por paso; ahora necesita
además **un caso con nombre propio dentro de la atadura**, porque desde el crudo 0
no hay ningún punto de partida en decibeles que la guarda acepte —ni finito ni
−∞—, así que el destino que ADR-034 eligió ya no se puede ni expresar. Está
escrito en [ADR-034](../adr/ADR-034-poner-el-nivel-de-monitor-y-retocarlo.md) y en
el punto 1 de «Lo que falta de la pieza 1» del documento anterior.

## Este documento ya no es el último

Lo reemplaza [`2026-09-18-donde-quedamos.md`](2026-09-18-donde-quedamos.md), y el
prompt para pegar después de un `/clear`, [`2026-09-18-prompt-para-retomar.md`](2026-09-18-prompt-para-retomar.md).
El prompt de esta jornada queda **superado**: cita como abierta la escucha entre
transacciones, que se cerró el 2026-09-18, y da por tres tareas separadas las que
ADR-035 unificó en una.

**Y una cifra de este documento quedó corregida:** «quince transacciones mueven
28,5 dB en 19 ms». Al medirlo de nuevo con el motor el 2026-09-18 son
**dieciséis transacciones y 32 dB** —de −32 a nominal—, y **el tiempo de reloj no
se cita más**: es lo que tarda en evaluarse la guarda, no en moverse la cuña.


## Lo que sigue valiendo de los cierres anteriores

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
  explícitamente, una tarea un commit empujado, auditoría antes de dar algo por
  bueno, y aviso cuando la sesión se alarga.
