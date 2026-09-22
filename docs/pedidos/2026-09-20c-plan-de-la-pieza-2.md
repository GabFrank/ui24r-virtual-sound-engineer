# El plan de la pieza 2, el ecualizador de canal

**Escrito el 2026-09-20**, inmediatamente después de que el usuario eligiera el
criterio entre cuatro opciones: [ADR-038](../adr/ADR-038-el-criterio-del-ecualizador-de-canal.md).
Su respuesta, textual: *«Opción D, por supuesto, arma un plan e iniciamos»*.

**Este documento ordena, no repite.** El qué y el porqué están en la ADR; acá
está en qué orden se construye y por qué en ese orden.

## El orden, y el criterio con el que está ordenado

**Primero lo que sostiene lo que sigue.** No se empieza por la pantalla ni por el
asistente: se empieza por lo que, si falta, deja todo lo demás sin poder
ejecutarse. Es el mismo criterio con el que se ordenó la pieza 1, y el que el
usuario eligió explícitamente cuando se le ofrecieron tres arranques.

> **Actualizado el 2026-09-21.** La tarea 1 está **hecha** y destapó que el
> verdadero cuello de botella era otro. Las bandas 2, 3 y 4 quedaron medidas
> —comparten la ley de la banda 1— y **eso no alcanzó para poder moverlas**: el
> motor las rechaza por una razón de modelo, no de medición. Entra una tarea
> nueva delante de todas, la **1b**.

| | Tarea | Por qué va acá | ¿Toca la consola? |
|---|---|---|---|
| ~~**1**~~ | ~~**Medir la frecuencia y el Q de las bandas 2, 3 y 4**~~ | **HECHA el 2026-09-21**, ítem 121. Las tres comparten la exponencial de la banda 1, con error de `f0` entre 0,17 % y 0,25 % contra un criterio del 5 % | ya está |
| ~~**1b**~~ | ~~**Decidir**~~ ~~**Implementar**~~ **HECHA el 2026-09-22** «un `kind`, una unidad»: que el motor pueda acotar un salto de frecuencia. **La decisión está tomada el 2026-09-21: [ADR-039](../adr/ADR-039-el-freno-viaja-con-la-hoja-y-se-cuenta-en-octavas.md)** | **Lo destapó la tarea 1 y es lo primero.** Medir las seis rutas **bajó** de 834 a 690 la cuenta de lo que el motor deja escribir: sus leyes están en Hz y en Q, el tope de `CHANNEL_EQ` está en dB, y INV-004 las rechaza —con razón: un tope de 4 dB no acota un salto de frecuencia—. **Mientras esto no se resuelva, la aplicación no puede mover una banda**, y toda la pieza 2 queda en el aire. El hallazgo está escrito desde el 2026-09-13 en [`hallazgo-un-kind-una-unidad-y-las-hojas-no-coinciden.md`](../backlog/hallazgo-un-kind-una-unidad-y-las-hojas-no-coinciden.md) | no |
| **2** | **Decidir si la aplicación puede elegir qué canal analiza** | Sin eso no hay forma de medir un canal, y la elección **es global: le cambia una pantalla al operador**. Es una escritura de clase nueva y necesita decisión del usuario | Decisión primero |
| **3** | **Leer el espectro de un canal** | Las 122 bandas, convertidas con la escala ya medida, promediadas en una ventana. Sólo lee | No escribe |
| **4** | **El asistente: qué banda mover y por qué** | El corazón. Necesita su propia decisión sobre **qué cuenta como «sobresale»** y **qué cuenta como «mejoró»** | No: es función pura |
| **5** | **El servicio que aplica** | Por el camino de siempre, con escucha comprobada entre cambio y cambio y vuelta atrás si empeoró | **Sí**, por el motor de seguridad |
| **6** | **La pantalla** | Recién cuando hay algo que mostrar y algo que disparar | — |
| **7** | **La fuente 1: la biblioteca como punto de partida** | Leer sus preajustes y ofrecerlos. El protocolo ya está medido | Sólo lee |
| **8** | **La fuente 3: «así está bien» guarda la curva** | Cierra el ciclo. **Escribe un preajuste en la consola del usuario**: clase nueva, decisión aparte | **Sí**, y necesita decisión |

## Lo que cada tarea deja listo

**1. La ley de las bandas 2, 3 y 4 — hecha.** Las tres comparten la exponencial
`20·1102,5^V` y el `0,05·300^V` de la banda 1, medidas una corrida por banda
contra el filtro real. Detalle en el [ítem 121](../compromisos/121-la-frecuencia-y-el-q-de-las-bandas-2-3-y-4.md).
Costó tres corridas fallidas: el instrumento puenteaba el compresor del canal y
se llevaba los 28 dB de ganancia del preajuste que el usuario tiene cargado ahí.

**1b. Un `kind`, una unidad. La decisión está tomada; queda construirla.**
`LIMITES` da **una** unidad por categoría, y `CHANNEL_EQ` cubre hojas en hercios,
en decibeles y en Q a la vez. El motor compara el movimiento propuesto contra un
tope en decibeles, y contra una ley en hercios eso es comparar especies
distintas: rechaza, y hace bien.

**[ADR-039](../adr/ADR-039-el-freno-viaja-con-la-hoja-y-se-cuenta-en-octavas.md),
decidida por el usuario el 2026-09-21**, entre tres opciones en tres preguntas:
la aplicación mueve las tres hojas de una banda; **el freno viaja con la hoja**,
con la unidad de la magnitud intacta y una **escala del movimiento** nueva
—octavas en la frecuencia, octavas de ancho de banda en el Q—; y **poner una
banda se hace con la campana en cero**, sin tope al salto, porque una campana
neutra no se oye. Con ganancia puesta, el retoque vuelve a llevar tope.

**Los cuatro pasos están construidos el 2026-09-22:**

1. La escala del movimiento por hoja, con la familia como valor por omisión, en
   `packages/domain/src/rules/hojas.ts`. Leer el tope por hoja cambió la
   interfaz pública de `@vse/domain`: `ContextoCambio` lleva ahora la ruta y las
   dos magnitudes, y la resta la hace el dominio con la escala de la hoja en vez
   de recibir un delta ya hecho.
2. La operación «poner la banda», en `poner-la-banda.ts`, comprobada sobre el
   contenido y el orden por el motor. **La etiqueta es necesaria y no
   suficiente**, igual que la exención de sistema.
3. El acumulado por sesión sumando en la escala del movimiento, con la misma
   función del dominio que usa el motor: ir y volver da cero exacto.
4. El conteo volvió a **930 exacto**, con su reparto por familia —el ecualizador
   de canal de 288 a 504 y el pasa-altos de 24 a 48— y con un control que
   propone sobre cada una de las 240 el movimiento más grande que su tramo
   medido admite y las rechaza a las 240 **por el tope**. Un censo de 930 con
   ese control también en 930 querría decir que el freno no está conectado.

**Lo que NO se construyó, y es lo que sigue de esta pieza: la exención del salto
libre.** Hoy la forma se exige y los tres cambios pasan por sus topes de
siempre, así que poner una banda lejos todavía se rechaza. Falta la medición
barata: correr una campana neutra a lo largo del tramo medido y comprobar que la
respuesta no se mueve. Lo que hay es una cota sobre una configuración quieta, no
una campana moviéndose, y lo encontró la auditoría de la propia ADR. **Esa
medición toca la consola**, así que se pregunta antes.

**2. Quién elige qué canal analiza.** El analizador de la consola es **uno solo**,
y elegir su fuente es una escritura. No entra en ninguna de las categorías
abiertas hoy. Hay que resolver además qué pasa cuando el usuario estaba mirando
otra cosa: se anota dónde estaba y se devuelve, igual que con cualquier otra
ruta.

**3. El lector del espectro.** La escala está medida —0,375 dB por byte, 122
bandas de un doceavo de octava, con su fórmula de frecuencia— y la balística
también. Falta promediar una ventana y decidir cuánto dura, que es lo mismo que
ya se resolvió para la escucha de una cuña.

**4. El asistente.** Dos preguntas que **se contestan midiendo, no programando**:
qué diferencia sobre las bandas vecinas cuenta como una resonancia, y qué
diferencia entre dos mediciones cuenta como una mejora. La segunda tiene una vara
disponible: la repetibilidad del medidor está medida en 0,3 dB, y nada por debajo
de eso es una mejora.

**5. El servicio.** Se apoya entero en lo construido: motor de seguridad, diario,
escucha comprobada con sus siete condiciones, atadura del origen y tope por paso.
Lo único nuevo es **qué cuenta como destino audible cuando lo que se mueve son dos
bandas del mismo canal**, que es lo que [ADR-035](../adr/ADR-035-el-tope-es-por-parlante-no-por-clave.md)
dejó decidido y sin implementar.

**6. La pantalla.** Misma forma que la de monitores: elegir el instrumento, ver lo
que la aplicación propone, y aprobar.

**7 y 8. Las fuentes 1 y 3.** El protocolo para leer la biblioteca está medido y
listo. Para escribir en ella **no**, y eso necesita que el usuario decida si la
aplicación puede guardar preajustes con su nombre en su consola.

## Lo que este plan NO incluye, dicho para que nadie lo dé por incluido

- **El compresor y la puerta.** La pieza 2 es el ecualizador. El usuario **no
  retoca la puerta** —medido en su aparato— y el compresor tiene su propia
  decisión ([ADR-032](../adr/ADR-032-puerta-y-compresor-por-lazo-cerrado.md)).
  Que un preajuste de canal los traiga adentro no los mete en esta pieza.
- **La reducción de enmascaramiento**, que es el criterio con mejor respaldo
  académico y **no es alcanzable hoy**: pide oír dos canales a la vez.
- **El ecualizador de salida**, congelado hasta después del MVP.
- **Los hallazgos del backlog.** Siguen esperando al campo, por la regla de la
  hoja de ruta: un hallazgo medido y anotado no es una tarea.

## Y la regla que sigue mandando

**Una tarea, un commit, empujado, y recién ahí la siguiente.** Si aparece un
hallazgo en el medio, va como tarea nueva y no se mete en la que está en curso.
