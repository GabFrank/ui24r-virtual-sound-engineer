# 112 — La misma ley, pero en el ecualizador del GENERAL

## MEDIDA el 2026-09-16: `30·V − 15`, la MISMA del auxiliar

Evidencia:
[`ley-del-eq-del-general-2026-09-16b.txt`](../spikes/SPK-P0.2c/evidence/ley-del-eq-del-general-2026-09-16b.txt).
Los tres controles en verde.

| | el auxiliar 5 (ítem 109) | **el general (ítem 112)** | tope |
|---|---|---|---|
| pendiente | 29.990 dB por unidad | **29.993 dB por unidad** | — |
| ordenada | -14.995 dB | **-14.996 dB** | — |
| residuo máximo (L2) | 0.001 dB | **0.001 dB** | 0.3 |
| recorrido total (L3) | 29.99 dB | **29.99 dB** | 24 mínimo |
| corte y realce (L4) | -14.99 y 15.00 dB | **-15.00 y 15.00 dB** | — |
| asimetría (L4) | 0.00 | **0.00** | 0.5 |
| el testigo se movió (C2) | 0.32 dB | **0.32 dB** | 1.0 |

**Las dos superficies dan la misma ley, a la milésima.** La deuda que el 109 dejó
escrita —«que el general comparta la ley es una suposición razonable, no un
resultado»— queda saldada: ahora es un resultado.

**Y la banda 17 vuelve a responder en 1000 Hz**, medido igual que en el 109
—realce al máximo contra plano en cinco candidatas—: 14.99 dB en 1000, 5.42 y
5.31 en las vecinas, 1.96 y 1.93 a dos bandas. La misma forma de falda que el
auxiliar.

**C0 pasó con 9.96 dB** de los 10 pedidos: subir la fuente no encontró ninguna no
linealidad en el camino, así que el barrido se hizo sobre una cadena limpia.

### Lo que esto habilita

`m.eq.peak.l.K` entra en `RAW_MAP` como **PROBADO**, y el motor de seguridad la
deja escribir —está en dB, igual que el tope de su `kind`—. Son **ocho** rutas
crudas con conversión medida, **cuatro** de ellas escribibles.

### Lo que NO entra, y por qué

**El lado derecho.** `m.eq.peak.r.K` se canoniza pero **no convierte**: la salida
que vuelve al banco es la **master 1**, o sea el lado izquierdo, y medir el
derecho pide que alguien cambie un cable. Darlo por simetría sería exactamente lo
que el 109 hizo con el general y esta medición tuvo que ir a corregir.

**Y hay un motivo más fuerte, que salió de esta misma corrida:** el enlace L/R
**no lo resuelve la consola**. Ver
[el hallazgo](../backlog/hallazgo-el-enlace-del-eq-lo-hace-el-cliente.md).

### Tarea que queda, y necesita manos

Medir `m.eq.peak.r.K` con la **master 2** entrando a la interfaz. Es la misma
corrida con `ENTRADA` cambiada; lo único que falta es el cable, y eso no lo puede
hacer un guion.

**Contrato escrito el 2026-09-16, ANTES de tocar la consola.** Consola
192.168.0.78. Canal 10 (`i.9`) → **general** → entrada 1 de la Scarlett.

## Por qué existe este contrato aparte

El [ítem 109](109-la-ley-del-ecualizador-de-salida.md) midió el ecualizador
gráfico **de un auxiliar** y dio `30·V − 15`. Y dejó escrita, con todas las
letras, la deuda:

> «Que el general comparta la ley es una **suposición razonable, no un
> resultado**. Si hace falta cerrarla, se mide aparte y con su propia
> autorización.»

**El usuario la dio.** Ante la pregunta interactiva de si valía la pena medir
también el general, contestó *«Medilo también en el general»*. Esto es esa
medición, y este contrato es el «aparte».

## Qué decide

Si `m.eq.peak.l.17` —una banda del gráfico del general— obedece **la misma ley**
que obedeció la banda del auxiliar, o no.

**No es una formalidad.** El general es la superficie que la aplicación va a
tocar de verdad cuando llegue a corregir la mezcla, y es la única de las dos
donde una ley equivocada le cambia el sonido al público. Que dos superficies se
dibujen con la misma función en el cliente no prueba que el audio las trate
igual: este proyecto ya vio a `VtoTHRESH` y `VtoRATIO` describir la pantalla y
no el aparato (medición 97).

## Por qué es más delicada que la 109, y qué se hace con eso

El auxiliar 5 no estaba en el camino de nada del usuario. **El general sí: es por
donde sale su mezcla, y es la superficie donde este proyecto le plantó un filtro
permanente dos veces.** De ahí tres decisiones:

1. **El fader que se mueve para hacer lugar es el DEL CANAL 10, nunca el del
   general.** El fader del general es el nivel de PA del usuario; bajarlo para
   acomodar una medición es tocarle el volumen. Se baja `i.9.mix`.
2. **Los dos lados entran en `PREVIO`.** `m.eq.linked = 1` (leído el 2026-09-16):
   escribir el izquierdo puede mover el derecho. Restaurar sólo el lado escrito
   sería restaurar la mitad, y nadie se enteraría. Se lee `m.eq.peak.r.17` aunque
   no se escriba, y al final se informa si siguió al izquierdo.
3. **Una sola banda, la 17**, que es la que el 109 ya ubicó en 1000 Hz. No se
   barre el gráfico.

## Qué se escribe, y qué vuelve

| Clave | Para qué |
|---|---|
| `m.afs.enabled` | apagado mientras suene, **comprobado releyendo por HTTP** |
| `m.eq.peak.l.17` | **la banda que se barre**: es la medición |
| `m.eq.peak.r.17` | no se escribe; entra por el enlace, para poder restaurarla |
| `i.9.mix` | el fader del canal, para el punto de trabajo |
| `m.dyn.bypass` | el compresor del general, puenteado: depende del nivel |
| `i.9.dyn.bypass`, `i.9.gate.enabled`, `i.9.deesser.enabled` | el proceso del canal |

Todas leídas antes, restauradas por `restaurarClaves()` dentro de
`conRestauracion`, verificadas releyendo por HTTP, y anotadas en el papelito de
`pendiente.ts` antes de la primera escritura.

**No se toca** `m.mix` —el fader del general—, ni `m.eq.bypass`, ni `m.eq.linked`,
ni ninguna otra de las 31 bandas.

**Estado leído antes de escribir, el 2026-09-16:** `m.eq.linked` 1,
`m.eq.bypass` 0, `m.eq.prmod` 0, las dos bandas 17 en 0,5, `m.afs.numtotal` 12.

## Los controles

**C1 — el tono llega.** El bin de 1000 Hz, con la banda plana, al menos **45 dB**
sobre el piso efectivo medido con el canal muteado.

**C2 — la banda es LOCAL.** El testigo, a **seis bandas** de distancia, no se
puede mover más de **1,0 dB** mientras la banda barre su recorrido. Las seis
bandas y el estímulo de **dos tonos** son la corrección que el 109 pagó con una
corrida: con un solo tono el testigo lee ruido, y con dos bandas de separación la
propia falda lo mueve 1,96 dB.

## Enmienda del 2026-09-16, ANTES de medir nada: hay un control más

**La primera corrida murió en la calibración, sin escribir ninguna banda.**
Evidencia:
[`ley-del-eq-del-general-2026-09-16.txt`](../spikes/SPK-P0.2c/evidence/ley-del-eq-del-general-2026-09-16.txt).
Con el fader del canal en su tope útil de 0,9 el tono llegaba a **−43,45 dBFS**,
tres decibeles por debajo de la ventana de trabajo. Por el general la señal llega
mucho más baja que por el auxiliar, porque el fader del general del usuario está
en 0,644 **y no se toca**.

La salida no es subir ese fader —es el volumen de PA del usuario— sino subir **la
fuente**, que es software nuestro: de −18 a −8 dBFS.

**Y subir la fuente no es gratis, así que se comprueba.** Empuja el previo de la
consola y todo lo analógico del medio; si algo recortara, el barrido saldría
aplanado — que es exactamente el resultado que más se parece a un hallazgo
(«el ecualizador tiene menos recorrido del que dice») y no lo sería.

**C0 — la subida de fuente es lineal en la cadena.** Se mide el tono antes y
después de subir la fuente 10 dB; la salida tiene que moverse **10 ± 1,0 dB**, y
la captura no puede recortar. Si no, se detiene antes de tocar el ecualizador.

Queda escrito acá, con su motivo, **antes** de la corrida que lo usa.

## Las expectativas, declaradas antes de mirar

Son las del 109, a propósito, porque la pregunta es si el resultado se repite:

- **L1 — el crudo 0,5 es el punto plano**, dentro de 0,2 dB.
- **L2 — lineal en el crudo**, residuo máximo 0,3 dB.
- **L3 — recorrido total de al menos 24 dB**, y se informa cuál es.
- **L4 — simetría**: |dB en 0| y |dB en 1| no difieren más de 0,5 dB.
- **L5 — ida y vuelta** dentro de 0,5 dB.
- **L6 — el crudo escrito contra el releído.**

Si falla C1, C2, L1 o L3, **no se imprime ley**.

**Y una expectativa que el 109 no podía tener:** si la ley sale `30·V − 15`, la
suposición se cierra. **Si sale distinta, el hallazgo es más grande que esta
medición**, porque significa que el cliente dibuja con la misma función dos
superficies que el audio trata distinto — y entonces ninguna fórmula del cliente
vale para una superficie donde no se midió.

## Lo que esta corrida NO va a decir

- **Nada de las otras 30 bandas** del general.
- **Nada de los otros cinco auxiliares.** El 109 midió el aux 5 y esto el
  general: son dos superficies de las siete que tienen gráfico.
- **Nada del ancho de banda ni de cómo interactúan las bandas entre sí.**
- **Nada de `m.eq.prmod`**, que se lee y se deja como está.
- Un nivel de fuente, una frecuencia, un día, una consola.

## Trabajo previo

**Buscado el 2026-09-16, clonando los cuatro repositorios y grepeándolos**, no de
memoria. Y esta vez apareció algo que la búsqueda del 109 no vio.

**`fmalcher/soundcraft-ui` SÍ trae el ecualizador del general**, en
`packages/mixer-connection/src/lib/example-state.json`: un bloque `m.eq` con
`peak.l` y `peak.r` de **31 bandas cada uno**, más `linked`, `bypass`, `prmod`,
`hpf` y `lpf`. Los auxiliares tienen el suyo, también de 31.

Eso **corrobora tres cosas que este proyecto midió por su cuenta**, y viniendo de
otra consola y otro autor vale como segunda fuente:

| Lo que este proyecto midió | Lo que el estado archivado de fmalcher muestra |
|---|---|
| el gráfico de salida tiene 31 bandas | `peak.l.0` … `peak.l.30`, exactamente 31 |
| es estéreo, con lado L y lado R | `peak.l` y `peak.r`, separados |
| el crudo 0,5 es el plano | las 62 bandas, **todas** en 0,5 |
| el enlace L/R es una clave aparte | `m.eq.linked` existe en el modelo |

**Y no trae ninguna semántica.** Sus únicos conversores a decibeles son los del
fader y los del medidor (`value-converters.ts`, `vu.utils.ts`): **para el
ecualizador no hay ninguno**. O sea que la ley sigue sin tener precedente
publicado — lo que perdió es la exclusividad de la estructura.

- **`Dennion/ioBroker.soundcraft`**, **`ndikanov/ui24`** y **`NaturalDevCR/MyUiPro`**:
  cero coincidencias de `eq.peak`, `graphic`, `geq` ni `eq.linked`.

### Y corrige al 109, que dijo de más

El ítem 109 escribió que en `fmalcher/soundcraft-ui` había **«cero coincidencias
de `eq.peak`»**. Como búsqueda de texto es cierto, y como afirmación es engañosa:
en ese repositorio las claves viven **anidadas en un JSON**, así que `eq.peak`
nunca aparece como cadena aunque la estructura esté entera. La frase se leyó como
«no expone el ecualizador de salida», y **sí lo expone**.

Es la misma forma que este repositorio persigue y que ya corrigió una vez con el
supresor: **una búsqueda que no encuentra convertida en un «no hay»**. La
diferencia entre las dos veces es sólo el costo — allá se perdió una atribución,
acá se habría perdido una corroboración independiente de cuatro hechos medidos.
