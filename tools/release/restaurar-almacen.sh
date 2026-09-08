#!/usr/bin/env bash
#
# Restaura el almacén de claves desde los secretos del repositorio.
#
#   tools/release/restaurar-almacen.sh <fichero de destino>
#
# Lee ANDROID_KEYSTORE_BASE64 y ANDROID_KEYSTORE_PASSWORD del entorno. Son dos
# secretos, no cuatro: el alias no es secreto -- está publicado en
# docs/actualizacion-en-app.md -- y en un almacén PKCS12 la clave comparte
# contraseña con el almacén.
#
# Todo lo que puede salir mal acá sale mal en silencio si no se comprueba: un
# base64 cortado produce un fichero que Gradle interpreta como "no hay almacén"
# y sigue con la clave de depuración, y un APK firmado con esa clave que llegue
# a instalarse deja a la tablet sin poder actualizarse nunca más.
set -euo pipefail

destino="${1:-}"
if [ -z "$destino" ]; then
  echo "Uso: $0 <fichero de destino>" >&2
  exit 2
fi

faltan=""
[ -z "${ANDROID_KEYSTORE_BASE64:-}" ] && faltan="$faltan ANDROID_KEYSTORE_BASE64"
[ -z "${ANDROID_KEYSTORE_PASSWORD:-}" ] && faltan="$faltan ANDROID_KEYSTORE_PASSWORD"
if [ -n "$faltan" ]; then
  echo "Faltan secretos del repositorio:$faltan" >&2
  echo "Sin ellos el APK quedaría firmado con una clave de depuración distinta" >&2
  echo "en cada corrida y NINGUNA actualización funcionaría." >&2
  echo "Ver docs/actualizacion-en-app.md." >&2
  exit 1
fi

# Se quitan los espacios y los retornos de carro antes de decodificar. El
# alfabeto base64 no tiene ninguno de los dos, así que no se pierde nada -- y
# copiar el secreto desde Windows mete un \r por línea que hace fallar a
# `base64 -d` con «invalid input», que fue exactamente cómo murió la primera
# publicación de este repositorio.
if ! printf '%s' "$ANDROID_KEYSTORE_BASE64" | tr -d '[:space:]' | base64 -d > "$destino" 2>/dev/null; then
  echo "El secreto ANDROID_KEYSTORE_BASE64 no es base64 válido." >&2
  echo "Causas habituales: se pegó el .jks binario en vez del .b64, se copió" >&2
  echo "solo una parte, o el portapapeles metió caracteres de más." >&2
  echo "Regenerarlo con: base64 -w 0 vse-release.jks" >&2
  exit 1
fi

if [ ! -s "$destino" ]; then
  echo "El almacén restaurado quedó vacío." >&2
  exit 1
fi

# Que decodifique no quiere decir que sea un almacén, ni que la contraseña sea
# la que está cargada. Abrirlo acá convierte dos secretos mal puestos en un
# mensaje claro, en vez de en un fallo de Gradle que no los nombra.
if ! keytool -list -keystore "$destino" -storetype PKCS12 \
     -storepass "$ANDROID_KEYSTORE_PASSWORD" > /dev/null 2>&1; then
  echo "El almacén restaurado no se puede abrir." >&2
  echo "O ANDROID_KEYSTORE_BASE64 no es el almacén, o ANDROID_KEYSTORE_PASSWORD" >&2
  echo "no es su contraseña. Ver docs/actualizacion-en-app.md." >&2
  exit 1
fi

echo "Almacén de claves restaurado en $destino."
