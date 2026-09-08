# Perfiles de canal

**No son presets.** Un preset dice "pon el filtro en 80 Hz". Un perfil dice "para esta fuente, el filtro suele estar entre 70 y 110 Hz, el objetivo de margen es 12 dB, y por debajo de 150 Hz normalmente no hay contenido útil".

El perfil define **rangos y objetivos**; la recomendación concreta sale de la medición.

## Campos

| Campo | Qué es |
|---|---|
| `tipo` | identificador del perfil |
| `rolPorDefecto` | rol musical si la escena no dice otra cosa |
| `bandaUtilHz` | rango donde vive el contenido de la fuente |
| `hpfRangoHz` | rango razonable del filtro pasa altos |
| `margenObjetivoDb` | margen buscado entre el pico y el fondo de escala |
| `rangoDinamicoEsperadoDb` | diferencia típica entre pasajes suaves y fuertes |
| `snrMinimoDb` | por debajo de esto, se avisa de ruido |
| `compresorRatio` | punto de partida de la relación de compresión |
| `usaPuerta` | si tiene sentido proponer puerta de ruido |
| `usaDeesser` | si tiene sentido proponer control de sibilancia |

## Perfiles iniciales

| Perfil | Rol | Banda útil Hz | Pasa altos Hz | Margen objetivo dB | Rango dinámico dB | SNR mín. dB | Relación | Puerta | Deesser |
|---|---|---|---|---|---|---|---|---|---|
| Voz principal | LEAD | 80 – 16000 | 80 – 120 | 12 | 18 | 30 | 2,5:1 | no | sí |
| Voz de acompañamiento | SUPPORT | 90 – 14000 | 90 – 130 | 12 | 15 | 28 | 2,5:1 | no | sí |
| Guitarra acústica | SUPPORT | 70 – 16000 | 70 – 100 | 14 | 16 | 30 | 2:1 | no | no |
| Guitarra eléctrica | SUPPORT | 80 – 12000 | 80 – 110 | 14 | 14 | 28 | 2:1 | no | no |
| Bajo | FOUNDATION | 35 – 5000 | 30 – 45 | 10 | 10 | 25 | 3:1 | no | no |
| Cajón | RHYTHMIC | 45 – 12000 | 40 – 60 | 8 | 20 | 22 | 3:1 | sí | no |
| Conga | RHYTHMIC | 60 – 12000 | 60 – 90 | 8 | 18 | 22 | 2,5:1 | sí | no |
| Shaker | RHYTHMIC | 300 – 18000 | 250 – 400 | 10 | 12 | 25 | 2:1 | sí | no |
| Flauta | LEAD | 200 – 16000 | 150 – 250 | 12 | 16 | 28 | 2:1 | no | no |
| Teclado | SUPPORT | 40 – 16000 | 35 – 60 | 12 | 12 | 30 | 2:1 | no | no |
| Reproducción | FOUNDATION | 30 – 18000 | 20 – 20 | 14 | 8 | 40 | ninguna | no | no |
| Palabra | LEAD | 100 – 12000 | 100 – 150 | 14 | 14 | 30 | 3:1 | sí | sí |
| Personalizado | SUPPORT | 20 – 20000 | 20 – 200 | 12 | 15 | 25 | 2:1 | no | no |

## Sincronización con el código

Estos valores viven además en `packages/domain/src/data/channel-profiles.ts`, y
**hay un test que lee esta tabla y la compara fila por fila con el código**
(`packages/domain/test/channel-profiles-doc.test.ts`). Si alguien ajusta un
número en un lado y no en el otro, la integración continua avisa.

Antes ese test comprobaba ocho valores sueltos y no leía este documento, así
que las tablas ya habían divergido en cinco celdas: «opcional» donde el código
decía que no, «LEAD o SOLO» donde decía `LEAD`, «ninguno» donde hay un rango
degenerado, y «por definir» donde ya había un rol.

La tabla usa **coma decimal** y **guion largo** para los rangos, como el resto
de la documentación; el test normaliza ambos.

## Revisión

Estos valores son un punto de partida informado, **no están validados con la banda todavía**. La historia del asistente de ganancia exige que el usuario los revise y firme:

| Fecha | Revisado por | Cambios |
|---|---|---|
| _pendiente_ | | |

Después de cada prueba de campo, los valores se ajustan con lo aprendido y se anota aquí.
