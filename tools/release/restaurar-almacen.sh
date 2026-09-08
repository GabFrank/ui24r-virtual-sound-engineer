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
limpio=$(printf '%s' "$ANDROID_KEYSTORE_BASE64" | tr -d '[:space:]')

if printf '%s' "$limpio" | base64 -d > "$destino" 2>/dev/null; then
  :
# Segundo intento, ignorando todo lo que no sea del alfabeto: una marca de orden
# de bytes que agregó el editor, unas comillas que se colaron al copiar. Salvar
# el caso no es adivinar: lo que salga de acá tiene que abrirse como almacén y,
# más tarde, su huella tiene que coincidir con la del APK firmado. Si el rescate
# produjera cualquier otra cosa, no llega a publicarse nada.
elif printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 -di > "$destino" 2>/dev/null && [ -s "$destino" ]; then
  echo "AVISO: el secreto ANDROID_KEYSTORE_BASE64 traía caracteres que no son" >&2
  echo "base64 y se ignoraron. Se pudo restaurar igual, pero conviene volver a" >&2
  echo "cargarlo limpio: base64 -w 0 vse-release.jks" >&2
else
  # Qué tiene de malo, sin enseñar el secreto. El largo y cuántos caracteres se
  # salen del alfabeto no lo revelan, y son justo lo que distingue las tres
  # causas: pegar el .jks binario da miles de caracteres fuera; copiar de menos
  # da un largo corto o no múltiplo de cuatro; y el resto es otra cosa.
  largo=$(printf '%s' "$limpio" | wc -c)
  fuera=$(printf '%s' "$limpio" | tr -d 'A-Za-z0-9+/=' | wc -c)
  resto=$(( largo % 4 ))
  echo "El secreto ANDROID_KEYSTORE_BASE64 no es base64 válido." >&2
  echo "  caracteres útiles: $largo" >&2
  echo "  fuera del alfabeto base64: $fuera" >&2
  echo "  largo múltiplo de 4: $([ "$resto" -eq 0 ] && echo sí || echo "no, sobran $resto")" >&2
  if [ "$fuera" -gt 0 ]; then
    echo "Hay caracteres que no son base64: lo más probable es que se haya pegado" >&2
    echo "el fichero .jks binario en vez del .b64." >&2
  else
    echo "Todos los caracteres son del alfabeto pero el largo no cierra: lo más" >&2
    echo "probable es que se haya copiado solo una parte." >&2
  fi
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
