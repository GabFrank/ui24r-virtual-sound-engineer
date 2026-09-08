package ar.frc.vse;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Descarga de ficheros desde GitHub con verificación de integridad.
 *
 * La suma se calcula mientras se escribe, no leyendo el fichero otra vez: sobre
 * un APK de decenas de megabytes en una tablet, leerlo dos veces se nota.
 */
final class Descarga {

    /** Los mismos servidores que acepta el catálogo en TypeScript. La lista se
     *  repite acá a propósito: esta clase se puede llamar desde otro sitio y no
     *  debe depender de que alguien haya validado antes. */
    private static final List<String> SERVIDORES_ACEPTADOS = Arrays.asList(
            "github.com",
            "objects.githubusercontent.com",
            "release-assets.githubusercontent.com",
            "api.github.com");

    private static final int MAXIMO_REDIRECCIONES = 5;
    private static final int TIEMPO_DE_ESPERA_MS = 30_000;

    interface Progreso {
        void avance(long bytesRecibidos, long bytesTotales);
    }

    static class DescargaFallida extends IOException {
        DescargaFallida(String mensaje) {
            super(mensaje);
        }
    }

    private Descarga() {
    }

    static void verificarServidor(String url) throws DescargaFallida {
        final URL u;
        try {
            u = new URL(url);
        } catch (IOException e) {
            throw new DescargaFallida("La dirección no es válida.");
        }
        if (!"https".equalsIgnoreCase(u.getProtocol())) {
            throw new DescargaFallida("Solo se descarga por HTTPS.");
        }
        if (!SERVIDORES_ACEPTADOS.contains(u.getHost().toLowerCase(Locale.ROOT))) {
            throw new DescargaFallida("Servidor no aceptado: " + u.getHost());
        }
    }

    /** Devuelve el SHA-256 en minúsculas de lo que se escribió en destino. */
    static String aFichero(String url, File destino, Progreso progreso) throws IOException {
        verificarServidor(url);

        final MessageDigest sha;
        try {
            sha = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new DescargaFallida("El dispositivo no ofrece SHA-256.");
        }

        String actual = url;
        HttpURLConnection conexion = null;
        try {
            for (int salto = 0; ; salto++) {
                if (salto > MAXIMO_REDIRECCIONES) {
                    throw new DescargaFallida("Demasiadas redirecciones.");
                }
                conexion = (HttpURLConnection) new URL(actual).openConnection();
                conexion.setConnectTimeout(TIEMPO_DE_ESPERA_MS);
                conexion.setReadTimeout(TIEMPO_DE_ESPERA_MS);
                // Se sigue la redirección a mano para poder volver a validar el
                // servidor de destino. El seguimiento automático de Java no lo
                // haría, y GitHub redirige siempre el APK a otro dominio.
                conexion.setInstanceFollowRedirects(false);
                conexion.setRequestProperty("Accept", "application/octet-stream");

                final int codigo = conexion.getResponseCode();
                if (codigo == HttpURLConnection.HTTP_MOVED_PERM
                        || codigo == HttpURLConnection.HTTP_MOVED_TEMP
                        || codigo == HttpURLConnection.HTTP_SEE_OTHER
                        || codigo == 307
                        || codigo == 308) {
                    final String siguiente = conexion.getHeaderField("Location");
                    conexion.disconnect();
                    if (siguiente == null) {
                        throw new DescargaFallida("Redirección sin destino.");
                    }
                    actual = new URL(new URL(actual), siguiente).toString();
                    verificarServidor(actual);
                    continue;
                }
                if (codigo != HttpURLConnection.HTTP_OK) {
                    throw new DescargaFallida("El servidor respondió " + codigo + ".");
                }
                break;
            }

            final long totales = conexion.getContentLengthLong();
            long recibidos = 0;
            final byte[] bloque = new byte[64 * 1024];

            try (InputStream entrada = conexion.getInputStream();
                 FileOutputStream salida = new FileOutputStream(destino)) {
                int leidos;
                while ((leidos = entrada.read(bloque)) != -1) {
                    salida.write(bloque, 0, leidos);
                    sha.update(bloque, 0, leidos);
                    recibidos += leidos;
                    if (progreso != null) {
                        progreso.avance(recibidos, totales);
                    }
                }
                salida.getFD().sync();
            }
        } finally {
            if (conexion != null) {
                conexion.disconnect();
            }
        }

        return aHexadecimal(sha.digest());
    }

    static String aTexto(String url) throws IOException {
        final File temporal = File.createTempFile("vse-suma", ".txt");
        try {
            aFichero(url, temporal, null);
            final byte[] contenido = new byte[(int) Math.min(temporal.length(), 4096)];
            try (InputStream entrada = new java.io.FileInputStream(temporal)) {
                final int leidos = entrada.read(contenido);
                return leidos <= 0 ? "" : new String(contenido, 0, leidos, "UTF-8");
            }
        } finally {
            // Se borra siempre: si queda, la próxima corrida lee un fichero viejo.
            if (!temporal.delete()) {
                temporal.deleteOnExit();
            }
        }
    }

    static String aHexadecimal(byte[] bytes) {
        final StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(Character.forDigit((b >> 4) & 0xF, 16));
            sb.append(Character.forDigit(b & 0xF, 16));
        }
        return sb.toString();
    }
}
