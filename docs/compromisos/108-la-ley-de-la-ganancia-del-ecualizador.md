# 108 — La ley de la ganancia del ecualizador de canal

**Contrato escrito el 2026-09-13, ANTES de tocar la consola.** Consola
192.168.0.78. Canal 10 (`i.9`) → general → entrada 1 de la Scarlett, el mismo
banco que el ítem 107.

## Qué decide

`i.N.eq.bM.gain` es **la única hoja del ecualizador que la aplicación podría
escribir**, y hoy no puede.

El ítem 101 midió cuatro leyes del ecualizador contra el filtro real —frecuencia
de la campana, su Q, y las de los dos filtros de corte— y el 2026-09-13 apareció
que **ninguna sirve para escribir**: `LIMITES` da una unidad por `kind`, y
`CHANNEL_EQ` tiene su tope en dB mientras esas cuatro están en Hz y en Q. El
motor las rechaza con INV-004 y tiene razón: un tope de 4 dB no acota un salto de
frecuencia. Está en
[`hallazgo-un-kind-una-unidad-y-las-hojas-no-coinciden.md`](../backlog/hallazgo-un-kind-una-unidad-y-las-hojas-no-coinciden.md).

**La ganancia no tiene ese problema: está en dB, igual que el tope de su `kind`.**
Así que medirla es lo único que convierte al ecualizador de canal —432 de las 834
rutas escribibles, y lo que el propio recorrido llama «el corazón del producto»—
en algo que la aplicación pueda tocar.

Hoy la tabla dice `lineal(−15, +15)` y `DESCONOCIDO`. El 101 encontró, sin
buscarlo, que la campana **sube 20,0 dB** en su extremo, y dejó escrito por qué
eso no alcanza:

> *«El pico de una campana no es el parámetro de ganancia salvo que el filtro esté
> normalizado de cierta manera, y eso no se sabe. Y se midió **un solo crudo de
> ganancia** —el extremo—, así que de la *forma* de esa ley no se sabe nada.»*

## Qué se mide, y por qué es la magnitud correcta

**Cuántos decibeles cambia el nivel en la frecuencia central de la banda, como
función del crudo.** No «el parámetro de ganancia del filtro»: la aplicación va a
decir «realzá esta banda 3 dB» y lo que importa es que el audio suba 3 dB ahí. Esa
es la cantidad que `fromRaw` tiene que devolver, y no depende de cómo esté
normalizado el filtro por dentro.

## El banco, y dos cosas que salieron gratis

- **La banda 2 ya está exactamente en 1000,0 Hz.** Su crudo es
  `0,5584347738`, que es el que la ley medida por el 101 da para 1 kHz. **No se
  escribe la frecuencia**: una clave menos que tocar y una menos que restaurar.
- **Las cinco bandas están planas** (`gain = 0,5`), y se exige que sigan así.

Se baja `i.9.mix` a **0,50** para hacer lugar. Con el fader donde está, un realce
de +20 dB dejaría el **pico capturado en −0,18 dBFS** según la cadena que midió el
ítem 107 —tono de −15 dBFS en un bin de −18,00—, o sea al borde del recorte del
conversor. Con 0,50 el pico peor queda en −11,8.

**Estímulo de DOS tonos: 1000 Hz y 37 Hz**, cada uno a −18 dBFS. El pico de la
suma es −11,98 dBFS, con doce decibeles de aire en el archivo. *(Decía −12,03; con dos tonos de igual amplitud a −18 dBFS el pico es −18 + 20·log₁₀2 = −11,98, y con los enteros que el generador escribe —4125 + 4125 sobre 32767— da lo mismo.)*

**El testigo está en 37 Hz y no en 100, y el motivo es física.** Con la campana en
1 kHz y el Q de fábrica —que el ítem 101 midió en 1,010, aunque las faldas de abajo salen de Q = 1,000 y por eso difieren en la tercera cifra— la falda a 100 Hz mueve
ese bin **0,41 dB con +20 de realce y −0,41 con −20**: un rango de 0,82 dB. Con el
tope de 0,5 que este contrato tenía, **C2 habría fallado justo en el escenario que
la corrida sale a encontrar** —la ley de ±20— y el mensaje habría acusado a la
consola por la falda del propio filtro que se está midiendo. A 37 Hz la falda es **0,059 dB por lado**, o sea 0,117 de
rango.

Y es **inarmónico a propósito**, que el de 100 Hz no era: 1000/100 = 10, así que el
décimo armónico del testigo caía exactamente en el bin que se mide; y 100 Hz es el
segundo armónico de una red de 50, así que un zumbido coherente ahí —invisible
para `pisoDelBin`, que saltea los bins de guarda— movía la lectura.

Se neutraliza el compresor, la puerta y el de-esser del canal **y el compresor del
general** —los cuatro dependen del nivel y el barrido mueve cuarenta decibeles— y
`m.afs.enabled`, por la regla del 2026-09-13. La puerta del general y el dim se
**exigen** apagados en vez de escribirse: son dos escrituras menos sobre el
general del usuario.

**Se exige al empezar:** `i.9.eq.bypass = 0`, `i.9.eq.prmod = 0`,
`i.9.eq.easy = 0`, las cinco bandas en `gain = 0,5`, `i.9.mute = 0`,
`m.gate.enabled = 0`, `m.dim = 0`, y que los filtros de corte no toquen el centro
ni el testigo —el pasa-altos tiene que estar **por debajo** de los 37 Hz, y el del
usuario está en 20— —`hpf.freq` está en el crudo 0, que
son 20 Hz, y `lpf.freq` en 1, que son 22 050—.

## Los controles positivos

**C1 — el tono llega.** El bin de 1 kHz con la banda plana tiene que estar al
menos **75 dB** por encima del piso efectivo, que es `MARGEN_MINIMO_DB +
EXCURSION_PREVISTA_DB` —45 más 30—. *(Hasta la sexta auditoría esos 30 eran el
mismo número que el piso de L4; se separaron al bajar ese piso, porque aflojar la
precondición es la dirección insegura: menos margen exigido son puntos cayéndose
al piso a mitad del barrido.)* **Es conservador a propósito**: el punto más
bajo está, como mucho, todo el recorrido por debajo del plano, y eso es la cota
que se puede afirmar *antes* de medir cuánto corta. En este banco se esperan
94 dB.

**C2 — la banda es LOCAL, y esto es lo que hace honesta a la medición.** Mientras
el bin de 1 kHz se mueve cuarenta decibeles, el del testigo no se puede mover más
de **la falda calculada más 0,15 dB de holgura**. El tope no es un número elegido:
sale de la fórmula de una campana estándar con el Q que la consola declara y el
realce y el corte que esta corrida midió, **acotados a ±25 dB**. La cota importa:
sin ella, algo que aplastara el canal en el corte llevaría el recorrido a −60, la
falda a 3,75 dB y el tope a 3,96, y C2 daría PASA sobre un testigo que se movió
tres decibeles enteros — auto-cumpliéndose justo en el caso en que hace falta.
±25 deja cinco decibeles sobre el mayor valor creíble (el manual dice ±20 y el 101
midió 20,0 exactos). Y cuando la cota muerde, **se dice**: es la señal de que o la
ley es mayor de lo que nadie cree, o algo quedó vivo. Un tope redondo era lo que hacía
imposible a C2. Si se mueve, lo que cambió no fue la banda sino algo global —el
fader, la ganancia, el compresor que no se puenteó— y **la corrida no mide la ley
del ecualizador**: mide otra cosa.

Es el testigo que los barridos de fader no podían tener, porque ahí lo que se
movía era global por definición. Acá se puede, y por eso se exige.

## Las expectativas, declaradas antes de mirar

**L1 — el crudo 0,5 es el punto plano.** La diferencia entre el nivel en 0,5 y el
nivel con el ecualizador puenteado tiene que ser menor que 0,2 dB. Si no lo es,
`0,5` no es «0 dB» y toda la tabla de conversión que lo supone está mal.

**L2 — la referencia interna de la interfaz no deriva** más de 0,05 dB. Es el
único control sobre el instrumento.

**L3 — la ley es lineal en el crudo.** Ajustando una recta a los puntos, el
residuo máximo tiene que ser menor que **0,3 dB**. Es lo que la tabla declara hoy
—`lineal(−15, +15)`— y lo que hay que poner a prueba: si la ley fuera, por
ejemplo, lineal en la ganancia *lineal* y no en decibeles, el residuo lo diría.

**L3b — y el residuo no tiene estructura.** Dos cosas, y las dos tuvieron que
corregirse antes de correr:

- **la prueba de rachas va sobre los puntos ordenados por crudo**, no por orden de
  barrido. La rejilla no es monótona —sube de 0,50 a 1,00 y salta a 0,45— y contar
  rachas en el orden en que se midió fabrica cambios de signo espurios en el salto
  y **tapa la curvatura**. Comprobado con una ley curva sintética;
- **la estructura se mide con el término cuadrático de un ajuste de segundo
  orden**, no con la pendiente del residuo. Esa pendiente es **cero por
  construcción**: los residuos de un ajuste por mínimos cuadrados son ortogonales
  a la x del ajuste. Medido: −4,1·10⁻¹⁴. Se imprimía como si fuera evidencia.

El umbral es que la curvatura aporte menos de 0,15 dB en el borde del recorrido,
la mitad de lo que L3 tolera: el control que busca estructura tiene que ser más
fino que el que la acota.

**L4 — el recorrido total es de al menos 24 dB**, y se informa cuál es. La tabla
dice ±15 y el 101 vio +20 en el extremo. **Los dos números no pueden ser
ciertos**, y esta corrida dice cuál es: quien lo dice es la **pendiente** del
ajuste de L3 —unos 30 dB por unidad de crudo es ±15 y unos 40 es ±20—.

*El piso valía 30 y la sexta auditoría midió que **30 es exactamente la respuesta
±15***, o sea el peor lugar donde puede estar: con esa ley y una corrida perfecta
el recorrido da 30,00 y pasa por **cero margen**, y basta perder un crudo por
punta para quedarse en 27 y no publicar nada —el ítem 101, mismo instrumento y
mismo banco, anuló 2 de 8—. La corrida estaba armada para no poder contestar una
de sus dos respuestas. El razonamiento que sostenía el 30 era circular: no hace
falta medir 30 dB de recorrido para distinguir ±15 de ±20, porque las distingue la
pendiente, que con 27 sale igual de determinada.

**L5 — la simetría.** |dB en el crudo 0| y |dB en el crudo 1| no difieren más de
0,5 dB. Una asimetría sería un hallazgo: muchos ecualizadores cortan más de lo que
realzan, y la tabla no lo contempla.

**L6 — ida y vuelta** dentro de 0,5 dB.

**L8 — el medidor del canal sigue al realce, o hubo recorte adentro.** Bajar el
fader del canal protege al conversor de la interfaz, pero el fader está **después**
del ecualizador: no protege de que el canal sature con +20 dB de realce. Ese
recorte llegaría a la Scarlett a un nivel cómodo, **sin marca**, y se leería como
una ley que se aplana arriba — un hallazgo falso contra la consola. El medidor de
salida del canal es el único instrumento que puede verlo, y hasta esta versión se
medía, se imprimía y no lo juzgaba nadie.

**Y no se supone si el medidor es de pico o de potencia: se miden las dos.** Con
dos tonos la predicción depende de eso —potencia da `10·log10((10^(g/10)+1)/2)` y
pico `20·log10((10^(g/20)+1)/2)`— y en los extremos difieren **2,23 dB** contra un
tope de 1,5. Suponer una habría producido, si era la otra, la misma acusación
falsa de recorte que esta expectativa vino a evitar. El veredicto es sobre la
hipótesis compuesta —el medidor es una de las dos— así que alcanza con que una
ajuste, **y la corrida informa cuál**: el 99b calibró la escala con un solo seno,
donde pico y eficaz se diferencian en una constante que se cancela, así que el
estímulo de dos tonos es la primera vez en este proyecto que la distinción
importa.

**L8 es un control del REALCE, y hay que decirlo.** Su sensibilidad es 0,99 en
+20 dB y 0,01 en −20: en el corte es ciego, y da igual, porque el recorte sólo
puede ocurrir arriba. Y sólo ve lo que pase **aguas abajo de donde ese medidor
toma**, que este proyecto no midió: «el único instrumento que puede verlo» es una
esperanza razonable, no un hecho.

**Y se compara contra la suma de los dos tonos, no contra el bin.** El medidor es
de banda ancha: con dos tonos de igual amplitud, en el corte máximo el testigo
*domina* el medidor —baja 3 dB mientras el bin baja 20—. Comparar uno con otro era
imposible por aritmética y L8 habría fallado siempre, acusando de un recorte que no
existe. Lo que el medidor tiene que seguir es
`10·log10((10^(g/10) + 1) / 2)`.

**L7 — el crudo escrito contra el releído**, con dos crudos fuera de la rejilla de
centésimos a propósito.

**Mínimos y anulación**: 10 puntos útiles para L3 y L3b, 20 cuadros por captura,
45 dB de margen sobre el piso efectivo, y **45 dB del testigo sobre su propio
piso** —que se mide, porque 37 Hz es zona de retumbe y de la falda del pasa-altos,
y sin eso un C2 en rojo no se puede diagnosticar—. Una captura que recorta se
anula.

Si falla **C1, C2, L1, L2, L4 o L8**, no se imprime ley. Y si el punto de
referencia está anulado, tampoco: de él cuelga toda la ley.

## Lo que esta corrida NO va a decir

- **Nada sobre las otras cuatro bandas ni sobre los otros canales.** Una banda de
  cinco, un canal de veinticuatro.
- **Nada sobre el ecualizador de salida** (`m.eq.*`, `a.N.eq.*`), que es otro
  `kind` y otra medición.
- **Nada sobre la forma de la campana.** Se mide la altura en el centro, no el
  ancho ni las faldas. El Q se deja donde está y se registra.
- **Nada sobre el parámetro interno del filtro.** Se mide el efecto en el audio,
  que es lo que el producto necesita y lo que `fromRaw` tiene que devolver.
- Una frecuencia, un Q, un nivel de fuente. Y un acuerdo dentro del umbral es una
  **cota**, no una identidad.

### Lo que la sexta auditoría encontró y se deja sin arreglar, a propósito

Se deja dicho en vez de arreglado porque son cosas que **la propia corrida ayuda a
decidir**, y seguir auditando en seco tiene rendimientos decrecientes: seis rondas,
y varias veces lo que una encontraba lo había introducido el arreglo de la
anterior. Lo que podía dañar la consola sí se arregló; esto no puede.

- **Un aplastamiento interno de menos de ~0,5 dB no lo ve nadie**, y la ley
  aplastada se publicaría como la ley. Entre 0,6 y 1,5 dB ahora lo dice L3 con la
  ayuda de L8; por debajo, ninguno de los dos llega.
- **Un solo nivel de estímulo.** No hay control que separe «la ley se aplana
  arriba» de «algo recorta arriba» por variación de nivel. Repetir con el estímulo
  10 dB más bajo es el paso siguiente si L3 falla, y está escrito en su mensaje.
- **C2 puede fallar en una corrida limpia.** Su tope de 0,15 dB de holgura está
  dimensionado como la incertidumbre de *una lectura* y se compara contra el rango
  de 42; con el instrumento en el mínimo de margen que este mismo guion acepta
  (σ ≈ 0,049 dB), una auditoría midió que falla en una de cada cuatro corridas
  sanas. Si pasa, **no** es un hallazgo sobre la consola: es el tope.
- **L8 supone que los dos tonos llegan iguales al medidor.** El desequilibrio real
  entre 37 Hz y 1 kHz —pasa-altos del canal, cadena analógica, el gráfico del
  general, que este guion no exige plano— no está medido por nadie. Unos 3 dB
  producirían una falla de L8 que sería falsa. El dato para estimarlo está en cada
  captura y hoy no se usa.
- **L3b es ciego a la estructura impar.** El término cuadrático no se mueve con un
  taper del tipo `u³`, que es la forma que usan muchas mesas; ahí sólo alcanza la
  prueba de rachas, y recién con ~1 dB. La afirmación de su docblock —«más fino que
  L3»— vale para estructura **par**, y está escrita sin esa condición.
- **Si el barrido no llega a |g| > 13,1 dB con los dos extremos vivos**, las dos
  predicciones de L8 entran en el tope y la corrida no decide si el medidor es de
  pico o de potencia. Lo dice por pantalla.

## Restauración

`i.9.eq.b2.gain`, `i.9.mix`, `i.9.dyn.bypass`, `i.9.gate.enabled`,
`i.9.deesser.enabled`, `m.dyn.bypass`, `m.afs.enabled`, y **`i.9.mute` y
`i.9.eq.bypass`, que los dos controles positivos escriben** —C0 mutea el canal
para medir el piso, C1 puentea el ecualizador para tener el punto plano— y que una
versión anterior de este contrato listaba como «se exige sin escribir». Leídos por HTTP antes, restaurados por
`restaurarClaves()` dentro de `conRestauracion`, verificados releyendo por HTTP. Y
la pila de filtros del supresor se compara antes contra después.

**No se toca**: la instantánea «Alma caninde», la fantasma del canal 9, la
frecuencia y el Q de la banda, ni las otras cuatro bandas.
