// Comunicación con la API en PHP y sesión del usuario.
// En la web la API está en el mismo sitio (/api). En la app de escritorio (Tauri) la página
// no se sirve por http(s) de tu dominio, así que se llama a la API publicada.

const API_PUBLICADA = 'https://poketon.dearbirdtw.com/api';   // al compilar el .exe se puede cambiar con POKETON_API
const esEscritorio = location.hostname === 'tauri.localhost' || location.protocol === 'tauri:';
export const API = esEscritorio ? API_PUBLICADA : '/api';

/* ---------- Sesión (token JWT guardado en el navegador) ---------- */

export function sesion() {
  try { return JSON.parse(localStorage.getItem('sesion')) || null; } catch { return null; }
}

export function guardarSesion(datos) {
  localStorage.setItem('sesion', JSON.stringify(datos));
}

export function cerrarSesion() {
  localStorage.removeItem('sesion');
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
    if (res.status === 401 && s) cerrarSesion();   // token caducado: se olvida
    const e = new Error(datos.error || `Error ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return datos;
}
