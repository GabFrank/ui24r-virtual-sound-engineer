#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { GRUPOS, COMPLETA, PARALELOS, seleccionar } from './impacto.mjs';
import { archivosCambiados, git } from './git.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
let cambio = false;
let plan = false;
let base = 'HEAD';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--cambio') cambio = true;
  else if (args[i] === '--plan') plan = true;
  else if (args[i] === '--base' && args[i + 1]) base = args[++i];
  else throw new Error(`Argumento desconocido o incompleto: ${args[i]}`);
}

try {
  const archivos = cambio ? archivosCambiados(raiz, base) : [];
  const seleccion = cambio ? seleccionar(archivos) : { grupos: COMPLETA, motivos: [] };
  if (plan) {
    console.log(JSON.stringify({ modo: cambio ? 'impacto' : 'completa', base, ...seleccion }, null, 2));
  } else if (seleccion.grupos.length === 0) {
    console.log('Sin cambios respecto de la base. No se ejecutaron comprobaciones.');
  } else {
    const destino = join(raiz, '.artifacts', 'verificacion');
    mkdirSync(destino, { recursive: true });
    const carpeta = mkdtempSync(join(destino, 'corrida-'));
    const resumen = {
      fecha: new Date().toISOString(), head: git(raiz, 'rev-parse', 'HEAD'),
      node: process.version, plataforma: process.platform,
      estado: git(raiz, 'status', '--porcelain=v1'),
      modo: cambio ? 'impacto' : 'completa', base, ...seleccion, resultados: [],
    };
    // **Los grupos van en lotes: los de PARALELOS que quedan seguidos corren a
    // la vez; el resto, de a uno.** El orden de `resultados` y de la salida es
    // el de la selección, así que un lote paralelo se imprime cuando termina
    // entero y no a medida que cada uno acaba: la lectura de «FALLO dsp» no
    // depende de cuál terminó primero.
    const lotes = [];
    for (const grupo of seleccion.grupos) {
      const ultimo = lotes.at(-1);
      if (PARALELOS.includes(grupo) && ultimo?.every((g) => PARALELOS.includes(g))) ultimo.push(grupo);
      else lotes.push([grupo]);
    }
    resumen.paralelos = lotes.filter((l) => l.length > 1);
    console.log(`Verificación ${resumen.modo}: ${lotes.map((l) => l.join(' ‖ ')).join(', ')}.`);
    console.log(`Logs completos: ${carpeta}`);
    const correr = (grupo) => {
      const inicio = performance.now();
      const archivo = join(carpeta, `${grupo}.log`);
      const salida = createWriteStream(archivo);
      return new Promise((resolve, reject) => {
        const hijo = spawn('npm', ['run', GRUPOS[grupo]], { cwd: raiz, stdio: ['ignore', 'pipe', 'pipe'] });
        hijo.stdout.pipe(salida, { end: false });
        hijo.stderr.pipe(salida, { end: false });
        salida.on('error', (error) => { hijo.kill(); reject(error); });
        hijo.on('error', (error) => { salida.end(); reject(error); });
        hijo.on('close', (code) => salida.end(() => resolve({
          grupo, codigo: code ?? 1, log: archivo,
          segundos: Number(((performance.now() - inicio) / 1000).toFixed(2)),
        })));
      });
    };
    lotes: for (const lote of lotes) {
      // Un fallo en un lote paralelo no mata al vecino: se deja terminar, se
      // anotan los dos y recién ahí se corta. Matarlo dejaría un log a medias y
      // un resultado que no se sabe si era verde.
      const resultados = await Promise.all(lote.map(correr));
      for (const r of resultados) {
        resumen.resultados.push(r);
        console.log(`${r.codigo === 0 ? 'OK' : 'FALLO'} ${r.grupo}: ${r.segundos}s`);
      }
      writeFileSync(join(carpeta, 'resumen.json'), JSON.stringify(resumen, null, 2) + '\n');
      for (const r of resultados) {
        if (r.codigo !== 0) {
          console.error(readFileSync(r.log, 'utf8').split('\n').slice(-65).join('\n'));
          process.exitCode = r.codigo;
          break lotes;
        }
      }
    }
    // El silencio de las suites no convierte una ejecución parcial en completa.
    console.log(`${resumen.resultados.length}/${seleccion.grupos.length} grupos ejecutados. Resumen: ${join(carpeta, 'resumen.json')}`);
  }
} catch (error) {
  console.error(`No se pudo verificar: ${error.message}`);
  process.exitCode = 1;
}
