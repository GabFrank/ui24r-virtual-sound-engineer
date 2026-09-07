# ADR-002 — El generador de señal es el reproductor de la consola

**Estado:** Aceptada
**Fecha:** 2026-09-07
**Origen:** Auditoría técnica A-20; auditoría de producto B-16 y B-20; auditoría de calidad D-01 a D-04.

## Contexto

El plan generaba barridos y ruido rosa desde Android, por la salida de la interfaz de audio, hacia un canal de retorno de la consola llamado *Analysis Return*, y de ahí al sistema de amplificación.

Al conectar un dispositivo de audio USB, **Android lo convierte en salida por defecto** para multimedia y notificaciones. La aplicación no puede impedir que otra aplicación escriba en esa salida. El "no molestar" reduce la probabilidad pero no cierra la ruta.

Peor: el retorno se abre con una escritura por red. Si la red cae con el canal abierto, la regla de "bloqueo ante pérdida de conexión" **no puede cerrarlo**.

Las dos auditorías coincidieron en que este es el mayor riesgo de seguridad acústica del proyecto. Una proponía mitigarlo con cinco invariantes; la otra, eliminar la ruta.

## Decisión

El generador de estímulo es el **reproductor multimedia interno de la Ui24R**, con los archivos preparados en el pendrive. La referencia eléctrica sigue llegando a la entrada 2 por el bus de análisis.

El *Analysis Return* **sale del alcance del MVP**. Queda como épica opcional posterior, solo si el reproductor resulta insuficiente.

La salida de la interfaz externa se usa únicamente dentro del asistente de loopback, con verificación de cables antes y después (INV-030).

## Consecuencias

- **Desaparece la clase entera de riesgo**, en lugar de mitigarse. Ninguna salida de Android participa en la cadena hacia el sistema de amplificación.
- El paro de emergencia pasa a ser una acción local más un comando de detención, sin depender de que la red esté viva para cerrar un canal abierto.
- Se pierde la sincronía entre generador y captura. **No hace falta**: con la referencia eléctrica en la entrada 2, la función de transferencia se calcula por doble FFT sin sincronía (ver ADR-003).
- Se depende del pendrive: formato FAT32, 32 GB o menos, 25 MB/s de escritura mínimos. Entra en la matriz de hardware.
- Las señales se preparan como archivos con suma de verificación, no se sintetizan en vivo.

## Alternativas descartadas

- **Conservar el retorno con cinco invariantes de protección.** Mitiga, no elimina. La ruta sigue existiendo y la aplicación sigue sin poder cerrarla cuando más falta hace.
