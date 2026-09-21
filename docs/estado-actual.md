# Estado actual

Actualizado el 2026-09-21. Base de producto contrastada: `8b4de18`, de
`claude/soundcraft-ui24-assistant-kh8ezj`. La corrección del flujo está preparada en
`fix/flujo-de-desarrollo-ligero`. Consultar `git log` para los commits posteriores.
Este archivo reemplaza la cadena de cierres como entrada de sesión.

**Entrega publicada:** la rama ya existe en GitHub. `a3f171b` aligera el flujo;
`a280aab` agrega pruebas sobre servicios reales; `e8ca255` registra el informe.
El usuario habilitó este repositorio en la instalación de GitHub y se publicaron
los tres cambios mediante el conector. Se comprobó con Git que sus árboles
coinciden con los de la entrega local; los identificadores de commit cambiaron.
El bundle anterior queda como respaldo, no como un paso pendiente de recuperación.
Ver correspondencia y comprobaciones en el
[informe](backlog/auditorias/2026-09-21-flujo-de-desarrollo.md).

## Producto y siguiente tarea

- **Pieza 1, monitores: cerrada y probada contra el aparato.** Conservarla.
- **Pieza 2, ecualizador de canal:** criterio decidido en
  [ADR-038](adr/ADR-038-el-criterio-del-ecualizador-de-canal.md): curva nombrada,
  corrección por medición del canal y curva aprobada que vuelve a la biblioteca.
- Las doce hojas de las cuatro bandas están medidas:
  [ítem 121](compromisos/121-la-frecuencia-y-el-q-de-las-bandas-2-3-y-4.md).
  No repetir esa medición por arrastrar un prompt viejo.
- **Sigue la tarea 1b, «un kind, una unidad».** Frecuencia y Q medidos no implican
  permiso para escribir: el límite de la categoría está en dB. INV-004 rechaza
  correctamente la mezcla de unidades. La corrección de las pruebas al medir
  las bandas cambió el censo permitido de 834 a 690; no es una nueva regresión.

## Próxima sesión: decisión antes de implementar

1. Leer el [hallazgo de las unidades](backlog/hallazgo-un-kind-una-unidad-y-las-hojas-no-coinciden.md)
   y la tarea 1b del [plan de la pieza 2](pedidos/2026-09-20c-plan-de-la-pieza-2.md).
2. Consultar el trabajo previo ya archivado:
   [protocolo](referencia/trabajo-previo-de-terceros.md) y
   [ecualización automática](referencia/trabajo-previo-ecualizacion-automatica.md).
   Buscar por frecuencia, Q, paso y límite; leer los apartados aplicables.
   El hueco a resolver es cómo acotar desplazamiento y anchura, no volver a
   inventariar asistentes. Agregar las fuentes que falten.
3. Explicar opciones en lenguaje de sonido y preguntar interactivamente qué
   acota el salto de frecuencia y de Q. Registrar la decisión en una ADR.
   Hasta esa decisión, no cambiar límites ni abrir escrituras.

Después siguen la decisión sobre selección del analizador, lector de espectro,
asistente, servicio, pantalla y biblioteca; el plan contiene sus condiciones.
Un hallazgo anotado entra cuando el campo o la tarea actual lo necesita.

## Equipo y comprobaciones

Esta corrección de desarrollo no requiere consola ni tablet. Para una futura
medición, cargar [hardware](desarrollo/hardware.md); contiene el banco y su
diagnóstico. Un dato de un cierre no sustituye leer el equipo en esa sesión.

Al comenzar, comprobar rama, cambios locales y diferencias con esta base. Para
editar, elegir pruebas según [CONTRIBUTING](../CONTRIBUTING.md). Una corrida
anterior vale sólo para el árbol que probó; un estado «verde» escrito aquí no
certifica los cambios siguientes. El próximo agente entrega el prompt en el chat
usando la [plantilla](templates/prompt-continuidad.md), sin copiar este archivo entero.
