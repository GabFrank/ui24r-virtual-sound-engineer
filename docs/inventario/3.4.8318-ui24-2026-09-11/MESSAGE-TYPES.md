# Tipos de mensaje observados — Ui24R `3.4.8318-ui24`

Captura del 2026-09-11. **90 segundos** de escucha pasiva del canal de control,
más `GET /raw` y `GET /js/initparams.js`.

El transporte es **socket.io 0.9, protocolo 1**. Cada mensaje de aplicación
viaja envuelto como `3:::<mensaje>`. Una entrega puede traer varios mensajes
lógicos separados por saltos de línea, y se procesan uno por uno.

## Los que llevan claves de estado

| Tipo | Veces en 90 s | Forma | Qué es |
|---|---|---|---|
| `SETD` | 6093 | `SETD^<clave>^<número>` | Actualización numérica. **No se fuerza a booleano un 0 o un 1**: se registra como numérico observado |
| `SETS` | 640 | `SETS^<clave>^<texto>` | Actualización de texto. El resto de la línea es el valor, incluidos los `^` que contenga |

Las dos son las únicas que aportan claves al inventario.

## Los que NO llevan claves de estado

| Tipo | Veces en 90 s | Qué es |
|---|---|---|
| `RTA` | 2693 | Analizador de espectro, 122 bandas en base64. **Una posición de este arreglo no es una clave**: es una banda |
| `VU2` | 2025 | Medidores de todos los canales y buses, en base64. Ídem: los bytes no son claves |
| `VUA` | 1 | Aparece **una sola vez** en 90 segundos. No se decodificó ni se le atribuye significado: queda registrado con su tipo y su cantidad, sin interpretar |
| `UPDATE_PLAYLIST` | 1 | Aviso del reproductor. Llega también en el volcado HTTP |

## Lo que NO se observó, y hay que decirlo

**No llegó ningún `INIT`.** Esta consola entrega su estado al conectarse como
**6732 mensajes `SETD`/`SETS` individuales**, no como un JSON detrás de `INIT^`.

Eso no prueba que el firmware no tenga `INIT`: el cliente oficial lo implementa y
el análisis de 3.5 lo describe. Lo que sí está medido es que **en esta captura, y
sin pedirlo, la consola no lo mandó**. No se disparó una reconexión para forzarlo
ni se envió `INIT` a mano: el encargo lo prohíbe y el volcado HTTP cubre lo mismo.

Tampoco se observaron, porque la captura no ejerció esos modos: listas de shows
o presets más allá del aviso del reproductor, `NETCONFIG`, `BMSG`, diálogos,
mensajes de cascada, ni nada de multipista en actividad.

## Lo que emitió el recolector

| | |
|---|---|
| Apretón de manos de socket.io | 1 (`GET /socket.io/1/`, identificador de un solo uso) |
| `ALIVE` | 89, uno por segundo |
| Escrituras de parámetro | **0** |
| `INIT` enviado | **0** |

`ALIVE` es el latido que el protocolo exige: sin él la consola se calla a los
pocos segundos. Se declara acá porque **una clave en un mensaje que mandamos
nosotros no es evidencia de nada**, y la cuenta de salientes se lleva aparte.
