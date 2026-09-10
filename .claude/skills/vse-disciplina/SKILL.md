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

**Preguntá de forma interactiva** cuando la respuesta cambia el trabajo y es del usuario: niveles de autonomía, umbrales que mueven el equilibrio entre avisar de más y de menos, cualquier cosa que toque su equipo de una forma nueva.

**Decidí vos** lo que es cuestión de oficio: cómo estructurar un módulo, qué probar, cómo nombrar. Preguntar todo es trasladar el trabajo.

**Cuando las fuentes se contradicen y no se puede medir, decidí por procedencia y escribí el razonamiento.** El byte 5 de la cabecera de `VU2` se resolvió así: el cliente del fabricante y dos implementaciones de terceros dicen cosas distintas, en una Ui24R los dos valores son iguales, y se siguió a quien probablemente tenga la documentación oficial.

---

## 8. Trabajar con lotes de ediciones

**Un lote tiene que informar cuáles no aplicaron.** Si aborta en la primera falla, las siguientes no se ejecutan y nadie se entera.

> **Lo que pasó.** Un lote de tres correcciones abortó en la primera. Se volvió a correr con dos, y la tercera —la polaridad del indicador de puerta— nunca llegó al archivo. El commit decía haberla hecho.

**Después de un lote, comprobá que cada edición esté**, con `grep`, no de memoria.
