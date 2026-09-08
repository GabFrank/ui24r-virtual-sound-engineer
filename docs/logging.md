# Registro estructurado

Implementa INV-022. **Estado hoy: solo salida por consola.** El `Logger` tiene el formato y el método `escritura()` con los campos obligatorios, y la tabla `log_event` existe en el esquema, pero **todavía no hay ningún sumidero persistente registrado, ni rotación, ni exportación de eventos**. Lo que exporta hoy Ajustes es el volcado de las entidades en JSON al portapapeles. Lo de abajo es la especificación de destino.

## Formato

Cada evento:

```json
{
  "ts": "2026-09-07T21:14:03.221Z",
  "sessionId": "…",
  "category": "mixer | audio | safety | transaction | ui | system",
  "level": "debug | info | warn | error",
  "event": "nombre corto y estable",
  "payload": { }
}
```

## Escrituras

Toda escritura a la consola registra, sin excepción:

```json
{
  "category": "transaction",
  "event": "write",
  "payload": {
    "transactionId": "…",
    "path": "i.3.mix",
    "expected": -6.0,
    "previous": -6.0,
    "sent": -4.5,
    "ack": "ECHO | VU | TIMEOUT | NONE",
    "verified": true,
    "unit": "dB"
  }
}
```

Un cambio sin `previous` leído de la consola es un error de programación, no un caso a contemplar.

## Qué nunca se registra

Datos personales de terceros, contenido de audio, y credenciales de red.

## Exportación

La sesión se exporta como archivo comprimido con `session.json`, `events.jsonl` y `report.md`. **Sin audio.** Es lo que se adjunta a un informe de prueba de campo o a una consulta de soporte.
