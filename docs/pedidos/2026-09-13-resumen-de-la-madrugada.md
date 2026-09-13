# Resumen de la madrugada del 2026-09-13

Plan: [`2026-09-13-plan-de-la-madrugada.md`](2026-09-13-plan-de-la-madrugada.md).
**Cuatro bloques cerrados; el quinto a medias, y conviene decirlo así.**

| Bloque | |
|---|---|
| 0 — la 101 | **cerrado** |
| 1 — la 102 | **cerrado** |
| 2 — auditoría general | **cerrada**, con sus nueve ALTA aplicados |
| 3 — el manual | **cerrado**, con cinco tareas escritas |
| 4 — producto | **a medias**: de las seis tareas (P1…P6) se hizo **P2**, más tres de robustecimiento que no estaban en la lista |

La primera versión de este resumen decía «los cinco bloques quedaron cerrados».
No era cierto, y es exactamente la clase de sobreafirmación que dos auditorías
estuvieron corrigiendo toda la noche.

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

## Lo que queda abierto

| | |
|---|---|
| **La 96b** | el bloque de efectos, estéreo de 7 bytes, sin medir |
| **`m.afs.fmode`** | cuál valor es LIVE, FIXED y LOCK. **Decide si una corrida planta filtros permanentes** |
| **La ganancia del ecualizador** | la campana sube 20,0 dB exactos y el código dice ±15, pero se midió **un solo crudo**: de la forma no se sabe nada |
| **La puerta** | ataque, relajación y retención declarados por el manual, ninguno en el código |
| **El llamador del monitor** | `MONITOR_AUX_SEND` y `techoPorRuta` **sólo existen en tests**. Es lo que haría que una sesión con sonido real valga el tiempo del usuario |
| **74 guiones** | escriben a la consola sin restauración garantizada. El trinquete los cuenta y no los deja crecer |
| **El extremo superior del pasa-bajos** | el manual dice 22 kHz; el estímulo no llega |

## Y lo único que hace falta del usuario

La instantánea **«Alma Caninde»** quedó intacta —verificada leyendo `SHOWLIST` y
`SNAPSHOTLIST`, no por «no la toqué»—. La fantasma del canal 9 no se tocó. Nada
sonó en la sala: no hay nada conectado a ninguna salida salvo los dos cables del
bucle.

**Lo que sí hay que decidir es el ring-out perdido.** Tres filtros de −6 dB en
200, 4226 y 8190 Hz. Rehacerlo es la forma correcta; escribirlos de vuelta con un
Q inferido, no.
