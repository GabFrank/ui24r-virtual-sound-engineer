---
name: vse-experto
description: Contexto y fuentes del Ui24R Virtual Sound Engineer. Leer al trabajar en este repositorio; cargar las referencias sólo para el área de la tarea.
---

# Ui24R Virtual Sound Engineer

Asistente de soundcheck para un músico que canta, toca y opera la consola desde
una tablet. La interfaz debe servir de pie, con poca luz y poco tiempo. Explicar
el resultado en lenguaje de sonido; el detalle técnico queda en los archivos.

## Orientarse

El estado y la próxima tarea viven sólo en `docs/estado-actual.md`. Leerlo junto
con `vse-disciplina`; no buscar el estado en cierres antiguos ni repetirlo aquí.
El alcance decidido está en `docs/alcance-mvp.md`.

## Reglas del producto

- Una capacidad del protocolo necesita evidencia aplicable en
  `docs/capability-matrix.md`. Medida no significa autorizada para escribir.
- Toda escritura de producto pasa por
  `Assistant → Recommendation → Transaction → SafetyEngine → MixerDomainAPI.write()`.
- Respetar `docs/safety-invariants.md` y `docs/autonomy-matrix.md`. Nunca abrir
  una categoría USER_ONLY ni cambiar límites por conveniencia de un test.
- Una corrección guarda estado, aplica el paso autorizado, mide y revierte si
  empeoró. Los niveles de autonomía los decide el usuario.
- El simulador comprueba software; no demuestra el comportamiento físico de la
  consola ni cierra una invariante de campo.

## Encontrar la fuente sin leer todo

| Área | Abrir cuando la tarea la toque |
|---|---|
| Modelo, unidades y seguridad | `packages/domain`, `packages/safety`, invariantes y ADR correspondiente |
| Protocolo y conversiones | `packages/mixer-adapter`, `docs/protocol-spec.md`, matriz de capacidades y evidencia citada |
| Análisis y propuestas | `packages/assistants`; no importa el adaptador |
| Pantallas y servicios | `apps/mobile`; Angular standalone, signals, OnPush y fichas de `styles/_tokens.scss` |
| Persistencia | `packages/store` y servicios de `apps/mobile/src/app/core`; diario durable antes de escribir |
| DSP y audio nativo | `packages/dsp-contract`, `tools/spikes/p0-10a-dsp`, `apps/mobile/android` |
| Pruebas y cierre | `CONTRIBUTING.md` y `docs/protocolo-de-verificacion.md` según riesgo |
| Equipo real | `docs/desarrollo/hardware.md`, antes de operarlo |

Detalles de orientación: [referencia.md](referencia.md). Las leyes y cifras se
consultan en su fuente, no se mantienen copiadas en esta skill.

## Convenciones que afectan la implementación

TypeScript estricto; imports relativos de paquetes con `.ts`. En archivos que
Node ejecuta eliminando tipos, evitar propiedades de constructor que exigen
transformación. La app usa Angular: no deducir que una limitación del runner de
funciones puras impida probar servicios con un compilador adecuado.

No llamar funciones arbitrarias ni getters desde plantillas; usar signals y
computed. Usar fichas de diseño y reservar la zona del paro y navegación.
No editar migraciones publicadas, cambiar nombres de artefactos de actualización
sin revisar su consumidor ni versionar secretos.
