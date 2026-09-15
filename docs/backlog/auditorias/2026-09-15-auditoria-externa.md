# Auditoría externa — estado, trabajo previo y qué corroborar con la consola

**Fecha:** 2026-09-15 · **Base auditada:** rama `fix/doble-de-transporte`, commit
`66d509c` del 2026-09-13 · **Rol:** auditor externo. **No se tocó código, no se
abrió ninguna conexión a la consola, no se corrió ningún guion de medición.**
Todo lo que se afirma acá sale de leer el repositorio, de ejecutar sus propias
comprobaciones (`npm run verificar`, `npm test`, `npm run lint`) y de leer
treinta y seis proyectos públicos de GitHub sobre la Ui24R, clonados en local.

**Cómo leer este documento.** Cada afirmación lleva una de tres marcas:

- **VERIFICADO** — lo comprobé yo, sobre el repositorio o ejecutando algo.
- **INFERIDO** — sale de código o documentación ajena (cliente oficial de la
  consola, bibliotecas de terceros, manual). Son **hipótesis con procedencia**,
  no hechos. La regla del proyecto se respeta: nada de esto entra a `raw-map.ts`
  ni a la matriz de capacidades sin medirse.
- **OPINIÓN** — recomendación mía. Se puede discutir.

---

## 0. Resumen ejecutivo

1. **El proyecto está mucho más avanzado que lo que sus puertas de entrada
   dicen.** El README, la skill `vse-experto`, el índice de spikes y el acta del
   control G-A describen el estado del 2026-09-10. Tres días de trabajo intenso
   —159 commits, 401 archivos— redefinieron el producto (asistente de
   soundcheck, no de show), abrieron la escritura a la consola (ADR-027 y
   ADR-028), anclaron por primera vez el medidor contra un instrumento externo y
   midieron seis leyes de conversión. Nada de eso se ve desde la portada.
2. **Esa rama no está fusionada y no tiene PR abierto.** La comprobación
   integral `npm run verificar` **falla en su punta por tres motivos**, los tres
   introducidos en la rama y ninguno presente en `main`: ADR-029 fuera del
   índice, una llamada a función desde una plantilla, y **un asistente que
   importa el adaptador de la consola**, que es la regla 3 del proyecto. Riesgo
   real: tres madrugadas colgando de una rama que el CI rechazaría.
3. **Tres preguntas abiertas del proyecto tienen su respuesta dentro del
   propio repositorio, en un archivo de evidencia que nadie volvió a leer.** La
   ganancia del ecualizador (ítem 108, escrito y auditado cinco veces), la unidad
   de los retardos («no está medida») y los tiempos de compresor y puerta tienen
   fórmula en `tablas-conversion-ui24r.js`, extraído de la consola del usuario el
   2026-09-08. La especificación transcribió 4 de las ~50 funciones de ese archivo.
4. **Hay trabajo previo publicado, y es más de lo que se creía.** Copias
   completas del cliente oficial de la consola, dos herramientas del formato de
   instantáneas, una referencia de protocolo verificada contra una Ui16 con
   hallazgos que este proyecto no tiene, y el formato del archivo de sesión
   multipista. Con eso, al menos ocho preguntas abiertas pasan de «medir desde
   cero» a «verificar una hipótesis concreta», que cuesta minutos y no días.
5. **La disciplina de medición del proyecto es excepcional y hay que
   conservarla.** Lo que falta no es rigor: es un paso de «buscar antes de
   medir» que no depende de que alguien se acuerde, y una portada que diga la
   verdad.
6. **Nadie está construyendo lo mismo sobre la Ui24R, y lo más afín en
   actitud está en otra consola.** El «competidor» con IA escribe rutas que la
   consola no tiene. El proyecto que más se parece en filosofía —medir, corregir
   de a poco, retirarse cuando el humano toca— es una herramienta para X32/M32.
   Y hay veinte años de investigación académica y código abierto de Sony y QMUL
   sobre exactamente estos problemas, que nadie había mirado (§10).

---

## 1. Alcance y método

**Qué se leyó (VERIFICADO):** los 159 commits nuevos de la rama, sus 401
archivos, los 31 ADR, las 5 actas de control, los 23 charters de spike, los 21
contratos de `docs/compromisos/`, los documentos de `docs/pedidos/`,
`docs/backlog/`, `docs/referencia/`, `docs/inventario/`, la matriz de
capacidades, la especificación del protocolo, `raw-map.ts`, y el `CHANGELOG`.

**Qué se ejecutó (VERIFICADO), sobre `66d509c`:**

| Comando | Resultado |
|---|---|
| `npm run verificar` | **Falla** en `validate:docs` → `validate-huerfanos`: «ADR-029 no está en docs/adr/README.md». Lo que sigue en la cadena no llega a correr desde ese comando |
| cada validador por separado | **Fallan tres**: `validate-huerfanos` (ADR-029), `validate-plantillas-llamadas` (`toLowerCase()` desde la plantilla de `plano-escenario.component.ts`) y `validate-limites` (`packages/assistants/src/bajar-envio-a-monitor.ts` y su test importan `@vse/mixer-adapter`). Los tres pasan en `main` |
| `npm test` | 1055 tests, 0 fallos, en todos los paquetes |
| `npm run test:dsp` | 48 tests, 0 fallos |
| `npm run test:audio` | 23 tests, 0 fallos |
| `npm run lint` | En verde: chequeo de tipos de paquetes y `tools/`, y compilación de la aplicación |

**Qué se leyó afuera (VERIFICADO que existe; su contenido es INFERIDO):**
treinta y seis repositorios públicos sobre la Ui24R más seis de referencia
(automatización en otras consolas e investigación), clonados el 2026-09-15. El
catálogo completo está en el Anexo A. Los que aportan algo concreto se citan en
§5 y §10.

**Qué NO se hizo, a propósito:** ninguna conexión a la consola, ningún guion de
`tools/spikes/`, ningún cambio en código ni en documentos existentes. Este
documento es el único archivo que agrega esta auditoría.

---

## 2. Estado real del proyecto al 2026-09-13

Escrito para quien llega nuevo. Corrige la foto que dan el README y la skill.

### 2.1 Qué es hoy

**Un asistente de soundcheck** para la Ui24R, decidido con el usuario el
2026-09-11 (`docs/alcance-mvp.md`). Acompaña a la banda instrumento por
instrumento hasta dejar la mezcla guardada en una instantánea. **No es un
asistente de show**: durante la función no hace nada. La escalera MVP0–MVP4b
que describen varios documentos viejos quedó reemplazada.

De los 14 pasos de ese camino, **8 están construidos** —perfiles, sesión,
canales, el **plano del escenario** con arrastre, el **recorrido guiado**, la
ganancia medida y aplicada, la instantánea final, el cierre— y **5 esperan una
ley por medir**: puerta, compresor, ecualizador de canal, envío a efectos y
envío a monitor. Decidido con el usuario: se miden antes de la primera entrega.

### 2.2 Qué escribe en la consola

**Ya escribe.** No en el sentido de que una pantalla lo dispare hoy —el único
camino de producción que construye un cambio propuesto sigue siendo la ganancia,
más el servicio de bajar un monitor que ADR-028 habilitó y que ninguna pantalla
llama todavía— sino en el sentido que importa para la seguridad: **el motor
admite escrituras que hace tres días rechazaba.**

| Decisión | Qué abre | Guarda |
|---|---|---|
| ADR-026 | La ganancia de entrada, cerrando el lazo | INV-006, topes por transacción |
| ADR-027 | Silenciar un canal para diagnosticar (+24 rutas) | Todo estado menos `SHOW`; nunca desilencia |
| ADR-028 | El nivel del envío a monitor, 240 rutas | Sólo `i.N.aux.M.value`; techo «hasta donde estaba» si la app lo bajó; no en `SHOW`; 2 dB por transacción |
| ADR-029 | Bajar el fader de un auxiliar para cazar un acople | **Decidido, sin implementar.** La mitad del general espera una decisión del usuario |

INV-010 dejó de ser «nunca». El texto de la invariante, la matriz de autonomía y
el código lo reflejan; **el README, `CONTRIBUTING.md` y la skill no.**

`raw-map.ts` tiene **5 entradas en `PROBADO`** —las cuatro del ecualizador
(frecuencia, Q, pasa-altos, pasa-bajos) y el envío a monitor— medidas contra el
filtro real con un bucle externo. El README dice «0, y así seguirá».

### 2.3 Lo que se cerró en esas tres madrugadas

- **La brecha más vieja del proyecto.** Hasta el 12, toda medición terminaba con
  «esto es autoconsistencia y no calibración». Con el bucle que el usuario cableó
  a la interfaz, el medidor quedó anclado contra un instrumento externo por dos
  caminos distintos, y los dos coinciden con el recorrido declarado dentro del
  1 %.
- **Seis leyes medidas** contra el aparato: fader de bus, fader del general,
  envío a auxiliar (acotado), envío a efectos (acotado), curvas del ecualizador y
  filtros de corte.
- **Dos leyes refutadas**: el umbral y la relación del compresor tal como el
  código las tenía. Ver H-06, porque hay algo que decir sobre cómo se refutaron.
- **El detector de realimentación fue exonerado.** El «defecto» del 10 era un
  Bluetooth enchufado a las entradas de línea; se retractó el 11 dejando el texto
  original a la vista.
- **El manual del fabricante entró como tercera fuente**, con extractor propio y
  la regla escrita de que pierde contra una medición.
- **Un inventario de 6 732 claves** de la consola real, observadas sin escribir.
- **Un protocolo de verificación** con dos auditores de contexto separado,
  nacido de una pregunta del usuario sobre los errores repetidos.

### 2.4 Lo que espera algo del usuario

Está en `docs/pedidos/2026-09-13-resumen-de-la-madrugada.md` y lo repito porque
es lo que destraba producto:

1. **ADR-029, mitad del general:** ¿hasta dónde puede volver a subir la
   aplicación el fader del general después de bajarlo para cazar un acople?
   Cuatro opciones escritas.
2. **Un minuto de manos:** desenchufar el cable de la entrada 1 de la interfaz.
3. **El ring-out perdido**: tres filtros del supresor que se borraron midiendo.
4. **Una objeción abierta**: el agente bajó el fader del general cinco minutos
   para medir su ley, y dejó escrito el argumento para que se pueda objetar.

---

## 3. Hallazgos sobre el repositorio

Numerados H-01 en adelante. **Severidad**: ALTA cambia decisiones o esconde un
riesgo; MEDIA cuesta tiempo o confunde; BAJA es orden.

### H-01 · ALTA · 159 commits sin fusionar y sin PR

**VERIFICADO.** `origin/main` está en `11271b5` (2026-09-10). La rama
`fix/doble-de-transporte` tiene 159 commits por encima, 401 archivos, +284 820
líneas. `list_pull_requests` de GitHub devuelve **cero PR abiertos**.

**Por qué importa.** El propio proyecto tiene escrito que un commit gordo no se
puede revisar. Una rama de tres días tampoco, y además es un punto único de
falla: cualquier accidente con esa rama se lleva el redefinido del producto, dos
ADR aceptadas, seis leyes medidas y 58 archivos de evidencia.

**Recomendación (OPINIÓN).** Abrir el PR ya, aunque sea para fusionar tal cual.
Si el usuario quiere revisarlo por partes, los commits están bien granulados y
se puede leer por día. Lo que no conviene es seguir apilando.

### H-02 · ALTA · La comprobación integral está en rojo en la punta de la rama, por tres cosas

**VERIFICADO.** `npm run verificar` se detiene en el tercer validador de
`validate:docs`, y corriendo cada validador por separado aparecen **tres
fallos**, los tres ausentes en `main`:

1. `validate-huerfanos`: ADR-029 existe y no está en `docs/adr/README.md`. Es
   el caso exacto para el que ese validador se escribió —tres ADR quedaron fuera
   del índice una vez— y lo atrapó.
2. `validate-plantillas-llamadas`: `plano-escenario.component.ts` llama
   `toLowerCase()` desde la plantilla (`'punto ' + f.ficha.origen.toLowerCase()`).
   Es la trampa que la skill dice que «ya se violó tres veces». Van cuatro.
   Commit `d5012bc`, 2026-09-12.
3. `validate-limites`: `packages/assistants/src/bajar-envio-a-monitor.ts`
   importa `aRaw`, `entrada` y `esNivelDeEnvioAMonitor` de `@vse/mixer-adapter`,
   y su test importa `entrada` y `faderADb`. **Es la regla 3 del repositorio**
   —«ningún asistente habla con la consola»— y el validador existe para que no
   se cruce. Commit `2cf6f44`, 2026-09-13, «el llamador del monitor, que
   ADR-028 declaraba faltante».

Sobre el tercero, para ser justo: lo que se importa son funciones puras de
conversión y clasificación, no el transporte. El asistente no *habla* con la
consola. Pero el límite está declarado sobre el paquete entero, a propósito, y
la forma correcta de resolverlo es la que el propio proyecto usa en otros
lados: las conversiones que un asistente necesita viven en `domain` o se le
pasan como argumento. Hoy el motor de seguridad importa del adaptador, y el
asistente también: el diagrama `Assistant → Recommendation → Transaction →
SafetyEngine → write()` tiene una flecha nueva que nadie dibujó.

**Por qué es ALTA.** La regla del proyecto es «no se commitea en rojo», el
último commit de la rama dice «cerrar la madrugada sin dejar nada sin
documentar», y el resumen del 13 afirma «validador en verde». El CI de un PR
fallaría en tres pasos. Y el tercero no es orden: es arquitectura de seguridad.

**Recomendación.** Las dos primeras son de una línea. La tercera merece una
decisión escrita: o el límite se afina («assistants puede importar conversiones
puras del adaptador», con la lista) o la función se mueve. Y una pregunta para
el proceso: ¿por qué el gancho `commit-msg` frena un ámbito inválido pero nada
frena un `verificar` en rojo? Un gancho `pre-push` que corra los validadores
—tardan segundos— cerraría este agujero como se cerró el de los mensajes.

### H-03 · ALTA · Las puertas de entrada describen otro proyecto

**VERIFICADO.** Fecha del último cambio de cada uno, contra lo que afirman:

| Documento | Última edición | Afirma | Realidad |
|---|---|---|---|
| `README.md` | 2026-09-11 | «No escribe nada en la consola» · «Rutas crudas escribibles: 0, y así seguirá» · «Spikes cerrados: 0 de 22» | ADR-027/028 abiertas; 5 rutas `PROBADO`; el motor admite 834 rutas; hay 23 spikes |
| `.claude/skills/vse-experto/SKILL.md` | 2026-09-12 | «La aplicación no escribe nada en la consola y no reproduce audio» · el mapa de código no menciona escenario, recorrido, compromisos, pedidos, inventario, referencia | Lo contrario en lo primero; lo segundo son seis carpetas nuevas |
| `docs/spikes/README.md` | — | Tabla de 23 filas con todos en ⬜ y «cuatro tienen resultados parciales» | P0.2b tiene cuatro leyes medidas; P0.10b cerró la calibración externa |
| `docs/gates/G-A.md` | 2026-09-10 | «repasado contra la realidad el 2026-09-10» | Tres días de mediciones después |
| `CONTRIBUTING.md` | — | No menciona INV-010 ni las tres ADR nuevas | — |
| `docs/backlog/03-orden-implementacion.md` | — | 126 ítems de la escalera MVP0–MVP4b | Superada por `alcance-mvp.md`, según el propio `autonomy-matrix.md` |

**Por qué es ALTA y no BAJA.** Yo arranqué esta auditoría sobre `main` porque la
portada no da ningún indicio de que exista otra cosa. Cualquier agente o persona
nueva va a hacer lo mismo. Y una skill que afirma «no escribe» a un agente que
va a tocar el motor de seguridad es una instrucción falsa en el peor lugar.

**Recomendación.** Actualizar las seis en un solo commit `docs`. Y para que no
vuelva a pasar: el proyecto ya tiene `validate-numeros.mjs`, que compara
«cifras contra el código». Agregarle dos afirmaciones: que el README diga la
cantidad de rutas en `PROBADO` que devuelve `rutasProbadas()`, y la cantidad de
spikes que hay en `docs/spikes/`. Un número que se comprueba no se pudre.

### H-04 · ALTA · Tres respuestas estaban en la propia evidencia del proyecto

**VERIFICADO** que el archivo existe y contiene lo que digo;
**INFERIDO** que las fórmulas describan al aparato. El archivo es
`docs/spikes/SPK-P0.2a/evidence/tablas-conversion-ui24r.js`: 121 líneas
extraídas literalmente del `mixer.html` que sirve la consola del usuario, el
2026-09-08, con cerca de cincuenta funciones de conversión. `protocol-spec.md`
§6.3 transcribió **cuatro**.

Tres preguntas que el proyecto trata como abiertas y que ese archivo contesta:

**a) La ganancia del ecualizador de canal.** El ítem 108 está «escrito, auditado
cinco veces y sin correr», y `hallazgo-el-ecualizador-del-raw-map-esta-inventado.md`
dice textualmente que para la ganancia «el `mixer.html` no da fórmula». Da dos:

```js
function VtoEQGAIN20(a){return 40*a-20}
function VtoEQGAIN15(a){return precision(30*a-15,1)}
```

En el cliente oficial, las campanas del ecualizador de canal (`i.N.eq.bM.gain`)
se muestran con `VtoEQGAIN20` y los deslizadores del ecualizador gráfico con
`VtoEQGAIN15` (INFERIDO, leído en la copia del cliente del Anexo A). Con eso
**tres fuentes independientes coinciden**: el cliente oficial, el manual (±20) y
la medición 101, que vio +20,0 exactos en el extremo. Y explica la contradicción
que el 108 quería decidir: el ±15 del código es la fórmula del gráfico, no la
del canal.

**b) La unidad de los retardos.** `capability-matrix.md` dice de `m.delayL/R`:
«cuántos milisegundos son esos 0,25 no está medido: la ley de conversión no
aparece en el código que la consola sirve». Aparece:

```js
function VtoLATENCY(a){return 0==a?"0"+lang.MS:a<=47/SAMPLE_RATE?Math.round(SAMPLE_RATE*a)+lang.SMPL:precision(1E3*a,1)+lang.MS}
```

El crudo está en **segundos**: 0,25 son 250,0 ms; por debajo de 47 muestras se
muestra en muestras. La biblioteca `soundcraft-ui` lo confirma por otro camino
(`sanitizeDelayValue`: `ms / 1000`) y declara los topes: 250 ms para entradas y
líneas, 500 ms para auxiliares y general (INFERIDO).

**c) Ataque, relajación y retención de compresor y puerta.** El manual del
fabricante dio los rangos y `hallazgos-del-manual.md` los anota como «sin
entrada». Las fórmulas están en el mismo archivo, con la función auxiliar
`desqr(v) = 1 − (1 − v)²` que la evidencia del manual 3.5 también describe:

| Parámetro | Función (INFERIDO) |
|---|---|
| `dyn.attack` | `400^desqr(v)` ms, truncado |
| `dyn.release` | `10 · 200^desqr(v)` ms, truncado |
| `gate.attack` | `400^desqr(v)` ms |
| `gate.hold` | `2000^desqr(v)` ms |
| `gate.release` | `5 · 400^desqr(v)` ms |

**Por qué pasó.** No es descuido de una persona: es que el archivo se archivó
como evidencia de un spike y nadie lo promovió a fuente. Y el patrón ya está
nombrado en el repositorio —«una corrección se aplica donde se descubre, no
donde se propagó»— sólo que acá es al revés: un hallazgo se archivó donde se
encontró y no se propagó a donde se necesitaba.

**Recomendación.** Ver P-03: transcribir el archivo entero a §6.3, en estado
`INFERIDO`, con una línea por función. Y correr el 108 igual —una fórmula del
cliente no reemplaza una medición— pero con la hipótesis correcta escrita en el
contrato: `40V − 20`, ±20 dB, lineal.

### H-05 · MEDIA · «Refutado» mezcla dos cosas: lo que la pantalla muestra y lo que el audio hace

**VERIFICADO** lo que dicen los documentos 97 y 98; lo demás es **OPINIÓN**.

La medición 97 refutó `VtoTHRESH(a) = −90 + 96a` y `VtoRATIO(a) = 1/a`. Cómo:
suponiendo esas dos fórmulas **más una rodilla dura**, el exceso despejado
debería ser constante y no lo es. La 98 refinó: `−20·log₁₀(a)` es el techo de
la reducción, `E·(1−a)` una aproximación de rodilla, y el propio contrato de la
97 dice «nada del `softknee`, que queda en su valor y no se barre».

Lo que quiero señalar es una distinción que `raw-map.ts` no tiene y que
importa para el producto:

- `VtoTHRESH` es una **ley de presentación**: qué número muestra la interfaz
  oficial cuando el crudo vale `a`. Se verifica leyendo la pantalla, sin audio,
  en un minuto.
- «Con umbral −40 dB y relación 4:1 la señal se reduce X dB» es una **ley de
  comportamiento**: el modelo del DSP, con su rodilla —que la consola expone como
  `i.N.dyn.softknee` y estaba en un valor no controlado— y sus tiempos.

Que el comportamiento no siga a «presentación + rodilla dura» no refuta la
presentación. Puede refutar la rodilla dura. Para el producto, la ley de
presentación es la que hace falta primero: es lo que le permite a la aplicación
decir «te pongo el umbral en −40» y que la pantalla de la consola diga −40, que
es lo que el operador va a mirar para confiar. La de comportamiento es lo que
hace falta para *automatizar* el compresor, y ésa sí requiere la superficie.

**Recomendación.** Separar los dos conceptos en `RawMapEntry` —o al menos en el
estado— para que `REFUTADO` diga qué se refutó. Y medir la presentación del
umbral, la relación, el ataque y la relajación leyendo la pantalla oficial con
crudos conocidos: es barato, no hace ruido, no planta filtros.

### H-06 · MEDIA · «Ítem 101» significa dos cosas distintas

**VERIFICADO.** `docs/backlog/03-orden-implementacion.md` numera 126 ítems: el
101 es «S-12.1c Test invariante INV-028». `docs/compromisos/101-las-curvas-del-ecualizador.md`
es otra cosa, numerada por el plan de la madrugada del 12. Los dos sistemas
conviven sin decirlo, y los documentos de la madrugada dicen «el ítem 101»,
«la 104», «el 108» sin calificar.

**Recomendación.** Renombrar los contratos con un prefijo propio (`C-101`) o
mover la numeración de la madrugada a un índice en `docs/compromisos/README.md`
que diga de dónde salen los números. La carpeta no tiene README ni plantilla, y
es la que más creció.

### H-07 · MEDIA · La documentación creció más rápido que su mapa

**VERIFICADO.** En tres días aparecieron seis carpetas o familias nuevas:
`docs/compromisos/` (21), `docs/pedidos/` (9), `docs/referencia/`,
`docs/inventario/`, `docs/backlog/hallazgo-*.md` (15 archivos sueltos) y
`docs/backlog/auditorias/10x-*.md`. `docs/README.md` tiene una sección «Para
arrancar» que mezcla el plan histórico con tres hallazgos puntuales, y los otros
doce hallazgos no están en ningún índice.

Hay además tres documentos de «lo que dijo el usuario» y de «plan / resumen de
la madrugada» que son **el registro más valioso del proyecto** —son los únicos
que permiten auditar la interpretación— y viven en una carpeta llamada
`pedidos`, sin índice propio, sin plantilla, y sin que la skill los mencione.

**Recomendación (OPINIÓN), propuesta concreta en §6.**

### H-08 · MEDIA · La búsqueda de trabajo previo fue un evento, no un método

**VERIFICADO.** `docs/spikes/SPK-P0.2a/evidence/trabajo-previo-2026-09-09.txt`
empieza con «el usuario preguntó si se habían mirado los repositorios… la
respuesta honesta era NO». Se buscó ese día, se encontró material bueno, se
corrigió un byte de la cabecera de `VU2`. Y ahí quedó: un archivo de texto en
la carpeta de evidencia de un spike, citado desde un solo lugar.

- La plantilla de spike (`docs/spikes/TEMPLATE.md`) no tiene un paso de
  «trabajo previo consultado».
- Los 21 contratos de `docs/compromisos/` tampoco: cada uno arranca desde la
  hipótesis del código.
- La regla «buscá trabajo previo antes de decodificar a mano» está en la skill
  `vse-disciplina` —y la skill también dice que una regla que depende de que
  alguien se acuerde no es una guarda.
- Ninguno de los seis proyectos que ese archivo nombra fue vuelto a mirar
  cuando aparecieron las preguntas de los días 11 a 13. Ninguno de los treinta
  que no nombra fue mirado nunca.

**Recomendación.** P-01 y P-02.

### H-09 · BAJA · Cifras a mano que ya se movieron

**VERIFICADO.**

- El resumen del 13 dice «1128 tests». Medido: 1055 + 48 + 23 = **1126**. No
  importa cuál es el número correcto: importa que el README tiene razón en no
  escribirlo, y el resumen no.
- El README dice «0 de 22 spikes»; hay 23 charters.
- `docs/backlog/README.md` dice «los cuatro informes completos» en
  `auditorias/`; hay seis, más éste.

### H-10 · MEDIA · Un «competidor» que escribe rutas que no existen

**VERIFICADO** contra el inventario del proyecto. `AlexandreCalmonJr/SoundMaster_IA`
es lo más parecido a este proyecto que hay en GitHub: asistente con IA para
Ui24R, auto-EQ, detector de realimentación, presets por voz. Su
`mixer-actions.js` manda `SETD^i.N.eq.band.X.freq`, `SETD^i.N.gate.on`,
`SETD^i.N.gate.thr`, `SETD^i.N.eq.hpf.on`, `SETD^m.eq.band.X.gain`. En las
6 732 claves observadas en la consola real **no existe ninguna de esas
rutas**: la consola usa `i.N.eq.b1.freq`, `i.N.gate.enabled`, `i.N.gate.thresh`,
y el general no tiene `m.eq.band`.

**Por qué lo anoto.** Primero, como validación de la regla 1 del proyecto: ese
código se ve funcional, tiene tests, y contra la consola no hace nada, o hace
otra cosa. Segundo, como advertencia para P-01: «trabajo previo» no es «copiar»;
es «hipótesis con procedencia, después medir». La Ui16 de la referencia de
Skaarhoj tampoco es una Ui24R.

### H-11 · MEDIA · ADR-028 abre 240 rutas con una ley medida en un canal y un auxiliar

**VERIFICADO** que el ADR lo declara. Lo agrego porque lo que encontró la
referencia de Skaarhoj (§5, INFERIDO) lo vuelve más importante: **la consola no
valida ni recorta lo que se le escribe**. `SETD^i.0.mix^1.5` y `^-0.2` quedaron
almacenados tal cual en una Ui16; `mute^2` también. Si la Ui24R hace lo mismo,
la única guarda contra un envío fuera de rango es la aplicación. `aRaw()`
rechaza con `FUERA_DE_RANGO`, así que hoy está cubierto; conviene que un test lo
fije con un valor fuera de [0, 1] a propósito, y que la fase 2 lo verifique en
la Ui24R.

### H-12 · BAJA · Cosas que el proyecto sabe y no conectó

**VERIFICADO.** Tres ejemplos, del mismo tipo que H-04:

- SPK-P0.7a pregunta «¿existe selección de sesión y posicionamiento por
  protocolo?» con las celdas vacías. La evidencia del manual 3.5
  (`manual-tecnico-fw-3.5.8328.txt`) lista `MTK_SELECT` y `MTK_JUMP_TO`, y el
  inventario del 11 tiene `var.mtk.currentTrackPos`, `var.mtk.session` y
  `var.mtk.soundcheck` observadas en la consola.
- `hallazgos-del-manual.md` deja «sigue sin medirse cuál de los tres valores de
  `m.afs.fmode` es cuál». El cliente oficial tiene las tres etiquetas
  (`LIVE`, `FIXED`, `LOCK`) y el código que las asigna; se puede leer el orden
  sin medir, y después confirmarlo con una medición de un minuto.
- El anexo A de la auditoría técnica original ya tenía `var.mtk.soundcheck`
  como CONFIRMADO desde `soundcraft-ui`, y P0.7a no lo cita.

---

## 4. Trabajo previo: qué hay publicado y qué vale cada cosa

Treinta y seis repositorios clonados y leídos el 2026-09-15 (Anexo A tiene la
lista completa con lo que es cada uno). Acá van los que cambian algo para este
proyecto, ordenados por lo que aportan. **Todo lo que sale de ellos es
INFERIDO.**

### 4.1 Copias completas del cliente oficial de la consola

Tres repositorios guardan el JavaScript entero del `mixer.html` que sirve la
consola: `ko7m/SoundcraftUI24R` y `enkayz/ui24r` (de 2018–2019, un firmware
viejo) y `arregloskati-hash/Ui24r_Custom_Layout` (2026, un cliente mucho más
grande, con automix, de-esser y las claves `var.mtk.*` de la 3.x).

**Para qué sirven.** El proyecto ya extrajo 121 líneas del cliente de su propia
consola. El cliente completo tiene, además de las conversiones, **el
decodificador de `VU2` y de `RTA`, la lógica de patcheo del soundcheck, el manejo
del supresor y el listado de todos los verbos que la consola acepta**. Y como el
usuario tiene la consola, lo correcto es extraer el cliente completo de ella
(firmware 3.4.8318) y archivarlo con su `sha256`, como ya se hace con las
constantes; las copias públicas sirven para comparar entre firmwares.

**Lo que ya se pudo leer ahí** (INFERIDO, contra la copia de 2026):

- Todos los verbos que el cliente manda. Los que el `protocol-spec.md` no
  lista están en el Anexo B. Entre ellos, para las preguntas abiertas:
  `MTK_SELECT^<sesión>`, `MTK_JUMP_TO^<posición>`, `MTK_GET_SESSIONS`,
  `MTK_GET_FILES`, `MTK_REC_SET_SESSION`, `MEDIA_JUMP_TO^<posición>`,
  `MEDIA_SWITCH_PLIST`, `AFSLOADCHAN`, `AFSUPDATEVAR`, `SAVESHOW`,
  `RENAMESNAPSHOT`, `USBMOUNTS`, `PRESETLIST`/`READPRESET`/`WRITEPRESET`.
- **Y tres que no hay que mandar nunca desde un guion**: `MIXER_RESET`,
  `DELETESHOW`, `DELETESNAPSHOT` fuera del show `VSE`. Conviene que el
  transporte del adaptador los rechace por lista negra, no por costumbre.
- El modo soundcheck es una clave, no un verbo: `SETD^var.mtk.soundcheck^0|1`.
  Y la fuente de cada canal en soundcheck es `i.N.scsrc` con valores `none`,
  `ua.N` (y `ub.N` en un modo de prueba de ruteo), contra `i.N.src` = `hw.N` o
  `li.N` fuera de soundcheck. El cliente **bloquea el patcheo mientras el
  multipista está ocupado** (`PATCHING_DURING_MTK`).
- Las etiquetas `LIVE`, `FIXED`, `LOCK` del supresor existen en el cliente; el
  orden que asigna a `m.afs.fmode` se lee del código.

### 4.2 Una referencia de protocolo verificada en hardware, escrita por otro agente

`collisterumc/skaarhoj_soundcraft` tiene un `IMPLEMENTATION.md` de 92 KB con
una sección de «resultados de validación del protocolo» contra una **Ui16**,
firmware 1.0.7548, el 2026-08-23, con cada prueba capturada y restaurada. **Es
otro modelo y otro firmware**: nada de esto vale para la Ui24R sin medirlo. Pero
son hipótesis mucho mejores que ninguna, y varias contestan preguntas abiertas
de SPK-P0.1 y SPK-P0.9:

| Lo que midió en la Ui16 | Pregunta del proyecto a la que apunta |
|---|---|
| **Un corte de energía es una caída silenciosa**: sin FIN ni RST, el socket queda `ESTABLISHED`, sólo un plazo de lectura lo nota. Cuatro cortes de red eléctrica | P0.1, modo «router apagado» |
| Un cliente que no manda nada se cierra a los 19,4 s; `ALIVE` cada 1 s sobra | P0.1, ciclo de vida |
| **La consola no valida ni recorta**: `i.0.mix^1.5`, `^-0.2` y `mute^2` quedan almacenados tal cual | INV-004, H-11 |
| Los flotantes se guardan a ~9 decimales | Confirmación por testigo: comparar con tolerancia |
| Comandos desconocidos y rutas inexistentes se ignoran en silencio, sin error | Todo guion que «espera respuesta» |
| **`MSG^$SNAPLOAD^<snap>` es un acuse que sólo recibe quien mandó `LOADSNAPSHOT`** | P0.8 y P0.9: hay una confirmación de recall que el proyecto no usa |
| Un recall difunde ~140 claves en la Ui16, como delta, no volcado | P0.9, umbral de avalancha |
| Lo que la consola genera sola —`var.currentSnapshot`, `var.isRecording`— **sí** le llega a quien mandó el comando; el no-eco es sólo para el `SETD` exacto que uno escribió | ACK-POLICY, matiz sobre «no hay eco» |
| Sin volcados espontáneos en 120 s ni al entrar/salir otro cliente; una corrida vio líneas del volcado a los 12 s de conectar | P0.1, «fin del volcado» |
| Ninguna línea lógica se parte entre tramas | `transport.ts` |
| `type^8ch` no es la cantidad de entradas | `capability-matrix.md` cita `type=8ch` |
| `LOADSNAPSHOT` pisa el estado vivo no guardado | Advertencia §8 |

### 4.3 El formato de las instantáneas, resuelto por dos proyectos

`dmotte/ui24rsc` (firmware 3.3) y su bifurcación `HighTechHarmony/SoundcraftUiSC`
(firmware 3.5) convierten entre el JSON «offline» que baja la interfaz y los
`.uisnapshot` / `.uishow` del USB. **Aportan dos cosas que P0.8 necesita:**

1. **Qué guarda una instantánea, clave por clave.** Un `.uisnapshot` de ejemplo
   tiene 6 451 líneas `clave=valor` con MD5 al pie. Contiene las once claves
   `m.afs.*` —incluida `m.afs.enabled`—, `hw.N.phantom` y `i.N.phantom`, y
   **ninguna** `var.*` ni `settings.*`. El proyecto midió que un recall **no**
   devuelve `m.afs.enabled`; el archivo dice que la instantánea **sí** la
   guarda. Son dos cosas distintas —guardar y aplicar— y esa diferencia es una
   pregunta concreta para la fase 2.
2. **Un estado de fábrica completo con valores**: `default-init.yml`, 6 495
   hojas, exportado del `* Init *` del show `Default` en 3.3. Es la referencia
   de «cómo viene la consola» que el proyecto no tiene, y sirve para distinguir
   un valor que el usuario tocó de uno que nunca se tocó.

### 4.4 El formato del soundcheck virtual

`Ultchad/ui24-session-builder` documenta el `.uirecsession` (JSON: `files`,
`names`, `mapping` = `i.0`…`i.21`, `sampleRate` 48000, `lengthSamples`,
`ext` = `.flac`) y genera carpetas de sesión que la consola carga. Y
`othmar52/ui24r-paramrecorder` hizo hace seis años lo que el paso 14 del MVP
promete: grabar con marca de tiempo cada cambio de parámetro mientras
`var.mtk.rec.busy` está en 1, y anota que el multipista graba **las entradas
crudas, sin ningún procesamiento** —un canal silenciado no queda en silencio
en la pista.

### 4.5 La biblioteca del ecosistema, y lo que este proyecto ya sabía de ella

`fmalcher/soundcraft-ui` (v7, activa, última actualización 2026-09-09). El
proyecto la auditó al principio (anexo A) y decidió no usarla. Tres cosas que
vale la pena tener a mano igual:

- Su conversión de fader es **exactamente** `VtoLIN` del cliente oficial, con
  inversión por Newton. Coincide con `conversiones.ts`.
- Documenta los `.uisnapshot`, el reproductor (`MEDIA_JUMP_TO`, listas), el
  multipista (`soundcheck$`, `activateSoundcheck()`), el automix (respuesta
  20–4000 ms por `0,02 + 3,98·v^3,0517`, que es `VtoVMIX_TIME` del archivo del
  proyecto), el retardo (250/500 ms) y la ganancia de previo (−6…57 dB, con la
  advertencia de que «la conversión de la interfaz original no es exacta»).
- Advierte que **guardar una instantánea sobreescribe sin confirmación**.

### 4.6 Lo que confirma lo ya medido

- `MatthewInch/UI24RBridge` y `jskeet/DemoCode` (DigiMixer): la cabecera de
  `VU2` con generales en el byte 5 y líneas en el 6; ya incorporado el
  2026-09-09. DigiMixer recorta el medidor en 240 con un comentario que duda de
  sí mismo; el proyecto midió 255. Correcto no usarlo.
- `othmar52/ui24r-light`: reimplementa el decodificador de `VU2` con el mismo
  formato de bloques. `jonathanslenders/ui24r-client`: cliente Python con
  suscripción por clave; nada nuevo sobre conversiones.

### 4.7 Lo que no está en ningún lado

Confirmado buscando en los treinta y seis y en GitHub por código: **nadie
publicó** la ley del medidor en decibeles, el techo real del medidor, el
analizador como espectro de 122 bandas, la confirmación por testigo, ni las
leyes medidas de envío y fader de bus. Eso es de este proyecto, y vale.

**Tampoco está publicado el documento oficial del protocolo.** Jon Skeet cuenta
en su blog que Tom Der (Soundcraft) se lo mandó «sin soporte oficial», y que hay
una versión más nueva en un grupo de programadores de Crestron. El hilo de
`groups.io/g/crestron` está detrás de un registro. Pedirlo cuesta un correo.

---

## 5. Hipótesis concretas para las preguntas abiertas

Una fila por pregunta. La columna «Cómo verificar» es lo que propongo para la
fase 2; los tiempos son estimaciones mías (OPINIÓN).

| # | Pregunta abierta del proyecto | Hipótesis (INFERIDO, fuente) | Cómo verificar en la Ui24R | Costo |
|---|---|---|---|---|
| 1 | Ganancia del ecualizador de canal (ítem 108) | `40V − 20` dB, ±20, lineal (cliente oficial; manual; 101 vio +20,0) | Escribir crudos 0, 0,25, 0,5, 0,75, 1 en `i.9.eq.b1.gain` y leer la pantalla oficial: −20, −10, 0, +10, +20. Después el multitono del 108 para la ley de comportamiento | 10 min + 6 min |
| 2 | Unidad de `m.delayL/R`, `a.N.delay`, `i.N.delay` | Crudo en **segundos**; canal hasta 0,25, aux y general hasta 0,5 (cliente oficial `VtoLATENCY`; `soundcraft-ui`) | Escribir 0,1 y leer «100,0 ms» en la pantalla; medir con el bucle el corrimiento entre general y aux con 0 y 0,1 | 15 min |
| 3 | Tiempos de compresor y puerta | `400^desqr(v)`, `10·200^desqr(v)`, `5·400^desqr(v)`, `2000^desqr(v)` ms con `desqr(v)=1−(1−v)²` (cliente oficial) | Presentación: leer la pantalla en 5 crudos. Comportamiento: después de la ley estática, como dice `las-leyes-del-compresor-no-se-conocen.md` | 10 min |
| 4 | Umbral y relación del compresor | Presentación: `−90 + 96V` y `1/V` (tope 50:1 → crudo 0,02). Comportamiento: rodilla por `softknee` sin controlar | Leer la pantalla con crudos conocidos, y barrer `softknee` en 0 y 1 antes de repetir la superficie | 10 min + una corrida |
| 5 | Puerta: umbral y profundidad | Presentación `96V − 90` y `60V − 60`; el manual dice −inf en el extremo, así que el cliente probablemente muestre «−inf» en 0 | Leer la pantalla en 0 y 0,01 | 5 min |
| 6 | `m.afs.fmode`: cuál es LIVE, FIXED, LOCK | El cliente asigna las etiquetas por índice; se lee sin medir | Leer el código del cliente propio; confirmar con un tono corto en cada modo, con el supresor restaurado después | 15 min |
| 7 | P0.7a: selección de sesión y posicionamiento | `MTK_SELECT^<sesión>`, `MTK_JUMP_TO^<segundos>`; estado en `var.mtk.session`, `var.mtk.currentTrackPos`, `var.mtk.currentState` (cliente oficial; manual 3.5) | Con el pendrive y una sesión grabada: mandar los dos verbos y leer las tres claves | 20 min |
| 8 | P0.7a: entrar y salir del soundcheck, y qué pasa con el canal en vivo | `SETD^var.mtk.soundcheck^1`; la fuente pasa de `i.N.src` a `i.N.scsrc` = `ua.N`; con `none` el canal queda en silencio | Activar por protocolo, leer `scsrc` de todos los canales, verificar que un canal con fuente en vivo cambia de fuente | 15 min |
| 9 | P0.6: el reproductor como generador | `MEDIA_JUMP_TO^<segundos>`, `MEDIA_PLAY/PAUSE/STOP`, `MEDIA_SWITCH_PLIST^<lista>`, `var.currentTrackPos` | Igual que 7, con el reproductor | 20 min |
| 10 | P0.8: qué guarda una instantánea vs qué aplica un recall | El archivo guarda `m.afs.enabled`; el recall no la aplica (medido). Falta saber si `hw.N.phantom` está en el archivo (sí, INFERIDO) y si el recall la aplica | Exportar una instantánea a USB, leer el `.uisnapshot`, comparar contra el alcance medido | 20 min |
| 11 | P0.8/P0.9: confirmación de un recall | `MSG^$SNAPLOAD^<snap>` le llega sólo al emisor (Ui16) | Mandar `LOADSNAPSHOT` desde la principal y mirar qué recibe la principal y qué el testigo | 5 min |
| 12 | P0.1: router apagado | Caída silenciosa; sólo un plazo de lectura la detecta (Ui16, con corte de energía) | Apagar el router con la app conectada; medir cuánto tarda el adaptador en declarar inestable con el umbral de 300 ms | 20 min |
| 13 | P0.1: fin del volcado | No hay marcador; la Ui16 tardó 0,2–0,55 s y una vez 12 s | El proyecto ya usa `volcadoIniciado()`; verificar el peor caso repitiendo diez conexiones | 15 min |
| 14 | INV-004: ¿la consola recorta? | No (Ui16): guarda 1,5 y −0,2 tal cual | En un canal sin fuente, escribir `i.9.mix^1.5`, leer por HTTP, restaurar. **Nunca** en `hw.N.gain` ni con parlantes conectados | 5 min |
| 15 | Confirmación por testigo: latencia | 41–75 ms en la Ui16 entre clientes | Ya medido en la Ui24R (11,5 ms de mediana). Sólo anotar que es otro modelo | — |

Las filas 1 a 6 son **lecturas de pantalla**, sin audio: no plantan filtros en
el supresor, no necesitan bucle, y cierran la mitad «presentación» de cinco
leyes en una hora. Las filas 7 a 9 necesitan el pendrive. Las 10 a 14 son de
protocolo puro.

---

## 6. Recomendaciones

### 6.1 De proceso

**P-01 · Un catálogo vivo de trabajo previo.** `docs/trabajo-previo.md`, con una
fila por proyecto: qué es, firmware o modelo con el que se probó, commit o
`sha256` de la versión leída, qué contesta y qué contradice. El Anexo A de este
documento es el borrador. La regla de procedencia va en el encabezado: todo lo
que sale de ahí es `INFERIDO`.

**P-02 · «Trabajo previo consultado» como sección obligatoria** en
`docs/spikes/TEMPLATE.md` y en la plantilla que le falta a `docs/compromisos/`.
Tres líneas: qué se buscó, qué se encontró, qué hipótesis entra al contrato con
su fuente. Y que `validate-fichas.mjs` —o un validador nuevo— exija la sección,
igual que se exige la evidencia. Una sección vacía se llena con «nada aplicable»
y queda dicho.

**P-03 · Promover el cliente oficial a fuente de primera clase.** Extraer de la
consola del usuario el `mixer.html` y sus scripts completos, archivarlos con
`sha256` en `docs/inventario/<firmware>/cliente/`, y transcribir **todas** las
funciones `Vto*`/`*toV` a `protocol-spec.md` §6.3 con estado `INFERIDO`. El
validador de constantes ya compara contra una transcripción literal; se extiende.
Esto solo cierra H-04 y H-12 y deja el ítem 108 con la hipótesis correcta.

**P-04 · Separar presentación de comportamiento en `RawMapEntry`.** Dos leyes
por parámetro donde corresponda: la que muestra la pantalla —que se verifica
leyendo— y la que hace el audio —que se verifica midiendo—. `REFUTADO` tiene
que decir cuál de las dos.

**P-05 · Un gancho `pre-push` con `validate:docs`.** Tarda segundos y habría
frenado H-02. El proyecto ya tiene la infraestructura de ganchos y la
justificación escrita: «una comprobación que llega después del hecho es un
reproche, no una guarda».

**P-06 · Lista negra de verbos en el transporte.** `MIXER_RESET`, `DELETESHOW`,
`DELETESNAPSHOT` fuera del show `VSE`, `RENAMESHOW`, `IMPORTSHOW`, `SWAPUSB`.
Que el adaptador los rechace antes de que lleguen al socket, con test. La única
prohibición absoluta del usuario —no borrar sus instantáneas— hoy depende de
que cada guion la respete.

**P-07 · Un solo registro de decisiones pendientes del usuario.** Hoy están
repartidas entre el resumen de la madrugada, ADR-029, `decision-bajar-buses…` y
`00-lo-que-dijo-el-usuario.md`. Una tabla en `docs/pedidos/README.md` con
pregunta, opciones, fecha en que se hizo y estado, es lo que el usuario puede
mirar en dos minutos antes de una sesión.

### 6.2 De organización de la documentación (OPINIÓN)

La estructura creció por acumulación y hoy hay cuatro lugares donde puede vivir
un hallazgo. Propuesta, sin mover evidencia ni romper enlaces (los archivos se
mueven con un `git mv` y los enlaces se corrigen con el validador de
identificadores como red):

```
docs/
  README.md                 ← el mapa, con UNA tabla por carpeta
  estado.md                 ← NUEVO: qué escribe hoy la app, qué leyes están medidas,
                              qué espera del usuario. Se regenera a mano en cada PR
                              y validate-numeros comprueba sus cifras contra el código
  alcance-mvp.md · protocol-spec.md · capability-matrix.md · safety-invariants.md · …
  adr/                      ← igual
  spikes/                   ← igual
  compromisos/              ← + README.md con índice y origen de la numeración, + TEMPLATE.md
  pedidos/                  ← renombrar a `usuario/`: lo-que-dijo, decisiones-pendientes, planes y resúmenes por fecha
  hallazgos/                ← NUEVO: los 15 `backlog/hallazgo-*.md`, con índice por estado (abierto / cerrado / retractado)
  referencia/               ← + cliente oficial archivado (P-03) + trabajo-previo.md (P-01)
  inventario/               ← igual
  backlog/                  ← sólo lo histórico: plan, auditorías originales, orden. Con una nota al tope: «superado por alcance-mvp.md el 2026-09-11»
  field/ · gates/ · visual/ ← igual
```

Y la skill `vse-experto` se reescribe contra `docs/estado.md`, no contra su
propia memoria.

### 6.3 De numeración

**P-08 · Un prefijo para los contratos.** `C-101`, o la fecha: `2026-09-13-101`.
Y una línea en `docs/compromisos/README.md` que diga que el 101 del plan de la
madrugada no es el 101 del orden de implementación.

---

## 7. Plan propuesto para la fase 2 (con la consola)

Orden por lo que desbloquea, no por lo fácil. Precondiciones de siempre:
`m.afs.enabled` leído y apagado antes de cualquier tono, restauración por
`try/finally` comprobada por HTTP, nada conectado a los parlantes, y **cada
corrida archivada con `medir.mjs`**.

| Orden | Qué | Por qué primero | Qué desbloquea |
|---|---|---|---|
| 1 | Filas 1–6 de §5: lecturas de pantalla con crudos conocidos | Una hora, sin audio, cero riesgo | La mitad «presentación» de EQ, compresor, puerta, retardos y supresor. Con eso la app puede **proponer** en unidades correctas |
| 2 | Ítem 108 tal como está, con la hipótesis `40V − 20` en el contrato | Ya auditado cinco veces; seis minutos de consola | El ecualizador de canal como parámetro escribible: 432 rutas, «el corazón del producto» |
| 3 | Fila 14: ¿la consola recorta? | Cinco minutos y cambia una guarda de seguridad | INV-004 verificada contra el aparato |
| 4 | Filas 10 y 11: instantáneas | Veinte minutos | P0.8 cerrado con la diferencia guardar/aplicar explicada |
| 5 | Filas 7–9: multipista y reproductor | Necesita pendrive con contenido | P0.7a y P0.6 contestados; el soundcheck virtual deja de ser incógnita |
| 6 | Fila 12: router apagado | Necesita a alguien junto al router | El segundo modo de corte de P0.1; G-A queda a un modo de cerrar |
| 7 | La superficie del compresor otra vez, con `softknee` controlado | Ya hay método y banco | La ley de comportamiento, que es la que automatiza |

Lo que **no** conviene hacer en la fase 2: repetir mediciones que ya cerraron
(el fader, la ganancia, la escala del medidor) «para estar seguros». Ya están
ancladas afuera. El tiempo de consola es el recurso escaso.

---

## 8. Advertencias

1. **`LOADSNAPSHOT` pisa el estado vivo no guardado** (INFERIDO, Ui16). Cualquier
   recall de prueba sobre una consola en uso borra lo que el operador movió y
   no guardó. Los guiones del proyecto guardan una instantánea antes; conviene
   que además **avisen** que van a hacerlo.
2. **La consola probablemente no recorta** (INFERIDO, Ui16). Un crudo fuera de
   [0, 1] en un fader es un valor desconocido en el audio. `aRaw()` protege
   hoy; que ningún guion de `tools/spikes/` escriba sin pasar por él.
3. **Tonos sostenidos con el supresor en modo FIXED plantan filtros
   permanentes.** Ya está escrito y ya pasó. Lo repito porque las lecturas de
   pantalla de §5 no lo necesitan, y es una razón más para hacerlas primero.
4. **Verbos destructivos existen y son una línea de texto.** `MIXER_RESET`,
   `DELETESHOW`. Ver P-06.
5. **El trabajo previo también se equivoca.** DigiMixer recorta en 240;
   SoundMaster escribe rutas inexistentes; la referencia de Skaarhoj es de una
   Ui16. Todo entra como hipótesis, y una hipótesis que coincide con la medición
   no se «confirma»: se mide igual.
6. **Nada de este documento autoriza a escribir en la consola.** El nivel de
   autonomía lo deciden las ADR y el usuario, como hasta ahora.

---

## 9. Límites de esta auditoría

- **No vi la consola.** Todo lo de §4 y §5 es lectura de código ajeno.
- **No leí el cliente oficial del firmware 3.4.8318 completo**, porque no está
  archivado; leí una copia de 2026 de firmware desconocido y dos de 2018–2019.
  Las funciones citadas en H-04 sí están en el archivo que el proyecto extrajo
  de su propia consola.
- **No leí el documento oficial del protocolo.** Está detrás de un registro.
- **No corrí `tools/visual/flujo.mjs`** ni capturas: la parte visual queda sin
  auditar.
- `npm run lint` corrió al final: **en verde**, chequeo de tipos de los
  paquetes, de `tools/` y compilación de la aplicación.
- Los tres validadores en rojo de H-02 se comprobaron también sobre `main`,
  donde los tres pasan.
- La cantidad de repositorios (36) es la que dio la búsqueda de GitHub por
  `ui24r` y `soundcraft ui` el 2026-09-15; puede haber más con otros nombres.
- De §10, leí el código de M32LiveConsoleTool, SoundMaster IA, FxNorm-automix,
  automix-toolkit, Diff-MST y el tutorial; de AutoMix y Mixing Station sólo sus
  páginas; de los papers de §10.3 sólo el catálogo, no los textos; y el PDF de
  *Ten Years of Automatic Mixing* no pude extraerlo en este entorno.

---

## 10. Proyectos afines y referencias profesionales

Agregado el 2026-09-15 a pedido del usuario, después de la primera entrega.
Lo que sigue sale de **leer el código** de cada proyecto, no su portada; donde
sólo pude leer la portada, lo digo. Todo es **INFERIDO** salvo lo que se
comprobó contra el inventario de claves de la consola.

### 10.1 Sobre la Ui24R: nadie está haciendo lo mismo

**`AlexandreCalmonJr/SoundMaster_IA`** es lo más parecido que existe, y
conviene entender bien qué es y qué no.

*Qué dice ser.* Un «ecosistema inteligente» para técnicos de sonido de iglesias
y eventos, en portugués. Electron + Node + Python. Un solo commit, del
2026-08-12 —probablemente importado de un repositorio privado—, y la portada lo
declara «Beta ativa».

*Qué promete.* Control de la Ui24R; presets de voz por IA («predicador», «voz
femenina») con ecualizador, pasa-altos y compresor; RT60 por Sabine/Eyring y por
barrido; STI según la norma IEC 60268-16; mapa de calor 3D de la sala; auto-EQ
contra una curva objetivo; detector de microfonía; automix Dugan; chat con un
modelo de lenguaje local (TinyLlama, Llama 3.2 vía Ollama); comandos por voz;
túnel para control remoto; y drivers para Behringer X32 y Yamaha.

*Qué hace de verdad, leído el código.*

- **Escucha con el micrófono de la computadora**, por el navegador
  (`getUserMedia` y Web Audio). No usa los medidores ni el analizador de la
  consola: `VU2` y `RTA` no aparecen en ninguna parte de su código.
- **Escribe rutas que no existen.** Usa la biblioteca `soundcraft-ui-connection`
  pero manda texto crudo, y las rutas de ecualizador, puerta y compresor están
  inventadas: `i.N.eq.band.X.*`, `i.N.gate.on`, `i.N.gate.thr`, `i.N.eq.hpf.on`,
  `i.N.comp.*`, `m.eq.band.X.*`. **VERIFICADO** contra las 6 732 claves del
  inventario del 2026-09-11: ninguna de esas familias existe; la consola usa
  `i.N.eq.b1.freq`, `i.N.gate.enabled`, `i.N.gate.thresh`, `i.N.dyn.*`, y el
  general no tiene `m.eq.band`. Como la consola ignora en silencio lo que no
  reconoce, sus presets y su corte de microfonía **no hacen nada en una Ui24R**.
  Mi lectura: se desarrolló contra el X32 —donde el OSC sí es real— y su
  simulador, y la Ui24R se agregó por documentación.
- **El detector de microfonía es razonable en concepto**: un pico angosto y
  persistente sobre el piso local, una ventana de tiempo, una confianza que
  combina persistencia con un clasificador, y corre en **«modo sombra»**:
  propone un corte de −3 dB con Q 10 y lo marca `executable: false` con la
  leyenda «confirmar el origen antes de aplicar». Es el mismo espíritu que
  OBSERVAR → SUGERIR. Cuando sí corta, aplica −12 dB con Q 8 en el general.
- Tiene **deshacer** —guarda el ecualizador antes de cortar— pero **no** tiene el
  lazo medir → aplicar → volver a medir → revertir. Aplica y confía.
- Los tests corren contra mocks. No hay evidencia de hardware en el repositorio.

*Qué tomar.* Nada del protocolo. Sí, como hipótesis con origen, la parte de
acústica de sala: RT60 por barrido exponencial y deconvolución (Farina 2000),
integración inversa de Schroeder (1965), EDT/T20/T30, claridad C50/C80 y STI por
la función de transferencia de modulación (IEC 60268-16). Está bien citada en su
`ARCHITECTURE.md` y puede servir de referencia de implementación cuando llegue
la corrección de sala.

**Los otros dos con nombre de asistente son cáscaras.**
`amjplanejados-cyber/ui24-live-assistant` es una clase de 29 líneas
(`FeedbackKiller`) con los métodos vacíos; `brunosilvafreitas/soundcraft-ui-assist`
es un «project setup» de enero de 2026 sin código. De los cerca de cuarenta
repositorios sobre la Ui24R, todo lo demás es control remoto, MIDI, capas
visuales o formatos de archivo. **Nadie hace medición más corrección sobre esta
consola.**

### 10.2 Sobre otras consolas: uno muy afín, y dos productos comerciales

**`CristianMoresi/M32LiveConsoleTool`** (Midas M32 / Behringer X32, C#, junio
de 2026, MIT). Es el proyecto más cercano **en actitud** que encontré, aunque el
protocolo sea OSC. Corre tres automatizaciones sobre la mezcla en vivo:

| Módulo | Qué hace | Regla que vale la pena copiar |
|---|---|---|
| **AutoLeveler** | Mantiene cada canal y bus en un nivel objetivo, comparando una media móvil del medidor con el objetivo y moviendo el fader | Siete guardas **en orden** antes de actuar: posición del fader conocida; silencio respetado; período de estabilización tras un cambio manual; detección de cambio manual nuevo; compuerta de silencio; límite de caída («una caída grande es un corte intencional, no deriva»); umbral de acción. La corrección se limita en pendiente antes de escribirse |
| **AntiClipper** | Cuando un canal satura de forma confirmada, **baja** la ganancia en el previo | **Sólo atenúa; nunca sube por su cuenta.** Aplica en la grilla real de la consola (0,5 dB en el previo, 0,25 en el trim). Si la ganancia ya está en el mínimo físico y sigue saturando, avisa **una vez** en vez de seguir «corrigiendo» |
| **DelayController** | Sincroniza los delays de efectos al tempo | Pregunta a la consola qué efecto hay en cada slot antes de escribir, para escribir en el parámetro correcto |

Los parámetros por defecto, que son decisiones de producto explícitas: ventana
del medidor 2 500 ms; umbral de acción 3 dB; pendiente 0,5 dB por segundo en los
dos sentidos; límite de caída 8 dB; ciclo de 100 ms; 4 000 ms de estabilización
después de un movimiento manual; 2 000 ms de captura del objetivo inicial («el
soundcheck»); anti-clip en pasos de 3 dB, máximo 6, dos muestras de confirmación
y 2 000 ms de enfriamiento.

Y tres decisiones de diseño que hablan directo al nivel AUTOMÁTICO CONTROLADO de
este proyecto: **se retira en cuanto el ingeniero toca ese fader** y vuelve sólo
cuando el fader se asentó y hay señal real («para no confundir silencio con el
nuevo objetivo»); distingue sus propias escrituras de los movimientos manuales
suscribiéndose a la realimentación de parámetros de la consola —que es lo que
este proyecto resolvió con el testigo—; tiene una **tecla de pánico** que
devuelve el control manual completo; y **no registra cada corrección** —hace
cientos por minuto— sino sólo los eventos de gestión, porque «un registro de tres
horas de show sería inmanejable». Trae simulador propio, y la capa de dominio
nunca toca la red.

**AutoMix** (`automix.live`, comercial, beta privada). «Ingeniero de sonido en
vivo con IA», sólo X32 por ahora, por OSC. Promete detección y eliminación de
feedback «en el momento en que empieza», ganancia y ecualización «aprendidas de
pistas de referencia», comandos por voz, y **monitores autoservicio: cada
músico ajusta el suyo desde el celular** — la misma idea que este proyecto
anotó el 2026-09-12 como pantalla por QR. Sin precio, sin empresa, sin detalles
técnicos de cómo escucha. Sólo pude leer su portada.

**Mixing Station** (`mixingstation.app`, comercial, madura, soporta la serie
Ui). Lo más parecido a producto terminado, y lo más honesto sobre sus límites:

- *Detección de feedback.* Elegís qué fuente del analizador mirar —típicamente
  un micrófono—; el analizador muestra **líneas amarillas en las frecuencias que
  infiere como feedback, y la altura de la línea es la confianza**. Un botón
  «Auto» baja las bandas del ecualizador gráfico que están acoplando. Sus
  propios documentos avisan que **«no está diseñado para usarse como
  destructor de feedback mientras suena música»**: es para hacer el ring-out en
  la preparación, y el modo automático se apaga solo al salir de la vista.
- *Auto EQ.* Micrófono de medición en un canal libre, ruido rosa, tres a cinco
  segundos, curva objetivo (con la posibilidad de una propia), ecualizador
  paramétrico o gráfico, y **el resultado se ajusta a mano antes de aplicarlo**.
  Leyenda: «no está pensado para reemplazar tus oídos» y «todavía en desarrollo».

**La propia consola** ya trae supresión automática de feedback (dbx AFS2), con
los modos LIVE/FIXED/LOCK que este proyecto está terminando de mapear.

**Automixers tipo Dugan** —decenas en GitHub, por ejemplo
`stoatworks-labs/mixerreturn` o `abelbour/automixer` en Csound— son otra cosa:
reparto automático de ganancia entre micrófonos de habla. No miden la sala ni
corrigen; no aplican a una banda.

### 10.3 La investigación: «automatic mixing» e Intelligent Music Production

Hay veinte años de investigación académica sobre exactamente los problemas de
este proyecto —nivel, ecualización, compresión, monitores, feedback—, casi toda
del grupo de Joshua Reiss en Queen Mary University of London, y está catalogada
en un solo lugar: `csteinmetz1/AutomaticMixingPapers` (89 papers, con categoría,
enfoque y enlace a código cuando existe). La síntesis es *«Ten Years of
Automatic Mixing»* (De Man, Reiss y Stables, 2017), que ordena el campo en dos
familias: **sistemas de reglas de oficio** («knowledge-engineered»: si el
instrumento es X, entonces…) y **sistemas que aprenden** de mezclas existentes.
No pude leer el PDF entero en esta sesión —el extractor de texto de este entorno
falló— así que no cito su contenido más allá del índice de la colección.

De los 89, éstos hablan directamente del oficio en vivo o de reglas explícitas.
Los títulos son exactos; el juicio sobre qué aportan es mío:

| Año | Trabajo | Para qué paso del MVP |
|---|---|---|
| 2008 | Perez Gonzalez y Reiss, *An automatic maximum gain normalization technique with applications to audio mixing* | Ganancia (paso 7) |
| 2009 | Perez Gonzalez y Reiss, *Automatic gain and fader control for live mixing* | Ganancia y fader, **en vivo** |
| 2009 | **Terrell y Reiss, *Automatic monitor mixing for live musical performance*** | **Envíos de monitor (paso 12)**: es literalmente el problema |
| 2009 | Perez Gonzalez y Reiss, *Automatic equalization of multichannel audio using cross-adaptive methods* | Ecualizador de canal (paso 10) |
| 2012 | Terrell y Sandler, *An offline, automatic mixing method for live music, incorporating multiple sources, loudspeakers, and room…* | El escenario: fuentes, cajas y sala en una sola cuenta |
| 2012 | Mansbridge, Finn y Reiss, *Implementation and evaluation of autonomous multi-track fader control* | Cómo se evalúa un fader automático |
| 2012 | Maddams, Finn y Reiss, *An autonomous method for multi-track dynamic range compression* | Compresor (paso 9) |
| 2013 | **De Man y Reiss, *A knowledge-engineered autonomous mixing system*** | **Las reglas de oficio, escritas y evaluadas.** La fuente que `orden-del-soundcheck.md` y `channel-profiles.md` necesitan |
| 2013 | Giannoulis, Massberg y Reiss, *Parameter automation in a dynamic range compressor* | Compresor: qué parámetro se automatiza y cómo |
| 2015 | Hafezi y Reiss, *Autonomous multitrack equalization based on masking reduction* | Ecualización entre canales que se tapan |
| 2015 | Wichern et al., *Comparison of loudness features for automatic level adjustment in mixing* | Qué medida de nivel usar para decidir un nivel |
| 2018 | Jiménez-Sauma, *Real-time multi-track mixing for live performance* (con código) | Lo único de la lista marcado en vivo y con código |
| 2018 | Moffat, Thalmann y Sandler, *Towards a semantic web representation and application of audio mixing rules* | Reglas de mezcla como datos, no como prosa |
| 2019 | Moffat y Sandler, *Approaches in Intelligent Music Production*; De Man, Reiss y Stables, *Intelligent Music Production* (libro) | Panorama |
| 2020 | Lefford, Bromham y Moffat, *Mixing with intelligent mixing systems: evolving practices and lessons from computer assisted design* | Cómo cambia el trabajo del ingeniero cuando hay un sistema al lado |
| 2021 | Lefford, Bromham, Fazekas y Moffat, *Context Aware Intelligent Mixing Systems* | El contexto —sala, banda, género— como entrada |

**Sobre feedback en particular**, la referencia estándar es van Waterschoot y
Moonen, *Fifty years of acoustic feedback control: state of the art and future
challenges*, Proceedings of the IEEE, vol. 99, n.º 2, pp. 288–327, 2011. Es la
revisión de cincuenta años de detección y supresión de acoples, con evaluación
comparativa. Los umbrales del detector de este proyecto están marcados como
«elegidos, no medidos»; ahí están los criterios con los que la literatura los
elige (según mi lectura previa del trabajo, no comprobada en esta sesión: razón
pico-a-armónicos, pico-a-vecinos, persistencia entre tramas del pico, desvío de
la pendiente entre tramas). Vale leerlo antes de calibrar.

### 10.4 Sony y el estado del arte con aprendizaje profundo

Es la línea más «profesional» en el sentido de documentación, código abierto y
método de evaluación. Ninguno es en vivo y ninguno habla con una consola. Lo
que aportan es otra cosa: **cómo se describe una mezcla con números, cómo se
codifican las reglas de oficio y cómo se evalúa un sistema que mezcla.**

**`sony/FxNorm-automix`** (Martínez-Ramírez, Liao, Fabbro, Uhlich, Nagashima y
Mitsufuji, ISMIR 2022, licencia MIT). Idea central: **normalización de
efectos**. Antes de entrenar, cada pista se lleva a un estado de referencia en
cinco dimensiones —reverberación, ecualización, compresión, paneo y sonoridad—
usando **el promedio de esas características por instrumento** sobre un
conjunto de datos (MUSDB18: voz, bajo, batería, otros). Publican esos promedios
(`features_MUSDB18.npy`), cuatro modelos preentrenados y, lo que más importa
acá, **rediseñaron el test de escucha** para evaluar sistemas de mezcla, con
ingenieros de mezcla muy experimentados como jueces, porque el método estándar
(MUSHRA) no sirve tal cual para esto.

**`csteinmetz1/automix-toolkit`** (Steinmetz, Apache 2.0). Los modelos de la
literatura implementados y entrenables: la **consola de mezcla diferenciable**
(DMC: ganancia, ecualizador y compresor como bloques derivables) y
Mix-Wave-U-Net; recetas para ENST-Drums, MedleyDB y DSD100; pesos en Hugging
Face; cuadernos de inferencia y evaluación.

**`sai-soum/Diff-MST`** (Vanka y Steinmetz, transferencia de estilo de mezcla,
licencia CC BY-NC-SA — **no comercial**). Además del modelo, trae en
`mst/mixing.py` una función `knowledge_engineering_mix`: **reglas de oficio por
instrumento** que asignan rangos de ganancia (±24 dB), un ecualizador de seis
secciones con sus frecuencias por banda (estante grave 20–2000 Hz, bandas
80–2000, 2000–8000, 8000–12000, 12000+ Hz, estante agudo desde 6 kHz), compresor
y paneo. Es la forma más concreta que encontré de «las reglas de oficio como
datos», que `channel-profiles.md` y `house-curves.md` hoy escriben a mano.

**El tutorial *Deep Learning for Automatic Mixing*** (`dl4am/tutorial`, ISMIR
2022; Steinmetz, Vanka, Martínez-Ramírez y Bromham, QMUL y Sony). Un libro web
en cinco partes: efectos de audio (paneo, ecualización, compresión,
reverberación), el problema de la mezcla automática y los cuatro métodos
(Mix-Wave-U-Net, DMC, FxNorm, Diff-MST), funciones de pérdida, implementación en
cuadernos, y **evaluación**. La parte 4 es la que este proyecto debería leer
entera: por qué MUSHRA no se recomienda tal cual (una mezcla comercial como
referencia no siempre puntúa alto; los estímulos de 12 segundos son demasiado
cortos para juzgar una mezcla) y cómo se arma un test de escucha para esto.

**Y una dirección reciente**: en la misma colección aparece `SonyResearch/LLM2Fx`
(2025): un modelo de lenguaje que propone parámetros de efectos. No lo leí; lo
anoto porque es exactamente la forma de «asistente que propone» de este
proyecto, con la diferencia de que acá la propuesta pasa por un motor de
seguridad y se mide.

### 10.5 Qué tomar de cada uno, y dónde encaja

| Fuente | Qué sirve | Dónde encaja | Riesgo |
|---|---|---|---|
| M32LiveConsoleTool | Las siete guardas ordenadas, la política de «sólo baja», la retirada ante el humano, la tecla de pánico, la política de registro | El nivel AUTOMÁTICO CONTROLADO; INV-004 y el acumulado por sesión; `autonomy-matrix.md` | Otro protocolo; parámetros calibrados para otra consola |
| Mixing Station | Confianza como altura de línea; «no mientras suena música»; el resultado del Auto EQ se edita antes de aplicar | La pantalla del detector de realimentación; el paso 10 del MVP | Producto cerrado: sólo se ve el comportamiento |
| AutoMix | Monitores autoservicio por celular | La pantalla QR de la banda | Sólo portada |
| Terrell y Reiss 2009 | Un método publicado para mezclar monitores automáticamente | Paso 12 del MVP, ADR-028 | Por leer |
| De Man y Reiss 2013; Moffat 2018 | Reglas de oficio escritas, evaluadas y en formato de datos | `orden-del-soundcheck.md`, `channel-profiles.md`, `house-curves.md` | Reglas de estudio, no de sala |
| van Waterschoot y Moonen 2011 | Los criterios estándar para decidir que un pico es feedback | Los tres umbrales «elegidos, no medidos» del detector | Por leer entero |
| FxNorm-automix | Promedios por instrumento como referencia; el diseño del test de escucha | `channel-profiles.md`; `protocolo-de-verificacion.md` | Estudio, no vivo; MUSDB18 no es una banda en una sala |
| Diff-MST | `knowledge_engineering_mix` como ejemplo de reglas codificadas | `packages/assistants` | Licencia no comercial: leer, no copiar |
| dl4am, parte 4 | Cómo evaluar con oyentes sin engañarse | El piloto de detección y los criterios de los controles G-C/G-D | — |
| SoundMaster IA | Acústica de sala bien citada | Fase de corrección de sala | Todo lo demás |

### 10.6 Una recomendación más

**P-09 · Lecturas obligatorias antes de diseñar cada pieza.** Una tabla en
`docs/referencia/README.md` —o en el `trabajo-previo.md` de P-01— que diga, para
cada pieza del MVP que todavía no se diseñó, qué hay que haber leído antes:
monitores → Terrell 2009; automatización → M32LiveConsoleTool y De Man 2013;
feedback → van Waterschoot 2011 y la documentación de Mixing Station; evaluación
→ dl4am parte 4 y el test de escucha de Sony. Con la misma regla que todo lo
demás: lo leído entra como hipótesis, y una hipótesis que coincide con la
medición se mide igual.

---

## Anexo A · Catálogo de proyectos públicos sobre la Ui24R

Leídos el 2026-09-15, clon superficial. «Aporta» es para este proyecto en
particular; un proyecto útil para otra cosa puede decir «nada».

| Repositorio | Qué es | Aporta | Ojo |
|---|---|---|---|
| `fmalcher/soundcraft-ui` | Biblioteca TS del ecosistema, v7, activa | Conversión de fader, retardos (ms/1000, topes 250/500), instantáneas, reproductor, multipista con `soundcheck`, automix, `VuProcessor` con `vuValueToDB` | Ya auditada en el anexo A original; el proyecto decidió no depender de ella |
| `arregloskati-hash/Ui24r_Custom_Layout` | Capa visual sobre el cliente oficial, 2026 | **Cliente oficial completo** (`dist/vendor-app.js`) con todos los verbos, `VtoEQGAIN20`, `afs.fmode`, `var.mtk.*` | Firmware de origen no declarado |
| `ko7m/SoundcraftUI24R` · `enkayz/ui24r` | Copias del cliente oficial, 2018–2019 | Cliente completo de un firmware viejo; sirve para diferenciar | Viejo |
| `collisterumc/skaarhoj_soundcraft` | Núcleo Go para controladores SKAARHOJ, 2026 | `IMPLEMENTATION.md` con validación de protocolo en hardware (§4.2) | **Ui16**, firmware 1.0.7548 |
| `jskeet/DemoCode` (DigiMixer.UiHttp) | Cliente C# por `GET /raw` | Cabecera de `VU2`; transporte HTTP | Recorta el medidor en 240 |
| `MatthewInch/UI24RBridge` | Puente MIDI en C# | Decodificador de `VU2` completo | Ya incorporado |
| `dmotte/ui24rsc` | Conversor de instantáneas JSON↔YAML, Python | `default-init.yml`: estado de fábrica con 6 495 hojas | Firmware 3.3.8293 |
| `HighTechHarmony/SoundcraftUiSC` | Bifurcación del anterior | `.uisnapshot` / `.uishow`, árbol `Exports/shows/`, MD5 al pie, ejemplos reales | Firmware 3.5.8328 |
| `Ultchad/ui24-session-builder` | Generador de sesiones multipista, Rust, 2026 | Esquema del `.uirecsession` | — |
| `othmar52/ui24r-paramrecorder` | Grabador de cambios de parámetro durante el multipista, Python | La idea del registro de cambios con marca de tiempo; el multipista graba crudo | 2020 |
| `othmar52/ui24r-light` | Interfaz alternativa en Vue | Decodificador de `VU2` reimplementado; lista de verbos entrantes | — |
| `jonathanslenders/ui24r-client` | Cliente Python asyncio | Suscripción por clave; ejemplo de `VU2` | Nada nuevo sobre conversiones |
| `stefets/osc-soundcraft-bridge` | Puente OSC, Python | Nada sobre conversiones | — |
| `bitfocus/companion-module-soundcraft-ui` | Módulo Companion | Usa `soundcraft-ui`; acciones de show y grabación | — |
| `eric-silverman/soundcraft-ui-swift` | Port Swift de `soundcraft-ui` | Nada nuevo | — |
| `Dennion/ioBroker.soundcraft` | Adaptador ioBroker | Usa `soundcraft-ui` | — |
| `NaturalDevCR/MyUiPro` | Envoltorio multiventana | Nada | — |
| `oliverhruby/ui24r-midi` | Controlador MIDI, TS | Nada sobre conversiones | — |
| `stevaedrum/ui2mcp` | Controlador MIDI en C para Raspberry | Nada | — |
| `AlexandreCalmonJr/SoundMaster_IA` | Asistente con IA para Ui24R, Electron + Python | Nada aprovechable: **escribe rutas que no existen** (H-10) | Advertencia |
| `CristianMoresi/M32LiveConsoleTool` | Automatización de mezcla en vivo para X32/M32 por OSC, C#, 2026 | El lazo de auto-nivel con sus siete guardas y el anti-clip que sólo baja (§10.2) | Otra consola |
| `sony/FxNorm-automix` | Mezcla automática con aprendizaje profundo, ISMIR 2022, MIT | Normalización de efectos por instrumento; test de escucha rediseñado (§10.4) | Estudio, no vivo |
| `csteinmetz1/automix-toolkit` | Modelos y datasets de mezcla automática, Apache 2.0 | Consola de mezcla diferenciable; recetas y pesos (§10.4) | Estudio |
| `sai-soum/Diff-MST` | Transferencia de estilo de mezcla, CC BY-NC-SA | Reglas de oficio codificadas en `knowledge_engineering_mix` (§10.4) | No comercial |
| `dl4am/tutorial` | Tutorial ISMIR 2022, QMUL + Sony | La parte 4, evaluación y tests de escucha (§10.4) | — |
| `csteinmetz1/AutomaticMixingPapers` | Catálogo de 89 papers de mezcla automática | Los quince trabajos de §10.3 | — |
| `amjplanejados-cyber/ui24-live-assistant` · `brunosilvafreitas/soundcraft-ui-assist` | Esqueletos de «asistente» | Vacíos | — |
| `martinsprengel/ui-doc` | «Documentación y migración» | Sólo el README | — |
| `electricsoldier96/ui24rtracksdocs` | Documentación de una app de pistas | Nada | — |
| `Sonkgs/ui24r-connect` · `Rasmaki/ui24r-socket` · `kempline/ui24r_tools` · `ndikanov/ui24` · `Oxocon/mixer` · `skullbooks/clui` · `MikaSappi/soundcraft-ui` · `ohnoitsalobo/soundcraft-ui` · `reinaldorodrigues/Soundcraft-Ui24R` · `brunogxp/ui24r` · `josecienty/ui-bridge` | Interfaces personalizadas, scripts sueltos | Nada | — |

**Vistos y no clonados**, por el nombre o la descripción: `dmotte`,
`Wolverine80/SoundCraftUIStreamDeck`, `tpxtron/scui-streamdeck`,
`doitwise-support/SoundcraftControl`, `KevinKickass/soundcraft-ui24-pipewire`
(reparte los 32 canales USB en pares para PipeWire —puede interesar a
SPK-P0.3b—), `HighTechHarmony` ya cubierto, y una decena de capas visuales más.

## Anexo B · Verbos que el cliente oficial conoce y `protocol-spec.md` no lista

INFERIDO, de la copia de 2026. Los que el proyecto ya cita quedan afuera. Los
marcados con ⚠ son destructivos.

```
Instantáneas y shows:  LOADSHOW SAVESHOW CREATESHOW RENAMESHOW ⚠DELETESHOW
                       SAVESNAPSHOT RENAMESNAPSHOT ⚠DELETESNAPSHOT
                       LOADCUE SAVECUE RENAMECUE ⚠DELETECUE
                       SHOWLIST SNAPSHOTLIST CUELIST IMPORTSHOWLIST IMPORTSHOW EXPORTSHOW
Presets:               PRESETLIST READPRESET WRITEPRESET RENAMEPRESET ⚠DELETEPRESET
                       IMPORTPRESETS EXPORTPRESETS
Multipista:            MTK_PLAY MTK_PAUSE MTK_STOP MTK_JUMP_TO MTK_SELECT MTK_RENAME ⚠MTK_DELETE
                       MTK_GET_SESSIONS MTK_GET_FILES MTK_REC_TOGGLE MTK_REC_STOP MTK_REC_PAUSE
                       MTK_REC_SET_SESSION MTK_REC_JUMP_TO
Reproductor:           MEDIA_PLAY MEDIA_PAUSE MEDIA_STOP MEDIA_NEXT MEDIA_PREV MEDIA_JUMP_TO
                       MEDIA_SWITCH_PLIST MEDIA_SWITCH_TRACK MEDIA_GET_PLISTS MEDIA_GET_PLIST_TRACKS
                       PLISTS PLIST_TRACKS UPDATE_PLAYLIST
Grabación 2 pistas:    RECTOGGLE
Supresor:              AFSLOADCHAN AFSUPDATEVAR
Sistema:               ⚠MIXER_RESET USBMOUNTS SWAPUSB SETTIME USERTIME NETCONFIG HIQNET_DISCOVER
                       IMPORTCONFIG EXPORTCONFIG RELOAD SERIAL VERSION IOSYS
Diálogos entrantes:    DLGSHOW DLGHIDE DLGRESULT TIMEDIALOG MSG BMSG
```

## Anexo C · Comandos ejecutados

```
git fetch --all --prune
git checkout -B claude/soundcraft-ui24-assistant-kh8ezj origin/fix/doble-de-transporte
npm install
npm run verificar      → EXIT 1 en validate-huerfanos (ADR-029 fuera del índice)
validadores sueltos    → fallan además validate-plantillas-llamadas y validate-limites; los tres pasan en main
npm test               → 1055 tests, 0 fallos
npm run test:dsp       → 48 tests, 0 fallos
npm run test:audio     → 23 tests, 0 fallos
npm run lint           → EXIT 0
```

Clones superficiales de los 36 repositorios del Anexo A en un directorio
temporal fuera del repositorio; no se versionó nada de ellos.
