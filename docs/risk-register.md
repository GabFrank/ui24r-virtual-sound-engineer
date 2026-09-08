# Registro de riesgos

Consolidado de las cuatro auditorías. Cada riesgo tiene responsable y mitigación concreta. Se revisa en cada control de paso.

**Responsable por defecto:** desarrollador principal.

## Riesgos de seguridad acústica

| ID | Riesgo | Severidad | Probabilidad | Mitigación | Estado |
|---|---|---|---|---|---|
| R-01 | Audio no solicitado de Android llega al sistema de amplificación | Crítica | Media | ADR-002: el generador es el reproductor de la consola. Ninguna salida de Android participa. Verificado en SPK-P0.6' criterio 6 e INV-026 | Mitigado por diseño, falta verificar |
| R-02 | El generador daña altavoces o audición por nivel excesivo | Crítica | Media | INV-015: arranque a −40 dBFS, rampa, tope digital, nivel operativo del fader que arranca en −30 dB y sube solo con acción explícita, límite de nivel acústico con calibración y tope absoluto sin ella | Definido, falta implementar |
| R-03 | La aplicación mueve un envío de monitor o el fader general y el músico pierde su referencia en pleno show | Crítica | Media | ADR-010 con la categoría solo del usuario, INV-008, INV-009, INV-010 y un test estático que enumera las rutas escribibles | Definido |
| R-04 | El bus de análisis está patcheado físicamente a un amplificador o a monitores, y la aplicación no puede saberlo porque solo ve envíos | Alta | Media | INV-016: prueba de aislamiento por correlación antes de la primera medición y tras cada cambio de configuración | Definido |
| R-05 | Alimentación fantasma sobre la salida de línea de la consola por un cable equivocado en la entrada 2 | Alta | Media | Regla de cableado en el asistente de configuración: entrada 2 solo por conector TRS, con confirmación explícita. INV-007: la aplicación nunca escribe alimentación fantasma | Definido |

## Riesgos técnicos

| ID | Riesgo | Severidad | Probabilidad | Mitigación | Estado |
|---|---|---|---|---|---|
| R-06 | La tablet no certifica: cortes, no carga mientras hace de anfitrión, desconexiones por cambio de ruta | Alta | Media | Dos candidatas antes de empezar. SPK-P0.3b antes de SPK-P0.3, por si la conexión directa elimina la interfaz. El primer entregable no depende de USB | Abierto |
| R-07 | El escalado de los parámetros de proceso es desconocido: una escritura mal convertida produce un cambio extremo en vivo | Alta | Media | SPK-P0.2b y P0.2c con captura de tráfico, tabla de mapeo con ida y vuelta, rechazo de todo valor fuera de tabla. Fuera del camino crítico | Abierto |
| R-08 | El protocolo no confirma escrituras ni identifica al emisor | Alta | Alta | ADR-005: estado confirmado propio desde mensajes entrantes, correlación temporal. SPK-ACK-POLICY define la confirmación por parámetro | Abierto |
| R-09 | Ecualización de sala equivocada por medir magnitud sin coherencia ni alineación temporal | Alta | Media | ADR-003: función de transferencia, coherencia y estimador de retardo en el motor básico. Máscara de coherencia con 16 promedios mínimo | Definido |
| R-10 | El soundcheck virtual no es repetible: sin posicionamiento, arranque variable, pendrive lento | Media | Media | SPK-P0.7a temprano, con la consola sola. Alineación por correlación. Pendrive certificado | Abierto |
| R-11 | **Sin micrófono de medición.** Un condensador de estudio es direccional y no plano: sesga la medición de sala, sobre todo en agudos y fuera de eje | Media | Alta | El perfil de micrófono lleva la marca de si es o no de medición. Sin ella, la confianza de las recomendaciones de sala se limita y por encima de 4 kHz se limita más. La medición multiposición exige orientación consistente. Se resuelve comprando un omnidireccional de medición antes de Room-Observe | Abierto |
| R-12 | La biblioteca comunitaria depende de un solo mantenedor, y un firmware puede cambiar el protocolo | Media | Baja | Versión de biblioteca y firmware fijados en la matriz. INV-033 deshabilita escrituras crudas con firmware distinto. Suite de tests de protocolo propia | Definido |
| R-13 | El pendrive no sostiene 22 pistas: la tasa bruta supera el mínimo declarado por el fabricante de la consola | Media | Alta | Pendrive certificado en la matriz con su velocidad medida. Formato comprimido sin pérdida si la escritura queda ajustada | Abierto |
| R-22 | La recuperación de un CUE de la consola incluye envíos de AUX y mueve la mezcla personal de un músico en pleno show | Crítica | Media | Sin verificar. SPK-FW3 mide campo por campo qué toca un CUE. Si incluye AUX y no se puede excluir, INV-010 prohíbe recuperar CUE desde la aplicación y la automatización por canción queda limitada a escritura directa de parámetros de FOH | Abierto |
| R-23 | Las transiciones graduales entre perfiles exigen un ritmo de escritura que la consola no sostiene, o que INV-005 no permite | Alta | Alta | Sin verificar. Una rampa de 300 ms sobre cuatro canales son decenas de escrituras por segundo; INV-005 exige ≥ 100 ms secuenciales con confirmación del anterior. SPK-FW3 y SPK-P0.9 miden la frecuencia segura. Si no alcanza, las transiciones son escalón, no rampa | Abierto |

## Riesgos de proceso

| ID | Riesgo | Severidad | Probabilidad | Mitigación | Estado |
|---|---|---|---|---|---|
| R-14 | La fase 0 se estira y el proyecto pierde impulso sin haber entregado nada | Crítica | Alta | ADR-007 con controles escalonados y ADR-008 con el primer entregable sin interfaz de audio, en unas nueve semanas | Mitigado |
| R-15 | Los asistentes de configuración resultan demasiado largos para el tiempo real de un soundcheck y no se usan | Alta | Alta | Cada asistente declara su presupuesto de tiempo y tiene camino rápido. Se mide en cada prueba de campo | Definido |
| R-16 | Estado inconsistente tras una caída o una recuperación manual de instantánea: el retroceso restaura algo equivocado | Alta | Media | ADR-013: diario antes de escribir, detección de avalancha, nunca reaplicar | Definido |
| R-17 | Parálisis por documentación, o especificaciones escritas antes de la fase 0 que hay que rehacer | Alta | Alta | ADR-016: mínimo documental, el resto son documentos vivos por versión | Mitigado |
| R-18 | El carril de trabajo con hardware es humano y no se paraleliza: 92 días que gobiernan el calendario | Alta | Alta | Reconocido en la estimación. Un segundo par de manos con acceso al hardware, aunque sea parcial, recorta dos o tres meses | Abierto |
| R-19 | Recomendaciones que el usuario no entiende ni aplica, y sin datos para aprender después | Media | Media | La cadena hallazgo, hipótesis y recomendación con enlaces por identificador. Explicación determinística. Valoración del usuario en cada prueba de campo | Definido |
| R-20 | Solo se prueban dos salas de los seis tipos previstos | Media | Alta | Documentado como límite conocido. Ampliar cobertura después del MVP | Aceptado |
| R-21 | El alcance crece de asistente de medición a automatización de show sin revisar la matriz de autonomía, y la aplicación termina escribiendo parámetros que hoy son «solo del usuario» | Alta | Alta | Los perfiles por canción piden escribir efectos y subgrupos, que ADR-010 dejó fuera de alcance, y balance vocal sobre cuatro canales a la vez, que excede el límite de INV-005. Es una decisión de alcance, no un detalle de implementación: hasta que se tome, no se escribe ninguno de esos parámetros | Abierto |
