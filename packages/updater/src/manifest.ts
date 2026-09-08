import type { Publicacion, Recurso } from './types.ts';
import { esEstable, parsearVersion } from './version.ts';

/**
 * Los únicos servidores desde los que se acepta descargar un APK.
 *
 * La respuesta de la API llega por red y el APK que nombre se va a instalar en
 * el dispositivo. Si alguien pudiera influir en el campo de la descarga sin
 * este filtro, elegiría qué aplicación se instala. El filtro es la diferencia
 * entre confiar en GitHub y confiar en cualquiera que conteste la petición.
 */
export const SERVIDORES_ACEPTADOS: readonly string[] = [
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
];

export interface PublicacionDescartada {
  readonly etiqueta: string;
  readonly motivo: string;
}

export interface ResultadoDelCatalogo {
  readonly publicaciones: readonly Publicacion[];
  /** Se registran para poder explicar por qué no apareció una versión esperada. */
  readonly descartadas: readonly PublicacionDescartada[];
}

const SUFIJO_APK = '.apk';
const SUFIJO_SUMA = '.apk.sha256';

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function servidorAceptado(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && SERVIDORES_ACEPTADOS.includes(u.hostname);
  } catch {
    return false;
  }
}

function leerRecurso(bruto: unknown): Recurso | null {
  if (!esObjeto(bruto)) return null;
  const { name, browser_download_url: url, size } = bruto;
  if (typeof name !== 'string' || typeof url !== 'string') return null;
  if (!servidorAceptado(url)) return null;
  return { nombre: name, url, bytes: typeof size === 'number' ? size : 0 };
}

/**
 * Convierte la respuesta de `GET /repos/{owner}/{repo}/releases` en el catálogo
 * de publicaciones instalables. Nunca lanza: lo que no se entiende se descarta
 * con su motivo, porque el origen es la red.
 */
export function leerCatalogo(bruto: unknown): ResultadoDelCatalogo {
  if (!Array.isArray(bruto)) {
    return { publicaciones: [], descartadas: [{ etiqueta: '(respuesta)', motivo: 'la respuesta no es una lista' }] };
  }

  const publicaciones: Publicacion[] = [];
  const descartadas: PublicacionDescartada[] = [];

  for (const item of bruto) {
    if (!esObjeto(item)) {
      descartadas.push({ etiqueta: '(desconocida)', motivo: 'entrada que no es un objeto' });
      continue;
    }
    const etiqueta = typeof item['tag_name'] === 'string' ? item['tag_name'] : '(sin etiqueta)';

    if (item['draft'] === true) {
      descartadas.push({ etiqueta, motivo: 'borrador' });
      continue;
    }
    if (item['prerelease'] === true) {
      descartadas.push({ etiqueta, motivo: 'marcada como pre-lanzamiento' });
      continue;
    }

    const version = parsearVersion(etiqueta);
    if (version === null) {
      descartadas.push({ etiqueta, motivo: 'la etiqueta no es una versión semántica' });
      continue;
    }
    // El usuario eligió recibir solo versiones estables. Una etiqueta como
    // `v0.3.0-rc.1` en una publicación no marcada como pre-lanzamiento sigue
    // siendo inestable, y el campo de GitHub es sólo una casilla que alguien
    // puede olvidar tildar.
    if (!esEstable(version)) {
      descartadas.push({ etiqueta, motivo: 'la versión lleva sufijo de pre-lanzamiento' });
      continue;
    }

    const activos = Array.isArray(item['assets']) ? item['assets'] : [];
    const recursos = activos.map(leerRecurso).filter((r): r is Recurso => r !== null);
    const apk = recursos.find((r) => r.nombre.endsWith(SUFIJO_APK) && !r.nombre.endsWith(SUFIJO_SUMA));
    const suma = recursos.find((r) => r.nombre.endsWith(SUFIJO_SUMA));

    if (apk === undefined) {
      descartadas.push({ etiqueta, motivo: 'no publica ningún APK en un servidor aceptado' });
      continue;
    }
    if (suma === undefined) {
      descartadas.push({ etiqueta, motivo: 'no publica el fichero de suma de verificación' });
      continue;
    }

    publicaciones.push({
      version,
      etiqueta,
      notas: typeof item['body'] === 'string' ? item['body'] : '',
      publicadaEl: typeof item['published_at'] === 'string' ? item['published_at'] : '',
      apk,
      suma,
    });
  }

  return { publicaciones, descartadas };
}

/**
 * Extrae el SHA-256 del contenido del fichero de suma.
 *
 * Acepta tanto el hash suelto como el formato de `sha256sum`, que es
 * `<hash>  <nombre>`. Devuelve el hash en minúsculas, o `null`.
 */
export function leerSuma(contenido: string): string | null {
  const primeraPalabra = contenido.trim().split(/\s+/)[0];
  if (primeraPalabra === undefined) return null;
  const hash = primeraPalabra.toLowerCase();
  return /^[0-9a-f]{64}$/.test(hash) ? hash : null;
}
