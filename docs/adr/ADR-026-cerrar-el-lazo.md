# ADR-026 — Cerrar el lazo: la aplicación escribe la ganancia

**Estado:** Aceptada
**Fecha:** 2026-09-09
**Origen:** Decisión del usuario tras la fase de medición. Habilita el nivel ASSISTED para la ganancia de entrada, que la matriz de autonomía ya tenía previsto desde MVP4a.

## Contexto

Hasta ahora la aplicación mide, propone y **no escribe**: el nivel es OBSERVE y la pantalla de ganancia lo dice —«la aplicación propone; el cambio se aplica a mano en la consola»—. Eso quedó verificado en la tablet: el ejecutor de transacciones existe en el código y **nadie lo instancia**.

Lo que faltaba no era el mecanismo sino la confianza en los números. Después de medir contra el aparato hay con qué:

- La escritura se confirma por una **segunda conexión testigo**, con mediana de 11,5 ms (ADR-024).
- La ganancia que la aplicación informa es la del **previo que el canal declara** en `i.N.src`, no la que su número sugiere.
- La conversión a decibeles lleva la **corrección medida** del previo, −1,15 dB por encima de 26 dB.
- El punto donde se mide está **antes** del compresor, del ecualizador y de la puerta, los tres comprobados.

Las invariantes ya acotan la forma: INV-006 restringe la ganancia a `CHANNEL_SETUP`, INV-005 pone el techo en 4 parámetros por transacción con 100 ms entre escrituras, INV-011 exige leer antes de escribir, e INV-021 aborta ante una avalancha.

Lo que no estaba decidido son tres cosas, y las tres tocan el equipo de alguien.

## Decisión

### 1. El botón se habilita con confianza ALTA o MEDIA, con el aviso a la vista

**Por qué no solo ALTA.** La mayoría de las propuestas reales caen en MEDIA: basta que el canal tenga de-esser activo —el único bloque que sigue sin medirse— o que la captura no se haya repetido. Exigir ALTA dejaría el botón apagado casi siempre, el operador aplicaría a mano igual, y el lazo no serviría para nada. Un mecanismo de seguridad que nunca se usa no protege: se saltea.

Con MEDIA se aplica, **y la pantalla dice qué falta para que fuera ALTA**. La confianza deja de ser una traba y pasa a ser información.

BAJA y SIN DATOS no habilitan. Con SIN DATOS no hubo medición, y la pantalla ya lo dice.

### 2. Sin testigo, se verifica por el medidor si hay señal

Si el testigo no abre —wifi saturada en pleno show, que es cuando más falta hace— la primera opción es la que INV-011 ya contempla: **para la ganancia con señal presente, el propio medidor confirma**. Si se subió la ganancia 3 dB, el nivel tiene que subir 3 dB.

Es una verificación **indirecta y más débil**, y hay que decirlo así: confirma el efecto, no el valor. Se anota en el diario como `VU` y no como `WITNESS`, para que un diario viejo siga diciendo la verdad sobre cómo se comprobó cada cosa.

**Sin señal no hay verificación posible y no se escribe.** Ahí sí se cae al comportamiento de hoy: rechazar antes de tocar nada. Escribir a ciegas y marcarlo como no verificado —lo que INV-011 llama `TIMEOUT`— se descartó: la aplicación afirmaría haber hecho algo que no comprobó, y el operador no tiene cómo distinguirlo de un cambio que sí funcionó.

### 3. Verificado quiere decir que se volvió a medir

Después de aplicar, una ventana corta de medición y comparar contra lo esperado. Si el margen no mejoró como debía, **se avisa y se ofrece revertir**.

**Por qué no alcanza con que el valor haya llegado.** Que el testigo vea `hw.9.gain = 0.72` prueba que la perilla se movió, no que haya servido. El caso que interesa es justamente el otro: la propuesta era razonable, el valor entró, y el efecto no fue el esperado —porque el previo está en su tope, porque hay un límite antes, porque la fuente cambió entre una medición y la otra—. Sin volver a medir, eso queda sin detectar y la aplicación informa un éxito que no hubo.

El costo es que la fuente tiene que seguir sonando unos segundos más. Es un costo del operador, y a cambio recibe la única comprobación que responde la pregunta que le importa.

## Consecuencias

- La ganancia de entrada pasa a **ASSISTED**; el resto sigue en SUGGEST. La matriz de autonomía se actualiza solo en esa fila.
- Aparece un estado nuevo en la pantalla: aplicado pero **sin verificar todavía**, mientras corre la segunda medición.
- La reversión necesita el valor anterior, que ya se guarda: `gainActualDb` sale del estado confirmado antes de escribir.
- El diario distingue `WITNESS` de `VU`, así que se puede auditar después con qué se comprobó cada cambio.
- **Nada de esto se activa fuera de `CHANNEL_SETUP`** (INV-006). En medio de un show la ganancia sigue bloqueada.
