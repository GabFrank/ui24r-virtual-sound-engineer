# SPK-P0.2a — Matriz de capacidades, lectura y escritura básica

**Estado:** Parcial · **Criterios 1, 5 y 6 cerrados**; el 4 contestado a medias · Repasado contra la realidad el **2026-09-10** · **Timebox:** 8 días · **Control:** G-A
**Depende de:** S-00.4, SPK-P0.1 · **Bloquea a:** SPK-P0.8, SPK-P0.7a, SPK-P0.5, SPK-P0.6', SPK-PA-BUS, SPK-P0.2b, SPK-P0.2c, S-02.5c
**Montaje:** Ui24R, router, laptop con Node, navegador con la interfaz web oficial de la consola.

## Pregunta que responde

¿Qué funciones expone realmente el protocolo, con qué ruta, en qué unidad y con qué rango?

Ninguna función de producto se implementa sobre un parámetro que no esté probado aquí.

## Pasos

1. Para cada función, mover el control en la interfaz web oficial mientras se captura el tráfico, y anotar ruta, valores crudos y valor mostrado.
2. Escribir el parámetro desde el código y verificar por lectura.
3. Para los envíos auxiliares, comprobar el efecto de la configuración global de punto de derivación.
4. Para el enlace estéreo, comprobar si mover un canal arrastra a su vecino.
5. Volcar la tabla resultante en `docs/capability-matrix.md` y generar `docs/protocol-spec.md`.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Confirmadas en hardware: fader de canal y general, silencio, panorama, nombre, ganancia de entrada, alimentación fantasma en lectura, envíos auxiliares con nivel, silencio y ambos puntos de derivación, matriz con el general como fuente, retardos de salida, instantáneas, shows, información del dispositivo | bloqueante | 100 % de esa lista | **16 de 16, cerrado el 2026-09-10.** A los 10 que había se sumaron los seis que faltaban, medidos en una corrida: fantasma en lectura, silencio de envío auxiliar, los dos puntos de derivación, matriz con el general como fuente y retardos de salida. **9 escrituras, 9 difundidas al testigo, 9 restauradas** y la restauración comprobada por HTTP, que no es ninguna de las dos conexiones que escribieron. `evidence/capacidades-que-faltan-2026-09-10b.txt` | ✅ |
| 2 | Reproductor: silencio, fader, panorama, envíos a todos los buses, estado de reproducción, listas, carga, reproducción y detención | bloqueante | 100 % | | ⬜ |
| 3 | Grabación multipista: grabar, reproducir, detener, modo soundcheck, estado de grabación | bloqueante | 100 % | | ⬜ |
| 4 | Efecto de la configuración global de punto de derivación sobre el significado de antes y después del fader | bloqueante | documentado | **Contestado a medias, y la mitad que falta no se puede medir sin audio.** `settings.auxsendpoint` y `settings.mtxsendpoint` existen, se escriben y se difunden. Lo que se midió es lo que **no** hacen: al cambiar el global, la consola difundió **cero** rutas más, así que no reescribe los `post`/`postproc` de cada envío — los dos niveles conviven en el estado. Cuál gana en el audio exige oír la diferencia, y eso es SPK-P0.2b. `evidence/capacidades-que-faltan-2026-09-10b.txt` | ⬜ |
| 5 | Enlace estéreo: si mover un canal arrastra al vecino en sus envíos | bloqueante | documentado con captura | **MEDIDO el 2026-09-09.** `i.N.stereoIndex`: 0 = izquierdo del par —el compañero es N+1—, 1 = derecho, −1 sin enlazar. **El enlace se lee de la consola, no se declara.** Enlazar es destructivo: el cliente hace `copySettings`/`pasteSettings` del izquierdo sobre el derecho. `evidence/enlace-estereo-2026-09-09.txt` | ✅ |
| 6 | `docs/capability-matrix.md` versión 1 y `docs/protocol-spec.md` versión 1 generados | bloqueante | ambos | **Los dos existen y dicen «Versión 1».** La matriz tiene **77 filas con estado, 37 verificadas** contra el aparato; la especificación encabeza con la consola de referencia y su firmware | ✅ |

## Evidencia a entregar

- `evidence/traffic/` con una captura por función.
- `evidence/roundtrip.jsonl` con los resultados de escritura y lectura.

## Acción ante fallo

Una función que no aparezca por protocolo se marca DESCONOCIDO en la matriz y **no se planifica ninguna historia sobre ella**. Si es la lectura de los medidores lo que falla, cae el asistente de ganancia del MVP0 y hay que rediseñarlo sobre la entrada 2, lo que exige la interfaz de audio y mueve el primer entregable entero.

---

## Resultado parcial — 2026-09-08

### Criterio 1: siete rutas de la lista, confirmadas contra el aparato

Gabriel movió cada control desde `http://192.168.0.49/mixer.html`, uno por vez, con una
instantánea guardada antes. La sesión **no escribió nada**: solo registró qué clave cambiaba.

| Control movido | Ruta | Verbo | Valores observados | Cambios |
|---|---|---|---|---|
| Fader del canal 1 | `i.0.mix` | `SETD` | 0,4131477793 → 0,5916673729 | 118 |
| Silencio del canal 1 | `i.0.mute` | `SETD` | `1`, después `0` | 2 |
| Ganancia del canal 1 | `hw.0.gain` | `SETD` | 0,4887160521 → 0,6396594483 | 102 |
| Panorama del canal 1 | `i.0.pan` | `SETD` | 0,05952380952 → 0,9047619048 | 104 |
| Nombre del canal 1 | `i.0.name` | `SETS` | `GTR GAB` → `PRUEBA` | 1 |
| Envío al auxiliar 1 | `i.0.aux.0.value` | `SETD` | 0,3182915842 → 0,4703894863 | 74 |
| Fader general | `m.mix` | `SETD` | 0,4896067302 → 0,6347446112 | 95 |

La ganancia cuelga de `hw.N.gain`, no del canal. **Ya estaba así en la matriz y en
`clasificar-ruta.ts`**: lo que agrega esta medición es la comprobación, no el dato.

**Granularidad:** un fader produjo 118 mensajes en nueve segundos. La consola emite de forma
continua mientras se arrastra el control, sin agrupar.

### El paso 2 del charter, hecho por completo

El charter proponía «extraer las tablas de conversión del código que la propia consola sirve por
HTTP». Salieron **las 54 funciones**, con inversas y tablas auxiliares, en
`evidence/tablas-conversion-ui24r.js`. Dos resultados cambian decisiones:

- **El fader llega a +10 dB, no a 0.** 0 dB está en 0,764706. La curva que la aplicación usaba
  tenía una pendiente inventada.
- **La ganancia de entrada es escalonada:** 48 valores, de 2 en 2 dB hasta +26 y de 1 en 1 desde
  +27. La recta que se suponía erraba más de un decibel. Una recomendación de «subí 1,5 dB» en
  la mitad baja del recorrido no se puede ejecutar.

Ida y vuelta sobre los escalones: exacta, error 0 dB sobre 63 dB de rango. El criterio 6 de
SPK-P0.2b pide 1 % o menos.

**Ojo con qué prueba esto.** Son las conversiones que la consola usa para dibujar su interfaz:
garantizan que nuestro número coincide con el que ve el operador, no que corresponda a un nivel
digital real. Eso lo mide SPK-P0.10b.

### Criterio 6: los dos documentos, generados

`docs/protocol-spec.md` versión 1 y `docs/capability-matrix.md` versión 1, con el firmware
`3.4.8318-ui24` registrado y las siete filas marcadas como probadas.

### Lo que no se midió

- **Criterio 1 completo**: faltan alimentación fantasma, silencio de envío auxiliar, ambos
  puntos de derivación, matriz, retardos de salida, instantáneas, shows.
- **Criterios 2 y 3** enteros: reproductor y grabación multipista.
- **Criterio 4**: efecto de la configuración global de punto de derivación.
- **Criterio 5**: enlace estéreo.
- **Paso 2 del charter, la escritura y su verificación por lectura**: exige escribir, y el nivel
  es OBSERVE.
- **`evidence/roundtrip.jsonl`** no existe por lo mismo.

## Evidencia archivada

Todo lo que esta carpeta guarda, con qué es cada cosa. Un archivo que nadie
cita es una medición que nadie va a encontrar cuando la necesite.

- `evidence/capacidades-que-faltan-2026-09-10.txt` — la primera pasada de las seis que faltaban. **Superada**: su contador daba por confirmada una fila que el guion no medía
- `evidence/capacidades-que-faltan-2026-09-10b.txt` — las seis capacidades que le faltaban al criterio 1, medidas y restauradas
- `evidence/curva-ganancia-completa-2026-09-09.txt` — captura archivada
- `evidence/enlace-estereo-2026-09-09.txt` — captura archivada
- `evidence/fuentes-de-canal-2026-09-09.txt` — qué fuente toma cada canal (`i.N.src`)
- `evidence/http-servido-2026-09-09.txt` — qué sirve la consola por HTTP, incluido `/raw`
- `evidence/ley-ganancia-2026-09-09.txt` — captura archivada
- `evidence/manual-fw-3.5-que-aporta-2026-09-09.txt` — qué confirma y qué agrega el manual del firmware 3.5
- `evidence/manual-tecnico-fw-3.5.8328.txt` — captura archivada
- `evidence/prueba-A-pasivo-claves.tsv` — el volcado en tabla, clave por clave
- `evidence/trabajo-previo-2026-09-09.txt` — qué hay publicado sobre este protocolo y qué no
- `evidence/trabajo3-cambios.txt` — cambios observados durante una sesión de trabajo


---

## Cierre del criterio 1 — 2026-09-10

Las seis que faltaban, medidas en una sola corrida contra el aparato:
`tools/spikes/p0-2a/capacidades-que-faltan.ts`. Nueve escrituras, **nueve
difundidas al testigo y nueve restauradas**, con la restauración comprobada por
`GET /raw` — que es HTTP y no pasa por ninguna de las dos conexiones que
escribieron. Latencia de difusión: mediana 13 ms, mínimo 4, máximo 29 ms.
Evidencia: `evidence/capacidades-que-faltan-2026-09-10b.txt`

### Tres cosas que el charter no anticipaba

**1. `i.N.phantom` existe, y miente.** El charter pedía «alimentación fantasma
en lectura» dando por sentado que había una ruta. Hay dos. Con el condensador
alimentado, `hw.8.phantom` valía **1** y `i.8.phantom` valía **0** en el mismo
instante — y el juego de parámetros de fábrica que la consola sirve
(`js/initparams.js`) trae exactamente esos dos valores, así que no es un desfase
momentáneo: son claves distintas y la del canal no se usa.

Esto ya estaba **bien resuelto en el código** —`clasificarRuta` reconoce
`hw.N.phantom` y devuelve `null` para `i.N.phantom`— pero estaba resuelto por
lectura de la matriz, no por medición. Ahora está medido. Y se suma a algo que
ya sabíamos: el canal no siempre toma el previo de su mismo número, así que leer
la alimentación fantasma exige **resolver antes qué previo alimenta al canal**.
Dos errores encadenados —ruta equivocada y número equivocado— darían «este
micrófono no tiene fantasma» sobre un condensador que sí la tiene, que es
justo el diagnóstico que hace perder diez minutos en una prueba de sonido.

**2. La matriz no es lo que parecía, y casi ningún canal llega a ella.** Buscando
«matriz» aparece primero `hwoutaux.N.src`, que nombra qué bus sale por cada jack
físico. **No es la matriz**: es el patchbay de salida. La matriz es
`<fuente>.mtx.<destino>.*`, y tienen envío a ella **19 fuentes**: los diez
auxiliares, los seis subgrupos, el general, y **solo dos canales de entrada,
`i.9` e `i.19`**. Los otros veintidós no pueden mandar a la matriz. Confirmado
contra el juego de parámetros de fábrica, no solo contra el estado de hoy.

Y esas dos, que son las únicas entradas con matriz, son también las únicas
fuentes **sin `postproc` propio** en su envío: no tienen punto de derivación
para elegir.

**3. Los retardos aceptan el valor, y nadie sabe qué significa.** `m.delayL`,
`m.delayR` y `a.0.delay` aceptaron 0,25, lo difundieron y volvieron a 0. Pero la
matriz de capacidades decía «ms, de 0 a 500», y ese rango **sale de la API
tipada de terceros, no de una medición nuestra**. La ley de conversión no
aparece en el código que la consola sirve por HTTP —está el pre-delay de la
reverberación, `VtoPREDELAY`, y nada más—. Así que la ruta queda CONFIRMADA y
**la unidad queda sin medir**, dicho así en la matriz. Se puede medir
acústicamente —un golpe, y la diferencia de llegada entre retardo 0 y retardo
0,25— pero la cadencia de las tramas del medidor pone el piso de resolución en
unos 34 ms, y eso hay que decirlo antes de intentarlo.

### Lo que esta corrida corrigió de sí misma

La primera pasada imprimió «9 de 9 confirmadas» con **una fila cuyo
`confirmado: true` estaba escrito a mano** en el guion, no medido: la del ajuste
global. El número era correcto por casualidad —al medirlo de verdad, difundió en
29 ms— pero el contador no lo sabía. Queda la corrida corregida como evidencia y
la primera, `evidence/capacidades-que-faltan-2026-09-10.txt`, como lo que fue.

**Un contador que suma un dato inventado es peor que no tener contador: se lee
igual de bien.**
