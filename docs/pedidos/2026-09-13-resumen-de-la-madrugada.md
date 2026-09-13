# Resumen de la madrugada del 2026-09-13

Plan: [`2026-09-13-plan-de-la-madrugada.md`](2026-09-13-plan-de-la-madrugada.md).
**Cuatro bloques cerrados; el quinto a medias, y conviene decirlo así.**

| Bloque | |
|---|---|
| 0 — la 101 | **cerrado** |
| 1 — las mediciones | **cerrado, y se extendió**: además de la 102 salieron la **104** (la ley del envío contra la salida real) y la **105** (de dónde viene la fuga) |
| 2 — auditoría general | **cerrada**, con sus nueve ALTA aplicados |
| 3 — el manual | **cerrado**, con cinco tareas escritas |
| 4 — producto | **a medias**: de las seis tareas (P1…P6) se hizo **P2**, más **seis** de robustecimiento que no estaban en la lista, y dos guiones convertidos de P3 |

La primera versión de este resumen decía «los cinco bloques quedaron cerrados».
No era cierto, y es exactamente la clase de sobreafirmación que dos auditorías
estuvieron corrigiendo toda la noche.

**Lo que necesita una mano tuya, en un minuto:** desenchufar el cable de la
entrada 1 de la interfaz y avisarme. Con eso se cierra de dónde viene la fuga de
1 kHz, que es lo único que limita hasta dónde puede medir esta serie.

## Lo que ahora se sabe y antes no

### La brecha más vieja del proyecto está cerrada

Las cinco mediciones del 2026-09-12 terminaban todas con la misma declaración:
*«esto es autoconsistencia y no calibración»*. Con el bucle que el usuario cableó
—salida del general y del auxiliar 5 a la interfaz— dejó de aplicar.

| Medición | Qué ancló | Contra el instrumento externo |
|---|---|---|
| **99b** | el paso del medidor de **canal** | rango implicado **79,91 dB** contra el 80 declarado |
| **102** | el paso del bloque de **auxiliar** | **79,57 dB** |

Dos bloques distintos de la trama, dos corridas, 0,11 % y 0,54 % del 80. **Los
84,5 dB que este proyecto tuvo que retirar quedan descartados con evidencia de
afuera.** No son dos instrumentos: las dos salieron de la misma Scarlett por
entradas distintas, así que lo que la coincidencia corrobora es que **los dos
bloques comparten escala**.

### La medición 94 queda en pie, y su residuo tiene explicación

La 102 barrió **también** el auxiliar 3 —el que la 94 leyó— y los dos buses dieron
la misma pendiente dentro de 0,36 dB. La escala queda anclada por transitividad.

Y la 94 había declarado indecidible un residuo unilateral. **Ahora se sabe qué
era**: eligió su bus comprobando sólo el supresor, y ese bus atenúa **22,67 dB en
1 kHz** por su ecualizador gráfico —un ring-out del usuario—. Esos 22,67 dB se
comen unos sesenta y ocho bytes de medidor: el barrido llegaba al piso antes de
tiempo. Y la 102 midió que **el medidor no se comprime cerca del piso**: en los
bytes 13, 10, 7 y 4 sigue a la salida real dentro de 0,16 dB, y cae a pico en el 0.

**La 96b sigue tocada**: el bloque de efectos es estéreo de 7 bytes contra el mono
de 5 del auxiliar, y medir uno no da el otro.

### Cuatro rutas escribibles, donde había cero

`RAW_MAP` tenía toda su tabla en `DESCONOCIDO` o `INFERIDO`, y `rutasProbadas()`
devolvía la lista vacía. Hoy tiene cuatro entradas medidas contra el filtro real:

| Ruta | Ley medida | Lo que el código decía |
|---|---|---|
| `i.N.eq.b1.freq` | `20·1102,5^V` — **0,24 %** sobre 6 crudos | `lineal(20, 20000)`, erraba hasta **×43** |
| `i.N.eq.b1.q` | `0,05·300^V` — **×1,02** sobre 5 crudos | `lineal(0,3, 10)`, erraba **×9,8** |
| `i.N.eq.hpf.freq` | `min(20·1102,5^V, 1000)` | `lineal(20, 400)` — mal el rango **y** la forma |
| `i.N.eq.lpf.freq` | `max(20·1102,5^V, 1000)` | no existía |

**Las cuatro comparten la misma exponencial.** La 103 la confirmó por tercera y
cuarta vez con once puntos dentro del 1,1 %, y su recorte en 1 kHz es exactamente
lo que el manual declara.

**Y el rango declarado es el medido, no el del recorrido entero.** `aRaw` rechaza
con `FUERA_DE_RANGO` lo que ninguna corrida vio.

### El manual se puede leer, y explicó un enigma

El extractor decía «79 % legible» y **el 51,6 % del archivo eran datos de imagen**
—su centinela contaba los caracteres corruptos como legibles—. Además había **dos
fuentes corridas en sentidos opuestos**: una ponía las letras 29 abajo (`7KH` es
`The`) y otra los números 29 arriba (`NKNW` es `1.1:`). Arreglado: de 620 225
caracteres con el 38 % de tokens siendo palabras, a **122 030 con el 91 %**.
`grep firmware` daba cero sobre once apariciones.

Y contestó una pregunta que tres mediciones no habían podido cerrar: **el modo del
supresor decide qué pila de filtros se planta**, y `m.afs.fmode` es ese selector.
Con eso se explica por qué un filtro resistía `clearlive`, por qué hay seis fijas
de doce, y **por qué un tono sostenido planta notches** — que es comportamiento
declarado del modo FIXED, no una falla.

### Un incidente del que salió una regla

Al reconectar el supresor con un multitono sonando se plantaron **cuatro notches
de −18 dB en 1 kHz** en el general del usuario. Limpiarlos costó **tres filtros
suyos**: 200,0 Hz, 4226,4 Hz y 8190,1 Hz, los tres a −6 dB — un ring-out real.
`clearall` borra todo, no sólo lo plantado, y es lo único que borra algo.

**No se escribieron de vuelta**: el Q no quedó en el registro de esa corrida, y
restaurar con un valor inferido deja la consola en un estado que nunca existió.
Está contado en
[`hallazgo-la-senal-de-que-una-corrida-termino.md`](../backlog/hallazgo-la-senal-de-que-una-corrida-termino.md).

## Lo que se arregló del método

**Nueve hallazgos ALTA de dos auditorías generales**, más los de cada medición.
Los que cambian cómo se trabaja:

- **La única señal de que una corrida terminó es la notificación del arnés.** Lo
  sustituí por indicios dos veces el mismo día, y la segunda contaminé una
  medición. Un `pgrep` vacío no es evidencia de nada.
- **El auditor lee el guión además del contrato.** Los seis ALTA de la 101, los
  siete de la 102 y los siete de la 103 estaban casi todos en el código.
- **Un control que sólo puede confirmar no es un control.** Apareció seis veces:
  un centinela que contaba la basura como legible; una expectativa que pasaba el
  98 % sobre ruido puro; una guarda calculada y nunca usada, dos veces en el mismo
  archivo; tres guardas inertes porque `NaN > 239` es `false`; un trinquete que
  podía crecer; y una promesa de huella que nadie verificaba.
- **Una regla estructural que cualquiera esquiva no es una regla.** Defendí
  distinguir un guion de un módulo por tener un `await` de nivel superior; un
  auditor la rompió en un intento. Volvió a ser una exención por nombre, que es
  una línea revisable.
- **Nunca encender el supresor con señal sonando.**

Y tres instrumentos que no tenían con qué fallar ahora lo tienen: `analizar.mjs`
—de donde sale toda cifra que este proyecto publica—, `restaurar.ts` —el único
código del camino de restauración— y la huella de la evidencia, que ahora cubre
**el guion y sus imports**, porque cubrir sólo el archivo de nivel superior dejaba
abierta la puerta que la huella existe para cerrar.

## La segunda mitad de la noche: la 104, y lo que destapó

### La ley del envío a monitor aguanta, y el residuo viejo tiene dueño

La **104** barrió `i.9.aux.4.value` contra el convertidor externo. Resultado:
`VtoLIN` —la curva que la consola sirve en su propio `mixer.html`— describe la
salida **física** con **0,007 dB sobre los primeros 32 dB de atenuación**. Es la
primera vez que esa curva se compara contra algo que no es la propia consola.

Y el residuo que la medición **94** había declarado indecidible quedó explicado.
Reapareció igual en este banco, que no tiene piso de medidor que lo justifique
—`L3b` falló con 23 signos de 23—, pero su **forma** no es la de una ley
distinta: es plana arriba y creciente abajo, o sea algo que se **suma**. Un
factor de escala empeora el acuerdo arriba para mejorarlo abajo; un término
aditivo lo mejora en los dos extremos.

El número que lo cierra está medido y no ajustado: **con el envío en 0, la
interfaz ve un tono de 1 kHz a −91,77 dBFS**, que son 25 dB por encima del piso
del bin de este banco. Hay una fuga. De quién es —consola o banco— lo mide el
ítem **105**, cuyo contrato ya está escrito.

Detalle: [`hallazgo-el-residuo-de-la-94-no-es-la-ley.md`](../backlog/hallazgo-el-residuo-de-la-94-no-es-la-ley.md).

### Y la 104 le plantó un filtro al general del usuario

Su guion exigió apagado el supresor del **auxiliar** por el que iba el tono y se
olvidó del **general**, que recibe lo mismo porque el canal tiene `i.9.mix` sin
mutear. Dejó puesta una notch de **1000,008 Hz, Q 7, −18 dB** en el general.

Borrarla mostró que la creencia del proyecto estaba al revés: `clearlive` borró
0, `clearfixed` borró 0, **`clearall` la borró**. El docblock del limpiador
afirmaba lo contrario desde el 2026-09-10. O sea que el precio de olvidarse no
es «limpiarlo después»: **lo único que borra se lleva la pila entera**, incluido
el ring-out del usuario. Esta vez no costó nada sólo porque las seis ranuras
fijas ya estaban vacías — y están vacías porque la vez anterior sí costó.

Van tres arreglos: el guion de la 104 apaga y restaura `m.afs.enabled` por
`PREVIO`; el docblock dice lo que la corrida mostró; y hay un **trinquete nuevo**
que exige que todo guion que haga sonar algo apague el supresor. Hoy **46** no lo
hacen y la lista no puede crecer.

El censo de esos 46 lo escribí mal —buscaba `codificarSetd` y se perdía los que
apagan con un ayudante— y **lo encontró el propio test**, que exige que lo que ya
cumple no figure en la lista.

Detalle: [`hallazgo-solo-clearall-borra-y-se-lleva-todo.md`](../backlog/hallazgo-solo-clearall-borra-y-se-lleva-todo.md).

## El 105: el veredicto no salió, y la corrida sirvió igual

El contrato del 105 exigía que, si una guarda falla, **no se imprima veredicto**.
G1 falló y no se imprimió. Eso es la regla funcionando, no la corrida perdida:
salieron tres cosas.

### El envío a auxiliar es pre-fader **y pre-mute**

El control positivo C2, con 103 dB de margen: con el envío abierto, mutear el
canal le sacó al auxiliar **0,00 dB**. El proyecto tenía medido `post = 0`
—pre-fader— y de la relación con el **mute** no sabía nada.

Para vos esto es una regla de operación: **mutear un canal no silencia lo que ese
canal manda al monitor del músico.** Hay que bajar el envío.

Detalle: [`hallazgo-el-envio-a-auxiliar-es-pre-mute.md`](../backlog/hallazgo-el-envio-a-auxiliar-es-pre-mute.md).

### La fuga viaja por la salida del general

Con el fader del general en 0, la fuga cayó **al menos 30,4 dB** y se hundió bajo
el piso de ruido de su propia captura. Como el fader del general es post-suma,
eso **excluye la diafonía del sumador interno** y deja la fuga en el camino de
salida: salida física del general → cable → entrada 1 de la interfaz → lo que se
cruce desde ahí.

Lo que falta para cerrarlo **necesita una mano tuya y un minuto**: desenchufar el
cable de la entrada 1 y repetir la lectura. Si el tono sigue, es de la consola;
si desaparece, es diafonía adentro de la Scarlett.

Detalle: [`hallazgo-la-fuga-viaja-por-la-salida-del-general.md`](../backlog/hallazgo-la-fuga-viaja-por-la-salida-del-general.md).

### Y por qué falló G1, que es el tercer hallazgo

E0 dio −87,04 dBFS donde la 104 midió −91,77. Pero el banco **no se movió**: el
control positivo del camino principal dio −12,68 contra −12,68 de la 104, cero
coma cero cero. Lo que cambió es la fuga.

La única diferencia deliberada entre las dos corridas es `m.afs.enabled`: la 104
lo dejó encendido —ése fue su defecto— y la 105 lo apaga porque la regla nueva lo
exige. Y encaja: si la fuga viaja por el camino del general, el supresor del
general está **en** ese camino.

Es coherente y **no está probado**, y probarlo cuesta un tono sostenido con el
supresor activo, o sea filtros plantados que sólo `clearall` borra. No lo hice.

### Dos auditorías, y lo que ninguna vio

El guion se auditó dos veces antes de tocar la consola. La primera paró un
defecto que habría publicado un veredicto falso —el banco no se reproducía—. La
segunda encontró que el tono se comprobaba en el momento equivocado: si `afplay`
moría durante la captura de E2, las seis guardas pasaban y se imprimía «la fuga
es de la consola», el veredicto de mayor consecuencia, producido por un
reproductor muerto.

**Lo que ninguna de las dos vio lo encontré leyendo el aparato:** el guion
escribía `m.mute`, una clave que **no existe** en esta consola. Hay 736 claves
con `mute` en el volcado y ninguna es del general. Las dos auditorías leyeron el
código; el código era consistente consigo mismo.

## Bloque 4: P1 quedó desbloqueado, y en el camino apareció una guarda muerta

La 104 midió la ley del envío, que era lo que bloqueaba **P1** —el llamador del
monitor, la tarea que el plan marca como «lo que hace que una sesión con sonido
real valga el tiempo del usuario»—. Al ir a conectarla aparecieron dos cosas que
nadie sabía.

### La guarda que ata la magnitud al crudo no podía disparar nunca

`RAW_MAP` se indexa por plantillas —`i.N.eq.b1.freq`— y `entrada()` era un
`Map.get` de la cadena cruda. O sea que **`entrada('i.3.eq.b1.freq')` devolvía
`undefined` para los veinticuatro canales.**

Con eso, `verificarAtadura` —escrita el mismo día para cerrar un agujero que una
auditoría había demostrado explotable: un recorrido completo del parámetro
aprobado bajo un techo de −6 dB declarando otras magnitudes— devolvía
`SIN_LEY_VERIFICADA` siempre, que está documentado como **«no es un rechazo»**.
La guarda estaba enchufada al motor y era inerte.

Nadie lo vio porque ningún llamador de producción usa `aRaw`, y las pruebas
usaban la plantilla, que sí resolvía.

Arreglado con `canonizarRuta`, que exige forma canónica —`i.03` no resuelve,
porque el techo por ruta se indexa por cadena cruda— e índice en rango real.
Comprobado: el ataque de la auditoría ahora se rechaza en un canal de verdad.

### Y 96 rutas que se contaban como escribibles no lo eran

Al arreglar eso, el arnés que cuenta rutas escribibles tuvo que declarar la
unidad de verdad en vez de `dB` para todo. Y ahí se vio que **`LIMITES` da una
unidad por `kind`, y un `kind` cubre hojas de unidades distintas**:
`CHANNEL_EQ` tiene su tope en dB y cubre `freq` (Hz), `gain` (dB) y `q`.

El motor las rechaza —«comparar los dos números sería comparar especies
distintas»— y **tiene razón**: un tope de 4 dB no acota un salto de frecuencia.
La cuenta baja de 930 a 834. No se cayeron 96 rutas: **nunca habían sido
escribibles**, y el 930 las contaba porque el arnés mentía la unidad.

Consecuencia incómoda: **las cuatro leyes del ecualizador que midió la 101 no
sirven para escribir nada**, y no por la medición. Medir más tampoco alcanzaría.
Hay tres salidas y las tres son decisión tuya; están escritas en
[`hallazgo-un-kind-una-unidad-y-las-hojas-no-coinciden.md`](../backlog/hallazgo-un-kind-una-unidad-y-las-hojas-no-coinciden.md).

**El envío a monitor no tiene ese problema**: su tope está en dB y su ley medida
también. Es la quinta ruta `PROBADO` y la primera que el motor puede usar.

### Lo que le queda a P1

Ya no es técnico. Falta decidir **cuándo** la aplicación propone bajar un envío a
monitor, y eso no está escrito en ningún lado. Los otros dos huecos que ADR-028
declara —el techo que no se llena y el acumulado por sesión— necesitan el
historial de la sesión.

## P1 quedó hecho: la aplicación puede bajar un monitor

ADR-028 abrió 240 rutas y su primer hueco decía que **ningún camino de la
aplicación las usaba**: el único `CambioPropuesto` de producción en todo el
repositorio era el de ganancia. Ahora son dos.

Lo que faltaba abajo de eso eran dos cosas y las dos aparecieron el mismo día: la
**ley** del envío, que midió la 104, y que `entrada()` **resolviera una ruta
concreta** —no lo hacía, así que la guarda que ata la magnitud al crudo devolvía
«no hay ley» en los veinticuatro canales—.

La regla vive donde se prueba, y **sólo baja**: volver a subir es tuyo, textual
—*«luego vuelvo a subir de a poco buscando el acople nuevamente»*—. Y se niega a
proponer un nivel fuera del tramo que la medición cubrió, en vez de extrapolar:
es la primera vez en este proyecto que **una medición cambia lo que la aplicación
puede hacer**.

### Y el techo resultó no necesitar lo que el ADR decía

`techoPorRuta` estaba vacío «porque hace falta el historial de la sesión». Para
este techo no hace falta: `registrarTecho` lo construye **de los cambios
mismos** —dónde estaba la ruta la primera vez que la app la bajó, y el primer
descenso gana—. El dueño natural de esa memoria es quien baja. El mapa vive en el
servicio, y con eso el hueco 2 también quedó cerrado.

**Lo que falta para que lo veas: ninguna pantalla lo llama todavía.** Existe el
camino y está probado; falta quién lo dispare. Lo digo porque la diferencia entre
una función y la promesa de una función es exactamente esa frase.

## El 106, en tercera auditoría y sin correr

La ley del fader de bus (`a.N.mix`) es lo que desbloquea P6. El contrato viejo
—la 99a— declaraba su propio techo: *«esto es autoconsistencia y no
calibración»*. Ese techo ya no está, así que la medición se rehizo contra el
convertidor externo.

**No corrió todavía, y las dos auditorías encontraron bloqueantes cada una.** La
primera: la corrida no podía terminar —567 s de barrido contra un tono de 300—, y
la guarda del ecualizador del bus no matcheaba ninguna clave real. La segunda
encontró el peor, y es de forma: **el arreglo anterior agregó el control bueno y
no sacó el malo**. El C1 circular seguía vivo setenta líneas más abajo, todavía
bloqueando la ley, y el contrato tenía el gemelo documental: afirmaba una frase y
la refutaba veintiocho líneas después.

Ese defecto —el mismo arreglo aplicado en un lugar y no en el otro— es el que más
me costó en toda la noche, y es el que le pedí que busque en la tercera vuelta.

## Lo que queda abierto

| | |
|---|---|
| **La 96b** | el bloque de efectos, estéreo de 7 bytes, sin medir |
| **`m.afs.fmode`** | cuál valor es LIVE, FIXED y LOCK. **Decide si una corrida planta filtros permanentes** |
| **La ganancia del ecualizador** | la campana sube 20,0 dB exactos y el código dice ±15, pero se midió **un solo crudo**: de la forma no se sabe nada |
| **La puerta** | ataque, relajación y retención declarados por el manual, ninguno en el código |
| **La pantalla del monitor** | el servicio que baja un envío existe y está probado; **ninguna pantalla lo llama**. Es lo que falta para que se vea |
| **Un `kind`, una unidad** | el ecualizador se puede medir todo lo que quieras y sigue sin poder escribirse. Tres salidas posibles, **las tres decisión tuya** |
| **77 guiones** | escriben a la consola sin restauración garantizada. El trinquete los cuenta y no los deja crecer. De ellos, **9 sólo mandan consultas** y no tienen nada que restaurar: el detector es `.enviar(` y no distingue |
| **46 guiones** | hacen sonar un estímulo sin apagar el supresor del general. Trinquete nuevo |
| **El ítem 106** | la ley del fader de bus, en tercera auditoría. Sin correr |
| **La fuga de 1 kHz** | medida: viaja por la salida del general. Falta **un minuto tuyo**: desenchufar el cable de la entrada 1 y repetir la lectura, para separar Scarlett de consola |
| **Los 4,73 dB de G1** | si el supresor del general explica la diferencia entre la 104 y la 105. Probarlo cuesta filtros plantados: **es decisión tuya** |
| **El extremo superior del pasa-bajos** | el manual dice 22 kHz; el estímulo no llega |

## Y lo único que hace falta del usuario

La instantánea **«Alma caninde»** quedó intacta —verificada leyendo `SHOWLIST` y
`SNAPSHOTLIST` de nuevo a las 05:50, no por «no la toqué»: está en el show
`Prueba`, junto a `Prueba asistente`—.

Dos cosas que vi al mirar esa lista y que son decisión tuya, no mía:

- El show **`VSE`** acumuló **17 instantáneas automáticas** (`VSE_AUTO_…`) que
  dejó este proyecto. Son basura nuestra en tu consola. Borrarlas es destructivo
  y no lo hago sin que lo pidas.
- `var.currentSnapshot` apunta a `VSE_AUTO_1789097773977`, que **no está en
  ninguna de las tres listas**. El puntero quedó colgado. No lo toqué: mover
  punteros de instantánea es lo que aplicaría una y cambiaría la consola entera.

La fantasma del canal 9 no se tocó. Nada sonó en la sala: no hay nada conectado a
ninguna salida salvo los dos cables del bucle.

**El estado quedó verificado por lectura a las 07:40**, no por «no lo toqué»: las
6665 claves están, el envío del canal 10 al auxiliar 5 en 0, los dos faders donde
estaban, y **la pila del supresor del general vacía**. No hay ningún proceso de
medición corriendo.

**Lo que sí hay que decidir es el ring-out perdido.** Tres filtros de −6 dB en
200, 4226 y 8190 Hz. Rehacerlo es la forma correcta; escribirlos de vuelta con un
Q inferido, no.
