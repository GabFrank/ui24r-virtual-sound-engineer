import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PERFILES_DE_CANAL } from '../src/data/channel-profiles.ts';

/**
 * Lee la tabla de docs/channel-profiles.md y la compara con el codigo.
 *
 * El documento decia tener este test desde el principio y no lo tenia: el que
 * habia comprobaba ocho valores sueltos de trece perfiles y no leia el
 * Markdown, asi que las dos tablas ya habian divergido en cinco celdas sin que
 * nada avisara. Un documento que afirma estar verificado y no lo esta es peor
 * que uno que no lo afirma: nadie vuelve a mirarlo.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DOC = join(RAIZ, 'docs', 'channel-profiles.md');

/** La documentacion usa coma decimal y guion largo; el codigo, punto y coma. */
function numero(celda: string): number {
  return Number(celda.replace(',', '.').replace(/[^\d.\-]/g, ''));
}

function rango(celda: string): [number, number] {
  const partes = celda.split(/\s*[–-]\s*/).filter((p) => p.trim() !== '');
  assert.equal(partes.length, 2, `rango ilegible: "${celda}"`);
  return [numero(partes[0]!), numero(partes[1]!)];
}

function siNo(celda: string): boolean {
  const v = celda.trim().toLowerCase();
  assert.ok(v === 'sí' || v === 'si' || v === 'no', `se esperaba sí o no, y dice "${celda}"`);
  return v !== 'no';
}

interface Fila {
  nombre: string; rol: string; banda: [number, number]; hpf: [number, number];
  margen: number; dinamico: number; snr: number; relacion: string;
  puerta: boolean; deesser: boolean;
}

function leerTabla(): Fila[] {
  const texto = readFileSync(DOC, 'utf8');
  const lineas = texto.split('\n');
  const cabecera = lineas.findIndex((l) => l.startsWith('| Perfil | Rol |'));
  assert.notEqual(cabecera, -1, 'no se encontró la tabla de perfiles en el documento');

  const filas: Fila[] = [];
  for (let i = cabecera + 2; i < lineas.length; i++) {
    const l = lineas[i]!;
    if (!l.startsWith('|')) break;
    const c = l.split('|').slice(1, -1).map((x) => x.trim());
    assert.equal(c.length, 10, `fila con ${c.length} columnas: ${l}`);
    filas.push({
      nombre: c[0]!, rol: c[1]!, banda: rango(c[2]!), hpf: rango(c[3]!),
      margen: numero(c[4]!), dinamico: numero(c[5]!), snr: numero(c[6]!),
      relacion: c[7]!, puerta: siNo(c[8]!), deesser: siNo(c[9]!),
    });
  }
  return filas;
}

test('la tabla del documento y el codigo tienen los mismos perfiles', () => {
  const filas = leerTabla();
  assert.equal(filas.length, PERFILES_DE_CANAL.length,
    `el documento tiene ${filas.length} perfiles y el codigo ${PERFILES_DE_CANAL.length}`);
  assert.deepEqual(
    filas.map((f) => f.nombre),
    PERFILES_DE_CANAL.map((p) => p.nombre),
    'los nombres o su orden no coinciden',
  );
});

test('cada valor de la tabla coincide con el del codigo', () => {
  const filas = leerTabla();
  for (const f of filas) {
    const p = PERFILES_DE_CANAL.find((x) => x.nombre === f.nombre);
    assert.ok(p, `el documento tiene "${f.nombre}" y el codigo no`);
    const donde = (campo: string) => `${f.nombre} · ${campo}`;

    assert.equal(p.defaultRole, f.rol, donde('rol'));
    assert.deepEqual([...p.bandaUtilHz], f.banda, donde('banda útil'));
    assert.deepEqual([...p.hpfRangoHz], f.hpf, donde('pasa altos'));
    assert.equal(p.margenObjetivoDb, f.margen, donde('margen objetivo'));
    assert.equal(p.rangoDinamicoEsperadoDb, f.dinamico, donde('rango dinámico'));
    assert.equal(p.snrMinimoDb, f.snr, donde('SNR mínimo'));
    assert.equal(p.usaPuerta, f.puerta, donde('puerta'));
    assert.equal(p.usaDeesser, f.deesser, donde('deesser'));

    const relacion = f.relacion.trim().toLowerCase();
    if (relacion === 'ninguna') {
      assert.equal(p.compresorRatio, null, donde('relación'));
    } else {
      assert.equal(p.compresorRatio, numero(relacion.split(':')[0]!), donde('relación'));
    }
  }
});
