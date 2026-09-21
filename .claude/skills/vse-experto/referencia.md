# Referencias bajo demanda

No es lectura de arranque. Abrir la fuente de la fila que corresponda a la tarea.

| Pregunta | Fuente vigente |
|---|---|
| ¿Dónde estamos y qué sigue? | `docs/estado-actual.md` |
| ¿Qué transiciones de sesión son legales? | `packages/domain/src/entities/session.ts` |
| ¿Qué rutas pertenecen al usuario? | `packages/domain/src/rules/ownership.ts` y `docs/autonomy-matrix.md` |
| ¿Qué invariantes y topes se aplican? | `docs/safety-invariants.md`, `packages/domain/src/rules`, `packages/safety` |
| ¿Qué conversión está medida? | `packages/mixer-adapter/src/raw-map.ts` y evidencia de `docs/capability-matrix.md` |
| ¿Cómo se leen los medidores? | `docs/protocol-spec.md` §4.6 y `packages/mixer-adapter/src/protocol.ts` |
| ¿Cómo se confirma una escritura? | `docs/adr/ADR-024-confirmacion-por-testigo.md` y su evidencia |
| ¿Qué sabemos de otros proyectos? | `docs/referencia/trabajo-previo-de-terceros.md` y `trabajo-previo-ecualizacion-automatica.md` |
| ¿Cómo comprobar software y registrar resultados? | `CONTRIBUTING.md` |
| ¿Cómo operar banco y tablet? | `docs/desarrollo/hardware.md` |
| ¿Cómo publicar? | `docs/actualizacion-en-app.md` y `.github/workflows/release.yml` |

Las rutas de protocolo son de base cero. El simulador reproduce nuestras
hipótesis: no valida la consola. No convertir una latencia de una muestra en una
garantía de tiempo. Las cuentas de tests, límites y valores medidos se consultan
en las fuentes anteriores; no se duplican aquí.
