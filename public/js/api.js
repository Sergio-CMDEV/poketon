// Comunicación con la API en PHP y sesión del usuario.
// En la web la API está en el mismo sitio (/api). En la app de escritorio (Tauri) la página
// no se sirve por http(s) de tu dominio, así que se llama a la API publicada.

const API_PUBLICADA = 'https://poketon.dearbirdtw.com/api';   // dominio provisional (luego poketon.online); al compilar se puede cambiar con POKETON_API
export const esEscritorio = location.hostname === 'tauri.localhost' || location.protocol === 'tauri:';
export const API = esEscritorio ? API_PUBLICADA : '/api';
// Raíz de la web: en la app de escritorio, la del servidor (de ahí salen la hoja de iconos y Pokémon Añil)
export const WEB = esEscritorio ? API_PUBLICADA.replace(/\/api\/?$/, '/') : '';

/* ---------- Sesión (token JWT guardado en el navegador) ---------- */

export function sesion() {
  try { return JSON.parse(localStorage.getItem('sesion')) || null; } catch { return null; }
}

export function guardarSesion(datos) {
  localStorage.setItem('sesion', JSON.stringify(datos));
}

export function cerrarSesion() {
  localStorage.removeItem('sesion');
  // El equipo que se estaba editando también: en un PC compartido, el siguiente no debe verlo ni subirlo a su cuenta
  localStorage.removeItem('borrador');
}

/* ---------- Peticiones ---------- */

/**
 * Llama a la API y devuelve el JSON. Si la API responde con error, lanza un Error con su mensaje.
 * peticion('equipos.php', { method: 'POST', body: {...} })
 */
export async function peticion(ruta, { method = 'GET', body } = {}) {
  const cabeceras = {};
  const s = sesion();
  if (s?.token) cabeceras.Authorization = `Bearer ${s.token}`;
  if (body !== undefined) cabeceras['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${API}/${ruta}`, { method, headers: cabeceras, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error('No hay conexión con el servidor');
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && s) {   // sesión caducada o cerrada desde otro dispositivo: se olvida y se repinta la cabecera
      cerrarSesion();
      window.dispatchEvent(new Event('sesion'));
    }
    const e = new Error(datos.error || `Error ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return datos;
}

/** Sube un archivo (multipart). subirArchivo('perfil.php?accion=foto', 'foto', blob, 'foto.webp') */
export async function subirArchivo(ruta, campo, archivo, nombreArchivo = 'archivo') {
  const s = sesion();
  const datos = new FormData();
  datos.append(campo, archivo, nombreArchivo);
  let res;
  try {
    res = await fetch(`${API}/${ruta}`, { method: 'POST', headers: s?.token ? { Authorization: `Bearer ${s.token}` } : {}, body: datos });
  } catch {
    throw new Error('No hay conexión con el servidor');
  }
  const r = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(r.error || `Error ${res.status}`); e.status = res.status; throw e; }
  return r;
}

/** Actualiza los datos del usuario guardados con la sesión (nombre, foto…) y repinta la cabecera. */
export function actualizarUsuario(cambios) {
  const s = sesion();
  if (!s) return;
  guardarSesion({ ...s, usuario: { ...s.usuario, ...cambios } });
}
