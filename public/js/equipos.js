// Equipo que se está editando ("borrador", guardado en el navegador) y equipos guardados en la cuenta.

import { peticion, sesion } from './api.js';
import { nuevoMiembro } from './showdown.js';

/** Generación elegida en "Juego" (1-9). Con Pokémon Añil elegido, los equipos usan la 9. */
export function genActual() {
  const g = localStorage.getItem('gen');
  return !g || isNaN(g) ? 9 : +g;
}

export function borrador() {
  try {
    const b = JSON.parse(localStorage.getItem('borrador'));
    if (b && Array.isArray(b.miembros)) return b;
  } catch { /* borrador dañado: se empieza uno nuevo */ }
  return equipoVacio();
}

export function equipoVacio() {
  return { id: null, nombre: '', generacion: genActual(), randomlocke: false, miembros: [] };
}

export function guardarBorrador(equipo) {
  localStorage.setItem('borrador', JSON.stringify(equipo));
}

/** Añade un Pokémon al primer hueco libre (1-6 titulares, 7-8 reservas). Devuelve false si está lleno. */
const huecoLibre = eq => { const ocupadas = new Set(eq.miembros.map(m => m.posicion)); return [1, 2, 3, 4, 5, 6, 7, 8].find(p => !ocupadas.has(p)); };

export function añadirAlBorrador(pokemonId) {
  const eq = borrador();
  const libre = huecoLibre(eq);
  if (!libre) return false;
  eq.miembros.push(nuevoMiembro(pokemonId, libre));
  guardarBorrador(eq);
  return true;
}

export const misEquipos = () => peticion('equipos.php');

/** Guarda en la cuenta (crea o actualiza) y deja el resultado como borrador. */
export async function guardarEnCuenta(equipo) {
  const cuerpo = { nombre: equipo.nombre, generacion: equipo.generacion, randomlocke: !!equipo.randomlocke, miembros: equipo.miembros };
  const guardado = equipo.id
    ? await peticion(`equipos.php?id=${equipo.id}`, { method: 'PUT', body: cuerpo })
    : await peticion('equipos.php', { method: 'POST', body: cuerpo });
  guardarBorrador(guardado);
  return guardado;
}

/** Añade un Pokémon al primer hueco libre de un equipo de la cuenta. Si es el que se está editando, lo actualiza también. */
export async function añadirAEquipo(eq, pokemonId) {
  const libre = huecoLibre(eq);
  if (!libre) throw new Error(`${eq.nombre} ya está completo`);
  const guardado = await peticion(`equipos.php?id=${eq.id}`, { method: 'PUT',
    body: { nombre: eq.nombre, generacion: eq.generacion, miembros: [...eq.miembros, nuevoMiembro(pokemonId, libre)] } });
  if (borrador().id === eq.id) guardarBorrador(guardado);
  return guardado;
}

/** Equipa un objeto al miembro de esa posición en el equipo que se está montando. */
export function equiparEnBorrador(posicion, objetoId) {
  const eq = borrador();
  const m = eq.miembros.find(x => x.posicion === posicion);
  if (!m) return false;
  m.objeto_id = objetoId;
  guardarBorrador(eq);
  return true;
}

/** Equipa un objeto a un miembro de un equipo de la cuenta. Si es el que se está editando, lo actualiza también. */
export async function equiparEnEquipo(eq, posicion, objetoId) {
  const miembros = eq.miembros.map(m => (m.posicion === posicion ? { ...m, objeto_id: objetoId } : m));
  const guardado = await peticion(`equipos.php?id=${eq.id}`, { method: 'PUT', body: { nombre: eq.nombre, generacion: eq.generacion, miembros } });
  if (borrador().id === eq.id) guardarBorrador(guardado);
  return guardado;
}

/** Crea un equipo nuevo en la cuenta con ese Pokémon (nombre automático "Equipo N"). */
export const crearEquipoCon = pokemonId =>
  peticion('equipos.php', { method: 'POST', body: { nombre: '', generacion: genActual(), miembros: [nuevoMiembro(pokemonId, 1)] } });

export async function borrarEquipo(id) {
  await peticion(`equipos.php?id=${id}`, { method: 'DELETE' });
  if (borrador().id === id) guardarBorrador(equipoVacio());   // si era el que se estaba editando, ya no existe
}

/** Tras iniciar sesión: si había un equipo montado sin guardar, se sube a la cuenta. */
export async function subirBorradorPendiente() {
  const b = borrador();
  if (!sesion() || b.id || !b.miembros.length) return null;
  return guardarEnCuenta(b);
}
