package ar.frc.vse;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Instalación de actualizaciones desde GitHub, sin tienda de aplicaciones.
 *
 * Reparto de responsabilidades: acá vive todo lo que sólo Android puede hacer
 * (permiso de instalación, descarga, instalador de paquetes). La política de
 * cuándo corresponde actualizar está en `@vse/updater`, en TypeScript y con
 * tests. Este fichero no decide nada; ejecuta.
 */
@CapacitorPlugin(name = "Actualizador")
public class ActualizadorPlugin extends Plugin {

    private static final String CARPETA = "actualizaciones";
    private static final String ACCION_ESTADO = "ar.frc.vse.INSTALACION_ESTADO";

    private final ExecutorService hilo = Executors.newSingleThreadExecutor();
    private PluginCall llamadaDeInstalacion;
    private BroadcastReceiver receptorDeEstado;

    // ---------------------------------------------------------------- consulta

    @PluginMethod
    public void infoInstalada(PluginCall call) {
        final JSObject r = new JSObject();
        try {
            final PackageInfo info = getContext()
                    .getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), 0);
            r.put("paquete", info.packageName);
            r.put("versionNombre", info.versionName);
            r.put("versionCodigo", Build.VERSION.SDK_INT >= 28
                    ? info.getLongVersionCode()
                    : info.versionCode);
        } catch (PackageManager.NameNotFoundException e) {
            call.reject("No se pudo leer la versión instalada.", e);
            return;
        }
        r.put("firma", huellaDeFirma());
        call.resolve(r);
    }

    /**
     * Huella SHA-256 del certificado con el que está firmada la aplicación.
     *
     * Sirve para diagnosticar el fallo más confuso de todo este mecanismo:
     * Android sólo reemplaza una aplicación por otra firmada con la MISMA clave,
     * y cuando no coinciden el mensaje que muestra es "aplicación no instalada",
     * que no dice nada. Comparando esta huella con la que publica la
     * integración continua se ve el problema antes de descargar 40 MB.
     */
    private String huellaDeFirma() {
        try {
            final PackageManager pm = getContext().getPackageManager();
            final String paquete = getContext().getPackageName();
            final android.content.pm.Signature[] firmas;
            if (Build.VERSION.SDK_INT >= 28) {
                final PackageInfo info = pm.getPackageInfo(paquete, PackageManager.GET_SIGNING_CERTIFICATES);
                firmas = info.signingInfo == null
                        ? new android.content.pm.Signature[0]
                        : info.signingInfo.getApkContentsSigners();
            } else {
                @SuppressWarnings("deprecation")
                final PackageInfo info = pm.getPackageInfo(paquete, PackageManager.GET_SIGNATURES);
                firmas = info.signatures;
            }
            if (firmas == null || firmas.length == 0) {
                return "";
            }
            final java.security.MessageDigest sha = java.security.MessageDigest.getInstance("SHA-256");
            return Descarga.aHexadecimal(sha.digest(firmas[0].toByteArray()));
        } catch (Exception e) {
            return "";
        }
    }

    @PluginMethod
    public void estadoDeBateria(PluginCall call) {
        final JSObject r = new JSObject();
        final Intent estado = getContext().registerReceiver(
                null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (estado == null) {
            r.put("porcentaje", JSObject.NULL);
            r.put("enCargador", false);
            call.resolve(r);
            return;
        }
        final int nivel = estado.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        final int escala = estado.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
        if (nivel < 0 || escala <= 0) {
            r.put("porcentaje", JSObject.NULL);
        } else {
            r.put("porcentaje", Math.round(nivel * 100f / escala));
        }
        final int enchufe = estado.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
        r.put("enCargador", enchufe != 0);
        call.resolve(r);
    }

    // ----------------------------------------------------------------- permiso

    @PluginMethod
    public void permisoDeInstalacion(PluginCall call) {
        final JSObject r = new JSObject();
        r.put("concedido", puedeInstalar());
        call.resolve(r);
    }

    private boolean puedeInstalar() {
        // Por debajo de API 26 el permiso era global del dispositivo. minSdk es
        // 29, así que en la práctica siempre se entra por la rama de arriba.
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || getContext().getPackageManager().canRequestPackageInstalls();
    }

    /**
     * Abre los ajustes del sistema donde el usuario habilita "instalar
     * aplicaciones desconocidas" para esta aplicación.
     *
     * No existe forma de conceder este permiso desde un diálogo dentro de la
     * aplicación: Android obliga a salir a los ajustes. Se vuelve con el
     * resultado ya releído, porque el sistema no informa si el usuario aceptó.
     */
    @PluginMethod
    public void pedirPermisoDeInstalacion(PluginCall call) {
        if (puedeInstalar()) {
            final JSObject r = new JSObject();
            r.put("concedido", true);
            call.resolve(r);
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.reject("Esta versión de Android no ofrece el ajuste.");
            return;
        }
        final Intent intent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()));
        startActivityForResult(call, intent, "volvioDeLosAjustes");
    }

    @ActivityCallback
    private void volvioDeLosAjustes(PluginCall call, ActivityResult resultado) {
        if (call == null) {
            return;
        }
        // El código de resultado de esta pantalla es siempre CANCELED, incluso
        // cuando el usuario concedió el permiso. Hay que releerlo.
        final JSObject r = new JSObject();
        r.put("concedido", puedeInstalar());
        call.resolve(r);
    }

    // ---------------------------------------------------------------- descarga

    /**
     * Descarga el APK y verifica su suma. Emite `progresoDeDescarga`.
     *
     * La verificación se hace acá y no en TypeScript porque el fichero nunca
     * pasa por el hilo de JavaScript: mover 40 MB en base64 a través del puente
     * bloquearía la interfaz durante segundos.
     */
    @PluginMethod
    public void descargar(PluginCall call) {
        final String url = call.getString("url");
        final String sumaEsperada = call.getString("sha256");
        final String nombre = call.getString("nombre", "vse.apk");
        if (url == null || sumaEsperada == null) {
            call.reject("Faltan la dirección o la suma de verificación.");
            return;
        }

        call.setKeepAlive(true);
        hilo.execute(() -> {
            File destino = null;
            try {
                final File carpeta = new File(getContext().getFilesDir(), CARPETA);
                if (!carpeta.exists() && !carpeta.mkdirs()) {
                    throw new IOException("No se pudo crear la carpeta de descargas.");
                }
                limpiar(carpeta);
                destino = new File(carpeta, nombre);

                final long[] ultimoAviso = { 0 };
                final String suma = Descarga.aFichero(url, destino, (recibidos, totales) -> {
                    // Un evento por cada 256 kB. Uno por bloque saturaría el
                    // puente y la barra de progreso se vería igual.
                    if (recibidos - ultimoAviso[0] < 256 * 1024 && recibidos != totales) {
                        return;
                    }
                    ultimoAviso[0] = recibidos;
                    final JSObject e = new JSObject();
                    e.put("bytesRecibidos", recibidos);
                    e.put("bytesTotales", totales);
                    notifyListeners("progresoDeDescarga", e);
                });

                if (!suma.equalsIgnoreCase(sumaEsperada.trim())) {
                    // El fichero se borra antes de informar el error. Un APK que
                    // no verifica no debe quedar en el disco esperando a que
                    // alguien lo abra a mano desde el explorador de ficheros.
                    borrar(destino);
                    call.reject("La suma de verificación no coincide. La descarga se descartó.");
                    return;
                }

                final JSObject r = new JSObject();
                r.put("ruta", destino.getAbsolutePath());
                r.put("bytes", destino.length());
                r.put("sha256", suma);
                call.resolve(r);
            } catch (Exception e) {
                if (destino != null) {
                    borrar(destino);
                }
                call.reject(e.getMessage() == null ? "Falló la descarga." : e.getMessage(), e);
            } finally {
                call.setKeepAlive(false);
            }
        });
    }

    private void limpiar(File carpeta) {
        final File[] previos = carpeta.listFiles();
        if (previos == null) {
            return;
        }
        for (File f : previos) {
            borrar(f);
        }
    }

    private void borrar(File f) {
        if (f.exists() && !f.delete()) {
            f.deleteOnExit();
        }
    }

    // -------------------------------------------------------------- instalación

    /**
     * Instala el APK ya descargado y verificado.
     *
     * Se usa `PackageInstaller` en lugar del intent de ver el fichero porque es
     * el único camino que devuelve un motivo cuando falla. El fallo típico acá
     * es la firma distinta, y con el intent clásico el usuario sólo ve
     * "aplicación no instalada" sin más.
     */
    @PluginMethod
    public void instalar(PluginCall call) {
        final String ruta = call.getString("ruta");
        if (ruta == null) {
            call.reject("Falta la ruta del fichero.");
            return;
        }
        if (!puedeInstalar()) {
            call.reject("Falta el permiso para instalar aplicaciones desconocidas.");
            return;
        }
        final File apk = new File(ruta);
        if (!apk.exists() || apk.length() == 0) {
            call.reject("El fichero descargado ya no está.");
            return;
        }

        call.setKeepAlive(true);
        llamadaDeInstalacion = call;
        registrarReceptor();

        hilo.execute(() -> {
            PackageInstaller.Session sesion = null;
            try {
                final PackageInstaller instalador = getContext().getPackageManager().getPackageInstaller();
                final PackageInstaller.SessionParams params =
                        new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                params.setAppPackageName(getContext().getPackageName());
                final int idSesion = instalador.createSession(params);
                sesion = instalador.openSession(idSesion);

                try (InputStream entrada = new FileInputStream(apk);
                     OutputStream salida = sesion.openWrite("vse", 0, apk.length())) {
                    final byte[] bloque = new byte[64 * 1024];
                    int leidos;
                    while ((leidos = entrada.read(bloque)) != -1) {
                        salida.write(bloque, 0, leidos);
                    }
                    sesion.fsync(salida);
                }

                final Intent intent = new Intent(ACCION_ESTADO).setPackage(getContext().getPackageName());
                final int banderas = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                        ? PendingIntent.FLAG_MUTABLE
                        : 0;
                final PendingIntent pendiente = PendingIntent.getBroadcast(
                        getContext(), idSesion, intent, banderas | PendingIntent.FLAG_UPDATE_CURRENT);
                sesion.commit(pendiente.getIntentSender());
            } catch (Exception e) {
                if (sesion != null) {
                    sesion.abandon();
                }
                terminarInstalacion(false, e.getMessage() == null ? "Falló la instalación." : e.getMessage());
            }
        });
    }

    private void registrarReceptor() {
        if (receptorDeEstado != null) {
            return;
        }
        receptorDeEstado = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                final int estado = intent.getIntExtra(
                        PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
                if (estado == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                    // Android exige que el usuario confirme en su propio
                    // diálogo. Sin este paso la sesión queda abierta para
                    // siempre y no llega ningún otro estado.
                    final Intent confirmacion = intent.getParcelableExtra(Intent.EXTRA_INTENT);
                    if (confirmacion != null) {
                        confirmacion.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        final Activity actividad = getActivity();
                        if (actividad != null) {
                            actividad.startActivity(confirmacion);
                        }
                    }
                    return;
                }
                if (estado == PackageInstaller.STATUS_SUCCESS) {
                    terminarInstalacion(true, "");
                    return;
                }
                terminarInstalacion(false, explicar(estado,
                        intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)));
            }
        };
        final IntentFilter filtro = new IntentFilter(ACCION_ESTADO);
        if (Build.VERSION.SDK_INT >= 33) {
            getContext().registerReceiver(receptorDeEstado, filtro, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(receptorDeEstado, filtro);
        }
    }

    /** Traduce el código del sistema a algo que se pueda leer en un escenario. */
    private String explicar(int estado, String mensaje) {
        final String bruto = mensaje == null ? "" : mensaje;
        if (bruto.toUpperCase(Locale.ROOT).contains("INSTALL_FAILED_UPDATE_INCOMPATIBLE")
                || bruto.toUpperCase(Locale.ROOT).contains("SIGNATURES")) {
            return "La actualización está firmada con una clave distinta a la de la "
                    + "aplicación instalada. Android no permite reemplazarla. Hay que "
                    + "desinstalar la versión actual, o volver a publicar firmando con "
                    + "la misma clave.";
        }
        switch (estado) {
            case PackageInstaller.STATUS_FAILURE_ABORTED:
                return "La instalación se canceló.";
            case PackageInstaller.STATUS_FAILURE_BLOCKED:
                return "El sistema bloqueó la instalación.";
            case PackageInstaller.STATUS_FAILURE_CONFLICT:
                return "Conflicto con la aplicación ya instalada. " + bruto;
            case PackageInstaller.STATUS_FAILURE_INCOMPATIBLE:
                return "El paquete no es compatible con este dispositivo. " + bruto;
            case PackageInstaller.STATUS_FAILURE_INVALID:
                return "El fichero descargado no es un APK válido. " + bruto;
            case PackageInstaller.STATUS_FAILURE_STORAGE:
                return "No hay espacio suficiente para instalar. " + bruto;
            default:
                return bruto.isEmpty() ? "La instalación falló." : bruto;
        }
    }

    private synchronized void terminarInstalacion(boolean exito, String mensaje) {
        final PluginCall call = llamadaDeInstalacion;
        llamadaDeInstalacion = null;
        if (receptorDeEstado != null) {
            try {
                getContext().unregisterReceiver(receptorDeEstado);
            } catch (IllegalArgumentException ignorado) {
                // Ya estaba dado de baja.
            }
            receptorDeEstado = null;
        }
        if (call == null) {
            return;
        }
        call.setKeepAlive(false);
        if (exito) {
            final JSObject r = new JSObject();
            r.put("instalada", true);
            call.resolve(r);
        } else {
            call.reject(mensaje);
        }
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (receptorDeEstado != null) {
            try {
                getContext().unregisterReceiver(receptorDeEstado);
            } catch (IllegalArgumentException ignorado) {
                // Ya estaba dado de baja.
            }
            receptorDeEstado = null;
        }
        hilo.shutdownNow();
    }
}
