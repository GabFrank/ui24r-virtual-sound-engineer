---
name: vse-disciplina
description: Flujo de trabajo del Ui24R Virtual Sound Engineer. Aplicar al implementar, investigar, medir o documentar; leer procedimientos largos sólo cuando la tarea los requiera.
---

# Trabajar con precisión y poco contexto

## Inicio y alcance

Leer `AGENTS.md` y `docs/estado-actual.md`, comprobar rama y cambios locales.
Cargar la skill `vse-experto`. Abrir sólo las fuentes de la tarea actual.
No ejecutar toda la suite ni reconstruir cierres anteriores por iniciar sesión.
El pedido actual manda sobre un prompt viejo. Un hallazgo en el backlog espera
hasta que lo necesite el campo o la tarea; no inicia trabajo por estar anotado.

## Decidir e investigar

Preguntar **siempre de forma interactiva** cuando haga falta una respuesta del
usuario. Le corresponden autonomía, umbrales con consecuencias audibles y nuevas
clases de operación sobre su equipo. Resolver por oficio las decisiones de
organización, nombres y pruebas sin trasladarle ese trabajo.

Antes de proponer una decisión de producto, protocolo o modelo, consultar el
trabajo previo aplicable en `docs/referencia/`. Reusar la investigación archivada
si sigue siendo pertinente; buscar sólo lo que falta y registrar fuente, versión
y alcance. Una corrección editorial no exige una investigación nueva ni una ADR.
«No encontré en estas fuentes» no significa «no existe». No usar la fórmula
absoluta «no hay coincidencias en otros proyectos» para suplir evidencia.

## Implementar y comprobar

Una tarea coherente y revisable, con un resultado observable. Ejecutar durante
la edición la prueba que distingue ese resultado; antes del commit usar
`npm run verificar:cambio -- --base <commit-inicial>` según CONTRIBUTING.
`npm run verificar` conserva la suite completa para cambios transversales,
contratos y antes de integrar/publicar. No repetirla sobre el mismo árbol sin
una causa concreta. Los resultados de otro árbol no son evidencia actual.

Revisión por riesgo en `docs/protocolo-de-verificacion.md`: una revisión del diff
para prosa; comportamiento y conexiones para código; expectativas independientes
y fuentes físicas para seguridad y medición. Comprobar cada hallazgo del auditor
antes de aceptarlo. Ningún número de agentes reemplaza evidencia o decisión humana.

Un test debe detectar el defecto, no exigir la ortografía del código. Para una
regresión importante, comprobar en una copia aislada que el defecto lo hace
fallar y un cambio equivalente no. No sembrar defectos contra equipo real.

## Documentar, commitear y continuar

Actualizar sólo fuentes afectadas: capacidades si cambió el protocolo,
invariantes/autonomía si cambió el permiso, especificación si cambió una ley,
ADR e índice si hubo decisión, changelog si hay comportamiento visible.
El estado apunta a esas fuentes. No propagar la misma cifra a skills y cierres.

Distinguir MEDIDO contra el aparato, INFERIDO por código o terceros, y SIMULADO.
Citar evidencia archivada de la misma corrida. Al retirar una conclusión,
registrar qué evidencia la reemplaza sin reescribir como actual la historia.
Antes de afirmar ausencia o imposibilidad, buscar en código y fuentes pertinentes.

Commit convencional en español, ámbito permitido y asunto de hasta 72 caracteres.
Un commit y push por tarea antes de empezar la siguiente, salvo instrucción actual
del usuario. Verificar los mensajes sobre el rango real con
`npm run verificar:commits -- --base <base-de-la-rama>`; el gancho revisa el mensaje
al crearlo. Explicar en el cuerpo el motivo y las pruebas. No abrir PR ni integrar
sin pedido. No reescribir commits ajenos para acomodar una comprobación.

## Equipo y comunicación

Antes de tocar consola, tonos o tablet leer `docs/desarrollo/hardware.md`:
valores previos, restauración comprobada por HTTP, AFS y **nunca borrar snapshots**.
Estas protecciones físicas no dependen del tamaño de la tarea.

Hablar en lenguaje de producto. Escribir en el chat lo que el usuario deba copiar.
Avisar si la sesión se alarga. Al terminar actualizar `docs/estado-actual.md` y
entregar el prompt breve de `docs/templates/prompt-continuidad.md`, con rama,
commit, siguiente acción, pruebas y pendientes; no una recopilación de reglas.
