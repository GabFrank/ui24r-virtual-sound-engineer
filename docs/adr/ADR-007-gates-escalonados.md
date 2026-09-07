# ADR-007 — Controles de paso escalonados

**Estado:** Aceptada
**Fecha:** 2026-09-07
**Origen:** Auditoría de producto B-11, B-13; auditoría de calidad D-51.

## Contexto

El plan exigía que los once resultados de la fase 0 estuvieran aprobados antes de empezar cualquier desarrollo de producto. Entre ellos, soundcheck virtual, retorno de señal y captura y reproducción simultáneas, ninguno de los cuales usa el primer entregable.

Además, **ningún spike tenía criterio de aprobación medible**. "Validar conexión" o "validar estabilidad" no son controles: la aprobación queda a criterio de quien la firma.

## Decisión

Cinco controles escalonados, cada uno desbloquea lo que efectivamente depende de él:

| Control | Cierra | Desbloquea |
|---|---|---|
| G-A | Conectividad, matriz básica, instantáneas, concurrencia | Foundation y MVP0 |
| G-B | Tablet certificada, bus de análisis, reproductor como generador, calibración | Motor de audio nativo |
| G-C | Generador seguro probado en hardware, loopback, matriz de salidas | MVP1 y Room-Correct |
| G-D | Repetibilidad del soundcheck virtual | Mezcla comparada A/B |
| G-E | Las 33 invariantes en verde | Aplicación asistida |

**Cada spike tiene criterio numérico.** Cada control distingue criterios bloqueantes de informativos, y define qué se hace ante un fallo: una sola repetición por criterio bloqueante antes de escalar a decisión de arquitectura. El acta la firma el desarrollador principal con fecha.

## Consecuencias

- El primer valor llega en semanas, no en meses.
- Los controles quedan cableados en el grafo de dependencias: nada que dependa de un control empieza antes de que su acta esté firmada.
- Un control puede cerrarse con un fallo documentado, si la decisión de alcance correspondiente queda escrita.

## Alternativas descartadas

- **Control único antes de todo.** Retrasaba meses el primer valor y exigía aprobar cosas que el primer entregable ni usa.
