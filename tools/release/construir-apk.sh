#!/usr/bin/env bash
#
# Compila, firma y comprueba el APK de una versión.
#
#   tools/release/construir-apk.sh 0.2.0
#
# Deja en la raíz del repositorio `vse-<versión>.apk` y `vse-<versión>.apk.sha256`,
# que son los dos adjuntos de la publicación. Sin los dos la aplicación descarta
# la publicación: sin suma no hay nada que verificar.
#
# Lo llama semantic-release en su paso `prepare` (ver .releaserc.json), con la
# versión que dedujo de los commits. Se puede llamar a mano con la misma firma.
set -euo pipefail

version="${1:-}"
if [ -z "$version" ]; then
  echo "Uso: $0 <versión>   (por ejemplo 0.2.0)" >&2
  exit 2
fi

# ADR-020: solo se publican versiones estables. Un pre-lanzamiento que llegara
# hasta acá produciría un APK que la aplicación descarta después de haberlo
# compilado y firmado; mejor no firmarlo.
if ! printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "'$version' no es una versión estable (X.Y.Z)." >&2
  exit 1
fi

# El código de versión tiene que crecer siempre y ser un entero.
# 1.2.3 da 10203; deja cien versiones de margen por componente.
IFS=. read -r mayor menor parche <<< "$version"
codigo=$(( mayor * 10000 + menor * 100 + parche ))

raiz="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$raiz"

echo "--- contenido web ---"
npm run build --workspace mobile

echo "--- Capacitor ---"
(cd apps/mobile && npx cap sync android)

echo "--- APK $version (código $codigo) ---"
(
  cd apps/mobile/android
  chmod +x ./gradlew
  ./gradlew assembleRelease --no-daemon \
    -PvseVersionName="$version" \
    -PvseVersionCode="$codigo"
)

origen=apps/mobile/android/app/build/outputs/apk/release/app-release.apk
destino="vse-$version.apk"
cp "$origen" "$destino"
# El nombre dentro del fichero de suma queda relativo a propósito: así
# `sha256sum -c` funciona desde el directorio de la descarga.
sha256sum "$destino" > "$destino.sha256"

# --- El certificado del APK, con apksigner y no con keytool ---
#
# `keytool -printcert -jarfile` lee la firma v1 (JAR). Con minSdk 29 el plugin
# de Android desactiva v1 y firma solo con v2/v3, así que sobre este APK no
# devuelve certificado: el guardián se quedaba sin nada que inspeccionar y
# dejaba pasar cualquier cosa. `apksigner` entiende los tres esquemas.
apksigner=$(find "${ANDROID_HOME:-/opt/android-sdk}" -name apksigner -type f 2>/dev/null | sort -r | head -1)
if [ -z "$apksigner" ]; then
  echo "No se encontró apksigner en el SDK de Android." >&2
  echo "Sin él no se puede comprobar con qué clave quedó firmado el APK," >&2
  echo "y publicar sin comprobarlo es lo que este paso existe para impedir." >&2
  exit 1
fi

certificado=$("$apksigner" verify --print-certs "$destino")

# No poder comprobarlo no es lo mismo que estar bien. Si el certificado viene
# vacío se detiene: un guardián que aprueba cuando no vio nada no es un guardián.
if [ -z "$certificado" ]; then
  echo "apksigner no devolvió ningún certificado para el APK." >&2
  exit 1
fi

echo "--- huella del certificado ---"
echo "$certificado" | grep -i 'certificate DN' || true
huella_apk=$(echo "$certificado" | grep -i 'SHA-256 digest' | head -1 |
             sed 's/.*digest: *//' | tr -d '[:space:]:' | tr 'A-F' 'a-f')
# En mayúsculas y con dos puntos, como la imprime keytool: así se puede comparar
# a ojo con la huella del almacén de claves.
echo "SHA-256: $(echo "$huella_apk" | tr 'a-f' 'A-F' | sed 's/../&:/g; s/:$//')"

# Que el APK no salga firmado con la clave de depuración de Android. Publicar
# uno así es irreversible para quien lo instale: la única salida es desinstalar,
# y con eso se pierden las sesiones guardadas.
if echo "$certificado" | grep -qi 'CN=Android Debug'; then
  echo "El APK quedó firmado con la clave de depuración de Android." >&2
  echo "Publicarlo dejaría a quien lo instale sin poder actualizar nunca." >&2
  echo "Revisar los secretos del repositorio y docs/actualizacion-en-app.md." >&2
  exit 1
fi

# --- Y que sea la clave que se pretende, no una cualquiera ---
#
# Descartar la de depuración deja pasar cualquier otra. La comparación con la
# huella del propio almacén es lo único que responde la pregunta que importa:
# ¿va a poder esta versión reemplazar a la que ya está instalada en la tablet?
# Hasta acá eso se contestaba a ojo, leyendo dos huellas de dos sitios
# distintos, y solo si alguien se acordaba de mirar.
if [ -n "${VSE_KEYSTORE_FILE:-}" ] && [ -f "${VSE_KEYSTORE_FILE}" ]; then
  huella_almacen=$(keytool -list -v \
      -keystore "$VSE_KEYSTORE_FILE" \
      -storetype PKCS12 \
      -storepass "${VSE_KEYSTORE_PASSWORD:-}" \
      -alias "${VSE_KEY_ALIAS:-vse}" 2>/dev/null |
    grep -i 'SHA256:' | head -1 | sed 's/^[^:]*: *//' | tr -d '[:space:]:' | tr 'A-F' 'a-f')
  if [ -z "$huella_almacen" ]; then
    echo "No se pudo leer la huella del almacén de claves." >&2
    echo "Sin ella no se puede comprobar que el APK quedó firmado con esa clave." >&2
    exit 1
  fi
  if [ "$huella_almacen" != "$huella_apk" ]; then
    echo "El APK NO está firmado con la clave del almacén." >&2
    echo "  almacén: $huella_almacen" >&2
    echo "  APK:     $huella_apk" >&2
    exit 1
  fi
  echo "La huella del APK coincide con la del almacén de claves."
else
  echo "Sin VSE_KEYSTORE_FILE: no se comprobó contra qué almacén se firmó." >&2
  echo "Esto solo es aceptable fuera de la publicación." >&2
fi

echo "Listos $destino y $destino.sha256"
