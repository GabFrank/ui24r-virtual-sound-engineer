# ADR-005 — Estado confirmado propio y origen de los cambios

**Estado:** Aceptada
**Fecha:** 2026-09-07
**Origen:** Auditoría técnica A-01, A-02, A-09; auditoría de producto B-19, B-23; auditoría de calidad D-19.

## Contexto

Tres hechos del protocolo:

1. Los mensajes **no identifican al cliente** que originó un cambio. El plan preveía distinguir "navegador de la Ui24R" de "tablet externa". No es derivable.
2. **No hay confirmación de escritura**, y la biblioteca comunitaria construye su estado sobre la unión de mensajes entrantes y salientes: una escritura propia actualiza el estado local **antes** de que la consola la aplique. Verificar contra ese estado compara contra un valor que quizá nunca llegó.
3. Al conectar y al recuperar una instantánea, la consola envía el estado como cientos de mensajes individuales. Arrastrar un fader en el navegador genera decenas por segundo. Un detector de conflictos ingenuo vería una avalancha de "cambios externos".

## Decisión

Se construye un **almacén de estado confirmado propio**, alimentado **solo por los mensajes entrantes**. Ninguna verificación previa a escribir y ningún retroceso leen el estado de la biblioteca.

El origen se reduce a `SELF`, `EXTERNAL` y `UNKNOWN`, por correlación temporal: una escritura propia se registra con ruta, valor e instante; un mensaje entrante con la misma ruta y valor dentro de 300 ms se etiqueta `SELF`; cualquier otro en esa ruta es `EXTERNAL`. Durante una avalancha la ventana sube a 1000 ms.

Más de 10 rutas distintas en menos de un segundo, o un cambio de la instantánea actual, se tratan como **avalancha de cambio externo**: se abortan las transacciones, se invalidan las mediciones previas abiertas y el almacén queda inválido hasta releer.

El almacén tiene estado válido o inválido. Es válido cuando la conexión estuvo continua desde el último volcado completo y no hubo avalancha posterior. No se define "antigüedad máxima de lectura": en un protocolo que solo empuja estado, un parámetro que nadie tocó en diez minutos tiene diez minutos de antigüedad y ninguna escritura pasaría.

## Consecuencias

- La interfaz nunca promete "lo cambió el teléfono de Fulano". Dice "cambio externo".
- Dos instancias de esta misma aplicación no se distinguen entre sí, lo que motiva la invariante de presencia INV-032.
- Hay que probar en el primer spike si la consola devuelve eco al emisor. De ahí sale la política de confirmación por parámetro.

## Alternativas descartadas

- **Usar el estado de la biblioteca.** Mezcla escrituras propias no confirmadas.
- **Enum de clientes del plan original.** No es derivable del protocolo.
