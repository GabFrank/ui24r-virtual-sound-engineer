# Cómo se trabaja en este repositorio

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

**Antes de empujar**, un solo comando corre lo mismo que la integración
continua:

```bash
npm run verificar            # documentación, plantillas, límites, tipos y tests
npm run verificar:commits    # los mensajes de esta rama, contra main
```

El segundo existe porque el mismo error costó dos ciclos de integración
continua: un asunto de 74 caracteres cuando el máximo es 72, descubierto
después de empujar. Y comprueba el **rango**, no el último commit: un asunto
largo de hace tres commits sigue rompiendo la comprobación de la rama.

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

Hay una skill con el conocimiento consolidado del proyecto en
[`.claude/skills/vse-experto/`](.claude/skills/vse-experto/SKILL.md): qué es,
cómo está construido, por qué está construido así, cómo se usa y qué reglas no
se pueden romper. El fichero `referencia.md` de esa misma carpeta guarda el
detalle numérico —estados, invariantes, protocolo, DSP, publicación—.

Si vas a tocar este repositorio por primera vez, empezá por ahí.
