# Registro estructurado

Implementa INV-022. Vive en `packages/logging`: el registro, sus sumideros y la lectura del registro guardado.

**Estado hoy:** hay salida por consola y salida persistente, y cada evento lleva la sesión en curso — `fijarSesion` existía desde el primer día y no la llamaba nadie, así que todas las filas iban con `session_id` en nulo y filtrar por sesión no podía devolver nada. Los eventos se guardan en `log_event` a través del mismo puerto de almacén que el resto, así que funcionan igual en la tablet y en el navegador. Ajustes muestra los últimos cien —con filtro de «avisos y errores»— y los copia como `events.jsonl`.

Lo que todavía no hay: el paquete completo de exportación (`session.json` + `events.jsonl` + `report.md` comprimidos). Hoy el JSONL se copia al portapapeles, que es lo que se puede hacer sin permisos de archivo.

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

## Cómo se guarda

El sumidero persistente encola y vuelca por lotes. `escribir()` es síncrono y guardar no lo es: escribir cada evento en cuanto llega convertiría cada registro en una espera, y durante una transacción el registro es justo lo que no puede frenar a lo que registra. Se vuelca a mano antes de leer o de exportar, y al terminar el arranque —incluido el arranque que falló, que es el que más falta hace leer.

El identificador de cada evento es su marca de tiempo más un contador, así que **ordenar por `id` da el orden cronológico** incluso entre eventos del mismo milisegundo, que en un arranque son varios.

Si el almacén falla, el sumidero **no lanza**: anota el error, lo muestra en Ajustes y sigue. El lote que no se pudo guardar se pierde a propósito — devolverlo a la cola haría que un almacén roto la hiciera crecer hasta quedarse sin memoria, que es peor que perder unas líneas.

## Rotación

Se guardan los últimos 5000 eventos. Se acota por número y no por tiempo porque lo que hay que acotar es el espacio en la tablet, y «tres días» no dice cuánto ocupa. Cada 250 eventos guardados se comprueba con `contar()` si hay que purgar, y solo entonces se listan los que sobran: purgar no puede costar más que registrar.

## Exportación

Hoy: Ajustes copia `events.jsonl` al portapapeles, con o sin filtro de gravedad. Una línea por evento, en orden cronológico — es el formato que se puede recortar con `grep` y abrir a la mitad sin que se rompa, que es lo que hace falta cuando el archivo llega por mensaje desde otra ciudad.

Destino: la sesión se exporta como archivo comprimido con `session.json`, `events.jsonl` y `report.md`. **Sin audio.** Es lo que se adjunta a un informe de prueba de campo o a una consulta de soporte.
