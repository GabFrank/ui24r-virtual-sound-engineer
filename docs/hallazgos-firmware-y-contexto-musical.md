> **Documento de origen, recibido el 2026-09-08.** Se guarda tal como llegó, sin editar su contenido, porque es la fuente de ADR-022 y de SPK-FW3.
>
> **Lo que afirma sobre el firmware todavía no está verificado.** Ninguna de las capacidades que describe —sidechain entre subgrupos, RTA compartido, pre-delay del Lexicon, canales DSP adicionales, contenido del CUE— fue comprobada contra una consola. Están anotadas como DESCONOCIDO en [la matriz de capacidades](capability-matrix.md) y las mide [SPK-FW3](spikes/SPK-FW3-capacidades-firmware.md). Hasta entonces no se implementa nada sobre ellas: es la misma regla que rige el resto del protocolo.
>
> **Dos de sus propuestas chocan con decisiones ya tomadas** —los efectos y los subgrupos son «solo del usuario» en [la matriz de autonomía](autonomy-matrix.md), y el ritmo de escritura que piden las transiciones excede INV-005—. Están anotadas como R-21, R-22 y R-23 en [el registro de riesgos](risk-register.md) y resueltas en ninguna parte: son decisiones de alcance pendientes.

# Hallazgos y lineamientos arquitectónicos del proyecto

Este documento reúne hallazgos que deben ser considerados durante el desarrollo actual del sistema de asistencia y automatización para Soundcraft Ui24R.

El objetivo inmediato no es implementar todas las funcionalidades descritas aquí, sino evitar decisiones arquitectónicas que dificulten su incorporación futura.

---

# SECCIÓN 1 — Capacidades internas de Soundcraft Ui24R

## 1. Hallazgo principal

Durante una revisión de la evolución del firmware de la Soundcraft Ui24R se identificaron capacidades internas de procesamiento, automatización, routing y análisis bastante más avanzadas de lo contemplado inicialmente.

El manual base corresponde a una versión antigua del firmware y no documenta varias funciones agregadas posteriormente, especialmente durante las ramas de firmware 2.x y 3.x.

La consecuencia arquitectónica principal es:

```text
Antes de implementar procesamiento externamente:

¿Ui24R ya puede hacerlo internamente?
        |
       Sí
        |
        v
Controlar la función existente
desde nuestro sistema
        |
       No
        |
        v
Evaluar procesamiento externo
```

La aplicación debería tender a convertirse en una capa inteligente de:

- observación;
- medición;
- análisis;
- decisión;
- automatización;
- control;

mientras el DSP crítico permanezca, cuando sea posible, dentro de la Ui24R.

Esto reduce:

- latencia;
- consumo de CPU externo;
- complejidad;
- puntos de fallo;
- dependencia de la aplicación durante un show.

La Ui24R debe continuar pasando audio normalmente incluso si nuestra aplicación deja de funcionar.

---

# 2. Funciones relevantes descubiertas

## 2.1 Sidechain / Ducker entre Subgroups

La Ui24R permite utilizar un Subgroup como señal de sidechain de otro Subgroup.

Ejemplo:

```text
SG1 = Voces
SG2 = Instrumentos

SG1
 |
 | sidechain
 v
Compressor SG2
```

Cuando existe actividad vocal, determinados instrumentos podrían bajar automáticamente aproximadamente 1–3 dB.

Aplicaciones:

- crear espacio para las voces;
- reducir guitarras/teclados mientras se canta;
- kick -> bajo;
- automatización dinámica del balance.

Importante:

En nuestra banda las cuatro voces frecuentemente cantan simultáneamente.

Por eso el sidechain NO debe utilizarse para decidir cuál cantante es el protagonista.

Debe considerarse principalmente como una segunda capa:

```text
Song Profile / CUE
        |
        v
determina jerarquía vocal

+

Sidechain
        |
        v
crea espacio instrumental
```

---

## 2.2 RTA Hold / RTA Share

La Ui24R posee herramientas RTA más avanzadas que un simple visualizador.

Permite:

- visualizar RTA;
- congelar mediciones;
- compartir la visualización entre diferentes vistas;
- utilizar una entrada de medición mientras se trabaja sobre el EQ de salida.

Debe investigarse especialmente para el módulo de calibración de sala.

Arquitectura potencial:

```text
Micrófono de medición
        |
        v
Ui24R input
        |
        v
RTA
        |
        v
Sistema de análisis
        |
        v
Recomendación / automatización
        |
        v
Master GEQ
```

---

## 2.3 dbx AFS2

La Ui24R incorpora AFS2 para detección y supresión de feedback.

Modos relevantes:

```text
FIXED
```

para hacer ring-out antes del show.

```text
LIVE
```

para detectar nuevas frecuencias problemáticas durante la presentación.

El proyecto no debe reinventar este sistema.

Nuestra aplicación puede:

- asistir en su configuración;
- controlar el procedimiento de ring-out;
- analizar resultados;
- complementar AFS2 con mediciones acústicas;
- detectar configuraciones potencialmente incorrectas.

---

## 2.4 Lexicon Reverb Pre-Delay

Firmwares posteriores incorporaron pre-delay.

Ejemplo:

```text
Voz directa ----------------------> PA

Voz -> 40 ms -> Reverb ----------> PA
```

Esto permite mantener la voz frontal e inteligible mientras la reverberación aparece ligeramente después.

El sistema podría recomendar valores considerando:

- BPM;
- tipo de canción;
- densidad;
- tipo de voz;
- papel lead/coro.

---

## 2.5 FX Sends PRE / POST

Los FX Sends pueden operar PRE o POST.

Esto debe contemplarse explícitamente en nuestro modelo de routing.

No asumir que un FX Send necesariamente sigue al fader principal.

---

## 2.6 Patch Matrix avanzada

La Ui24R permite routing considerablemente más complejo que el contemplado inicialmente.

Debe mapearse completamente:

```text
Physical Inputs
USB-A
USB-DAW
DSP Channels
Subgroups
Aux
Matrix
FX
Master
Physical Outputs
Headphones
```

Esto puede permitir procesamiento encadenado internamente.

Ejemplo:

```text
Voz
 |
 v
Delay
 |
 v
DSP Channel
 |
 v
Reverb
 |
 v
Master
```

en lugar de utilizar siempre efectos en paralelo.

---

## 2.7 Canales DSP adicionales

Existen canales que pueden emplearse como recursos internos y no necesariamente corresponden directamente a entradas físicas.

Posibles usos:

- retornos;
- procesamiento;
- loops;
- routing;
- USB/DAW;
- cadenas DSP.

Debe incluirse en la auditoría técnica.

---

## 2.8 AUX adicionales / Matrix

Las versiones modernas disponen de mayor flexibilidad de buses.

Debe verificarse:

- qué buses existen;
- cuáles poseen salida física;
- cuáles pueden patcharse;
- qué procesamiento admiten.

Aplicaciones potenciales:

- IEM;
- monitores;
- fills;
- subwoofer;
- grabación;
- medición;
- procesamiento paralelo.

---

## 2.9 HPF / LPF en AUX

Los filtros en AUX pueden ser particularmente útiles para monitoreo.

Ejemplo:

```text
Monitor vocal

HPF ~= 100–150 Hz
```

Puede reducir:

- energía innecesaria en escenario;
- graves sin utilidad para el cantante;
- enmascaramiento;
- posibilidades de feedback.

---

# 3. CUE Recall

La Ui24R posee un sistema de CUE separado de los Snapshots completos.

Los CUE pueden involucrar parámetros relacionados con:

- Mix Level;
- Pan;
- Mute;
- FX Send;
- AUX Send;
- PRE/POST.

Esto resulta especialmente interesante para nuestra banda.

---

# 4. Jerarquía vocal particular de la banda

Tenemos cuatro voces que generalmente permanecen activas durante toda la canción.

Lo que cambia es su rol musical.

Ejemplos:

```text
Canción A

V1 = LEAD
V2 = coro
V3 = coro
V4 = coro
```

```text
Canción B

V1 = igual
V2 = igual
V3 = igual
V4 = igual
```

Especialmente frecuente en cantos nativos.

```text
Canción C

V4 = LEAD
V1/V2/V3 = coro
```

```text
Canción D

V3 = LEAD
V1/V2/V4 = coro
```

La actividad acústica de los micrófonos no permite determinar correctamente esa intención artística.

Por tanto:

```text
NO usar actividad de voz
para decidir el protagonista.
```

La identidad del protagonista debe provenir de conocimiento previo de la canción.

---

# 5. CUEs como roles vocales

Podrían existir perfiles reutilizables:

```text
V1_LEAD
V2_LEAD
V3_LEAD
V4_LEAD
ALL_EQUAL
CUSTOM
```

Ejemplo inicial:

```text
V3_LEAD

V1  -2.5 dB
V2  -2.5 dB
V3   0.0 dB
V4  -2.5 dB
```

Los valores son únicamente orientativos y deberán calibrarse.

Inicialmente se recomienda bajar ligeramente los coros en lugar de subir significativamente el lead.

Ventajas:

- mantiene headroom;
- disminuye riesgo de feedback;
- mantiene estable el nivel general;
- crea jerarquía sin cambios agresivos.

---

# 6. Profundidad mediante FX

El rol vocal puede afectar no solamente volumen.

Ejemplo:

```text
             LEVEL     REVERB

V1 coro      -2.5       +1
V2 coro      -2.5       +1
V3 LEAD       0.0       -1
V4 coro      -2.5       +1
```

Conceptualmente:

```text
LEAD
más frontal
más seco
más presente

COROS
algo más bajos
algo más húmedos
más profundos
```

Para cantos colectivos:

```text
ALL_EQUAL

V1 = 0
V2 = 0
V3 = 0
V4 = 0

FX similares
```

---

# 7. Song Profile

La aplicación debería implementar eventualmente un concepto independiente de CUE denominado:

```text
SongProfile
```

Ejemplo conceptual:

```text
SongProfile

songId
name
bpm

vocalRole

vocalBalance

vocalFxProfile

instrumentProfile

cueReference

snapshotReference

transitionSettings
```

Roles sugeridos:

```text
V1_LEAD
V2_LEAD
V3_LEAD
V4_LEAD
ALL_EQUAL
CUSTOM
```

`CUSTOM` permitirá configuraciones como:

```text
V1 = lead
V2 = segunda voz destacada
V3 = coro
V4 = coro
```

---

# 8. CUE nativo vs control directo

Debe investigarse cuál de estas arquitecturas conviene utilizar.

## Alternativa A

```text
SongProfile
      |
      v
Recall CUE nativo
      |
      v
Ui24R
```

Ventajas:

- robustez;
- lógica ejecutada dentro de la consola;
- posible fail-safe manual.

## Alternativa B

```text
SongProfile
      |
      v
escritura directa
de parámetros
      |
      v
Ui24R
```

Ventajas:

- mayor flexibilidad;
- generación dinámica;
- no requiere crear manualmente muchos CUE.

Es probable que la mejor solución sea híbrida.

---

# 9. Protección de AUX / IEM

Este punto es crítico.

Los cambios de canción NO deben alterar inesperadamente las mezclas personales.

Objetivo:

```text
Cambio de canción
       |
       +----> FOH cambia
       |
       +----> FX pueden cambiar
       |
       X
       |
       +----> IEM permanece estable
```

Debe investigarse si podemos:

- excluir AUX del CUE;
- proteger AUX;
- mantener valores idénticos;
- utilizar control directo únicamente de parámetros FOH.

---

# 10. Transiciones

Debe investigarse si los cambios de parámetros pueden realizarse gradualmente.

En lugar de:

```text
V3 -2.5 -> 0
instantáneo
```

preferimos evaluar:

```text
V3 -2.5 -> 0
durante 200–500 ms
```

simultáneamente con:

```text
V1 0 -> -2.5
```

Esto puede producir cambios musicalmente más naturales.

Si la Ui24R no posee ramp interno, nuestra aplicación podría implementarlo enviando cambios progresivos.

Debe medirse la frecuencia segura de comandos.

---

# 11. Investigación técnica requerida

Abrir una investigación:

## Auditoría completa de capacidades internas de Soundcraft Ui24R firmware 3.5

Especialmente:

### DSP

- EQ;
- GEQ;
- HPF/LPF;
- Gate;
- Compressor;
- De-Esser;
- AFS2;
- Sidechain;
- Automix;
- Lexicon FX;
- Delay;
- Subgroups;
- Aux;
- Matrix.

### Routing

Mapear:

```text
Physical Inputs
USB-A
USB-DAW
DSP Channels
Subgroups
Aux
Matrix
FX Send
FX Return
Master
Physical Outputs
Headphones
```

### Protocolo remoto

Investigar:

- WebSocket/protocolo utilizado;
- parámetros;
- IDs;
- mensajes;
- lectura;
- escritura;
- rangos;
- eventos;
- frecuencia segura de comandos.

Especial atención a:

```text
CUE
Snapshots
Sidechain
RTA
AFS2
Patching
FX
Subgroups
Aux
Matrix
```

### RTA / telemetría

Determinar posibilidad de leer:

- espectro;
- meters;
- Gain Reduction;
- AFS filters;
- estados DSP.

### CUE / Snapshot

Determinar:

- contenido;
- recall;
- diferencias;
- AUX;
- protección;
- latencia;
- acceso remoto;
- creación automática;
- modificación automática;
- Next/Previous Cue.

---

# 12. Fail-safe

Principio obligatorio:

```text
La aplicación NO debe ser necesaria
para que continúe pasando audio.
```

Si nuestra aplicación desaparece:

```text
Ui24R
 |
 v
continúa mezclando normalmente
```

Los mecanismos críticos deben quedar dentro de la consola siempre que sea posible.

---

# SECCIÓN 2 — Integración futura con CanindeChords

## 13. Contexto

Actualmente ya existe una PWA denominada:

```text
CanindeChords
```

utilizada oficialmente por la banda durante los shows.

CanindeChords ya administra:

- canciones;
- setlists;
- letras/acordes;
- orden planificado;
- sesión del show;
- canción actualmente seleccionada.

Aunque existe un orden en el setlist, durante los shows ese orden puede no ser respetado.

Por lo tanto:

```text
NO utilizar posición del setlist
como autoridad musical.
```

La información importante es:

```text
¿Cuál canción está actualmente abierta?
```

---

# 14. CanindeChords como fuente de verdad del show

Arquitectónicamente, CanindeChords debería convertirse en la autoridad sobre:

```text
CURRENT SONG
```

La aplicación de mezcla NO debe implementar otra gestión independiente del setlist.

Responsabilidades:

```text
CANINDE CHORDS
|
+-- repertorio
+-- setlist
+-- selección de canción
+-- canción actual
+-- eventualmente sección actual
```

Mientras:

```text
MIX ASSISTANT
|
+-- SongMixProfile
+-- roles vocales
+-- automatización
+-- calibración
+-- Soundcraft
```

---

# 15. Hallazgo importante en el código actual

CanindeChords ya mantiene:

```text
currentSongId
```

como parte del estado de una sesión.

Además, el sistema actual ya sincroniza cambios de canción mediante:

```text
BroadcastChannel
Firestore
WebRTC / P2P
```

Existe además un evento P2P equivalente a:

```text
SONG_CHANGE
```

con datos como:

```text
currentSongIndex
currentSongId
updatedAt
directorId
```

Esto significa que gran parte de la infraestructura necesaria ya existe.

No debemos crear otro protocolo de sincronización desde cero sin evaluar primero el existente.

---

# 16. Regla fundamental: sincronizar por songId

El setlist puede ser:

```text
1. Song A
2. Song B
3. Song C
4. Song D
```

Pero durante el show puede ocurrir:

```text
A
D
B
C
```

Por eso:

```text
currentSongIndex
```

puede ser útil para UI, pero NO debe ser el identificador principal de integración.

La integración debe utilizar:

```text
currentSongId
```

Idealmente un ID canónico estable.

---

# 17. Arquitectura futura propuesta

```text
┌──────────────────────────────┐
│        CANINDE CHORDS        │
│                              │
│ Setlist                      │
│ Current Song                 │
│ Director Mode                │
└──────────────┬───────────────┘
               │
               │ SONG_CHANGE
               │ songId
               ▼
┌──────────────────────────────┐
│       MIX ASSISTANT          │
│                              │
│ SongMixProfiles              │
│ Vocal Roles                  │
│ Mix Automation               │
│ Room Calibration             │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│      SOUNDCRAFT Ui24R        │
│                              │
│ CUE                          │
│ Faders                       │
│ FX                           │
│ Sidechain                    │
│ EQ                           │
│ AFS2                         │
└──────────────────────────────┘
```

---

# 18. Flujo futuro

Ejemplo:

CanindeChords selecciona:

```text
Song X
```

Entonces publica:

```text
SONG_CHANGE
songId = X
```

Mix Assistant recibe:

```text
songId X
```

Busca:

```text
SongMixProfile[X]
```

Ejemplo:

```text
vocalRole = V3_LEAD
```

Y ejecuta:

```text
V1 -> backing
V2 -> backing
V3 -> lead
V4 -> backing

FX -> profile correspondiente

instrument automation -> profile correspondiente
```

Finalmente:

```text
Ui24R
```

queda preparada para esa canción.

---

# 19. La Mix App como spectator especializado

CanindeChords ya posee concepto de:

```text
DIRECTOR
```

y dispositivos que siguen a ese director.

La futura Mix Assistant puede conceptualmente funcionar como:

```text
Spectator especializado
```

No necesita mostrar acordes.

Cuando recibe:

```text
SONG_CHANGE
```

ejecuta automatización de mezcla.

Arquitectura:

```text
                    CanindeChords
                      DIRECTOR
                         |
          +--------------+--------------+
          |              |              |
          v              v              v
     Tablet A        Tablet B       MIX APP
      acordes         acordes         audio
```

Todos reciben la misma información musical.

---

# 20. WebRTC + Firestore

La recomendación preliminar es utilizar ambos mecanismos.

## WebRTC

Para eventos rápidos durante el show.

```text
SONG_CHANGE
```

debería llegar prácticamente en tiempo real.

## Firestore

Como estado persistente y mecanismo de recuperación.

Ejemplo:

```text
Actualmente:
Song C
```

Mix Assistant se inicia tarde.

No necesita esperar otro evento.

Puede consultar:

```text
session.currentSongId
```

y recuperar inmediatamente:

```text
Song C
```

---

# 21. BroadcastChannel

CanindeChords utiliza también BroadcastChannel.

Puede ser útil entre pestañas/ventanas que compartan el mismo origen web.

Pero NO debe asumirse como mecanismo principal entre las dos aplicaciones porque:

```text
BroadcastChannel
```

está restringido por origen.

Si las aplicaciones están hospedadas en dominios diferentes, no compartirán directamente el mismo canal.

Por tanto, la base de integración debe pensarse alrededor de:

```text
WebRTC
+
Firestore
```

o un contrato equivalente.

---

# 22. Contrato de eventos

Aunque la implementación se realice posteriormente, conviene definir desde ahora un contrato conceptual.

Ejemplo:

```text
ShowEvent
```

con:

```text
version
type
sessionId
songId
timestamp
```

Primer evento:

```text
SONG_CHANGE
```

Ejemplo conceptual:

```json
{
  "version": 1,
  "type": "SONG_CHANGE",
  "sessionId": "...",
  "songId": "...",
  "timestamp": 0
}
```

Esto debe ser versionado.

En el futuro pueden existir:

```text
SHOW_STARTED
SHOW_STOPPED

SONG_CHANGE

SECTION_CHANGE

MIX_PROFILE_CHANGE

PANIC
```

No es necesario implementar todos ahora.

Solamente debemos evitar una arquitectura que impida agregarlos posteriormente.

---

# 23. No acoplar configuración Soundcraft a Song

No recomendamos modificar el objeto `Song` de CanindeChords para guardar directamente:

```text
soundcraftChannel
soundcraftFader
soundcraftReverb
soundcraftAux
...
```

Esto generaría un acoplamiento innecesario entre ambos proyectos.

Preferimos:

```text
CANINDE CHORDS

Song
 |
 +-- id
 +-- title
 +-- tempo
```

y:

```text
MIX ASSISTANT

SongMixProfile
 |
 +-- songId
 +-- vocalRole
 +-- vocalBalance
 +-- vocalFxProfile
 +-- instrumentProfile
```

La vinculación es simplemente:

```text
Song.id
   |
   v
SongMixProfile.songId
```

---

# 24. SongMixProfile independiente

El modelo de la Mix Assistant debería estar preparado desde ahora para recibir un identificador externo de canción.

Ejemplo conceptual:

```text
SongMixProfile

id

externalSongId

source = CANINDE_CHORDS

vocalRole

vocalBalance

vocalFxProfile

instrumentProfile

cueReference

transitionSettings
```

No es obligatorio usar exactamente esos campos.

El punto importante es no diseñar `SongMixProfile` dependiendo exclusivamente de una tabla de canciones propia.

Debe poder vincularse a una entidad externa estable.

---

# 25. Integración futura sin dependencia obligatoria

CanindeChords debe mejorar la experiencia, pero la Mix Assistant no debería quedar inutilizable si CanindeChords no está disponible.

Idealmente:

```text
AUTO MODE

CanindeChords
     |
     v
cambia SongProfile
```

pero debe existir:

```text
MANUAL MODE

usuario selecciona SongProfile
directamente en Mix Assistant
```

Esto forma parte del fail-safe.

---

# 26. Confirmación bidireccional

No recomendamos una comunicación exclusivamente:

```text
CanindeChords
   |
   v
Mix Assistant
```

sin confirmación.

Futuro ideal:

```text
CanindeChords

SONG_CHANGE
    |
    v

Mix Assistant

carga profile
    |
    v

Ui24R

aplica cambios
    |
    v

Mix Assistant

verifica estado
    |
    v

MIX_READY
    |
    v

CanindeChords
```

Así CanindeChords podría mostrar visualmente:

```text
MIX READY
```

o:

```text
MIX OFFLINE
```

---

# 27. Preparar desde ahora soporte para ACK

Aunque no se implemente ahora, el contrato de integración debería permitir futuros mensajes:

```text
COMMAND
EVENT
ACK
ERROR
STATUS
```

Ejemplo:

```text
SONG_CHANGE
     |
     v
MIX_APPLIED
```

Esto facilitará considerablemente la operación en vivo.

---

# 28. Evolución futura: Section Change

CanindeChords actualmente sabe qué canción se está tocando.

Una evolución futura podría permitir que también conozca:

```text
qué sección de la canción
se está tocando
```

Ejemplo:

```text
INTRO

VERSE

CHORUS

INSTRUMENTAL

VERSE

FINAL
```

Esto permitiría automatizaciones mucho más avanzadas.

Ejemplo:

```text
VERSE

V1 lead
coros -2.5 dB
guitarra normal
```

```text
INSTRUMENTAL

voces -3 dB
guitarra +1.5 dB
flauta +2 dB
```

```text
VERSE

restaurar perfil vocal
```

NO implementar ahora.

Pero el protocolo debe permitir que aparezca posteriormente:

```text
SECTION_CHANGE
```

sin necesitar una reescritura completa.

---

# 29. CanindeChords como reloj lógico del show

Conceptualmente:

```text
CanindeChords
```

puede convertirse en la fuente de contexto musical.

La Mix Assistant conoce audio.

La Ui24R ejecuta DSP.

Quedaría:

```text
CANINDE CHORDS
"qué estamos tocando"
        |
        v
MIX ASSISTANT
"cómo debe sonar"
        |
        v
Ui24R
"ejecuta el procesamiento"
```

Esta separación de responsabilidades parece adecuada y debe preservarse.

---

# 30. Estado visual futuro en CanindeChords

En el futuro CanindeChords podría mostrar información mínima del estado de mezcla.

Ejemplo:

```text
MAINUMBY

Tom: Am
BPM: 82

Vocal Role: ALL
Mix: READY
```

O:

```text
MEDICINA

Lead: V1

Mix: READY
```

Esto permitiría confirmar durante el show que el cambio musical fue aplicado correctamente.

No es prioridad actual.

---

# 31. Servicio futuro sugerido

La Mix Assistant debería contemplar eventualmente una capa como:

```text
CanindeChordsIntegrationService
```

Responsabilidades:

```text
connect()

disconnect()

getCurrentSession()

getCurrentSong()

subscribeSongChanges()

handleSongChange()

sendAck()

reportMixStatus()
```

No es obligatorio implementar ahora.

Pero las capas de dominio deberían quedar suficientemente desacopladas para introducir este servicio sin afectar:

- Soundcraft integration;
- mixer domain;
- SongMixProfile;
- automation engine.

---

# 32. Evitar dependencias directas entre UI y Soundcraft

No implementar algo como:

```text
CanindeChords UI
      |
      v
Ui24RService directamente
```

Preferir:

```text
CanindeChords Event

      |
      v

ShowContext

      |
      v

SongProfileResolver

      |
      v

Automation Engine

      |
      v

Ui24R Adapter
```

Esto mantiene desacoplamiento.

---

# 33. Arquitectura preparada para otros controladores

El sistema de eventos musicales debería ser suficientemente genérico como para que en el futuro el contexto pueda provenir de:

```text
CanindeChords

MIDI Controller

Footswitch

Manual UI

OSC

otro software
```

Todos deberían poder generar conceptualmente:

```text
SET_CURRENT_SONG
```

La automatización no necesita saber quién originó el cambio.

---

# 34. Prioridad de esta feature

Estado:

```text
FUTURE FEATURE
```

No debe distraer del desarrollo actual de:

- comunicación con Ui24R;
- calibración;
- análisis;
- automatización;
- DSP;
- perfiles.

Sin embargo, las bases arquitectónicas deben quedar preparadas ahora.

---

# 35. Requisitos arquitectónicos actuales derivados de esta feature futura

Aunque la integración todavía no sea implementada, desde ahora:

### 1

No acoplar el motor de mezcla a una lista interna fija de canciones.

### 2

Utilizar IDs estables para SongMixProfile.

### 3

Permitir `externalSongId`.

### 4

Separar:

```text
Show Context
```

de:

```text
Mix Engine
```

### 5

Permitir que la canción actual pueda cambiar por eventos externos.

### 6

Evitar que la UI sea la única forma de seleccionar un SongProfile.

### 7

Diseñar Automation Engine para reaccionar a eventos.

### 8

Permitir ACK / resultado futuro.

### 9

Mantener CanindeChords y Mix Assistant como aplicaciones independientes.

### 10

No introducir dependencia de internet para que continúe pasando audio.

---

# 36. Arquitectura objetivo completa

```text
┌───────────────────────────────┐
│        CANINDE CHORDS         │
│                               │
│ Repertorio                    │
│ Setlist                       │
│ Current Song                  │
│ Director Mode                 │
└───────────────┬───────────────┘
                │
                │ SONG_CHANGE
                │
                ▼
┌───────────────────────────────┐
│         SHOW CONTEXT          │
│                               │
│ Current Song                  │
│ Current Section [future]      │
│ Current Session               │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│     SONG PROFILE RESOLVER     │
│                               │
│ songId -> SongMixProfile      │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│      AUTOMATION ENGINE        │
│                               │
│ Vocal Roles                   │
│ FX                            │
│ Sidechain                     │
│ Mix transitions               │
│ Other automations             │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│         UI24R ADAPTER         │
│                               │
│ Protocol                      │
│ Read state                    │
│ Write parameters              │
│ Verify                        │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│      SOUNDCRAFT Ui24R         │
│                               │
│ CUE                           │
│ DSP                           │
│ Sidechain                     │
│ FX                            │
│ EQ                            │
│ AFS2                          │
└───────────────────────────────┘
```

---

# 37. Responsabilidades finales

## CanindeChords

```text
¿Qué estamos tocando?
```

## Show Context

```text
¿Cuál es el estado musical actual?
```

## SongMixProfile

```text
¿Cómo debería mezclarse esta canción?
```

## Automation Engine

```text
¿Qué cambios deben realizarse?
```

## Ui24R Adapter

```text
¿Cómo ejecutar esos cambios?
```

## Soundcraft Ui24R

```text
Procesar el audio.
```

Esta separación debe ser considerada como lineamiento arquitectónico para las siguientes fases del proyecto.

---

# 38. Prioridades generales revisadas

## Prioridad 1 — Ahora

```text
Ui24R protocol

Read/write parameters

CUE internals

Faders

FX Sends

AUX isolation

Sidechain

RTA

AFS2

Patch Matrix
```

## Prioridad 2

```text
SongMixProfile

Automation Engine

Vocal Roles

Transitions

CUE integration
```

## Prioridad 3 — Feature futura

```text
CanindeChords integration

SONG_CHANGE

WebRTC integration

Firestore recovery

MIX_READY ACK

Section automation
```

---

# 39. Matriz técnica solicitada

La investigación de Ui24R debe terminar produciendo una matriz con:

```text
Función

Disponible nativamente

Firmware mínimo

Controlable externamente

Readable

Writable

Parámetros

Rango

Puede incluirse en CUE

Puede incluirse en Snapshot

Afecta AUX / IEM

Tipo de transición

Limitaciones

Utilidad para el proyecto

Necesita procesamiento externo
```

Esto debería convertirse en una referencia arquitectónica antes de ampliar significativamente los módulos de automatización.

---

# 40. Principio general del proyecto

La visión que surge de estos hallazgos es:

```text
CanindeChords
       |
       | contexto musical
       v
Mix Assistant
       |
       | inteligencia
       v
Soundcraft Ui24R
       |
       | DSP
       v
PA / IEM
```

Cada sistema debe tener una responsabilidad claramente definida.

La integración con CanindeChords es una **feature futura**, pero la arquitectura desarrollada ahora debe dejar preparado el camino para incorporarla sin reestructurar el núcleo del proyecto.

---

## Instrucción principal para el agente

No implementar todavía la integración con CanindeChords, pero desacoplar desde ahora:

```text
ShowContext
SongMixProfile
AutomationEngine
Ui24RAdapter
```

de forma que `currentSongId` pueda llegar en el futuro desde una fuente externa como CanindeChords.
