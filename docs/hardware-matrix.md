# Matriz de hardware certificado

**Regla:** el producto no promete compatibilidad con cualquier Android. Solo el hardware con estado *Certificado* en esta tabla está soportado.

**Antes de ejecutar SPK-P0.3 tiene que haber al menos dos tablets candidatas listadas.** Si la primera no certifica, se pasa a la segunda con un timebox de cinco días, y todo lo que no depende de USB sigue avanzando mientras tanto.

## Tablets

| Modelo | Android / API | Carga mientras hace de anfitrión | Captura sin procesar | Cortes por hora | Estabilidad térmica 4 h | Estado |
|---|---|---|---|---|---|---|
| _candidata 1, por completar_ | | ⬜ | ⬜ | | ⬜ | ⬜ Pendiente |
| _candidata 2, por completar_ | | ⬜ | ⬜ | | ⬜ | ⬜ Pendiente |

## Interfaces de audio

| Modelo | Clase | Dos entradas independientes | Salida | Alimentación por bus | Estado |
|---|---|---|---|---|---|
| Focusrite Scarlett 2i2 | compatible con la clase estándar | ⬜ | ⬜ | sí | ⬜ Pendiente |

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
