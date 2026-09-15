# Hallazgo: la fuga de 1 kHz viaja aguas abajo del fader del general

**Medido el 2026-09-13, ítem 105.** Evidencia:
`docs/spikes/SPK-P0.10b-vu2/evidence/de-quien-es-la-fuga-2026-09-13.txt`.

**Esto NO es el veredicto del contrato.** La guarda G1 —«E0 reproduce la 104»—
**falló**, y el guion se negó a imprimir la tabla, que es lo que tenía que hacer.
Lo de abajo es lo que la corrida midió **dentro de sí misma**, con sus propias
cotas, y se publica separado y con esa etiqueta.

## Lo que se midió, todo en la misma corrida

| estado | auxiliar, bin de 1 kHz | margen |
|---|---|---|
| **E0** — todo normal, envío cerrado | −87,04 dBFS | 31 dB |
| **E1** — fader del general en 0 | −121,01 dBFS | −0,1 dB |
| **E3** — tono apagado, consola como en E0 | −117,44 dBFS | 0 dB |

Con el fader del general en 0, la fuga **cayó por debajo del piso de ruido de la
propia captura**. Como E1 quedó bajo el piso, lo que se puede afirmar no es la
caída aparente de 33,97 dB sino una **cota**: la fuga cayó **al menos 30,4 dB** y
aterrizó en el piso o más abajo.

El testigo confirma que la escritura llegó: el general pasó de −18,00 a
−133,34 dBFS.

## Qué excluye, y qué no

El fader del general es **post-suma por construcción**. O sea que E1 no toca el
bus interno del general: sólo lo que sale de él. Que la fuga desaparezca al
bajarlo **excluye la diafonía del sumador interno** —ésa habría sobrevivido— y
deja la fuga en el camino de salida: la salida física del general, su cable, la
entrada 1 de la interfaz, y lo que se cruce desde ahí.

**Lo que sigue sin separarse** es si el cruce ocurre adentro de la Scarlett
—entrada 1 a entrada 2— o en la etapa de salida de la consola. Eso pide
desenchufar el cable de la entrada 1, que necesita una mano.

## Por qué falló G1, que es un hallazgo aparte

E0 dio **−87,04 dBFS** donde la 104 midió **−91,77**: 4,73 dB de diferencia,
contra una tolerancia de 1,5.

Y no es que el banco se haya movido. El control positivo C1 —el camino principal,
con el envío abierto— dio **−12,68 dBFS contra los −12,68 de la 104: cero coma
cero cero**. El camino de señal está idéntico. Lo que cambió es **la fuga**.

**La única diferencia deliberada entre las dos corridas es `m.afs.enabled`:** la
104 lo dejó en 1 —ése fue su defecto, el que le plantó una notch al usuario— y la
105 lo apaga, porque la regla que salió de aquello lo exige.

Eso encaja con lo de arriba: si la fuga viaja por el camino del general, el
supresor del general está **en** ese camino, y su estado cambia cuánto 1 kHz sale
por ahí. Con el supresor apagado sale más, y la fuga sube 4,73 dB.

**Es coherente, no está probado, y la prueba tiene un costo.** Medir E0 con el
supresor encendido es poner un tono sostenido con el supresor activo, que es
exactamente lo que planta filtros que sólo `clearall` borra, llevándose los del
usuario. No se hizo de noche y sin permiso.

## Lo que esto NO dice

- **Nada sobre el mecanismo del cruce.** Ni coherente ni incoherente: el bin da
  amplitud y no fase.
- **Nada sobre otras frecuencias.** Un tono, 1 kHz.
- **Nada sobre el auxiliar 3 ni el bloque de efectos.**
- La cota es «al menos 30,4 dB», no «33,97 dB»: E1 quedó bajo el piso de su
  propia captura y ahí el número deja de ser una medición.

## Lo que hay que hacer con esto

1. **Separar Scarlett de consola**: desenchufar el cable de la entrada 1 y
   repetir E0. Necesita una mano; es un minuto.
2. **Decidir si el supresor explica los 4,73 dB.** Cuesta un tono sostenido con
   el supresor activo, o sea filtros plantados. **Es decisión del usuario.**
3. Mientras tanto, toda medición de esta serie que baje de unos 70 dB por debajo
   de la referencia arrastra este aditivo, y ahora se sabe por dónde entra.
