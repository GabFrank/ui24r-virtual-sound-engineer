# SPK-ACK-POLICY — Política de confirmación de escrituras

**Estado:** Desbloqueado, sin decidir — **la entrada que faltaba llegó el 2026-09-08: no hay eco** · **Timebox:** 1 día · **Control:** G-A
**Depende de:** SPK-P0.1 · **Bloquea a:** S-02.9a, S-13.1
**Montaje:** resultados de SPK-P0.1. No requiere hardware adicional.

## Pregunta que responde

Si la consola no confirma las escrituras, ¿qué se considera "aplicado" para cada parámetro?

El protocolo no tiene confirmación explícita, y **el eco tampoco existe: está medido**. Con eso, solo el fader, el silencio y la ganancia tienen verificación indirecta por los medidores. Sin una política escrita, los envíos, la ecualización y la dinámica quedarían siempre sin verificar y **toda transacción se detendría en su primera escritura**. Eso ya no es una hipótesis: es lo que hace hoy `escribir()`.

## Pasos

1. ~~Tomar el resultado de eco de SPK-P0.1.~~ Hecho el 2026-09-08: **no hay eco**. Ver más abajo.
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

## Lo medido — 2026-09-08

**La consola no devuelve eco al emisor de su propia escritura.** Es el criterio 3 de SPK-P0.1 y
el paso 1 de este spike, que hasta hoy no tenía respuesta. Medido en `i.9.mute` y en `i.9.mix`
contra la consola en `192.168.0.78`, firmware `3.4.8318-ui24`. El detalle y la evidencia están
en [SPK-P0.1](SPK-P0.1-conectividad.md); acá va lo que cambia una decisión.

Tres hechos, y los tres importan por separado:

| Hecho | Medido | Por qué importa acá |
|---|---|---|
| No hay eco | seis segundos escuchando, **cero líneas** para la ruta escrita | la confirmación por eco no existe |
| La escritura **sí se aplica** | `INIT` posterior trae el valor nuevo a los **~100 ms** | el silencio no es un rechazo: hay algo que confirmar |
| La consola **difunde a los demás clientes** | la aplicación en la tablet lo registró como `cambio_externo` en el mismo instante | el mensaje existe, y lo ve todo el mundo menos quien escribió |

Dos consecuencias inmediatas sobre código que ya está escrito:

- **`Ui24rMixerAdapter.escribir()` devolvería `UNVERIFIED` siempre.** Su
  `esperarConfirmacion()` exige que el almacén registre la ruta con origen `SELF`, y sin eco eso
  no pasa nunca. La rama `APPLIED` con `confirmedBy: 'ECHO'` es inalcanzable contra esta
  consola.
- **La correlación propio/externo del `ConfirmedStateStore` nunca marcaría `SELF`.** Es el cabo
  suelto que ADR-005 dejó anotado para este spike: la ventana de 300 ms espera un mensaje
  entrante que no llega.

## Las opciones, sin elegir ninguna

Este spike todavía no decide. Lo que sigue es el conjunto de caminos que la medición deja en
pie, con lo que cada uno cuesta y lo que cada uno no cubre. **La elección es de la persona que
cierra el spike**, y sale con su ADR si cambia una decisión.

| Opción | Qué confirma | Costo | Qué no cubre |
|---|---|---|---|
| **A — Medidores** | fader, silencio y ganancia, y solo con señal presente | ninguno: las tramas ya llegan | todo lo que no se ve en un medidor: ecualizador, dinámica, envíos, retardos. Y cualquier parámetro en silencio |
| **B — Relectura por `INIT`** | cualquier parámetro, con certeza | el volcado entero: **6 665 claves** por cada escritura confirmada, a ~100 ms | no escala a una transacción de varias escrituras ni a nada parecido a una rampa. Ver R-23 |
| **C — Segunda conexión testigo** | en principio cualquier parámetro, porque la consola sí difunde a los otros clientes | una sesión más, que hay que abrir, mantener viva con `ALIVE` y reconectar; y una instancia más que INV-032 tiene que poder distinguir | **sin medir.** Que difunda a un cliente ajeno no prueba que difunda a una segunda conexión del mismo aparato, ni con qué latencia. Es una opción a evaluar, no un mecanismo verificado |
| **D — Ninguna** | nada: `confirmedBy = TIMEOUT` y aviso «no verificable» por cada cambio | ninguno | deja todo parámetro sin verificación inelegible en automático controlado, que es la regla por defecto de más abajo |

Las opciones no son excluyentes: lo más probable es que la tabla final del criterio 1 mezcle
varias, una por familia de parámetro. Eso es exactamente lo que este spike tiene que escribir.

**Lo que la opción C necesita antes de poder elegirse** es una medición propia: abrir dos
conexiones desde el mismo aparato, escribir por una y comprobar si la otra lo recibe, con su
latencia. Mientras eso no esté medido, C no es candidata sino pregunta.

## Evidencia a entregar

- `docs/ack-policy.md` completo.
