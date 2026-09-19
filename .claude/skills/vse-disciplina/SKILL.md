---
name: vse-disciplina
description: Cómo se trabaja en el Ui24R Virtual Sound Engineer — reglas de commit, de documentación, de medición y de trato con la consola del usuario. Usar SIEMPRE al implementar, medir o documentar en este proyecto, no solo cuando se pregunte por el proceso.
---

# Cómo se trabaja en este proyecto

Cada regla de acá salió de un error real. La cicatriz va junto a la regla a propósito: una regla sin el caso que la produjo se lee, se acepta y se olvida.

---

## 1. Commits y empujes

**Granulares y frecuentes.** Un commit por pieza terminada, empujada al terminar. No se acumula trabajo de horas en un commit gigante ni se espera al final para empujar.

**El PR no se abre salvo pedido explícito.** Empujar la rama no es abrir el PR. Si la sesión se cierra y nadie lo pidió, la rama queda lista y el PR lo abre el usuario.

**El asunto no pasa de 72 caracteres** y el ámbito sale del enum de `commitlint.config.js`. Se comprueba con `npm run verificar:commits` **antes** de empujar, no después: corregirlo después obliga a reescribir historia.

**El cuerpo dice por qué, no qué.** El diff ya dice qué cambió. Lo que no dice es qué error se estaba cometiendo antes, cómo se descubrió, y qué se descartó en el camino.

---

## 2. Ningún commit sale sin su documentación

**Es parte del cambio, no un paso posterior.** Si un commit cambia algo que la documentación afirma, la corrección va en el mismo commit.

Dónde mirar, según qué se tocó:

| Si cambiaste | Actualizá |
|---|---|
| Una constante medida | `protocol-spec.md` §4.6 (tabla de constantes) |
| Una capacidad del protocolo | `capability-matrix.md` |
| Qué puede escribir la aplicación | `autonomy-matrix.md` |
| Una regla de seguridad | `safety-invariants.md` |
| Cualquier cosa que el usuario vea | `CHANGELOG.md` |
| Una decisión con alternativas descartadas | una ADR **y el índice `docs/adr/README.md`** |

**Toda medición se archiva y se cita.** Un archivo en `evidence/` que nadie referencia es una medición que nadie va a encontrar. `npm run validate:docs` lo comprueba.

> **Lo que pasó.** Tres ADR quedaron fuera del índice y diecisiete archivos de evidencia sin citar — el techo del medidor, la cola de `VU2` byte por byte, el recorrido en la tablet. Todo medido, todo archivado, nada alcanzable. El validador de huérfanos existe por eso.

---

## 3. Medir sin engañarse

**Medí el instrumento, no la cadena.** Para medir algo interno de la consola, movelo con ganancia digital —el fader— y no con una fuente externa. Una fuente externa mide el iMac, la Scarlett, el previo y el medidor, todo junto.

> **Lo que pasó, dos veces.** El recorrido del medidor se documentó como 84,5 dB midiendo con tonos por la interfaz; el valor real es 80. Meses después, el techo se documentó como byte 239 con el mismo método; el valor real es 255, y el 239 era donde saturaba la Scarlett. La segunda vez la lección ya estaba escrita en el mismo documento.

**Comprobá que la fuente suena antes de concluir sobre el instrumento.** Una medición hecha sobre silencio parece un hallazgo y no lo es.

**Mirá el estado de alrededor antes de concluir.** Las tres conclusiones falsas de una sola sesión tuvieron la misma forma: un bus silenciado, una fuente apagada, una clave que se creía inexistente. En los tres casos el dato que faltaba estaba a un `grep` de distancia.

**Dos caminos que comparten un supuesto no son dos caminos.** Si el mapa por bytes y el censo del vocabulario pueden equivocarse por el mismo motivo, coincidir no confirma nada.

**Buscá trabajo previo antes de decodificar a mano.** Media hora de búsqueda ahorra horas. Pero el trabajo previo da hipótesis, no verdades: `DigiMixer` recorta el medidor en 240 y está mal.

---

## 4. Escribir lo que se sabe y lo que no

**`MEDIDO` es contra el aparato. `INFERIDO` es leído del código de la consola.** No se mezclan. La salida de un desensamblado o de un cliente ajeno es `INFERIDO` aunque suene autoritativa.

**Un comentario que explica un valor equivocado es peor que el valor solo.** El valor mal se corrige; el valor mal con una justificación convincente se defiende.

> **Lo que pasó.** `PEAK_HOLD_TIME` estuvo escrito como 3 en vez de 3000 con el comentario «es tan corto que el pico cae de inmediato». Esa frase le daba al lector una razón para no dudar.

**Escribí la limitación con todas las letras.** Es lo que la vuelve visible. Al documentar «con 1 dB esperado y 1,5 de tolerancia, quedarse quieto también confirma» quedó claro que no era un límite tolerable sino un agujero.

**Si retirás una conclusión, decilo donde estaba.** No se borra: se marca retractada y se explica qué la hizo caer. El error es la parte instructiva.

---

## 5. La consola es el equipo de trabajo de alguien

**Antes de escribir una ruta, leé y anotá su valor anterior.** Restaurá todo, siempre, con `try/finally`. Al terminar, listá qué se tocó y a qué valor quedó.

**Antes de meter tonos sostenidos, mirá `*.afs.enabled`.** El supresor de realimentación aprende de ellos y planta filtros. Nada en el protocolo avisa.

**Nunca borres los snapshots guardados.** Es la única prohibición absoluta.

**No uses tuberías que puedan cortar el proceso.** Un `| head` manda `SIGPIPE`, el `finally` no corre y la consola queda con la ganancia a mitad de un barrido. Escribí a archivo.

**Diagnóstico rápido:** `curl -s --max-time 10 http://<consola>/raw` da el estado entero. Es un flujo que no cierra, así que sale con código 28 y hay que tolerarlo.

---

## 6. Los validadores comprueban contra la fuente

**Una comprobación que compara el repositorio consigo mismo no detecta un error de lectura.** Con código y documento diciendo 3, el validador pasaba en verde y el error de factor mil sobrevivía.

Las constantes que salen del cliente de la consola se comparan contra una transcripción literal de ese cliente, archivada con su `sha256`.

**Un test que pasa con y sin la corrección no protege de nada.** Después de arreglar algo, revertí la corrección y comprobá que el test falla.

---

## 7. Cuándo preguntar y cuándo decidir

**Preguntá de forma interactiva. Siempre**, que es la palabra que usó el usuario: «preguntas siempre interactivas». No es una condición con lista de ejemplos —una versión anterior de esta línea la convirtió en eso y perdió el «siempre»—: es la forma por defecto de preguntar cualquier cosa. Los casos donde además **hay** que preguntar son los de siempre: niveles de autonomía, umbrales que mueven el equilibrio entre avisar de más y de menos, cualquier cosa que toque su equipo de una forma nueva.

**Decidí vos** lo que es cuestión de oficio: cómo estructurar un módulo, qué probar, cómo nombrar. Preguntar todo es trasladar el trabajo.

**Cuando las fuentes se contradicen y no se puede medir, decidí por procedencia y escribí el razonamiento.** El byte 5 de la cabecera de `VU2` se resolvió así: el cliente del fabricante y dos implementaciones de terceros dicen cosas distintas, en una Ui24R los dos valores son iguales, y se siguió a quien probablemente tenga la documentación oficial.


**Y antes de proponer, mirá qué hicieron los demás. Siempre, no sólo para el protocolo.** La línea de §3 decía «buscá trabajo previo antes de decodificar a mano», y por estar en la sección de medir se leyó como que valía sólo para el protocolo. No vale sólo para eso.

> **Lo que pasó.** El 2026-09-15 se le pidió al usuario que decidiera hasta dónde puede volver a subir la aplicación el fader del general después de bajarlo para cazar un acople, ofreciéndole cuatro opciones **sin haber mirado qué hace nadie más**. Su respuesta: «*¿no habíamos quedado en que nada iba a ser implementado antes que se investigue en proyectos existentes?*». Y tenía razón dos veces, porque al mirar apareció que **el supresor de la propia consola ya contesta esa pregunta** —los filtros LIVE del dbx AFS se levantan solos cuando dejan de hacer falta— y que el argumento que el ADR daba para dudar tenía la acústica al revés.

**Toda propuesta lleva su sección de trabajo previo**, y lleva una de estas dos formas:

- **Qué proyecto o documentación hace algo parecido, y cómo lo resolvió**, con el enlace. Entra como hipótesis, no como verdad: `DigiMixer` recorta el medidor en 240 y está mal.
- **«No hay coincidencias en otros proyectos»**, dicho así de explícito. Que no haya nada es un dato: significa que lo que se propone no tiene precedente y hay que tener más cuidado, no menos.

Lo que no vale es no decir nada, porque el que lee no puede distinguir «no hay» de «no miré». `tools/docs/validate-trabajo-previo.mjs` lo comprueba en las ADR.

**Y hay cuatro repositorios donde mirar primero, que el usuario pidió por nombre
el 2026-09-16.** Los cuatro hablan el protocolo de esta consola:
[`fmalcher/soundcraft-ui`](https://github.com/fmalcher/soundcraft-ui),
[`Dennion/ioBroker.soundcraft`](https://github.com/Dennion/ioBroker.soundcraft),
[`ndikanov/ui24`](https://github.com/ndikanov/ui24) y
[`NaturalDevCR/MyUiPro`](https://github.com/NaturalDevCR/MyUiPro).

> **Lo que pasó.** Una medición del ítem 108 fallaba y se probaron **nueve
> hipótesis**, todas refutadas contra el aparato, sin haber mirado qué hizo nadie
> más. El usuario lo cortó dos veces: «*¿no hay algún proyecto de GitHub que tenga
> algo documentado o parecido?*» y después «*buscá también en repositorios de
> terceros*». De ahí salió la única pista accionable —que la consola cierra el
> socket si deja de recibir `3:::ALIVE`—, y aunque resultó estar ya cubierta, era
> la pregunta correcta y se había hecho tarde. El repositorio citaba uno solo de
> los cuatro, enterrado en un anexo de auditoría.

**Y hay una tercera forma de fallar, que es la que de verdad muerde: «no
encontré X» dicho como «no hacen X».** Un `grep` del parámetro del día que vuelve
vacío dice que ese parámetro no aparece, y nada más. Convertirlo en una
afirmación sobre todo el proyecto ajeno es ampliar el alcance en silencio.

> **Lo que pasó, tres veces.** Se escribió que ninguno de los cuatro nombra
> `afs.*` —`fmalcher` lista las doce claves del supresor—. Se escribió que
> `fmalcher` tiene «cero coincidencias de `eq.peak`» y con eso «no expone el
> ecualizador de salida» —lo expone entero, anidado en un JSON, donde esa cadena
> nunca aparece—. Y se escribió que `MyUiPro` e `ioBroker` «no tocan parámetros
> de mezcla» —los dos escriben la ganancia del previo, y `MyUiPro` publica una
> ley para convertirla, la misma que publica `fmalcher`—. Las tres veces la frase
> falsa era la **cómoda**: dejaba el hallazgo propio sin precedente.

**Para estos cuatro la respuesta está archivada**, con el commit que se miró de
cada uno: `docs/referencia/trabajo-previo-de-terceros.md`. Qué escribe cada uno,
qué convierte y qué no tiene. Antes de escribir «ninguno de los cuatro hace X»,
se busca ahí; si X no está, se clona, se grepea y **se agrega la fila**. Recordar
no cuenta.

Y sigue valiendo la advertencia de §3: **el trabajo previo da hipótesis, no
verdades.** De los cuatro, **ninguno documenta la cadencia del `VU2`** ni que se
emite por cambio, que es lo que hacía falta. Que no haya precedente es un dato:
significa más cuidado, no menos.

## 8. Explicarle al usuario en su idioma, que es el del producto

**Nada de nombres de clave, de funciones ni de archivos en la explicación
principal.** El detalle técnico va al commit, al documento o a la evidencia, que
es donde se audita. A la conversación va **qué se quiere saber, por qué importa
para el producto, qué se va a hacer, cuánto lleva y qué le toca de su equipo.**

> **Lo que pasó.** El 2026-09-16 se le explicó un fallo de medición a base de
> `m.afs.enabled`, conteos de cuadros `VU2` y bloqueos del bucle de eventos. Él
> pidió la versión simple, la aprobó, y dejó la regla: «*las explicaciones deben
> de ser así, pues yo ni entiendo de claves ni funciones. **Entiendo del
> producto**.*»

**Por qué no es cosmética.** Es músico e ingeniero de sonido, no programador, y
**la autoridad es humana**: las decisiones sobre qué se toca de su consola son
suyas. Una explicación que no puede evaluar lo obliga a aceptar o rechazar a
ciegas, que es exactamente lo contrario de la regla 5 del README.

Si hace falta una analogía, que sea del oficio —un velocímetro que se apaga con
el auto parado, no un búfer que no se vacía—. Y vale igual **cuando él pregunta
algo técnico**: primero qué significa para el producto, después el detalle si lo
pide.

---

## 9. Trabajar con lotes de ediciones

**Un lote tiene que informar cuáles no aplicaron.** Si aborta en la primera falla, las siguientes no se ejecutan y nadie se entera.

> **Lo que pasó.** Un lote de tres correcciones abortó en la primera. Se volvió a correr con dos, y la tercera —la polaridad del indicador de puerta— nunca llegó al archivo. El commit decía haberla hecho.

**Después de un lote, comprobá que cada edición esté**, con `grep`, no de memoria.

## El límite que se comprueba tarde no es un límite

`npm run verificar:commits` revisaba la convención de los mensajes, pero corre
**después**: el commit ya existe, muchas veces ya se empujó, y arreglarlo cuesta
una enmienda y un `--force-with-lease`. Pasó dos veces en la misma sesión, las
dos por uno o dos caracteres de más en el asunto. Al poner la guarda apareció
además un ámbito inválido —`gates` cuando el válido es `gate`, en singular—.

**Y acá hay que corregir lo que se escribió el mismo día.** El commit dijo que
la comprobación tardía «se estaba leyendo por encima», y no es cierto:
`verificar:commits` corre commitlint entero, `scope-enum` incluido, y habría
cantado ese ámbito sin problema. La razón por la que nunca lo mostró es más
simple y mejor para el argumento: **el commit con ese ámbito nunca llegó a
existir**, porque el gancho lo frenó antes. Culpar a la herramienta vieja de
algo que no hizo debilita el motivo verdadero para tener la nueva.

Hay un gancho `commit-msg` en `.githooks/` y `npm install` lo engancha con
`core.hooksPath`. Si el mensaje no cumple, **el commit no llega a existir**.

La regla general, que vale para más cosas que los mensajes: **una comprobación
que llega después del hecho es un reproche, no una guarda.** Cuando algo se
repite, la pregunta no es «cómo me acuerdo la próxima» sino «dónde se pone para
que no dependa de que me acuerde».

## Una tarea, un commit, y recién entonces la siguiente

Una tarea **no está terminada** hasta que está documentada, commiteada y
empujada. Nada de acumular dos o tres y cerrarlas juntas. El usuario lo dijo
así: «cada tarea se finaliza documentandola y haciendo commit y push **solo asi
iniciar la otra**». La última cláusula es la que se pierde primero: no alcanza
con documentar y commitear, hay que hacerlo *antes* de empezar la próxima.

El orden es siempre el mismo:

1. El trabajo.
2. La documentación que corresponda: evidencia, especificación, matriz de
   capacidades, acta del control, `CHANGELOG`.
3. `npm run verificar` **en verde**. No se commitea en rojo, ni siquiera
   «porque el arreglo va en el commit siguiente» — eso ya se hizo una vez y el
   commit quedó afirmando una corrección que no estaba en el archivo.
4. Commit, con el ámbito y el largo que acepta el gancho `commit-msg`.
5. Empujar.
6. Recién ahí, marcar la tarea y tomar la próxima.

**Si aparece un hallazgo en medio de una tarea, va como tarea nueva.** No se
mete en la que está en curso. El último commit de la sesión del 2026-09-10 juntó
mediciones nuevas de SPK-P0.9 con diecisiete correcciones de una auditoría: las
dos cosas eran ciertas y ninguna se puede revertir sin la otra.

**Por qué importa más de lo que parece.** Un commit gordo no solo es difícil de
revertir: es difícil de *revisar*, y en este proyecto las cosas que se
descubrieron tarde —el techo del medidor, la retención de picos, el respaldo por
VU que no existía— se descubrieron leyendo, no ejecutando. Lo que no se puede
leer con atención no se revisa.

## Terminar una medición es más que archivarla

**El usuario preguntó tres veces en un día si la documentación estaba bien, y las
tres veces faltaba algo.** No es casualidad ni distracción: el trabajo de medir
produce contrato y evidencia —que se hacen solos, porque son el trabajo— y deja
atrás **los documentos que dicen qué se sabe**, que son otros.

Su frase: *«se me hace costumbre preguntar porque de alguna manera es algo en
donde siempre fallamos»*. Tenía razón las tres veces.

### La lista, sacada de lo que falló de verdad el 2026-09-16

Cuando una medición termina, estos son los que se quedan atrás. **Se recorren, no
se recuerdan:**

| Documento | Qué se le pudre |
|---|---|
| `docs/capability-matrix.md` | la **fila narrativa** de la familia: dice «desconocida / INFERIDO» de algo recién medido |
| `docs/protocol-spec.md` §4.6 | la **tabla de constantes**: dice «sin probar» o «REFUTADA» de fórmulas que cambiaron de estado |
| `README.md` | el resumen de qué falta medir |
| `.claude/skills/vse-experto/SKILL.md` | la sección «Estado real, hoy», que **avisa de que se pudre** y se pudre igual |
| `CHANGELOG.md` | lo que el usuario va a ver |
| el contrato **anterior** | si esta medición contesta una pregunta que aquél dejó abierta, hay que decirlo **ahí** |

### Lo que se puede comprobar solo, y lo que no

`validate-rutas-medidas` cubre **la mitad mecanizable**: que ningún documento
describa con una palabra de negación —«sin probar», «REFUTADA», «INFERIDO»,
«desconocida»— una ruta que `RAW_MAP` declara `PROBADO`. Mira todos los `.md` del
repositorio, no uno.

**Lo que no puede cubrir es la prosa que describe una ley sin nombrar su ruta**, y
ahí no hay guarda posible. Por eso la otra mitad de la regla:

### Los documentos de estado APUNTAN, no repiten

**Cada número repetido es un número que se pudre.** Un documento de estado dice
*qué* se sabe y *dónde* está el detalle; el detalle vive en el contrato de la
medición, que es el único sitio donde se actualiza cuando cambia.

> **Lo que pasó.** La fila del compresor en la matriz repetía la ley completa con
> sus cifras. Cuando la medición siguiente mostró que esa ley era el promedio de
> una curva, hubo que corregirla **en cuatro lugares** — y dos se encontraron
> recién cuando el usuario preguntó por tercera vez.

---

## Una medición que no se archiva no se midió: se contó

Pasó **tres veces en un día**, y la tercera casi cuesta caro.

La rutina era: correr el spike, leer la salida en la terminal, y después correrlo
otra vez redirigiendo a un archivo de evidencia. **Son dos corridas.** Sobre
hardware nunca dan igual —el testigo dio mediana 17 en una y 18 en la otra;
`SNAPSHOTLIST` dio máximo 277 en una y 7 en la otra— y el documento terminaba
citando un número que no estaba en ningún archivo.

El peor fue el 277: era **el argumento entero** para cambiar un plazo. Al medirlo
de nuevo, sesenta veces seguidas, no volvió a aparecer. Un número inventado no
molesta mientras nadie dependa de él; molesta el día que alguien ajusta un plazo,
un umbral o una espera confiando en él, **con la sala llena**.

**La medición se corre con `tools/spikes/medir.mjs`**, que muestra y archiva la
misma corrida a la vez:

```
node tools/spikes/medir.mjs docs/spikes/SPK-X/evidence/lo-que-sea-2026-09-10.txt \
  tools/spikes/.../guion.ts [args...]
```

Escribe el encabezado con la fecha y el comando exacto, no deja archivar fuera de
una carpeta `evidence/`, y **no pisa un archivo que ya existe** —la evidencia es
el registro de un día, y sobrescribirla borra el rastro de que la anterior
existió—. Y los parámetros de la medición se imprimen **dentro** de la medición:
un archivo que no dice con qué ventana se midió obliga a buscarla en el código de
ese día, y esa búsqueda es la que nadie hace.

**`validate-cifras-medidas.mjs` atrapa lo que se escape.** Toma cada bloque de
documentación que cite un archivo de evidencia y exige que los números **con
unidad** —ms, s, dB, Hz— de ese bloque estén en ese archivo. Solo con unidad, y
es deliberado: comprobar todos los números reportaba once cosas de las cuales una
era real, y una guarda con esa proporción de ruido se desactiva en una semana.

Dos cosas que se aprendieron construyéndolo, y que valen para cualquier guarda:

- **Probala contra el caso que la motivó.** La primera versión no atrapaba el 277
  —la cifra estaba en una línea y la cita en la siguiente— y estaba en verde. Una
  guarda que no cubre su propio caso motivador es decorado.
- **Que una entrada rota no la apague.** La segunda versión sí miraba el bloque,
  pero una cita a una ruta que no resolvía hacía `return` en silencio y desactivaba
  la comprobación del bloque entero. Ahora una cita rota **es un error**.
