# Informe de prueba de campo

Archivo: `docs/field/<MVP>-<AAAA-MM-DD>-<sala>.md`. **Todos los campos son obligatorios.** Sin ellos la historia no cierra.

## 1. Contexto

- Compilación y commit:
- Firmware de la consola:
- Tablet y versión de Android:
- Interfaz, concentrador, pendrive:
- Sala, sistema de amplificación, banda, número de canales usados:
- Quién operó y quién tocó:
- Estado de calibración: ganancia de la interfaz, nivel acústico, perfil de micrófono

## 2. Objetivos medibles y resultado

| Métrica | Objetivo | Medido | Resultado |
|---|---|---|---|
| Tiempo por asistente, canal o posición | | | ⬜ |
| Recomendaciones generadas, aceptadas, descartadas, no entendidas | | | ⬜ |
| Incidentes de seguridad | 0 | | ⬜ |
| Desconexiones y recuperación | 100 % recuperadas | | ⬜ |
| Caídas de la aplicación | 0 | | ⬜ |
| Métrica propia de la versión | | | ⬜ |

**Incidente de seguridad** es cualquiera de: una escritura fuera del pipeline, un cambio sin verificar y sin aviso visible, una invariante violada en el registro, audio no solicitado en el sistema de amplificación, una transacción aplicando durante más de diez segundos, o el paro de emergencia usado por necesidad real.

## 3. Cronología

Hora y evento: inicio, cada asistente, cada alerta, cada paro de emergencia, cada desconexión.

## 4. Valoración del usuario

Por cada recomendación o hallazgo, de 1 a 5, con comentario.

## 5. Fallos y sorpresas

Qué pasó, qué esperaba la aplicación, y el enlace a la evidencia.

## 6. Decisiones derivadas

Ajustes de perfiles, de umbrales, historias nuevas con su identificador.

## 7. Adjuntos

Exportación de la sesión, registro, fotos del montaje, mediciones de referencia externas.
