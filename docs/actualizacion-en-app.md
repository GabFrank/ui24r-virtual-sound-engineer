# Actualización dentro de la aplicación

Cómo funciona el mecanismo de ADR-020 y, sobre todo, **qué hay que hacer una sola vez antes de instalar la aplicación por primera vez en la tablet.**

## Lo primero, porque después no tiene arreglo

Android sólo reemplaza una aplicación instalada por otra **firmada con la misma clave**. No hay excepción ni ajuste que lo desactive.

La clave de depuración que genera el entorno de desarrollo **es distinta en cada máquina** y en cada corrida de integración continua. Si la primera instalación en la tablet se hace con una de esas claves, ninguna versión posterior va a poder reemplazarla: el diálogo dirá «aplicación no instalada», sin más explicación, y la única salida será desinstalar, con lo que se pierden la base de datos local, las sesiones guardadas y los perfiles.

Por eso hace falta **un almacén de claves fijo, generado una vez, antes de la primera instalación.** Da igual que se lo llame de depuración o de publicación: la ceremonia es la misma y lleva unos minutos.

### 1. Generar el almacén

```bash
keytool -genkeypair -v \
  -keystore vse-release.jks \
  -alias vse \
  -keyalg RSA -keysize 4096 \
  -validity 10950 \
  -storetype PKCS12 \
  -dname "CN=Virtual Sound Engineer, O=FRC, C=PY"
```

Pide una contraseña. Anotala donde se guarden las contraseñas de verdad, no en el repositorio.

`-validity 10950` son treinta años. Una clave vencida deja de poder firmar actualizaciones, y con ella el mismo problema de arriba.

**El fichero `.jks` nunca se versiona.** El `.gitignore` ya excluye `*.keystore` y `*.jks`, pero conviene comprobarlo con `git status` antes de cada commit. Guardá una copia fuera de la máquina: si se pierde, se pierde la capacidad de actualizar cualquier instalación existente.

### 2. Cargarlo como secreto del repositorio

```bash
base64 -w 0 vse-release.jks > vse-release.jks.b64
```

En GitHub, **Settings → Secrets and variables → Actions → New repository secret**, cuatro secretos:

| Secreto | Contenido |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | el contenido de `vse-release.jks.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | la contraseña del almacén |
| `ANDROID_KEY_ALIAS` | `vse` |
| `ANDROID_KEY_PASSWORD` | la contraseña de la clave (la misma, salvo que se haya puesto otra) |

Desde acá, cada APK que publique la integración continua queda firmado con esa clave.

### 3. Para compilar en la máquina propia con la misma firma

En `~/.gradle/gradle.properties`, fuera del repositorio:

```properties
vseKeystoreFile=/ruta/absoluta/a/vse-release.jks
vseKeystorePassword=...
vseKeyAlias=vse
vseKeyPassword=...
```

Con eso, `assembleDebug` y `assembleRelease` usan la misma clave que la integración continua, y un APK compilado a mano puede reemplazar a uno publicado y al revés. Sin esas propiedades, la compilación avisa por consola y sigue con la clave de depuración local — sirve para probar en un emulador, no para instalar en la tablet.

### Comprobar que la firma es la que se espera

```bash
keytool -printcert -jarfile app-release.apk | grep SHA256
```

La aplicación muestra la misma huella: el complemento nativo la expone en `infoInstalada().firma`. Si las dos coinciden, la actualización va a poder instalarse.

## Cómo funciona

```
El usuario abre la pestaña Actualización
  → GET /repos/GabFrank/ui24r-virtual-sound-engineer/releases
  → se descartan borradores, pre-lanzamientos y publicaciones sin suma
  → se elige la versión MÁS ALTA, no la última publicada
  → se comprueba el contexto: sesión, transacción, red, batería
  → si hay bloqueos, se muestran con su motivo y se termina acá
  → descarga del APK con verificación de SHA-256 mientras se escribe
  → PackageInstaller: sesión, escritura, confirmación del usuario
  → Android reemplaza la aplicación y la reinicia
```

El reparto es deliberado:

- **`packages/updater`** decide. Es TypeScript puro, sin red y sin Android, con 32 tests. Toda la política está ahí: qué versión es más nueva, qué publicación es instalable, qué bloquea la actualización.
- **`ActualizadorPlugin.java`** ejecuta. Permiso, descarga, instalación. No decide nada.

Se eligió `PackageInstaller` en vez del intent clásico de abrir el APK porque devuelve un motivo cuando falla. El fallo más probable es el de la firma distinta, y el plugin lo traduce a una frase que explica qué pasó en vez de dejar el «aplicación no instalada» del sistema.

## Cuándo NO se actualiza

| Motivo | Invariante | Por qué |
|---|---|---|
| Hay una sesión de sonido abierta | INV-034 | Actualizar reinicia la aplicación y corta la conexión con la consola en medio del trabajo. |
| La aplicación está conectada a la consola | INV-034 | Suplente de lo anterior mientras el modelo de sesión no esté cableado a la interfaz. Sin él, en MVP0 la invariante no se dispararía nunca y la pantalla ofrecería actualizar en pleno ensayo. |
| Hay una transacción escribiendo | INV-034 | Quedaría a medio aplicar y sin nadie que la revierta. |
| No hay red (`navigator.onLine`) | — | No hay de dónde descargar. El dato es flojo —el navegador dice si hay interfaz, no si hay internet— pero distingue el caso; estuvo fijo en «sí hay» y este bloqueo era inalcanzable. |
| Batería por debajo del 30 % sin cargador | — | La instalación es atómica y no rompe nada, pero una tablet apagada media hora antes de un show sí. |

El contexto se vuelve a evaluar **justo antes de descargar**, no sólo al consultar: entre una cosa y la otra el usuario puede haber abierto una sesión.

## Publicar una versión

```bash
git tag v0.2.0
git push origin v0.2.0
```

El flujo `release.yml` compila, firma, calcula la suma y crea la publicación con dos ficheros adjuntos: `vse-0.2.0.apk` y `vse-0.2.0.apk.sha256`. **Sin los dos, la publicación se descarta y la aplicación no la ofrece** — es a propósito: sin suma no hay nada que verificar.

La etiqueta manda sobre la casilla de pre-lanzamiento. `v0.3.0-rc.1` se descarta aunque nadie haya marcado la casilla.

## Cuando algo falla

| Síntoma | Causa casi segura |
|---|---|
| «Aplicación no instalada», sin más | Firma distinta. Comparar las huellas SHA-256 como se explica arriba. |
| La versión nueva no aparece | Falta el `.sha256` adjunto, la etiqueta no es una versión semántica, o está marcada como pre-lanzamiento. El registro de `actualizacion.consultada` lista cada descarte con su motivo. |
| El botón de descargar no hace nada | No es el botón: hay un bloqueo. La pantalla lo muestra con su explicación. |
| «La suma de verificación no coincide» | La descarga se cortó o el fichero publicado no corresponde. El APK se borra solo; volver a intentar. |
| El ajuste de instalación no queda concedido | Android devuelve siempre «cancelado» en esa pantalla. La aplicación relee el permiso al volver; si sigue sin conceder, es que no se activó el interruptor. |
