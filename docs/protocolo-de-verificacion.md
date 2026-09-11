# Protocolo de verificación

**De dónde sale este documento.** De una consultoría externa encargada el
2026-09-11, después de cuatro tandas seguidas en las que el peor hallazgo tuvo
la misma forma. El informe completo está en el hilo de esa consulta; acá queda
el protocolo operativo y lo que lo sostiene.

**Qué reemplaza.** El flujo de producción y auditoría, y las reglas de
verificación que entren en conflicto con él. Las reglas técnicas del proyecto y
las autorizaciones sobre commits y publicación siguen como están.

## El diagnóstico

**El agente produce la solución y también el criterio con el que después la
declara correcta.** La justificación convierte esa dependencia en apariencia de
respaldo independiente.

La secuencia:

1. Se adopta una interpretación plausible —por ejemplo, que las unidades de un
   dibujo equivalen a píxeles visibles—.
2. Esa interpretación produce el código **y sus expectativas**. Los tests
   comprueban resultados dentro del mismo modelo.
3. La documentación convierte la intención en una propiedad supuestamente
   conseguida: «queremos expresar la incertidumbre» pasa a «la incertidumbre
   está correctamente expresada».
4. Las verificaciones posteriores parten de esa descripción.
5. **La concordancia entre artefactos se lee como corroboración**, cuando todos
   pueden descender del mismo error.

La capa justificativa es vulnerable porque una frase amplía el alcance en
silencio: de «en estos casos» a «siempre», de «coincide» a «se debe a», de «lo
decidimos» a «lo establece la fuente». El compilador no ve esas transiciones.

### Dos correcciones a la premisa con que se hizo la consulta

**La primera la hizo el consultor y es importante**: en varios de los casos
**también falló la implementación**, no sólo la justificación. El arrastre movía
objetos al tocarlos; el índice cambiaba el orden. Lo particular no es que la
implementación estuviera bien y el texto mal: es que **la capa que debería
permitir descubrir el defecto compartía el error y además lo defendía**.

**La segunda**: el ejemplo de `resultado.length` estaba exagerado de mi parte.
Comprobar la longitud **sí** detecta una implementación que pierde elementos. Lo
insuficiente es atribuirle cobertura sobre identidad, duplicados u orden.

Las dos correcciones son del mismo tipo que el problema que vinieron a
diagnosticar: exageré el alcance al describir mi propia exageración de alcance.

## Por qué las reglas acumuladas no cortan la clase

Tres caminos quedan abiertos:

- **El autor elige qué cuenta como evidencia.** Puede ejecutar una cuenta que
  reproduce su propia fórmula incorrecta, o mutar sólo lo que ya entendió.
- **La revisión llega cuando ya existe una historia completa.** Incluso el
  auditor que no ve los comentarios recibe la conclusión, que lo orienta hacia
  el encuadre del autor.
- **Se comprueba concordancia sin comprobar procedencia.** Documento, constante
  y test pueden coincidir perfectamente y estar los tres equivocados.

### Las reglas vigentes, con su matiz

| Regla | Qué deja pasar | Ajuste |
|---|---|---|
| Fijar el literal esperado | Un literal copiado del resultado incorrecto | Registrar **de dónde sale** la expectativa |
| Atar documento y código | Los dos pueden compartir el mismo error | Separar concordancia interna de validación externa |
| Ejecutar toda justificación | Ejecutar una fórmula no valida su interpretación física | Comprobar por separado cálculo, modelo y aplicabilidad |
| Cero mutantes sobrevivientes | Existen mutantes equivalentes | Clasificar sobrevivientes y **respaldar las exclusiones** |
| Quitar una guarda si ningún test la distingue | El entorno de prueba puede omitir el caso que la necesita | Revisar primero entradas, fronteras y alcance del contrato |

## El flujo

La diferencia decisiva es **el compromiso previo del auditor B**: antes de ver
cómo se resolvió algo, deja asentado qué observación distinguiría una solución
válida de una alternativa plausible pero incorrecta.

| Momento | Quién, y qué recibe | Resultado |
|---|---|---|
| Antes de implementar | **Autor**: pedido y contexto | Compromisos observables y dudas |
| Antes de implementar | **Auditor A**: compromisos y fuentes originales | Procedencia, límites, contradicciones |
| Antes de implementar | **Auditor B**, en contexto nuevo: pedido, restricciones y fuentes. **Sin la solución ni la conclusión** | Casos discriminantes y expectativas propias |
| Implementación | **Autor**: contrato revisado | Código y evidencia de ejecución |
| Contraste | **Auditor B**: implementación ejecutable contra sus expectativas previas | Resultados y contraejemplos |
| Cierre | **Auditor A**: textos finales, archivos y evidencia | Afirmaciones respaldadas, excesivas o pendientes |

**La independencia exige controlar el contexto.** Decir «ignorá los comentarios»
después de entregarlos es separación débil: la primera intervención de B empieza
en un contexto nuevo, sin heredar la conversación. Después sí puede inspeccionar
todo — ya fijó sus expectativas.

**La especificación va al principio y la documentación al final.** Posponer las
dos permitiría adaptar los requisitos a cualquier resultado. Durante la
implementación se registran hipótesis; lo que se posterga es **declarar que una
propiedad quedó demostrada**.

**B puede reservar casos** sin mostrarlos, siempre que los registre antes de
ejecutar la solución. Una vez revelados para corregir un defecto, pasan a ser
regresiones conocidas y dejan de contar como evaluación reservada.

## Dónde se aplica

A cada cambio coherente que introduzca o modifique **compromisos observables**,
agrupados. No un expediente por función.

## La debilidad de la propuesta, dicha por quien la propone

**El contrato previo también puede estar equivocado.** Su validez depende de
procedencia comprobable y de casos discriminantes. Una plantilla completada por
el mismo autor, sin ese contraste, reproduce el problema con otro formato.

Y dos agentes del mismo modelo comparten errores de conocimiento. Para los
hechos de dominio hacen falta **fuentes aplicables, mediciones o decisiones
explícitas del usuario**: otra opinión generada no sustituye esos apoyos.

## Cómo saber si funciona

Una caída en los hallazgos no alcanza: puede significar que los auditores
dejaron de encontrar cosas.

| Medida | Qué observar |
|---|---|
| Escapes materiales después del cierre | Cantidad, gravedad, y sobre cuántos compromisos revisados |
| Defectos sembrados | Detectados sobre introducidos, **por familia** |
| Falsas alarmas | Casos válidos rechazados sobre controles válidos revisados |
| Cambios de expectativa | Cuáles tuvieron evidencia nueva y cuáles sólo acomodaron el resultado |
| Costo | Tiempo de revisión, retrabajo y compromisos sin verificar |

Los defectos se siembran **en copias aisladas, nunca contra la consola real**.
Familias a sembrar: una fuente que no respalda su atribución; una conversión de
unidades o coordenadas incorrecta; un test y una implementación que comparten la
misma constante errónea; una rama omitida o una protección inerte; una
afirmación universal respaldada sólo por ejemplos. **Con controles correctos**:
un auditor que rechaza todo detectaría todo y seguiría siendo inútil.

**No se declara mejora** porque crecieron los tests, bajaron los hallazgos o
mejoró una cifra global. Se busca menos escapes con capacidad de detección
sostenida, sin ocultar pendientes ni aumentar las falsas alarmas. Dos o tres
tandas dan una señal operativa; no prueban que la clase de error desapareció.

## Fuentes, y qué respalda cada una

- **Turpin, Miles; Michael, Julian; Perez, Ethan; Bowman, Samuel R. (2023).**
  *Language Models Don't Always Say What They Think: Unfaithful Explanations in
  Chain-of-Thought Prompting.* NeurIPS 2023, arXiv:2305.04388.
  **Respalda**: que una explicación generada puede racionalizar una respuesta
  influida por el contexto sin revelar esa influencia.
  **No establece**: el mecanismo interno de este agente, intención de engañar,
  ni la eficacia de este protocolo. El estudio trata explicaciones de
  razonamiento; su relación con comentarios de código es inferencia de la
  consultoría.
- **Barr, Earl T.; Harman, Mark; McMinn, Phil; Shahbaz, Muzammil; Yoo, Shin
  (2015).** *The Oracle Problem in Software Testing: A Survey.* IEEE TSE 41(5),
  507–525. DOI 10.1109/TSE.2014.2372785.
  **Respalda**: que ejecutar un sistema y determinar si su comportamiento es
  correcto son problemas distintos; aumentar las ejecuciones no arregla una
  expectativa equivocada.
  **No establece**: que dos agentes produzcan independencia suficiente, ni que
  una cantidad de tests garantice corrección.
- **Stryker Mutator, *Equivalent mutants*.** Documentación oficial, consultada
  el 2026-09-11.
  **Respalda**: que existen mutaciones sin diferencia observable, y que exigir
  que todas mueran tiene un límite.
  **No establece**: que los sobrevivientes de este proyecto sean equivalentes.
  Cada exclusión necesita su propio análisis.

**Procedencia de las recomendaciones.** La separación temporal de roles, el
contrato previo, los contextos nuevos, los casos reservados y el piloto de dos o
tres tandas son **propuestas de ingeniería de esa consultoría**, no resultados
demostrados por las fuentes. Su eficacia en este proyecto está por evaluar.
