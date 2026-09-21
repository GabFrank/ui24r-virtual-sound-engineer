# Cómo se trabaja en este repositorio

## Sesión y comprobación por impacto

Empezar por [AGENTS.md](AGENTS.md) y [estado actual](docs/estado-actual.md).
Registrar el commit inicial con `git rev-parse HEAD`; comprobar los cambios
locales antes de editar. No ejecutar pruebas por abrir sesión. Durante el trabajo
correr el test del resultado que se está construyendo.

Antes de cerrar una tarea:

```bash
npm run verificar:cambio -- --base <commit-inicial> --plan  # qué se ejecutaría
npm run verificar:cambio -- --base <commit-inicial>         # ejecutarlo
npm run verificar:commits -- --base <base-de-la-rama>       # después del commit
```

Sin `--base`, la selección compara con HEAD y cubre sólo cambios sin commit.
Con una base explícita incluye además todos los commits posteriores. Incluye
archivos nuevos, índice, cambios locales, borrados y ambos lados de traslados.
Una base inexistente falla; no se interpreta como «no hay cambios».

| Cambio | Comprobación antes del commit |
|---|---|
| Prosa, estado, skills y cierres | Validadores de documentación |
| App web y sus tests | Documentación, plantillas, límites, tipos/build y tests de workspaces |
| Contratos de seguridad/protocolo, ADR, compromisos y evidencia | Suite completa |
| Paquetes compartidos, herramientas, dependencias, CI o ruta desconocida | Suite completa |

La tabla selecciona por archivos; un cambio de prosa que decide comportamiento
sensible se trata como contrato y requiere `npm run verificar` explícitamente.
No basta clasificar el formato: revisar el diff y su alcance.

`npm run verificar` **sigue siendo la suite completa**. Se usa para cambios
transversales y antes de integrar/publicar. CI la ejecuta con el mismo comando,
incluyendo audio y tests de las guardas. No hay caché de aprobaciones: si cambia
el árbol, volver a seleccionar lo afectado. Una corrida parcial no es una
comprobación completa ni valida hardware.

La salida muestra el resultado y tiempo de cada grupo. Los logs completos y
`resumen.json` quedan en `.artifacts/verificacion/`, fuera de Git. Si falla algo,
se muestra el final del log y se conserva el código de error. La guarda de rutas medidas contrasta código/matriz y busca contradicciones en
README, AGENTS, CONTRIBUTING, skills, Markdown directo de docs, las carpetas
desarrollo/templates, **las ADR y los contratos**. El listado está en
`tools/docs/documentos-vigentes.mjs`; no recorre cierres, pedidos ni backlog,
ni interpreta toda la prosa.
El validador de trabajo previo comprueba presencia de sección, no calidad de
investigación: revisar fuentes y alcance al tomar la decisión.
Consultar el log del grupo fallido; no volcar miles de líneas en el contexto del agente.

Revisar con el alcance de [protocolo de verificación](docs/protocolo-de-verificacion.md).
Documentar, commit y push por tarea coherente antes de la siguiente. No abrir PR
sin pedido. Actualizar sólo las fuentes afectadas y el estado si cambió el
siguiente paso; no agregar un cierre que herede otros cierres.
Entregar la [plantilla de continuidad](docs/templates/prompt-continuidad.md)
completada en el chat.


Las pruebas que importan servicios Angular reales se explican en
[pruebas de integración](docs/desarrollo/pruebas-de-integracion.md).

## Definition of Done — historia

Una historia (`S-nn.m`) se cierra solo cuando:

1. **Todos sus criterios de aceptación tienen evidencia enlazada**: identificador del test, línea del log, captura o archivo en `docs/spikes/<id>/evidence/`. Un criterio sin evidencia es un criterio no cumplido.
2. Los tests unitarios están en verde y corren en integración continua.
3. La funcionalidad emite log estructurado según [docs/logging.md](docs/logging.md).
4. La matriz de capacidades, la de hardware o el registro de decisiones están actualizados si la historia los toca.
5. El `CHANGELOG.md` tiene su entrada.
6. **Revisión por una persona** si la historia toca `write()`, el Safety Engine, el generador de señal o cualquier invariante. Un agente puede hacer la prerrevisión, nunca la aprobación.
7. La parte de la suite de seguridad que le corresponde (EP-12) está en verde.

## Definition of Done — spike

Un spike (`SPK-*`) se cierra cuando:

1. El charter tiene resultado **PASS o FAIL por cada criterio**, con su número medido.
2. La evidencia está archivada en `docs/spikes/<id>/evidence/`.
3. Las matrices y el registro de riesgos están actualizados.
4. Si el resultado cambia una decisión, existe la ADR correspondiente.
5. El código vive en `tools/spikes/` y **no** requiere tests ni entrada en el changelog.
6. El timebox se respetó, o la extensión está aprobada por escrito en el charter.

Un spike no entrega producto. Un spike entrega una respuesta con un número.

## Reglas que no se negocian

1. **Ningún write RAW fuera de tabla.** Todo parámetro escrito por ruta cruda pasa por `raw-map` con rango físico y test de ida y vuelta. Un valor sin entrada en la tabla se rechaza en tiempo de ejecución.
2. **Ninguna versión con escrituras se libera sin su parte de EP-12 en verde.**
3. **Ningún asistente importa el adaptador.** Los asistentes hablan con `MixerDomainAPI`. Lo verifica `npm run validate:limites`.
4. **Ninguna llamada a la consola fuera del pipeline.** `Assistant → Recommendation → Transaction → SafetyEngine.check() → MixerDomainAPI.write()`.
5. **Ningún parámetro marcado USER-ONLY se escribe jamás.** Ver [docs/autonomy-matrix.md](docs/autonomy-matrix.md).

## Ramas

- `main` protegida. Todo entra por pull request.
- `feat/<área>-<descripción>`, `fix/<área>-<descripción>`, `spike/<id>`, `docs/<tema>`, `chore/<descripción>`.
- Minúsculas, guiones, sin acentos.

## Commits

Conventional Commits, en español, sujeto de 72 caracteres como máximo.

**El tipo** sale de la lista estándar: `feat`, `fix`, `docs`, `refactor`,
`test`, `perf`, `build`, `ci`, `chore`, `style`, `revert`. No se inventan tipos
nuevos.

**El ámbito nombra el módulo afectado**, no el hito ni la versión. `feat(mvp0)`
está mal: dentro de seis meses "mvp0" no le dice a nadie qué parte del sistema
cambió. Ámbitos permitidos en `commitlint.config.js`.

**Mensajes:** el gancho `commit-msg` comprueba cada commit antes de crearlo.
`verificar:commits` comprueba el rango explícito antes de empujar. Sin `--base`
usa el ancestro común con `origin/main`; si esa referencia falta, falla y pide
una base. No reescribir historia ajena si el rango incluye commits anteriores.

```
feat(domain): agrega ChannelAssignment con enlace a BandProfile
fix(safety): rechaza delta acumulado por sesión en INV-004
chore(spike): registra cadencia de medidores y resultado de eco en P0.1
docs(adr): ADR-019 decisión con o sin interfaz externa
```

El trabajo de spike va como `chore(spike)` o `docs(spike)` según lo que
entregue. Un spike no entrega funcionalidad, así que no lleva `feat`.

Hay un commit en la historia, anterior a esta regla, que usa `spike` como tipo.
Está mergeado y no se reescribe: la verificación solo mira los commits que trae
cada pull request.

## Checklist de pull request

Cada pull request responde estas preguntas en su descripción:

- **Qué resuelve** y a qué historia o spike corresponde.
- **Cómo se prueba**, con el comando exacto.
- **Riesgo**: bajo, medio o alto. Alto exige revisión humana aunque el DoD no la pidiera.
- **¿Toca escrituras, Safety Engine, generador o invariantes?** Si es sí, qué invariantes y qué tests lo cubren.
- **¿Actualiza alguna matriz o ADR?**
- **Evidencia**: enlaces por criterio de aceptación.

## Estilo

- Idioma de dominio: **español** para nombres de entidades de negocio visibles al usuario e interfaz. Identificadores de código genéricos en inglés.
- Interfaz siempre en modo oscuro. Nunca fondos claros: se usa en escenario.
- Texto centrado en tablas por defecto.
- Nunca llamar funciones ni usar getters desde plantillas Angular: se reevalúan en cada ciclo de detección de cambios.
- Números alineados con `font-variant-numeric: tabular-nums`.

## Conocimiento del proyecto

Las skills breves [vse-experto](.claude/skills/vse-experto/SKILL.md) y
[vse-disciplina](.claude/skills/vse-disciplina/SKILL.md) orientan el trabajo.
El estado vive en un solo archivo; cifras, leyes y decisiones se consultan en
sus fuentes. Los relatos de incidentes siguen en el historial y en sus contratos,
pero no son lectura obligatoria de cada sesión.
