# Ciclo de vida de la sesión

Implementa ADR-014. La tabla de transiciones se verifica con un test de matriz de estado por transición.

## Estados

```text
CREATED
   ↓
SETUP              asistente de configuración y patcheo
   ↓
CALIBRATING        ganancia de la interfaz, nivel acústico, loopback
   ↓
ROOM_OBSERVE  ⇄    medición de sala sin escribir
   ↓
CHANNEL_SETUP      ajuste de ganancia y proceso por canal
   ↓
SOUNDCHECK_REC     grabación de la toma
   ↓
MIX           ⇄    construcción de mezcla y recomendaciones de fader
   ↕
SOUNDCHECK_PLAY    reproducción de la toma para comparar mezclas
   ↓
ROOM_CORRECT  ⇄    corrección de sala
   ↓
FULL_BAND          prueba de banda completa
   ↓
RINGOUT            supresión de realimentación, manual
   ↓
SHOW               modo show, sin escrituras
   ↓
CLOSED
```

## Reglas de transición

- **Solo una sesión activa** a la vez.
- **Retroceso a `CHANNEL_SETUP`** desde `CALIBRATING`, `ROOM_OBSERVE`, `SOUNDCHECK_REC` y `MIX` —desde `ROOM_CORRECT`, `FULL_BAND`, `RINGOUT` y `SHOW` hay que pasar antes por `MIX`—: permitido **solo si no existe una toma de soundcheck activa** (INV-006), y con invalidación explícita de las mediciones posteriores. Si el usuario insiste, la aplicación le dice exactamente qué mediciones y qué candidatos de mezcla pierden validez.
- **`ROOM_OBSERVE` y `ROOM_CORRECT` son reentrantes** desde `MIX`: medir la sala de nuevo a mitad de la mezcla es legítimo.
- **`SOUNDCHECK_PLAY` y `MIX` alternan** libremente: es el ciclo de comparación A y B.
- **`SHOW` no admite ninguna escritura** salvo la lista blanca del paro de emergencia.
- **Cada escritura consulta el estado** antes de proceder: INV-006 y INV-009 dependen de él.
- Tras una caída, la sesión se recupera en su último estado persistido, con las transacciones interrumpidas listadas para decidir.

## Relación con otras entidades

Una sesión referencia siempre un perfil de banda y un perfil de lugar. El perfil de lugar acumula las mediciones y el histórico de puntajes, lo que permite comparar la sesión de hoy con la última vez que se tocó en el mismo sitio.
