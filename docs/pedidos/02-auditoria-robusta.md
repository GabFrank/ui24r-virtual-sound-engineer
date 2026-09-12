# Auditoría robusta del cuerpo de mediciones — 2026-09-12

El usuario dio permiso para parar y auditar «cuando creas conveniente». El
momento se eligió con una razón concreta: lo que seguía era el barrido en dos
dimensiones del compresor, que se apoya en la rodilla (0,530), la pendiente
(95,6) y la calibración del medidor de reducción. Si alguna de las tres está
mal, el barrido la hereda y multiplica el error por una dimensión más.

**Seis auditores, mandatos disjuntos, contexto fresco, sin tocar la consola ni
editar nada:** procedencia de cifras, aritmética y unidades, sobre-afirmación,
motor de seguridad, instrumentos de medición, coherencia cruzada.

## El resultado en una línea

**Los hallazgos no están donde yo los buscaba.** Fui a auditar si las
conclusiones de las mediciones eran sólidas, y las conclusiones aguantaron casi
todas. Lo que no aguantó fue el **andamiaje alrededor**: comentarios que
justifican, tablas de referencia, documentos de capacidad, y guiones que archivan
una corrida degradada sin chillar.

## Lo que aguantó, dicho primero

Para que nada de lo de abajo se lea como que la noche no sirvió:

- **La aritmética.** El auditor recalculó **44 cantidades** desde los crudos y
  coinciden: las quince filas de `faderADb` de la 94, los catorce desvíos, el
  máximo 0,31 en el último punto, los 27,87 dB, los +24,00 = 72 escalones
  exactos de la 95, la dispersión de 7,7 dB, los 0,25/0,23 de la 96b, la rodilla
  y la pendiente de la 97, los siete cocientes, el exceso despejado de 10,00 a
  25,62. **Y ningún número mágico**: los ocho guiones derivan el escalón en vez
  de escribirlo.
- **El ajuste de −20·log₁₀(a)** encaja dentro de 0,48 dB hasta a = 0,15, con el
  máximo real 0,478 cayendo exactamente en ese punto. Y está bien declarado
  como no-ley.
- **`calibrar-medidor-de-reduccion.ts` es el mejor instrumento de la tanda**:
  topología correcta, testigo quieto, y refutó la hipótesis de quien lo escribió.
- **Ninguna generalización del banco a la consola.** Los seis documentos llevan
  su sección de alcance y son explícitos. El único hueco es la última sección de
  la 97, que se quedó sin ella.
- **Ningún criterio movido después de ver los datos** en los seis documentos.
  Es el patrón que este cuerpo maneja mejor: la 94 pone «P1 quedó falsada por mi
  propio criterio» primero y el defecto del criterio después.
- **Los nombres de campo son todos correctos**, verificados contra el censo de
  claves, incluido `gate.thresh`.
- **ADR-028 distingue bien, una por una, qué es del usuario y qué del agente.**

## ALTA — puede hacer que alguien mida mal o escriba mal a la consola

### 1. El techo del medidor: cinco lugares dicen 239, y está refutado a 255

`docs/spikes/SPK-P0.10b/evidence/techo-medidor-2026-09-09.txt` existe **para
refutar exactamente eso**, y lo midió dos veces: la salida siguió creciendo
lineal 232 → 242 → 248 → 255. El 239 es donde satura la interfaz de audio, no el
medidor. Los bytes 240 a 255 son posiciones mayores que 1: de +0,02 a +5,0 dB.

Y sigue publicado en cinco lugares, dos de ellos con ✅:
`capability-matrix.md:99`, `SPK-P0.10b-vu2.md:26` y `:131-133`,
`guia-de-pruebas-manuales.md:57`, y **`packages/assistants/src/gain.ts:79-82`**,
que es código de producción justificando `TECHO_DEL_MEDIDOR_DB = 0` con una
medición retirada y heredando la conclusión falsa «no hay margen escondido
arriba». `dbDeMedidor` no recorta arriba, así que devuelve dB positivos que el
asistente de saturación no espera.

El propio `SPK-P0.10b-vu2.md` se contradice: la línea 220 dice «el techo real
del medidor: 255, no 239», ciento veinte líneas después de afirmar el 239 dos
veces.

Lo que lo habría impedido existe y no se usó: `validate-cifras-medidas.mjs`
guarda el 84,5 retirado y **no** guarda el 239.

### 2. Un guion puede encender el supresor que el usuario tenía apagado

`canal-muerto.ts:36-37`: `estadoPorHttp` devuelve un Map vacío ante cualquier
falla. Los cuatro guiones del compresor leen `m.afs.enabled` y **caen al valor
por omisión `'1'`**, imprimen «estaba en 1» como si lo hubieran medido, y al
restaurar **encienden** un supresor que podía estar apagado. Ninguno imprime
cuántas claves leyó, que es lo único que distinguiría una lectura vacía de una
lectura real.

Es el peor de la auditoría en términos de lo que le pasa al usuario: toca el
único de 45 campos que una instantánea no devuelve, y lo toca en la dirección
de encenderlo.

### 3. El defecto del `??` con cadena vacía sigue vivo, en el archivo que lo documenta

`ley-envio-aux.ts:52`: `Number(process.argv[6] ?? '-12')`. Con `''` da `Number('')
= 0`, o sea **tono a 0 dBFS, fondo de escala, 240 segundos**. Con un argumento
malformado da `NaN`, y `Buffer.writeInt16LE(NaN)` escribe 0 sin lanzar: el WAV
sale en silencio digital y el barrido entero mide el piso del bus.

La guarda que puse protege sólo la lista de puntos. Y después, con la fuente
muda, `:188-190` lanza `TypeError` **antes de restaurar**, dejando el envío
abierto y `afplay` sonando. **Ningún guion de la tanda tiene `try/finally`.**

Ninguno valida `canal`, `aux` ni `fx`. `aux=''` → `0` → **`a.0`, justo el bus que
el docblock del mismo archivo dice que invalida la medición** por el notch de
−18 dB en 999,97 Hz contra un tono de 1 kHz. Y nadie lee `a.<aux>.afs.enabled`
antes de medir.

### 4. Las leyes refutadas del compresor siguen implementadas y documentadas como verdad

- `packages/mixer-adapter/src/raw-map.ts:90` convierte `i.N.dyn.threshold` con
  `−90 + 96a`, con el comentario «las funciones **reales** están leídas del
  `mixer.html`». `:99-103` presenta `VtoRATIO = 1/a` como «su función **se
  conoce**».
- `protocol-spec.md:397` y `§6.3:652-653` las enuncian como verdad. «No probado»
  y «refutado» no son lo mismo, y el spec es el documento al que `raw-map.ts`
  remite.
- **Tres tests fijan el modelo refutado**: `raw-map.test.ts:34-58`, incluido uno
  que recorre `RAW_MAP` entero y convierte en contrato la ida y vuelta de la ley
  caída.

### 5. La matriz de capacidades tiene el orden viejo de la cola `VU2`

`capability-matrix.md:109` dice «línea, subgrupos, efectos, auxiliares y
general» con «línea de a 6». El orden real, que el código implementa y el spec
corrigió el 2026-09-09, es **reproductor** → subgrupos → efectos → auxiliares →
general → entradas de línea. Los dos rótulos que la matriz usa son los que se
retiraron. **Es el documento que haría leer el byte equivocado en la próxima
medición** — y saltearse la sección del reproductor es exactamente el error que
me costó una corrida anoche (leí el byte 247, el centinela de «sin reducción»,
como si fuera un nivel).

De paso el puntero está mal: dice §4.3 y el reparto está en §4.2.

### 6. El techo del motor de seguridad juzga un número que declara quien propone

`engine.ts:319` compara `magnitudPropuesta`; el ejecutor escribe
`valorPropuesto`/`valorEsperado`, que son crudos, y **nada ata los dos pares**.
Nada valida `c.unidad` contra `LIMITES[kind].unidad`. Demostrado por el auditor
ejecutando el motor: una escritura de **recorrido completo** (crudo 0 → 1)
aprobada bajo un techo de −6 dB, declarando magnitudes −31 → −30.

Hoy no es explotable porque ningún código de producción construye un
`MONITOR_AUX_SEND`. **Pero el llamador está en el plan**: la pantalla por QR
donde el músico solicita subir su retorno es exactamente ese llamador. Hay que
cerrarlo antes.

### 7. La lista blanca acepta una familia infinita, y un alias esquiva el techo

`engine.ts:308`: `/^i\.\d+\.aux\.\d+\.value$/`. Sin cota. Dieron PERMITIDO:
`i.24.aux.0.value` (canal fuera de rango), `i.99.aux.99.value`,
`i.03.aux.1.value`, `i.0003.aux.0000000001.value`.

Y lo grave: `techoPorRuta`, `acumuladoPorRuta` y `rutasYaTocadas` se indexan por
la **cadena cruda**, sin normalizar. Con un techo puesto en `i.3.aux.1.value`,
pedir `i.03.aux.1.value` a 0 dB **pasa**. Es la misma ruta que suena en la sala,
alcanzada por una clave que el estado por ruta no reconoce.

El ADR afirma «exactamente `i.N.aux.M.value` y nada más» y «240 rutas»: las dos
cosas son ciertas sobre el inventario y falsas sobre la expresión regular. El
test guarda no puede verlo porque sólo recorre el inventario.

## MEDIA — hay que corregir cifras o calificar afirmaciones

### 8. Dos veces más una decisión mía firmada como del usuario

Van cuatro y cinco.

- **`97:77-78` y `:250`: «el usuario decidió que el supresor se apaga antes de
  medir».** Lo único que el usuario dijo sobre el supresor está en
  `pedidos/00:86-88`: «**Lo apago yo durante el diagnóstico y lo vuelvo a
  prender**» — sobre el diagnóstico de acoples, no sobre medir. La regla de
  apagarlo antes de medir está en el plan de la madrugada, escrita por mí. Y lo
  que la 97 hace es una **escritura** (`m.afs.enabled = 0`) sobre un parámetro
  que el dominio declara `USER_ONLY`, `escribible: false`, «procedimiento
  manual».
- **`safety-invariants.md:227`: el ancla del techo firmada como «palabras del
  usuario».** Es el error exacto que ADR-028 dice haber corregido en sí mismo.
  Y peor: describe el comportamiento **anterior** a la corrección, el que
  rompía el caso principal y que el usuario hizo cambiar.

### 9. Aritmética: tres cifras publicadas que hay que mover

- **El exceso de la ley de la razón no descuenta el sesgo de la rodilla.** La
  rodilla se definió como «el primer crudo con reducción > 0», y hace falta
  1,09 dB de exceso para que el medidor salga de cero con a = 0,1. Así que el
  «exceso 6 dB» es **7,09 dB real** y el de 18 es 19,09. Con eso, la fila
  «encaja con `E(1−a)`» pasa de **0,38 a 1,10 escalones**, por encima de uno. La
  conclusión de la 97 no cambia: **se refuerza**, porque el ajuste que parecía
  bueno era todavía peor.
- **El peor caso de cuantización de la 94 cuenta una lectura, no dos.** Publica
  ~0,48 dB; la cantidad medida es una diferencia de dos lecturas, así que con la
  regla que el propio proyecto registró es **~0,64 dB**.
- **Los residuos del medidor de reducción son doce de doce negativos.** El
  medidor informa siempre **menos** que la caída real, compatible con truncado a
  su rejilla de 0,6668. La 97 sólo reporta el máximo y presenta como «precisión»
  lo que es un sesgo de un signo. La conclusión aguanta; el signo hay que
  decirlo. Es el mismo patrón que la 94 se obligó a reportar.
- Y **«dentro de medio escalón»** contradice la tabla dos líneas arriba, que
  dice 0,52.

### 10. La cifra de la 95 que la 94 ya había retirado

Tres auditores la encontraron por separado. `95:25-27` publica «el auxiliar leyó
**−59,00 dB las cuatro**» citando `ley-envio-aux-caliente-2026-09-12b.txt`, que
dice −58,91 / −58,85 / −59,00 / −59,00. Las cuatro idénticas salen de la corrida
**de un solo punto** que la 94 declara inservible. La 94 corrigió esto con nombre
y apellido y la corrección no se propagó.

### 11. La acotación vuelta identidad, en el índice del spike

`SPK-P0.10b-vu2.md:271`: «**Confirma de paso la ley del fader** por un camino
distinto». Es un punto de fader con 0,32 escalones de desvío. La 94 dice «no se
puede decidir» y la 96b dice «lo que NO se puede decir es que el envío usa la ley
del fader». **El índice del spike, que es lo que alguien lee primero, dice lo
contrario de los dos documentos que indexa.**

### 12. El residuo sistemático sobre-leído

`94:162-164` salta de «hay estructura» a «**es la firma de una diferencia de ley
real**». Los datos no lo sostienen: el residuo máximo de cada corrida cae en su
**byte más bajo**, no en el mismo crudo. Una diferencia entre dos leyes es
función del crudo y se reproduciría crudo por crudo; lo que ordena estos datos es
la cercanía al piso del medidor. Y en la corrida de −12 dBFS los residuos **no**
son todos del mismo signo, aunque el documento lo presenta como propiedad del
fenómeno.

### 13. Los 7,7 dB están entre 1 kHz y 10 kHz, no entre 100 Hz y 10 kHz

`96b:80` y `SPK:240` reasignan el par de frecuencias. Entre 100 Hz y 10 kHz la
diferencia es 2,4 dB. El argumento sobrevive (100 Hz vs 1 kHz son 5,3 dB); la
cifra está mal atribuida. La 96a lo dice bien.

### 14. Las tres pendientes del umbral por sustitución no son utilizables

`umbral-por-sustitucion.ts:138-141` toma el primer y el último punto útil, y la
curva 2:1 está **clavada en 5,65 dB desde u = 0,30 hacia abajo**: cinco filas
idénticas. La pendiente de 22,2 dB por unidad es una recta trazada por una
meseta, y las tres (22,2 / 32,1 / 47,3) están contaminadas. Lo que esa corrida
**sí** sostiene es que las tres curvas no coinciden, que es lo concluyente.

Y su pregunta central no tiene veredicto: el guion imprime «LAS TRES CURVAS
TIENEN QUE COINCIDIR», muestra una tabla, y no imprime ninguna cifra de
discrepancia.

### 15. La premisa fallada con la ley impresa debajo

`ley-envio-fx.ts:181-188` imprime la separación (1,24 escalones en la corrida A:
**falló**) y debajo el desvío contra `faderADb`, sin veredicto. La 96b nombra la
dependencia dos líneas después de dar la cifra. El orden es el que la 94 declara
inaceptable.

### 16. Dos de siete bytes del bloque estéreo no se decodifican nunca

`vu-buses.ts:110-122` omite `+4` y `+5` —entrada y salida del bloque dinámico del
bus—. El control negativo de la 96a («los siete bytes caen al piso») cubre cinco
de siete, contra lo que el guion afirma.

### 17. `controles-del-bus.ts` mira el supresor que no podía aprender

Lee `a.<aux>.afs.*`, que tenía el supresor apagado, e imprime «filtros
plantados: 0 (0 = no aprendió nada)» **mientras el general acumulaba seis
filtros de −18 dB**. Los tres archivos `controles-*` no sostienen lo que parecen
sostener. Y ninguno comprueba `i.9.fx.1.value` ni `f.1.mix`, que son las dos
claves que escribió la 96a.

### 18. Otras contradicciones cruzadas

- `alcance-mvp.md:30-31` dice que las dos leyes de envío «no están medidas»;
  están **acotadas**, que es lo que debería decir.
- `limits.ts:49-51` y `ownership.ts:90-91` siguen con «0,25 dB sobre 28 dB», que
  es el par del envío a **efectos**; en el auxiliar es 0,31 / 27,87. ADR-028
  dice haber propagado la corrección a tres archivos y quedaron dos sin tocar.
  Y dicen «la ley **quedó medida**» contra «la ley **no quedó cerrada**».
- `capability-matrix.md:109` cierra con ✅ una celda cuyo propio texto dice «en
  el efecto NO está verificado» — y la 96a ya lo verificó.
- El pendiente de `protocol-spec` §4.4 y §8 que la 96a cerró **sigue abierto en
  los dos lugares**.
- `vu-buses.ts` se contradice sobre el byte 5 de la cabecera entre su docblock de
  módulo y su código, y tiene el docblock del auxiliar puesto sobre la función
  del reproductor.
- ADR-028 dice que bajar buses «necesita su propia decisión»; el usuario ya la
  tomó («Los dos, con techo»). Lo que falta es el ADR y las leyes, no la
  decisión. **Invierte la regla dura del proyecto en la otra dirección**:
  presenta como no decidido algo que el usuario decidió.
- `SPK-P0.10b-vu2.md` cita tres archivos de evidencia con rutas que apuntan a su
  propia carpeta y viven en la del spike hermano, y en dos lugares dice que falta
  archivar lo que en un tercero cita como archivado.
- El conteo de 930 rutas **puede cuadrar con el conjunto equivocado**:
  `i.N.pan` (24) por `hw.N.gain` (24) deja el total y todas las familias en
  verde. Y `tools/inventario/permisos.ts`, la herramienta que mostraría *cuáles*,
  **está roto desde ADR-028** y nadie lo ve porque no es workspace.
- Diez documentos siguen afirmando que INV-010 significa «nunca», incluida
  `.claude/skills/vse-experto/referencia.md`, que es lo que lee un agente.

## La forma que tiene todo esto

Tres patrones, y los tres son el mismo visto de costados distintos:

**1. El error vive en la capa que justifica, no en la que implementa.** Ya
nombrado en este proyecto, y la auditoría lo encontró seis veces más. El caso
puro es el orden de columnas del supresor: dos docblocks del mismo archivo se
contradecían a veinte líneas de distancia, y el código obedeció al que estaba
escrito con más seguridad.

**2. Una corrección se aplica donde se descubrió y no donde se propagó.** El
−59,00 corregido en la 94 y vivo en la 95. El 239 refutado en el spec y vivo en
cinco lugares. El 0,25/28 corregido en el ADR y vivo en dos archivos de código.
La decisión del supresor corregida en dos pedidos y mal en la 97. **El defecto no
es no corregir: es no buscar las otras copias.**

**3. Un control que sólo puede confirmar.** `estadoPorHttp` devolviendo un Map
vacío, `media([])` dando `NaN` que compara `false`, `tomar()` sin tramas
devolviendo ceros indistinguibles de «el bus está aislado», el validador de
capturas comparando nombres, el conteo de 930 siendo un escalar,
`limpiar-supresor` imprimiendo «borró 6, quedan 0» cuando la lectura falló.
**Seis instrumentos que no distinguen el éxito de la falta de datos.**

## Y lo que esto le hace al barrido 2-D

Queda **suspendido hasta arreglar tres cosas**, y la razón es concreta:

1. El exceso se calcularía con la rodilla y la pendiente heredadas, sin
   descontar el 1,09 dB de sesgo del piso del medidor (hallazgo 9).
2. El guion caería en el mismo `estadoPorHttp` que puede encender el supresor
   del usuario (hallazgo 2).
3. No tendría `try/finally`, así que una caída dejaría umbral y razón escritos
   (hallazgo 3).

El método correcto ya existe y está probado: el de
`calibrar-medidor-de-reduccion.ts`, que mide la caída de nivel con `ratio = 1`
como referencia en vez de despejar el exceso de una rodilla calculada. El
barrido 2-D tiene que usar ése.

---

# Estado, al cierre del 2026-09-12

## Arreglado

**Los siete de severidad alta.**

1. **El techo del medidor** es 255 en los cinco lugares, incluido `gain.ts`. El
   0 dB de ahí es el **cero de la escala** y no su techo; la conducta del
   asistente no cambia y lo que se retiró es la justificación.
2. **El guion que podía encender el supresor.** `estadoPorHttpExigido` falla si
   la lectura trae menos de mil claves, y `exigirClave` lanza si la clave no
   vino —sobre un mapa vacío también, que es lo que la hace suficiente sola—.
   **Una guarda estática encontró 16 sitios donde el auditor había visto 4**,
   porque barre el árbol entero: tres más que suponían `m.afs.enabled`, dos que
   suponían el fader general, tres la ganancia del previo, y **dos que escribían
   `var.currentSnapshot`**.
3. **Los argumentos.** `argumentos.ts` no tiene función que devuelva un valor
   dudoso, y el rango es obligatorio. El caso que hacía daño —`""` dando un tono
   a 0 dBFS de cuatro minutos— ahora aborta antes de conectar.
   **Y la restauración**: `conRestauracion` tapa la excepción *y* la señal.
   Ninguno de los **47** guiones que escriben la tenía —el auditor dijo diez
   porque le dieron diez—, así que hay un trinquete que sólo puede encoger; va
   el primero convertido.
4. **Las leyes refutadas del compresor** quedan marcadas en `raw-map.ts`, en
   `protocol-spec` §4.4 y §6.3, y en los tres tests que las fijaban. «No
   probado» y «refutado» dejan de ser lo mismo.
5. **El orden de la cola `VU2`** en la matriz de capacidades, que era el
   retirado y haría saltear la sección del reproductor.
6. **La unidad del tope se compara**, que era la mitad que faltaba de INV-004.
7. **La lista blanca es canónica y acotada**, y el alias con ceros ya no esquiva
   el techo. Con dos tests que fallan contra la guarda vieja.

**Y lo que salió de arreglar eso, que no estaba en ningún informe:**

- **`tools/` no entraba al chequeo de tipos.** Es la raíz de dos hallazgos de la
  auditoría y de un bug mío. Al entrar encontró **un instrumento que sólo podía
  confirmar** (`barrido-testigo.ts` esperaba un objeto que no era promesa, así
  que informaba «SI» en todas las filas), un archivo con error de sintaxis, y un
  estrechamiento mal resuelto.
- **El motor estallaba** al recibir el código de rechazo nuevo, con la suite en
  verde: lo encontró una herramienta, no un test. La tabla de traducción ahora
  es exhaustiva por tipo.
- **Tres veces la misma divergencia** entre el test del conteo y la herramienta
  del inventario. Ahora hay una sola definición.
- **El reparto de lo escribible por categoría** está fijado: el total de 930
  podía cuadrar con el conjunto equivocado.

**Correcciones de cifras**: el exceso de la 97 (6 → 7,09 dB, y la fila que
«encajaba» pasa de 0,38 a 1,10 escalones), el peor caso de la 94 (0,48 → 0,64),
el sesgo sistemático del medidor de reducción, el par de frecuencias de los
7,7 dB, la cita de la 95 que la 94 ya había retirado, el residuo sobre-leído de
la 94, la acotación vuelta identidad en el índice del spike, y el alcance que le
faltaba a la última sección de la 97.

**Tres atribuciones**: el ancla del techo firmada como palabras del usuario (van
cinco), la misma ancla derogada en la tabla de ADR-028, y —al revés— una decisión
del usuario presentada como pendiente.

**Y una donde los auditores se contradijeron.** Uno dijo que el «0,05 dB sobre
38» del spec era un redondeo favorable; el otro lo recalculó. Recalculado da
38,2411 y 0,051 por los dos caminos: **el error está en el archivo de
evidencia**, que imprimió 38,25 y 0,06. No hay que tomar a un auditor al pie de
la letra.

## Sin arreglar, y por qué

- **46 guiones sin `conRestauracion`.** Convertirlos de golpe es un cambio
  mecánico grande sobre código que habla con un aparato real, y romper un
  instrumento en silencio es peor que la deuda. El trinquete impide que crezca y
  obliga a sacar de la lista lo que se convierta.
- **Nueve guiones con el valor previo escrito a mano.** Misma razón, y el
  primero ya se convirtió: `ley-envio-aux.ts` lee el fader del aparato antes de
  empezar. La guarda de `restaurar-sin-adivinar` no los ve porque busca `??`, no
  literales.
- **`magnitudPropuesta` no está atada al crudo que va al cable.** Comparar la
  unidad hace que declarar mal sea visible; atarla necesita las leyes de
  conversión verificadas, y la del compresor acaba de quedar refutada. Hay que
  cerrarlo **antes del primer llamador**, y el primer llamador está en el plan:
  la pantalla por QR.
- **`techoPorRuta` no tiene productor.** La regla «sólo si la app bajó» está en
  el motor y nadie llena el mapa. Declarado en ADR-028 y en las invariantes;
  entra con el llamador.
- **El límite acumulado es inerte** por el mismo motivo, y está declarado.

## Y el barrido 2-D

Sigue suspendido, y por menos razones que antes: de las tres que lo bloqueaban,
**dos están cerradas** —la lectura que podía encender el supresor, y la
restauración ante una caída—. Queda la primera: el exceso tiene que medirse con
el método de `calibrar-medidor-de-reduccion.ts` y no despejarse de una rodilla,
porque la rodilla arrastra 1,09 dB de sesgo del piso del medidor. Está escrito
en `docs/backlog/las-leyes-del-compresor-no-se-conocen.md`.
