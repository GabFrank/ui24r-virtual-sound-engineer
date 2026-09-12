# Matriz de hardware certificado

**Regla:** el producto no promete compatibilidad con cualquier Android. Solo el hardware con estado *Certificado* en esta tabla está soportado.

**Antes de ejecutar SPK-P0.3 tiene que haber al menos dos tablets candidatas listadas.** Si la primera no certifica, se pasa a la segunda con un timebox de cinco días, y todo lo que no depende de USB sigue avanzando mientras tanto.

## Tablets

| Modelo | Android / API | Carga mientras hace de anfitrión | Captura sin procesar | Cortes por hora | Estabilidad térmica 4 h | Estado |
|---|---|---|---|---|---|---|
| **Blackview LINK 8** | Android 15 / API 35 | ⬜ | ⬜ | | ⬜ | 🟡 En uso, sin certificar |
| _candidata 2, por completar_ | | ⬜ | ⬜ | | ⬜ | ⬜ Pendiente |

**La LINK 8 es la que se viene usando y el 2026-09-10 quedó identificada.** Pantalla
1600 × 2176, y la aplicación corre sobre ella conectada a la consola por la misma red.
Lo que **no** está medido es nada de lo que pide SPK-P0.3: carga como anfitrión USB,
captura sin procesar, cortes en cuatro horas, estabilidad térmica. Que funcione una
sesión no certifica ninguna de esas cosas, y la fila queda en amarillo a propósito.

**Depuración inalámbrica**: se vincula una vez desde *Opciones de desarrollador →
Depuración inalámbrica → Vincular con código*, que muestra un puerto y seis dígitos.
El puerto de vinculación **no** es el de conexión. Después, `adb` la descubre sola por
mDNS mientras la función siga encendida.

## Interfaces de audio

| Modelo | Clase | Dos entradas independientes | Salida | Alimentación por bus | Estado |
|---|---|---|---|---|---|
| Focusrite Scarlett 2i2 | compatible con la clase estándar | ⬜ | ⬜ | sí | ⬜ Pendiente |

## El banco de pruebas de esta sala, canal por canal

**Leído del aparato el 2026-09-12**, no de memoria, con
`tools/spikes/quien-esta-conectado.ts`. Es el equipo con el que se miden las
leyes de DSP, y saber a qué canal entra cada cosa dejó de ser adivinanza.

| Qué | Canal | Ruta | Estado leído |
|---|---|---|---|
| **Entrada de línea de la Scarlett** | **10** | `i.9` / `hw.9` | abierto, fader 0,765 (0 dB), ganancia de previo 0,251, fantasma apagada. Dato del usuario, confirmado contra la consola |
| **Behringer B2** (condensador) | **9** | `i.8` / `hw.8` | fantasma **encendida**, en silencio a propósito: mira a un monitor a 1,7 m |
| **Rokit** | salida del general | `m.mix` | 0,764 |
| **Auxiliares** | — | `a.0`…`a.9` | **nada enchufado**. Dicho por el usuario el 2026-09-12: «no tenemos ningun parlante conectado a ningun auxiliar entonces no existe ningún peligro» |

El canal 10 tiene además una propiedad que lo hace cómodo para medir: **es uno de
los dos únicos canales con envío a la matriz** (el otro es `i.19`).

**Lo que no está enchufado importa tanto como lo que sí.** Los faders de los
auxiliares 1 y 2 están en 0,904 y 0,373: con una cuña conectada, barrer un envío
sería sonido fuerte en la sala. Sin cuña, es una medición de banco. La diferencia
entre las dos cosas es un cable, y no se puede leer por protocolo.

## Interfaces de audio, notas

Nota: el estado del preamplificador, la ganancia automática, la protección de saturación y el monitoreo directo **no son legibles desde Android**. La ganancia se fija en su mínimo físico y el ajuste fino se hace por software desde el fader del bus de análisis (SPK-CAL).

## Concentradores USB

| Modelo | Alimentación propia | Paso de carga | Estado |
|---|---|---|---|
| _por completar_ | | | ⬜ Pendiente |

## Pendrives

El pendrive es requisito de la grabación multipista y del reproductor como generador. Requisitos conocidos: formato FAT32, 32 GB o menos, 25 MB/s de escritura como mínimo. Veintidós pistas a 48 kHz y 24 bits en formato sin comprimir dan unos 30 MB/s de tasa bruta, **por encima del mínimo declarado**: muchos pendrives fallan. Si la escritura queda ajustada, se usa formato comprimido sin pérdida.

| Modelo | Capacidad | Escritura medida | 22 pistas 5 min sin fallo | Estado |
|---|---|---|---|---|
| _por completar_ | | | ⬜ | ⬜ Pendiente |

## Micrófonos de medición

| Modelo | Patrón | Archivo de calibración | Es micrófono de medición | Estado |
|---|---|---|---|---|
| _condensador de estudio disponible, por identificar_ | probablemente cardioide | no | **no** | ⬜ Provisional |
| Behringer ECM8000 o equivalente | omnidireccional | recomendable | sí | ⬜ No disponible todavía |

**Aviso:** un condensador de estudio no es un micrófono de medición. Es direccional y su respuesta no es plana. Sirve para desarrollar y para detectar problemas gruesos, pero sesga la medición de sala. Mientras el perfil de micrófono tenga *es micrófono de medición* en no, la confianza de toda recomendación de ecualización de sala se limita, y por encima de 4 kHz se limita aún más. Ver el riesgo R-11.

## Red

| Elemento | Requisito | Estado |
|---|---|---|
| Router dedicado | no se usa la red del lugar | ⬜ Pendiente |
| Topología | router dedicado con la consola y la tablet, sin nada más | ⬜ Pendiente |
