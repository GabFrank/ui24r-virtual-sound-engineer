/**
 * Cuentas con su sustantivo bien concordado.
 *
 * La pantalla de perfiles decía «1 integrantes» y «1 canales asignados», y otra
 * salía del paso con «1 local(es)». Es de esas cosas que no rompen nada y que
 * le dicen al usuario que nadie miró: si la aplicación se equivoca en algo que
 * él ve sin esfuerzo, va a dudar de los números que no puede comprobar, que
 * son justamente los que importan acá.
 *
 * Vive fuera de los componentes para poder probarse con `node --test`, y se usa
 * desde `computed()`: llamar funciones desde una plantilla las reevalúa en cada
 * ciclo de detección de cambios.
 */
export function cuenta(n: number, singular: string, plural: string): string {
  // El cero va en plural: «0 integrantes», no «0 integrante». Es lo que dice el
  // castellano y lo que ya se lee en la aplicación cuando no hay nada cargado.
  return `${n} ${n === 1 ? singular : plural}`;
}
