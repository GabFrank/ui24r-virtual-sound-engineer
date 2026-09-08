# Entorno de desarrollo

Qué hace falta en una máquina nueva para compilar, instalar y probar la aplicación contra una
consola real. Escrito el 2026-09-08, después de montarlo desde cero en un iMac.

## 1. Lo que hay que instalar

| Qué | Versión probada | Por qué |
|---|---|---|
| **Node 22** | v22.22.1 | El monorepo lo pide. Con Node 20 los tests corren igual, pero no es lo que valida la integración continua |
| **Android Studio** | — | Trae el SDK, `adb` y un JDK. Sin JDK, Gradle no arranca |
| **JDK 17** | Temurin 17.0.17 | Lo que Gradle usa. `export JAVA_HOME=$(/usr/libexec/java_home -v 17)` en macOS |
| **Android SDK build-tools** | 34.0.0 | Trae `apksigner`, que hace falta para comprobar la firma |
| **`adb`** | 1.0.41 | Viene con Android Studio. En macOS suelto: `brew install --cask android-platform-tools` |

Si se usa `nvm`, **acordarse de `nvm use 22`**: es fácil compilar sin querer con la versión por
defecto del sistema.

```bash
npm ci                # en la raíz del repositorio
npm run verificar     # documentación, plantillas, límites, tipos y tests
```

## 2. La clave de publicación, que es el paso que no se puede saltear

**Android solo reemplaza una aplicación por otra firmada con la misma clave.** Un APK firmado
con la clave de depuración de la máquina nueva sería rechazado con «aplicación no instalada», y
la única salida sería desinstalar, perdiendo la base de datos local del teléfono.

El `.jks` lo tiene el usuario. Se declara **fuera del repositorio**, en
`~/.gradle/gradle.properties`:

```properties
vseKeystoreFile=/ruta/absoluta/a/vse-release.jks
vseKeystorePassword=...
vseKeyAlias=vse
vseKeyPassword=...
```

**Ese fichero tiene contraseñas: dejarlo en `chmod 600`**, y el `.jks` también. Nunca dentro del
repositorio, nunca en un mensaje.

`build.gradle` falla a propósito si el fichero existe pero falta una credencial, y dice cuál.

### Comprobar la firma **antes** de instalar

```bash
$ANDROID_HOME/build-tools/34.0.0/apksigner verify --print-certs app-debug.apk | grep -i 'SHA-256 digest'
```

Tiene que dar exactamente:

```
8db45d3fbeedf7402580a5482f25c4bd1ac55cefc9be47cefffc08c0cb3e5325
```

Si no coincide, **no instalar**. `keytool -printcert -jarfile` no sirve: con `minSdk 29` el APK
no lleva firma v1 y devuelve vacío.

Para comprobar el almacén sin instalar nada:

```bash
keytool -list -v -keystore <ruta al .jks> -alias vse
```

## 3. Compilar e instalar

```bash
nvm use 22
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_HOME="$HOME/Library/Android/sdk"

npm run build -w mobile
cd apps/mobile && npx cap sync android && cd android

# El versionCode importa: ver el aviso de abajo.
./gradlew assembleDebug -PvseVersionCode=<mayor al instalado> -PvseVersionName=0.2.0-local.<n>

adb install -r app/build/outputs/apk/debug/app-debug.apk
```

> ⚠️ **Sin `-PvseVersionCode`, una compilación local es `versionCode 1`.** Es a propósito: así
> nunca es más alta que una versión publicada y no dispara una actualización a sí misma. Pero
> instalar eso sobre una versión publicada es un downgrade y **Android lo rechaza**:
> `INSTALL_FAILED_VERSION_DOWNGRADE`. El `-d` de `adb install` no alcanza cuando lo instalado es
> un build de publicación. Hay que mirar qué está instalado y pasar un número mayor:
>
> ```bash
> adb shell dumpsys package ar.frc.vse | grep versionCode
> ```

## 4. Ver qué pasa adentro

**El WebView, desde el navegador de la máquina:** `chrome://inspect` y elegir el de `ar.frc.vse`.

**Sin depender de esa pantalla**, que a veces no aparece, se puede hablar el protocolo de
depuración directamente:

```bash
PID=$(adb shell pidof ar.frc.vse | tr -d '\r')
adb forward tcp:9222 localabstract:webview_devtools_remote_$PID
curl -s http://localhost:9222/json          # lista de objetivos, con su webSocketDebuggerUrl
```

Con eso se puede evaluar JavaScript en la página y escuchar los eventos de red, que es como se
encontraron los tres bloqueos de la sección 6 de
[guia-de-pruebas-manuales.md](guia-de-pruebas-manuales.md).

**El lado nativo:** `adb logcat | grep -i vse`.

## 5. El simulador, para trabajar sin consola

```bash
node tools/mixer-sim/src/server.mjs --port 8765
```

En Ajustes → Dirección va `ws://localhost:8765`. **Con `ws://` y puerto**, que es lo que
distingue un simulador de una consola: a la consola se le pone solo la máquina, porque su
dirección lleva un identificador de sesión que se agota al usarlo.

Desde el 2026-09-08 el simulador habla el envoltorio de socket.io y el formato real de
medidores. Lo que sigue sin imitar, a propósito y documentado en su cabecera: manda `DUMP_END`,
que la consola real no manda, y emite medidores en silencio, que la consola real calla.

## 6. Para probar contra la consola de verdad

- La consola y el teléfono **en la misma red**. Comprobarlo desde el teléfono, no desde la
  máquina de desarrollo: `adb shell ping -c 3 <ip de la consola>`.
- La Ui24R levanta su propia red y responde en `10.10.1.1`, o toma la que le dé el router. En
  las pruebas del 2026-09-08 estuvo en `192.168.0.49`.
- **Antes de tocar un control de la consola**: PA apagado o faders de salida abajo, y una
  instantánea guardada desde la propia consola.

## 7. Lo que no hay que hacer

- Empujar a `main`. Todo entra por pull request.
- Poner el `.jks` o las contraseñas dentro del repositorio.
- Commitear el cambio de `capacitor.config.ts` que apunta a una IP propia, si se usa recarga en
  vivo con `npx cap run android -l --external`.
- Cambiar `server.androidScheme` de vuelta a `https`: la aplicación deja de poder conectarse a
  la consola y el error no lo dice de frente.
