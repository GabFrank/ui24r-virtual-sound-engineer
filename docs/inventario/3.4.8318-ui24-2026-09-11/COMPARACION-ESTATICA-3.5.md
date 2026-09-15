# Comparación con el inventario estático 3.5.8328

**Las dos fuentes no son equivalentes, y esta comparación no las trata como si
lo fueran.** Lo observado sale de una consola encendida con firmware
`3.4.8318-ui24`; el inventario 3.5 sale de un ZIP analizado estáticamente, sin
ejecutar el servidor ni ver una unidad. Una diferencia entre las dos **no
demuestra un cambio de versión**: puede ser una ruta heredada, una condicional
que no se dio, un nombre de otro modelo, o simplemente algo que no estaba activo
en el momento de la captura.

## Cifras

| | |
|---|---|
| Claves observadas en la consola 3.4 | **6732** |
| Nombres literales en el documento 3.5 que tienen forma de clave | **1758** |
| Coincidencia **literal** | **1294** |
| Coincidencia **por patrón** (mismo nombre con otro índice) | **91** |
| Referenciadas en 3.5 y **no observadas** en esta captura | **373** |

Los conjuntos no se suman entre sí: el documento 3.5 mezcla nombres literales,
sufijos, expresiones sin resolver y cadenas candidatas del binario, y acá sólo se
tomaron las que tienen forma de clave completa.

## Familias

**Sólo en el documento 3.5**, no observadas acá: _ninguna_

**Sólo observadas en la consola**, no inventariadas en 3.5: `firmware`, `flavour`, `hwouthpdsp`, `mg`, `mgmask`, `model`, `mtk`, `schema`, `type`, `vg`

## Referenciadas en 3.5 y no observadas en esta captura

**Esto no significa «introducidas en 3.5».** Significa que no aparecieron en los
90 segundos de escucha ni en el volcado HTTP de esta unidad,
con esta configuración y en este momento.

- `a.0`
- `a.0.aux.0.mute`
- `a.0.aux.0.pan`
- `a.0.aux.0.post`
- `a.0.aux.0.postproc`
- `a.0.aux.0.value`
- `a.0.aux.1.mute`
- `a.0.aux.1.pan`
- `a.0.aux.1.post`
- `a.0.aux.1.postproc`
- `a.0.aux.1.value`
- `a.0.aux.2.mute`
- `a.0.aux.2.pan`
- `a.0.aux.2.post`
- `a.0.aux.2.postproc`
- `a.0.aux.2.value`
- `a.0.aux.3.mute`
- `a.0.aux.3.pan`
- `a.0.aux.3.post`
- `a.0.aux.3.postproc`
- `a.0.aux.3.value`
- `a.0.aux.4.mute`
- `a.0.aux.4.pan`
- `a.0.aux.4.post`
- `a.0.aux.4.postproc`
- `a.0.aux.4.value`
- `a.0.aux.5.mute`
- `a.0.aux.5.pan`
- `a.0.aux.5.post`
- `a.0.aux.5.postproc`
- `a.0.aux.5.value`
- `a.0.aux.6.mute`
- `a.0.aux.6.pan`
- `a.0.aux.6.post`
- `a.0.aux.6.postproc`
- `a.0.aux.6.value`
- `a.0.aux.7.mute`
- `a.0.aux.7.pan`
- `a.0.aux.7.post`
- `a.0.aux.7.postproc`
- `a.0.aux.7.value`
- `a.0.aux.8.mute`
- `a.0.aux.8.pan`
- `a.0.aux.8.post`
- `a.0.aux.8.postproc`
- `a.0.aux.8.value`
- `a.0.aux.9.mute`
- `a.0.aux.9.pan`
- `a.0.aux.9.post`
- `a.0.aux.9.postproc`
- `a.0.aux.9.value`
- `a.0.fx.0.mute`
- `a.0.fx.0.value`
- `a.0.fx.1.mute`
- `a.0.fx.1.value`
- `a.0.fx.2.mute`
- `a.0.fx.2.value`
- `a.0.fx.3.mute`
- `a.0.fx.3.value`
- `a.1`
- `a.2`
- `a.3`
- `a.4`
- `a.5`
- `a.6`
- `a.7`
- `a.8`
- `a.9`
- `a.BASS.setValue`
- `a.D1.setValue`
- `a.D2.setValue`
- `a.D3.setValue`
- `a.MID.setValue`
- `a.TREBLE.setValue`
- `a.getNameValue`
- `a.l1.setKey`
- `a.l2.setKey`
- `a.l3.setKey`
- `a.l4.setKey`
- `a.l5.setKey`
- `a.s1.setKey`
- `a.s2.setKey`
- `a.s3.setKey`
- `a.s4.setKey`
- `a.s5.setKey`
- `a.setNameValue`
- `a.setValue`
- `a.sl.setValue`
- `a.slFREQ.setValue`
- `a.slGAIN.setValue`
- `a.slGain.setValue`
- `a.transport.onClose`
- `afs.fmode`
- `afs.logic`
- `afs.sensitivity`
- `f.0`
- `f.0.deesser.enabled`
- `f.0.deesser.freq`
- `f.0.deesser.ratio`
- `f.0.deesser.threshold`
- `f.0.eq.lpf.freq`
- `f.0.eq.lpf.slope`
- `f.0.fx.0.mute`
- `f.0.fx.0.value`
- `f.0.fx.1.mute`
- `f.0.fx.1.value`
- `f.0.fx.2.mute`
- `f.0.fx.2.value`
- `f.0.fx.3.mute`
- `f.0.fx.3.value`
- `f.0.mtx.0.mute`
- `f.0.mtx.0.pan`
- `f.0.mtx.0.value`
- `f.0.mtx.1.mute`
- `f.0.mtx.1.pan`
- `f.0.mtx.1.value`
- `f.0.mtx.2.mute`
- `f.0.mtx.2.pan`
- `f.0.mtx.2.value`
- `f.0.mtx.3.mute`
- `f.0.mtx.3.pan`
- `f.0.mtx.3.value`
- `f.0.mtx.4.mute`
- `f.0.mtx.4.pan`
- `f.0.mtx.4.value`
- `f.0.mtx.5.mute`
- `f.0.mtx.5.pan`
- `f.0.mtx.5.value`
- `f.0.mtx.6.mute`
- `f.0.mtx.6.pan`
- `f.0.mtx.6.value`
- `f.0.mtx.7.mute`
- `f.0.mtx.7.pan`
- `f.0.mtx.7.value`
- `f.0.mtx.8.mute`
- `f.0.mtx.8.pan`
- `f.0.mtx.8.value`
- `f.0.mtx.9.mute`
- `f.0.mtx.9.pan`
- `f.0.mtx.9.value`
- `f.1`
- `f.2`
- `f.3`
- `f.getNameValue`
- `f.setKey`
- `f.setNameValue`
- `f.vuIN.setValue`
- `f.vuOUT.setValue`
- `hw.0`
- `hw.1`
- `hw.10`
- `hw.11`
- `hw.12`
- `hw.13`
- `hw.14`
- `hw.15`
- `hw.16`
- `hw.17`
- `hw.18`
- `hw.19`
- `hw.2`
- `hw.20`
- `hw.21`
- `hw.24`
- `hw.25`
- `hw.3`
- `hw.4`
- `hw.5`
- `hw.6`
- `hw.7`
- `hw.8`
- `hw.9`
- `i.66.c4`
- `l.0.deesser.enabled`
- `l.0.deesser.freq`
- `l.0.deesser.ratio`
- `l.0.deesser.threshold`
- `l.0.eq.lpf.freq`
- `l.0.eq.lpf.slope`
- `l.0.mtx.0.mute`
- `l.0.mtx.0.pan`
- `l.0.mtx.0.value`
- `l.0.mtx.1.mute`
- `l.0.mtx.1.pan`
- `l.0.mtx.1.value`
- `l.0.mtx.2.mute`
- `l.0.mtx.2.pan`
- `l.0.mtx.2.value`
- `l.0.mtx.3.mute`
- `l.0.mtx.3.pan`
- `l.0.mtx.3.value`
- `l.0.mtx.4.mute`
- `l.0.mtx.4.pan`
- `l.0.mtx.4.value`
- `l.0.mtx.5.mute`
- `l.0.mtx.5.pan`
- `l.0.mtx.5.value`
- `l.0.mtx.6.mute`
- `l.0.mtx.6.pan`
- `l.0.mtx.6.value`
- `l.0.mtx.7.mute`
- `l.0.mtx.7.pan`
- `l.0.mtx.7.value`
- `l.0.mtx.8.mute`
- `l.0.mtx.8.pan`
- `l.0.mtx.8.value`
- `l.0.mtx.9.mute`
- `l.0.mtx.9.pan`
- `l.0.mtx.9.value`
- `l.invert`
- `l.ratio`
- `l.softknee`
- `l.threshold`
- `m.0`
- `m.1`
- `m.aux.0.mute`
- `m.aux.0.pan`
- `m.aux.0.post`
- `m.aux.0.postproc`
- `m.aux.0.value`
- `m.aux.1.mute`
- `m.aux.1.pan`
- `m.aux.1.post`
- `m.aux.1.postproc`
- `m.aux.1.value`
- `m.aux.2.mute`
- `m.aux.2.pan`
- `m.aux.2.post`
- `m.aux.2.postproc`
- `m.aux.2.value`
- `m.aux.3.mute`
- `m.aux.3.pan`
- `m.aux.3.post`
- `m.aux.3.postproc`
- `m.aux.3.value`
- `m.aux.4.mute`
- `m.aux.4.pan`
- `m.aux.4.post`
- `m.aux.4.postproc`
- `m.aux.4.value`
- `m.aux.5.mute`
- `m.aux.5.pan`
- `m.aux.5.post`
- `m.aux.5.postproc`
- `m.aux.5.value`
- `m.aux.6.mute`
- `m.aux.6.pan`
- `m.aux.6.post`
- `m.aux.6.postproc`
- `m.aux.6.value`
- `m.aux.7.mute`
- `m.aux.7.pan`
- `m.aux.7.post`
- `m.aux.7.postproc`
- `m.aux.7.value`
- `m.aux.8.mute`
- `m.aux.8.pan`
- `m.aux.8.post`
- `m.aux.8.postproc`
- `m.aux.8.value`
- `m.aux.9.mute`
- `m.aux.9.pan`
- `m.aux.9.post`
- `m.aux.9.postproc`
- `m.aux.9.value`
- `m.eq.peak`
- `m.fx.0.mute`
- `m.fx.0.value`
- `m.fx.1.mute`
- `m.fx.1.value`
- `m.fx.2.mute`
- `m.fx.2.value`
- `m.fx.3.mute`
- `m.fx.3.value`
- `m.tempo`
- `p.0`
- `p.0.deesser.enabled`
- `p.0.deesser.freq`
- `p.0.deesser.ratio`
- `p.0.deesser.threshold`
- `p.0.eq.lpf.freq`
- `p.0.eq.lpf.slope`
- `p.0.mtx.0.mute`
- `p.0.mtx.0.pan`
- `p.0.mtx.0.value`
- `p.0.mtx.1.mute`
- `p.0.mtx.1.pan`
- `p.0.mtx.1.value`
- `p.0.mtx.2.mute`
- `p.0.mtx.2.pan`
- `p.0.mtx.2.value`
- `p.0.mtx.3.mute`
- `p.0.mtx.3.pan`
- `p.0.mtx.3.value`
- `p.0.mtx.4.mute`
- `p.0.mtx.4.pan`
- `p.0.mtx.4.value`
- `p.0.mtx.5.mute`
- `p.0.mtx.5.pan`
- `p.0.mtx.5.value`
- `p.0.mtx.6.mute`
- `p.0.mtx.6.pan`
- `p.0.mtx.6.value`
- `p.0.mtx.7.mute`
- `p.0.mtx.7.pan`
- `p.0.mtx.7.value`
- `p.0.mtx.8.mute`
- `p.0.mtx.8.pan`
- `p.0.mtx.8.value`
- `p.0.mtx.9.mute`
- `p.0.mtx.9.pan`
- `p.0.mtx.9.value`
- `p.1`
- `s.1.aux.0.mute`
- `s.1.aux.0.pan`
- `s.1.aux.0.post`
- `s.1.aux.0.postproc`
- `s.1.aux.0.value`
- `s.1.aux.1.mute`
- `s.1.aux.1.pan`
- `s.1.aux.1.post`
- `s.1.aux.1.postproc`
- `s.1.aux.1.value`
- `s.1.aux.2.mute`
- `s.1.aux.2.pan`
- `s.1.aux.2.post`
- `s.1.aux.2.postproc`
- `s.1.aux.2.value`
- `s.1.aux.3.mute`
- `s.1.aux.3.pan`
- `s.1.aux.3.post`
- `s.1.aux.3.postproc`
- `s.1.aux.3.value`
- `s.1.aux.4.mute`
- `s.1.aux.4.pan`
- `s.1.aux.4.post`
- `s.1.aux.4.postproc`
- `s.1.aux.4.value`
- `s.1.aux.5.mute`
- `s.1.aux.5.pan`
- `s.1.aux.5.post`
- `s.1.aux.5.postproc`
- `s.1.aux.5.value`
- `s.1.aux.6.mute`
- `s.1.aux.6.pan`
- `s.1.aux.6.post`
- `s.1.aux.6.postproc`
- `s.1.aux.6.value`
- `s.1.aux.7.mute`
- `s.1.aux.7.pan`
- `s.1.aux.7.post`
- `s.1.aux.7.postproc`
- `s.1.aux.7.value`
- `s.1.aux.8.mute`
- `s.1.aux.8.pan`
- `s.1.aux.8.post`
- `s.1.aux.8.postproc`
- `s.1.aux.8.value`
- `s.1.aux.9.mute`
- `s.1.aux.9.pan`
- `s.1.aux.9.post`
- `s.1.aux.9.postproc`
- `s.1.aux.9.value`
- `s.1.deesser.enabled`
- `s.1.deesser.freq`
- `s.1.deesser.ratio`
- `s.1.deesser.threshold`
- `s.1.eq.lpf.freq`
- `s.1.eq.lpf.slope`
- `settings.block.mode`
- `settings.cascade.ch24solo`
- `settings.hpaux`
- `settings.shuffle`

## Qué haría falta para convertir esto en una comparación de versiones

Una captura **equivalente** de una consola con 3.5.8328 encendida: mismo método,
misma duración, misma configuración de capacidades. Sin eso, lo único que se
puede afirmar es lo que dice cada fila de arriba, con su calificativo.

También ayudaría una captura de 3.4 con **otras condiciones activas** —cascada
conectada, multipista grabando, soundcheck encendido, efectos en uso— porque
varias de las no observadas pertenecen a modos que esta captura no ejerció.

## Rutas de propiedades del cliente, apartadas a propósito

El documento 3.5 mezcla claves del protocolo con accesos JavaScript de la
interfaz —`this.algo`, `selectedStrip.x`, `dynPage.y`— y con sufijos
relativos. **319** nombres con forma de clave caen en ese
grupo y no entran en las cifras de arriba: son bindings de widgets, no
parámetros publicados. Familias: `bmEqdyn`, `bmMeters`, `c`, `comp`, `cs`, `d`, `deesser`, `delay`, `delay2`, `digitech`, `dyn`, `dynPage`, `e`, `eq`, `fx`, `fxtype`, `g`, `gate`, `gatePage`, `h`, `hp`, `li`, `n`, `q`, `selectedStrip`, `this`, `tvPage`, `ua`, `ub`, `y`, `z`

Meterlos en el conteo habría inflado el inventario con nombres que el aparato no
manda nunca, que es exactamente lo que el encargo pide no hacer.

## Lo que este documento NO hace

- No usa los 1.437 nombres obtenidos en 3.5 mediante sondas de reset. Ese
  conjunto se generó con sustitutos de setters y capacidades hipotéticas: es
  evidencia del cliente, no publicación real.
- No construye claves combinando familias con sufijos.
- No convierte un patrón con `%d` o `{expresión}` en una clave concreta.
