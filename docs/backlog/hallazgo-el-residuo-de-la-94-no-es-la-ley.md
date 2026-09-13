# Hallazgo: el residuo que la 94 declaró indecidible no es la ley del envío

**Medido el 2026-09-13, ítem 104.** Evidencia:
`docs/spikes/SPK-P0.10b-vu2/evidence/ley-del-envio-a-monitor-2026-09-13.txt`.
Banco: canal 10 (`i.9`) → auxiliar 5 (`a.4`) → salida física → entrada 2 de la
Scarlett. Tono de 1 kHz, 50 puntos de ida y vuelta, 48 útiles.

## Lo que estaba abierto

La medición **94** barrió el envío a auxiliar y vio, en el tramo bajo, un
residuo **unilateral y creciente** contra la ley declarada. No pudo decidir si
era el piso del medidor de la consola o una diferencia real de ley, y lo dejó
escrito como indecidible. El banco de aquella corrida no tenía forma de
saberlo: el único testigo era el propio medidor, que ahí abajo está aplastado.

**Este banco sí puede contestarlo**, porque mira la salida física con un
convertidor externo, que no tiene piso donde el medidor lo tiene.

## Lo que se midió

La ley bajo prueba es `faderADb`, que es `VtoLIN` copiada literal del
`mixer.html` que la consola sirve. Hasta hoy estaba verificada **contra la
pantalla de la consola**, no contra el aire.

| tramo | acuerdo de `VtoLIN` con la salida real |
|---|---|
| primeros 32 dB de atenuación (crudo 1,0 → 0,35) | **≤ 0,007 dB**, 16 puntos |
| 32 a 42 dB (crudo 0,35 → 0,25) | de 0,006 a 0,028 dB, siempre del mismo signo |
| 42 a 55 dB (crudo 0,25 → 0,15) | de 0,031 a 0,146 dB |

Los dos crudos puestos **fuera de la rejilla de centésimos** a propósito
(0,8237 y 0,6141) dan residuos de 0,0015 y 0,0000 dB. Es la comprobación de que
la consola no redondea el crudo del envío y de que el barrido no se está
midiendo a sí mismo.

`L3b`, declarada antes de mirar, **falló**: 23 residuos de 23 con el mismo
signo, 0 cambios de signo donde con residuos independientes se esperarían ~12.
La firma de la 94 reapareció en un banco sin piso de medidor. Eso ya es el
resultado: **no era el piso del medidor.**

## Y tampoco es la ley

Un residuo estructurado admite dos formas, y no dicen lo mismo:

- **una ley distinta** deja un residuo proporcional a la atenuación;
- **algo que se suma** deja un residuo plano arriba y creciente abajo.

El residuo medido es plano hasta 28 dB y después se acelera. Ajustando:

| modelo | residuo que queda | signos |
|---|---|---|
| `VtoLIN` tal cual | 0,146 dB | 1+/20− |
| factor de escala ×0,99924 | 0,104 dB | 21+/2− |
| término aditivo incoherente | 0,019 dB | 5+/18− |
| término aditivo coherente | 0,024 dB | 11+/12− |

El factor de escala **empeora** el acuerdo arriba para mejorarlo abajo, que es
lo que hace un modelo equivocado. El aditivo lo mejora en los dos extremos, y
en el coherente los signos quedan repartidos (10 cambios de signo sobre 22), o
sea: ya no queda estructura que explicar.

**Prueba de retención, que es la honesta:** ajustando el modelo aditivo
**sin** el punto más bajo y usándolo para predecirlo, el error de ese punto
baja de 0,146 dB a 0,059 dB. Predice, no sólo ajusta. Pero no lo clava, así que
el modelo describe la forma y **no fija el mecanismo**.

## El número que lo cierra, y que es medido y no ajustado

La corrida midió el auxiliar **con el envío en 0**:

```
con el envio en 0: la interfaz ve -91.77 dBFS
```

Eso es el **bin de 1 kHz**, no banda ancha. El piso del bin de este banco,
deducido punto por punto como `real − margen`, es −117,0 dBFS con 1,3 dB de
dispersión en seis capturas. O sea que ese −91,77 está **25 dB por encima del
piso**: es un tono, no ruido.

Con el envío cerrado hay señal de 1 kHz en la salida del auxiliar, **79,1 dB
por debajo de la referencia**. Un aditivo de esa magnitud o menor explica el
residuo; el ajuste ciego —que nunca vio este número— pide una componente en
fase de −95 dB, que cabe holgada dentro de −79,1 dB con cualquier fase por
encima de unos 74°.

## Qué queda decidido y qué no

**Decidido:** la ley del envío no necesita corrección en el rango medido. Es la
primera vez que `VtoLIN` se compara contra algo que no es la propia consola, y
aguanta con 0,007 dB sobre 32 dB de recorrido. El residuo de la 94 se explica
por un término que se suma, no por la ley.

**No decidido: dónde está la fuga.** Hay dos candidatos y esta corrida no los
separa:

1. **la consola** —el envío no cierra del todo, o hay diafonía de la tira al bus—;
2. **la interfaz** —la entrada 1 lleva el bucle del general con el mismo tono a
   nivel alto, y podría cruzarse a la entrada 2 adentro de la Scarlett—.

Es barato separarlos y hay que hacerlo antes de creerle nada a la consola:
repetir la lectura de envío cerrado **con el cable del general desenchufado de
la entrada 1**. Si el tono sigue, es de la consola; si desaparece, es del banco
y ninguna medición de esta serie puede bajar de unos 70 dB sin corregirlo.

## Lo que esto NO dice

- **Nada sobre el cero absoluto.** Es una medición relativa al crudo 1,0: un
  error de escala constante es invisible por construcción. Que el crudo 0,7647
  sea «0 dB de envío» sigue sin medirse.
- **Nada sobre la ley inversa.** Se midió crudo → dB.
- Un auxiliar, un canal, una frecuencia, un nivel de fuente.
