# ADR-003 — Función de transferencia y coherencia en el motor básico

**Estado:** Aceptada
**Fecha:** 2026-09-07
**Origen:** Auditoría técnica A-21, A-29, A-30.

## Contexto

El plan reservaba fase, coherencia y retardo para un "motor de precisión" posterior, y exigía captura y reproducción sincronizadas como requisito de ese motor.

Dos correcciones:

1. Con la referencia eléctrica en la entrada 2 y el micrófono en la entrada 1, **sobre el mismo conversor**, la función de transferencia H(f) = S12/S11 da magnitud y fase relativa, y la coherencia γ² = |S12|²/(S11·S22) sale del mismo cálculo. Ninguno de los dos necesita sincronía con el generador ni deconvolución de barrido. Es lo que hacen los analizadores de doble canal.
2. Una respuesta de magnitud sobre ruido rosa **sin coherencia** confunde reverberación y ruido con respuesta del sistema, y produce ecualización errónea en salas reverberantes, que es justo donde más se necesita.

Además falta un estimador de retardo: entre la referencia eléctrica y el micrófono hay latencia de la consola, retardos configurados en salidas, procesamiento del sistema de amplificación y propagación acústica, unos 2,9 ms por metro. Sin compensarlo, la fase se envuelve y la coherencia se desploma.

## Decisión

El **motor básico** incluye: RMS, pico, pico real, factor de cresta, FFT, **función de transferencia de doble canal con magnitud y fase, coherencia y estimador de retardo**.

El **motor de precisión** queda como: respuesta al impulso por deconvolución, curva de energía-tiempo, tiempo de reverberación, retardo de grupo refinado y alineación de subgraves.

Se retira "full duplex sincronizado" como requisito. Se sustituye por dos requisitos separados: captura dual sincronizada por muestra, que el hardware garantiza al compartir conversor, y reproducción y captura simultáneas no sincronizadas, que solo hace falta para el loopback.

## Consecuencias

- El Room-Observe entrega mediciones útiles y honestas desde su primera versión, con máscara de coherencia que marca los bins no confiables.
- El estimador de retardo se vuelve dependencia de la medición de sala y de la alineación del soundcheck virtual.
- La coherencia solo se aplica con 16 promedios o más: con menos, está sesgada hacia 1 y engaña.

## Alternativas descartadas

- **Dejar fase y coherencia para el motor de precisión.** Habría producido recomendaciones de ecualización de sala sin forma de saber qué bins eran ruido.
