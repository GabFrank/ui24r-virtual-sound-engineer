# SPK-ACK-POLICY — Política de confirmación de escrituras

**Estado:** Pendiente · **Timebox:** 1 día · **Control:** G-A
**Depende de:** SPK-P0.1 · **Bloquea a:** S-02.9a, S-13.1
**Montaje:** resultados de SPK-P0.1. No requiere hardware adicional.

## Pregunta que responde

Si la consola no confirma las escrituras, ¿qué se considera "aplicado" para cada parámetro?

El protocolo no tiene confirmación explícita. Si además no hay eco, solo el fader, el silencio y la ganancia tienen verificación indirecta por los medidores. Sin una política escrita, los envíos, la ecualización y la dinámica quedarían siempre sin verificar y **toda transacción se detendría en su primera escritura**.

## Pasos

1. Tomar el resultado de eco de SPK-P0.1.
2. Para cada parámetro de la matriz de capacidades, decidir su método de confirmación: eco, medidores, volcado tras reconexión, o ninguno.
3. Redactar el texto normativo de la invariante INV-011 ajustado al resultado.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Tabla parámetro a método de confirmación, completa | bloqueante | 100 % de las filas de la matriz | | ⬜ |
| 2 | Texto normativo de INV-011 redactado y aprobado | bloqueante | sí | | ⬜ |

## Regla por defecto si no hay eco

- Los medidores valen como confirmación para fader, silencio y ganancia **solo con señal presente**, es decir, medidor por encima de −60 dB.
- El resto de parámetros continúa en modo asistido con confirmación por tiempo de espera y el aviso "no verificable" visible por cada cambio.
- En modo automático controlado, **todo parámetro sin eco ni verificación por medidores es inelegible**.

## Evidencia a entregar

- `docs/ack-policy.md` completo.
