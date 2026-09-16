# El 108 corrió por primera vez, y falló por dos cuadros del medidor

**2026-09-15.** Primera corrida real del ítem 108, después de seis auditorías en
seco. Contrato:
[`108-la-ley-de-la-ganancia-del-ecualizador.md`](../compromisos/108-la-ley-de-la-ganancia-del-ecualizador.md).
Evidencia:
[`ley-ganancia-del-eq-2026-09-15.txt`](../spikes/SPK-P0.10b-vu2/evidence/ley-ganancia-del-eq-2026-09-15.txt).

**No hay ley.** La corrida no llegó al barrido.

## Lo que sí salió bien, y no es poco

- **El supresor no plantó nada**: 0 filtros antes, 0 después. La guarda que la
  sexta auditoría agregó —releer `m.afs.enabled` por HTTP antes del tono— se
  ejecutó y pasó. Es la primera vez que un tono largo de este proyecto pasa por
  esa comprobación, y es exactamente el daño que costó tres filtros dos veces.
- **La consola quedó como estaba**: las 9 claves de `PREVIO` restauradas y
  releídas por HTTP, por una vía distinta de la que escribió.
- **Las precondiciones se cumplieron todas**, incluida la banda 2 en 1000,0 Hz
  exactos, después del aplanado de
  [`hallazgo-el-canal-del-banco-no-estaba-plano.md`](hallazgo-el-canal-del-banco-no-estaba-plano.md).
- **C0 midió el piso**: −116,38 dBFS en el bin de 1 kHz con el canal muteado. El
  grabador, el analizador y el lazo físico funcionan.

## Por dónde falló

```
la captura «puenteado» de L1 tiene 2 cuadros VU2 y hacen falta 20:
el promedio no es un promedio.
```

`C1-puenteado` es **la primera captura con el tono sonando**. Juntó 2 cuadros del
medidor donde el guion exige 20.

## Cinco hipótesis, las cinco refutadas contra el aparato

Ninguna de éstas es la causa. Se dejan escritas porque una hipótesis descartada
con una medición vale más que una sospecha viva, y porque la próxima persona que
mire esto va a pensar las mismas cinco.

| Hipótesis | Qué se midió | Veredicto |
|---|---|---|
| Los flujos `/raw` abiertos ahogan el WebSocket | 22,0 / 22,3 / 21,3 cuadros/s con cero, uno y dos `/raw` abiertos | **No** |
| El grabador le roba la Scarlett al flujo | 29,7/s *durante* la grabación, más que la línea de base | **No** |
| `decodificarVuCanales` descarta cuadros cortos | 135 de 135 cuadros traen los 24 canales; el índice 9 existe en todos | **No** |
| El grabador muere cuando `afplay` tiene el dispositivo | código 0 y 3 471 ms con `afplay` sonando | **No** |
| `analizar()`, que es síncrono, mata el flujo | bloquea 2 562 ms y los cuadros **no se pierden: se acumulan** | **No** |

## Lo que la búsqueda de trabajo previo aportó

Se buscó en proyectos de terceros, a pedido del usuario y por la regla de la
disciplina. Existen cuatro implementaciones del mismo protocolo que este
repositorio no citaba —[`fmalcher/soundcraft-ui`](https://github.com/fmalcher/soundcraft-ui)
sólo figuraba en un anexo de auditoría, y
[`Dennion/ioBroker.soundcraft`](https://github.com/Dennion/ioBroker.soundcraft),
[`ndikanov/ui24`](https://github.com/ndikanov/ui24) y
[`NaturalDevCR/MyUiPro`](https://github.com/NaturalDevCR/MyUiPro) no figuraban—.

De ahí salió la única pista accionable, y de un tutorial suelto:
[blechtrottel.net](https://blechtrottel.net/en/jswebsockets.html) documenta que la
consola **cierra la conexión si deja de recibir `3:::ALIVE`**. Se comprobó:
`Ui24rTransport` ya manda el latido periódico. Descartado, pero era la hipótesis
correcta para ir a mirar.

**Ninguno de los cuatro documenta la supresión del `VU2` en silencio**, que es el
punto que hace falta. Eso sigue siendo un hallazgo propio de este repositorio.

## Y una afirmación de este repositorio que hoy no reproduce

Cinco documentos —[`SPK-P0.1-conectividad.md`](../spikes/SPK-P0.1-conectividad.md),
`risk-register.md` R-25, `safety-invariants.md` INV-017,
[`G-A.md`](../gates/G-A.md) y `guia-de-pruebas-manuales.md`— afirman que la
consola calla el `VU2` en silencio: *«una trama en 30 s de silencio; 1 932 en
90 s»*, medido el 2026-09-08.

Medido el 2026-09-15, con **el único cable de entrada en el canal 10** y ningún
otro cliente conectado —confirmado por el usuario—, o sea silencio real: ningún
canal por encima de −60 dB, el canal 10 en −70,3 dB, y el `VU2` fluyendo a
**22,5 cuadros/s**.

Las dos no pueden ser ciertas. O la conducta depende de algo que ninguna de las
dos corridas anotó, o una de las dos midió otra cosa.

**Qué NO cambia con esto.** INV-017 decide vigilar `RTA` y nunca `VU2`, y esa
decisión sigue siendo la correcta: `RTA` es estable en los dos casos. Lo que
queda sin respaldo es el **motivo** escrito al lado, y un motivo falso que
defiende una decisión correcta es peor que ninguno, porque nadie lo vuelve a
mirar. Queda declarado, no corregido: corregirlo pide medir la transición, que es
lo que ninguna de las dos corridas hizo.

## Dos defectos del guion, encontrados y arreglados

Ninguno es la causa del fallo. Los dos son de la misma familia que la causa:
**instrumentos que no dicen lo que les pasa.**

**1. El grabador era mudo y su código de salida no lo miraba nadie.** Estaba con
`stdio: 'ignore'` y resolviendo en `close` sin leer el código. Un grabador que
muriera diciendo por qué —dispositivo ocupado, permiso de micrófono, la Scarlett
desenchufada— quedaba indistinguible de uno que grabó bien, y lo que fallaba
después era el análisis, acusando a otra cosa.

**2. El promedio del medidor arrastraba el punto anterior.** `analizar()` bloquea
el bucle de eventos 2 562 ms por captura. Los cuadros que llegan durante ese
bloqueo no se pierden: Node los encola y los entrega **después** de que la
captura siguiente hizo su `cuadros = []`. Medido: una ventana de 3,9 s que debía
traer 89 cuadros traía **149** —37,7/s contra los 22,5/s reales del flujo—.

Eso significa que el promedio del medidor de cada punto del barrido venía
contaminado con cuadros del punto anterior, **medidos con otra ganancia**. De ese
promedio cuelga L8, y la contaminación corre la lectura hacia el punto anterior:
**aplana la curva que L8 vigila**, que es la dirección en la que L8 deja de ver
un recorte interno. Los cuadros ahora llevan su hora de llegada y se filtran a la
ventana real de grabación.

**Y toda captura imprime ahora cuántos cuadros juntó.** El fallo dijo «2 cuadros»
de la primera captura con tono, y no se pudo saber si C0 había estado sana,
porque nadie lo imprimía. Un número que sólo aparece cuando ya es tarde no sirve
para diagnosticar: hace falta la serie, no el caso que falló.

## Lo que queda abierto

**No se sabe por qué esa captura vio 2 cuadros**, y no se va a saber
teorizando: cinco hipótesis razonables cayeron contra el aparato. La corrida
siguiente trae la serie completa de conteos, y con eso se separa lo único que
falta separar: si el flujo estuvo muerto desde el arranque —C0 incluida— o si se
murió cuando entró el tono.

Hasta entonces, **el mensaje de error miente sobre sí mismo**. Dice «el promedio
no es un promedio», que suena a reproche estadístico, cuando lo que está diciendo
es «acá no llegó señal». Es la misma familia de defecto que el guion que acusa a
la consola equivocada, y se arregla cuando se sepa qué lo dispara.
