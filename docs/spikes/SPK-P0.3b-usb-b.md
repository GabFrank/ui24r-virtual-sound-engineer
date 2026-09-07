# SPK-P0.3b — Consola por USB directo a la tablet

**Estado:** Pendiente · **Timebox:** 2 días · **Control:** G-B
**Depende de:** S-00.3 · **Bloquea a:** SPK-P0.3, DEC-19
**Montaje:** tablet Android candidata, cable USB adecuado, Ui24R.

## Pregunta que responde

¿La tablet enumera la consola como interfaz de audio multicanal, y con cuántos canales?

Si la respuesta es sí, desaparecen la interfaz externa, sus dos ganancias analógicas no observables, la alimentación fantasma global, el bus de análisis con sus envíos y la restricción de un solo canal espectral. Se ejecuta **antes** de certificar la interfaz externa, para no gastar cinco días certificando un montaje que se descartaría.

## Pasos

1. Conectar la consola por USB a la tablet.
2. Enumerar dispositivos de audio de entrada y salida desde una aplicación de prueba.
3. Intentar abrir captura con el máximo de canales que ofrezca, a 48 kHz.
4. Sostener treinta minutos y contar cortes.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | La tablet enumera la consola como dispositivo de audio | informativo | sí o no | | ⬜ |
| 2 | Número de canales de captura negociados | informativo | registrado | | ⬜ |
| 3 | Estabilidad con el máximo de canales | informativo | 30 min, cortes contados | | ⬜ |

Todos los criterios son informativos: este spike no bloquea, alimenta una decisión.

## Evidencia a entregar

- `evidence/enumeration.txt`, `evidence/capture-30min.log`.

## Resultado esperado

Si enumera 24 canales o más a 48 kHz de forma estable, se abre DEC-19 y se escribe la ADR-019 con la variante sin interfaz externa. Si no, se descarta con evidencia y no se vuelve sobre el tema.
