#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { GRUPOS, COMPLETA, seleccionar } from './impacto.mjs';
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
    console.log(`Verificación ${resumen.modo}: ${seleccion.grupos.join(', ')}.`);
    console.log(`Logs completos: ${carpeta}`);
    for (const grupo of seleccion.grupos) {
      const inicio = performance.now();
      const archivo = join(carpeta, `${grupo}.log`);
      const salida = createWriteStream(archivo);
      const codigo = await new Promise((resolve, reject) => {
        const hijo = spawn('npm', ['run', GRUPOS[grupo]], { cwd: raiz, stdio: ['ignore', 'pipe', 'pipe'] });
        hijo.stdout.pipe(salida, { end: false });
        hijo.stderr.pipe(salida, { end: false });
        salida.on('error', (error) => { hijo.kill(); reject(error); });
        hijo.on('error', (error) => { salida.end(); reject(error); });
        hijo.on('close', (code) => salida.end(() => resolve(code ?? 1)));
      });
      const segundos = Number(((performance.now() - inicio) / 1000).toFixed(2));
      resumen.resultados.push({ grupo, codigo, segundos, log: archivo });
      writeFileSync(join(carpeta, 'resumen.json'), JSON.stringify(resumen, null, 2) + '\n');
      console.log(`${codigo === 0 ? 'OK' : 'FALLO'} ${grupo}: ${segundos}s`);
      if (codigo !== 0) {
        console.error(readFileSync(archivo, 'utf8').split('\n').slice(-65).join('\n'));
        process.exitCode = codigo;
        break;
      }
    }
    // El silencio de las suites no convierte una ejecución parcial en completa.
    console.log(`${resumen.resultados.length}/${seleccion.grupos.length} grupos ejecutados. Resumen: ${join(carpeta, 'resumen.json')}`);
  }
} catch (error) {
  console.error(`No se pudo verificar: ${error.message}`);
  process.exitCode = 1;
}
