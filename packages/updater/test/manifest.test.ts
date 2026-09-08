import { strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { leerCatalogo, leerSuma } from '../src/manifest.ts';

const URL_APK = 'https://github.com/GabFrank/ui24r-virtual-sound-engineer/releases/download/v0.2.0/vse-0.2.0.apk';
const URL_SUMA = `${URL_APK}.sha256`;

function publicacion(extra: Record<string, unknown> = {}) {
  return {
    tag_name: 'v0.2.0',
    body: 'notas',
    draft: false,
    prerelease: false,
    published_at: '2026-09-08T00:00:00Z',
    assets: [
      { name: 'vse-0.2.0.apk', browser_download_url: URL_APK, size: 12_345 },
      { name: 'vse-0.2.0.apk.sha256', browser_download_url: URL_SUMA, size: 64 },
    ],
    ...extra,
  };
}

test('lee una publicacion completa', () => {
  const { publicaciones, descartadas } = leerCatalogo([publicacion()]);
  strictEqual(descartadas.length, 0);
  strictEqual(publicaciones.length, 1);
  strictEqual(publicaciones[0]?.etiqueta, 'v0.2.0');
  strictEqual(publicaciones[0]?.apk.nombre, 'vse-0.2.0.apk');
  strictEqual(publicaciones[0]?.suma.url, URL_SUMA);
});

test('descarta borradores y pre-lanzamientos', () => {
  const { publicaciones, descartadas } = leerCatalogo([
    publicacion({ draft: true }),
    publicacion({ prerelease: true }),
  ]);
  strictEqual(publicaciones.length, 0);
  strictEqual(descartadas.length, 2);
});

test('descarta una etiqueta con sufijo de pre-lanzamiento aunque la casilla no este tildada', () => {
  // La casilla de GitHub es manual y se olvida. La etiqueta no miente.
  const { publicaciones, descartadas } = leerCatalogo([
    publicacion({ tag_name: 'v0.3.0-rc.1', prerelease: false }),
  ]);
  strictEqual(publicaciones.length, 0);
  strictEqual(descartadas[0]?.motivo, 'la versión lleva sufijo de pre-lanzamiento');
});

test('descarta una publicacion sin fichero de suma', () => {
  const { publicaciones, descartadas } = leerCatalogo([
    publicacion({ assets: [{ name: 'vse-0.2.0.apk', browser_download_url: URL_APK, size: 1 }] }),
  ]);
  strictEqual(publicaciones.length, 0);
  strictEqual(descartadas[0]?.motivo, 'no publica el fichero de suma de verificación');
});

test('rechaza una descarga alojada fuera de GitHub', () => {
  // Si este filtro se cae, el catalogo elige que aplicacion se instala.
  const { publicaciones, descartadas } = leerCatalogo([
    publicacion({
      assets: [
        { name: 'vse-0.2.0.apk', browser_download_url: 'https://ejemplo.invalido/vse.apk', size: 1 },
        { name: 'vse-0.2.0.apk.sha256', browser_download_url: URL_SUMA, size: 64 },
      ],
    }),
  ]);
  strictEqual(publicaciones.length, 0);
  strictEqual(descartadas[0]?.motivo, 'no publica ningún APK en un servidor aceptado');
});

test('rechaza una descarga por http aunque el servidor sea github', () => {
  const { publicaciones } = leerCatalogo([
    publicacion({
      assets: [
        { name: 'vse-0.2.0.apk', browser_download_url: URL_APK.replace('https:', 'http:'), size: 1 },
        { name: 'vse-0.2.0.apk.sha256', browser_download_url: URL_SUMA, size: 64 },
      ],
    }),
  ]);
  strictEqual(publicaciones.length, 0);
});

test('no confunde el fichero de suma con el APK', () => {
  const { publicaciones } = leerCatalogo([
    publicacion({
      assets: [
        { name: 'vse-0.2.0.apk.sha256', browser_download_url: URL_SUMA, size: 64 },
        { name: 'vse-0.2.0.apk', browser_download_url: URL_APK, size: 1 },
      ],
    }),
  ]);
  strictEqual(publicaciones[0]?.apk.nombre, 'vse-0.2.0.apk');
});

test('no lanza ante una respuesta con cualquier forma', () => {
  for (const bruto of [null, undefined, 42, 'texto', {}, [null], [{ assets: 'no' }]]) {
    const r = leerCatalogo(bruto);
    strictEqual(r.publicaciones.length, 0);
  }
});

test('lee la suma en formato suelto y en formato sha256sum', () => {
  const hash = 'a'.repeat(64);
  strictEqual(leerSuma(hash), hash);
  strictEqual(leerSuma(`${hash}  vse-0.2.0.apk\n`), hash);
  strictEqual(leerSuma(hash.toUpperCase()), hash);
});

test('rechaza una suma que no es un sha-256', () => {
  strictEqual(leerSuma(''), null);
  strictEqual(leerSuma('abc'), null);
  strictEqual(leerSuma('z'.repeat(64)), null);
});
