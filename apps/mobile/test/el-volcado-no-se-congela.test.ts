import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computed, signal } from '@angular/core';

const AQUI = dirname(fileURLToPath(import.meta.url));
const APP = join(AQUI, '..', 'src', 'app');

/**
 * Que una pantalla que lee el estado confirmado no se quede congelada.
 *
 * **El defecto que este archivo existe para que no vuelva.** `MixerService`
 * expone el estado confirmado con un **método**, `volcadoDelEstado()`, que
 * devuelve una copia del almacén del adaptador. Escribir
 * `computed(() => this.mixer.volcadoDelEstado())` parece el cableado obvio y es
 * una trampa: ese `computed` no lee ninguna señal, así que Angular **no lo
 * recalcula nunca**. La pantalla de monitores se construyó así el 2026-09-20 y
 * quedaba mostrando la foto del primer instante para siempre; lo encontró una
 * auditoría adversarial, con la suite en verde.
 *
 * Y era peor que un dato viejo: los dos medidores de la tarjeta de arriba sí
 * salen de señales y se movían con la música, **encima de una tabla muerta**.
 * Una pantalla que se ve viva y miente es peor que una que se ve rota.
 *
 * Se prueba en dos planos, y hacen falta los dos:
 *
 * 1. **El mecanismo**, con el motor de señales de verdad: sin leer la revisión
 *    el `computed` se congela, leyéndola se despierta. Es lo que demuestra que
 *    el arreglo arregla.
 * 2. **Que producción lo use**, leyendo la fuente. El plano 1 se puede aprobar
 *    entero con la aplicación rota, porque prueba una reconstrucción. Es la
 *    misma razón por la que existe `ley-del-envio.ts` como archivo aparte.
 */

// --- 1. El mecanismo ---------------------------------------------------------

/** Un servicio de mentira con la misma forma: un método y una señal de revisión. */
function servicioFalso() {
  const almacen = new Map<string, { valor: number }>();
  const revision = signal(0);
  return {
    almacen,
    revisionDelEstado: revision.asReadonly(),
    // Copia, igual que el de verdad: el `Map` que sale nunca es el de adentro.
    volcadoDelEstado: (): ReadonlyMap<string, { valor: number }> => new Map(almacen),
    cambio(clave: string, valor: number): void {
      almacen.set(clave, { valor });
      revision.update((n) => n + 1);
    },
  };
}

test('sin leer la revisión, el computed se congela en el primer instante', () => {
  const m = servicioFalso();
  const congelado = computed(() => m.volcadoDelEstado());

  assert.equal(congelado().size, 0);
  m.cambio('i.0.aux.0.value', 0.5);
  m.cambio('i.1.aux.0.value', 0.9);

  // **Ésta es la afirmación que importa**: el estado cambió dos veces y el
  // `computed` sigue contestando lo de antes. Si algún día Angular recalculara
  // igual, este test fallaría y habría que borrar la guarda de abajo, no
  // corregir este número.
  assert.equal(congelado().size, 0, 'se congeló: es el defecto, reproducido');
});

test('leyendo la revisión, el computed se entera de todo', () => {
  const m = servicioFalso();
  const vivo = computed(() => {
    m.revisionDelEstado();
    return m.volcadoDelEstado();
  });

  assert.equal(vivo().size, 0);
  m.cambio('i.0.aux.0.value', 0.5);
  assert.equal(vivo().size, 1);
  assert.equal(vivo().get('i.0.aux.0.value')?.valor, 0.5);

  // Y sigue vivo: alguien mueve el envío en la consola y la pantalla lo ve.
  m.cambio('i.0.aux.0.value', 0.9);
  assert.equal(vivo().get('i.0.aux.0.value')?.valor, 0.9);
});

// --- 2. Que producción lo use ------------------------------------------------

/**
 * Las pantallas que leen el estado confirmado dentro de un `computed`.
 *
 * Se enumera a mano a propósito: una lista que se arma sola recorriendo
 * archivos deja de fallar el día que alguien mueve el archivo, que es
 * justamente cuando hace falta que falle.
 */
const PANTALLAS = [join(APP, 'monitor', 'monitores.component.ts')];

/**
 * La fuente sin comentarios, reemplazados por espacios del mismo largo.
 *
 * **Hace falta, y lo demostró esta misma guarda dos veces.** Los archivos de
 * este repositorio explican sus defectos citando el código roto --acá mismo, el
 * docblock muestra `computed(() => this.mixer.volcadoDelEstado())` para contar
 * por qué no va--. Una guarda que no separa el código de la explicación falla
 * sobre el archivo ya arreglado, y una guarda que falla siempre se apaga en una
 * semana. Se reemplaza por espacios y no se borra para que las posiciones no se
 * muevan: el mensaje tiene que poder señalar el lugar de verdad.
 */
function sinComentarios(fuente: string): string {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

test('toda pantalla que lee el volcado en un computed lee antes la revisión', () => {
  for (const ruta of PANTALLAS) {
    // **La LLAMADA en el CÓDIGO, no la palabra en un comentario.** La primera
    // versión buscaba `volcadoDelEstado()` a secas y encontraba la mención del
    // docblock; la segunda buscó la llamada entera y encontró la llamada citada
    // DENTRO del docblock, que muestra la forma rota para explicarla. Las dos
    // fallaban sobre el archivo ya arreglado.
    const fuente = sinComentarios(readFileSync(ruta, 'utf8'));
    const llamadas = [...fuente.matchAll(/this\.mixer\.volcadoDelEstado\(\)/g)];
    assert.ok(llamadas.length > 0, `${ruta}: ya no lee el volcado; sacalo de la lista`);
    // Y se comprueban TODAS: alcanza con que una se escriba suelta para que esa
    // parte de la pantalla quede congelada.
    for (const m of llamadas) {
      const i = m.index ?? 0;
      // La revisión tiene que leerse ANTES, en el mismo computed. Se mira una
      // ventana corta hacia atrás en vez de parsear: lo que se quiere impedir es
      // el `computed` de una línea, que es como nació.
      const antes = fuente.slice(Math.max(0, i - 300), i);
      assert.match(
        antes, /revisionDelEstado\(\)/,
        `${ruta}: lee volcadoDelEstado() sin leer antes revisionDelEstado(): `
        + 'ese computed no se va a recalcular nunca',
      );
    }
  }
});

test('el servicio toca la revisión en los momentos en que el estado cambia', () => {
  const fuente = sinComentarios(readFileSync(join(APP, 'core', 'mixer.service.ts'), 'utf8'));
  // No alcanza con que la señal exista: tiene que tocarse. Cada uno de estos
  // es un momento en que el estado confirmado deja de ser el que era, y
  // olvidarse de uno deja a la pantalla ciega justo en ese caso.
  for (const [momento, ancla] of [
    ['el volcado inicial', 'alVolcadoCompleto'],
    ['un cambio de otro operador', 'alCambiarExterno'],
    ['una avalancha', 'alCambioMasivo'],
  ] as const) {
    const i = fuente.indexOf(ancla);
    assert.ok(i > 0, `no está ${ancla}`);
    const bloque = fuente.slice(i, i + 400);
    assert.match(bloque, /tocarEstado\(\)/, `no se toca la revisión en ${momento}`);
  }
  assert.match(fuente, /await adapter\.conectar\(url\);\s*\n\s*this\.tocarEstado\(\);/,
    'no se toca la revisión al conectar');
  assert.match(fuente, /this\.adapter = null;\s*\n\s*this\.tocarEstado\(\);/,
    'no se toca la revisión al desconectar');
});

// --- 3. Y que la aplicación se entere de sus PROPIAS escrituras --------------

test('escribir por el camino de la aplicación toca la revisión', async () => {
  // **El defecto que la tablet del usuario encontró el 2026-09-20.** La
  // revisión se tocaba con el volcado, con un cambio ajeno y al conectar, pero
  // no cuando escribía la propia aplicación: el almacén marca esas como LOCAL y
  // `alCambiarExterno` no dispara. En el campo la pantalla encendió una cuña,
  // escribió en la consola, escuchó, lo anotó, y la fila seguía diciendo
  // «Cerrado».
  //
  // Se reproduce la envoltura con la misma forma: un `escribir` envuelto que
  // avisa en un `finally`. Lo que ata esta copia a producción es la guarda de
  // fuente de abajo.
  const avisos: number[] = [];
  const base = {
    escribir: async () => ({ status: 'OK' }),
    leer: () => null,
    otraCosa: () => 'sin avisar',
  };
  const envuelta = new Proxy(base, {
    get: (obj, prop) => {
      const v = Reflect.get(obj, prop, obj);
      if (prop !== 'escribir' || typeof v !== 'function') {
        return typeof v === 'function' ? v.bind(obj) : v;
      }
      return async (...args: unknown[]) => {
        try { return await (v as (...a: unknown[]) => unknown).apply(obj, args); }
        finally { avisos.push(1); }
      };
    },
  }) as typeof base;

  await envuelta.escribir();
  assert.equal(avisos.length, 1, 'escribir no avisó');
  // Y lo que no es escribir pasa derecho, sin avisar de más.
  assert.equal(envuelta.otraCosa(), 'sin avisar');
  assert.equal(avisos.length, 1);
});

test('la envoltura avisa AUNQUE la escritura falle', async () => {
  // Un conflicto también significa que el estado confirmado aprendió algo --el
  // valor real, que es por lo que el conflicto se detectó--. Un refresco de más
  // cuesta un recálculo; uno de menos muestra un número viejo.
  const avisos: number[] = [];
  const envuelto = async () => {
    try { throw new Error('la consola cortó'); } finally { avisos.push(1); }
  };
  await assert.rejects(envuelto);
  assert.equal(avisos.length, 1, 'no avisó cuando la escritura falló');
});

test('el camino para escribir sale envuelto, y el embudo es uno solo', () => {
  const fuente = sinComentarios(readFileSync(join(APP, 'core', 'mixer.service.ts'), 'utf8'))
    .replace(/\s+/g, ' ');
  const api = fuente.slice(fuente.indexOf('api(): MixerDomainAPI | null'));
  assert.ok(api.length > 0, 'ya no existe api()');
  assert.match(api.slice(0, 400), /this\.queAvise\(adapter\)|this\.apiEnvuelta/,
    'api() devuelve el adaptador pelado: las escrituras propias no van a refrescar nada');
  // La envoltura tiene que tocar la revisión, y sobre `escribir`, que es por
  // donde pasa TODA escritura --ganancia, monitor y lo que venga--.
  const envoltura = fuente.slice(fuente.indexOf('private queAvise('));
  assert.match(envoltura.slice(0, 600), /prop !== 'escribir'/);
  assert.match(envoltura.slice(0, 600), /this\.tocarEstado\(\)/);
});
