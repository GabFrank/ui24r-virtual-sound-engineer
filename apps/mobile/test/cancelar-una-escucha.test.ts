import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SERVICIO = join(
  AQUI, '..', 'src', 'app', 'monitor', 'escucha-de-la-cuna.service.ts',
);

/**
 * Que cancelar una escucha cancele de verdad.
 *
 * **El hallazgo 10 de las auditorías de la cuña, del 2026-09-19.** `cancelar()`
 * resuelve la cuenta regresiva para no dejar una promesa colgada, así que el
 * `await` de `escuchar` **continuaba**: seguía con las series vacías, ponía el
 * estado en `LISTA` --pisando el `INACTIVA` que acababa de poner `cancelar`-- y
 * guardaba una medición de silencio de 0 s.
 *
 * El veredicto falla cerrado, así que **no era un agujero de seguridad**: una
 * medición de 0 s no compra ningún paso. Lo que quedaba mal es la pantalla
 * --cancelar terminaba mostrando «lista»-- y una fila espuria en la base por
 * cada cancelación. Y había un tercero: entre el cancelar y el final de la cola,
 * una segunda escucha podía arrancar y la cola de la primera le pisaba el
 * estado.
 *
 * Se anotó y **no se arregló ese día**, por la regla de la hoja de ruta: nadie
 * podía cancelar porque ninguna pantalla llamaba al servicio. Entra ahora
 * porque la rampa de la pantalla por músico estrena el botón de cancelar.
 *
 * ## Por qué se prueba así y no llamando al servicio
 *
 * `EscuchaDeLaCunaService` lleva un decorador de Angular y el modo de
 * eliminación de tipos de Node no lo parsea: importarlo desde un test es un
 * `SyntaxError`, comprobado. Así que se prueban dos planos, y hacen falta los
 * dos: el **mecanismo**, que demuestra que el arreglo arregla, y la **fuente**,
 * que demuestra que producción lo usa. El primero solo se aprueba entero con la
 * aplicación rota.
 */

// --- 1. El mecanismo ---------------------------------------------------------

/**
 * La misma forma que el servicio, reducida a lo que se prueba.
 *
 * **Es una copia y hay que decirlo**: lo que ata esta copia a producción es la
 * guarda de fuente de más abajo, no este objeto.
 */
function escuchaDeMentira() {
  const guardadas: string[] = [];
  let estado = 'INACTIVA';
  let generacion = 0;
  let destrabar: (() => void) | null = null;

  return {
    get estado() { return estado; },
    get guardadas() { return guardadas.length; },
    /** Destraba la espera como lo hace la cuenta regresiva al cancelarse. */
    cancelar(): void {
      generacion++;
      estado = 'INACTIVA';
      destrabar?.();
      destrabar = null;
    },
    async escuchar(): Promise<{ cancelada: boolean }> {
      const mia = ++generacion;
      estado = 'ESCUCHANDO';
      await new Promise<void>((r) => { destrabar = r; });
      if (mia !== generacion) return { cancelada: true };
      estado = 'LISTA';
      guardadas.push('una fila');
      return { cancelada: false };
    },
  };
}

test('cancelar no deja la pantalla en «lista» ni guarda una fila espuria', async () => {
  const e = escuchaDeMentira();
  const corriendo = e.escuchar();
  e.cancelar();
  const r = await corriendo;

  assert.equal(r.cancelada, true);
  assert.equal(e.estado, 'INACTIVA', 'cancelar terminaba mostrando «lista»');
  assert.equal(e.guardadas, 0, 'cancelar guardaba una medición de silencio de 0 s');
});

test('sin la guarda, la cola de la cancelada pisa el estado: el defecto, reproducido', async () => {
  // La misma máquina sin la comprobación de generación. Si esto empezara a
  // pasar, el arreglo dejó de hacer falta y hay que borrar la guarda, no este
  // número.
  let estado = 'INACTIVA';
  let guardadas = 0;
  let destrabar: (() => void) | null = null;
  const escuchar = async (): Promise<void> => {
    estado = 'ESCUCHANDO';
    await new Promise<void>((r) => { destrabar = r; });
    estado = 'LISTA';
    guardadas++;
  };
  const corriendo = escuchar();
  estado = 'INACTIVA';
  destrabar!();
  await corriendo;

  assert.equal(estado, 'LISTA', 'así quedaba: cancelaste y decía «lista»');
  assert.equal(guardadas, 1, 'y con su fila espuria');
});

test('una segunda escucha invalida la cola de la primera', async () => {
  // El tercer defecto del hallazgo: entre el cancelar y el final de la cola,
  // otra escucha puede arrancar. Una bandera no alcanzaría --la cola de la
  // primera no podría distinguir «me cancelaron» de «ya empezó otra»--.
  const e = escuchaDeMentira();
  const primera = e.escuchar();
  e.cancelar();
  const segunda = e.escuchar();

  assert.equal((await primera).cancelada, true);
  e.cancelar();
  assert.equal((await segunda).cancelada, true);
  assert.equal(e.guardadas, 0);
});

// --- 2. Que producción lo use ------------------------------------------------

/** La fuente sin comentarios: los docblocks de acá citan el código roto. */
function sinComentarios(fuente: string): string {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

test('el servicio corta después de CADA espera, no sólo al final', () => {
  // Los comentarios se borran y **el espacio se colapsa**: borrarlos deja
  // cientos de espacios donde estaba el docblock, y con eso una ventana ajustada
  // no alcanza a ver la línea que sigue. La primera versión de esta guarda falló
  // por eso sobre el archivo ya arreglado, que es la tercera vez en dos días que
  // una guarda de fuente tropieza con el texto que explica el defecto.
  const fuente = sinComentarios(readFileSync(SERVICIO, 'utf8')).replace(/\s+/g, ' ');
  const cuerpo = fuente.slice(fuente.indexOf('async escuchar('));
  const esperas = [...cuerpo.matchAll(/await this\.(cuentaAtras|recolectar)\(/g)];
  assert.equal(esperas.length, 2, 'cambiaron las esperas de escuchar(): revisá esta guarda');

  for (const m of esperas) {
    // Después de cada espera tiene que venir la comprobación, antes de tocar
    // nada. Se mira una ventana corta: seguir de largo es lo que guardaba la
    // fila espuria.
    const despues = cuerpo.slice(m.index ?? 0, (m.index ?? 0) + 120);
    assert.match(
      despues, /if \(mia !== this\.generacion\) return CANCELADA;/,
      `no se corta después de ${m[1]}: la escucha cancelada sigue y guarda`,
    );
  }
});

test('cancelar invalida ANTES de destrabar la espera', () => {
  const fuente = sinComentarios(readFileSync(SERVICIO, 'utf8'));
  const cuerpo = fuente.slice(fuente.indexOf('cancelar(): void'));
  const invalida = cuerpo.indexOf('this.generacion++');
  const destraba = cuerpo.indexOf('this.resolverCuenta?.()');
  assert.ok(invalida > 0, 'cancelar ya no invalida la escucha en curso');
  assert.ok(destraba > 0, 'cancelar ya no destraba la espera');
  // Al revés hay una carrera: la cola puede despertarse antes de que la
  // generación cambie, y entonces la comprobación la deja pasar.
  assert.ok(invalida < destraba, 'cancelar destraba antes de invalidar: hay carrera');
});

test('el resultado cancelado no concede nada', () => {
  const fuente = sinComentarios(readFileSync(SERVICIO, 'utf8'));
  const i = fuente.indexOf('const CANCELADA');
  assert.ok(i > 0, 'ya no existe el resultado cancelado');
  const bloque = fuente.slice(i, i + 300);
  // Si alguna de estas se aflojara, una cancelación compraría un paso de 2 dB
  // sobre la cuña de un músico sin que nadie haya escuchado nada.
  assert.match(bloque, /cancelada: true/);
  assert.match(bloque, /medicionId: null/);
  assert.match(bloque, /sonoS: 0/);
  assert.match(bloque, /alcanzaParaOtroPaso: false/);
});

// --- 3. La cadena de la pantalla, que es quien cancela ------------------------

const PANTALLA = join(
  AQUI, '..', 'src', 'app', 'monitor', 'monitores.component.ts',
);

test('la pantalla encadena subir, escuchar y anotar, en ese orden', () => {
  const fuente = sinComentarios(readFileSync(PANTALLA, 'utf8'));
  const cuerpo = fuente.slice(fuente.indexOf('async subirUnPaso('));
  const sube = cuerpo.indexOf('this.envio.subir(');
  const escucha = cuerpo.indexOf('this.escucha.escuchar(');
  const anota = cuerpo.indexOf('this.envio.anotarEscucha(');
  assert.ok(sube > 0 && escucha > 0 && anota > 0, 'la cadena ya no está entera');
  // El orden no es estético: la escucha ocurre DESPUÉS del cambio --al cerrar la
  // transacción todavía no hay nada que oír-- y anotar es lo último, porque el
  // identificador que se anota sale de la escucha.
  assert.ok(sube < escucha, 'escucha antes de subir: no habría nada que oír');
  assert.ok(escucha < anota, 'anota antes de escuchar: el identificador no existe todavía');
});

test('una escucha cancelada no anota nada', () => {
  const fuente = sinComentarios(readFileSync(PANTALLA, 'utf8')).replace(/\s+/g, ' ');
  const cuerpo = fuente.slice(fuente.indexOf('async subirUnPaso('));
  const corte = cuerpo.indexOf('if (e.cancelada)');
  const anota = cuerpo.indexOf('this.envio.anotarEscucha(');
  assert.ok(corte > 0, 'la pantalla ya no mira si la escucha se canceló');
  assert.ok(corte < anota, 'se anota antes de mirar si se canceló');
  // Y el corte tiene que SALIR, no seguir de largo: anotar una escucha que no
  // ocurrió compraría el paso siguiente sin que nadie haya oído nada.
  assert.match(cuerpo.slice(corte, anota), /return;/,
    'la rama de cancelada no corta: la cadena sigue y anota igual');
});

test('la pantalla sube un envío por vez', () => {
  // ADR-035: el motor no cruza el canal de la medición contra la ruta, así que
  // una sola escucha autoriza todas las rutas que la citen. Esta pantalla tiene
  // varias rutas del mismo músico a mano, así que lo impone ella.
  const fuente = sinComentarios(readFileSync(PANTALLA, 'utf8')).replace(/\s+/g, ' ');
  const cuerpo = fuente.slice(fuente.indexOf('async subirUnPaso('));
  assert.match(
    cuerpo.slice(0, 600), /if \(this\.enCurso\(\) !== null \|\| this\.escuchando\(\)\) return;/,
    'no se frena un segundo paso mientras hay uno en curso',
  );
  // Y los botones se apagan, que es la otra mitad: sin esto el freno existe y
  // el usuario no lo ve hasta que aprieta.
  assert.match(fuente, /\[deshabilitado\]="enCurso\(\) !== null \|\| escuchando\(\)"/);
});
