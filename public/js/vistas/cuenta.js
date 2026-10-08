// Pantallas 2, 3, 4 y 8 · Iniciar sesión, registro, recuperar contraseña (pasos 1 y 2), Mi cuenta y privacidad.

import { peticion, sesion, guardarSesion, cerrarSesion, esEscritorio, WEB } from '../api.js';
import { catalogo } from '../datos.js';
import { el, campoForm, aviso, poner, iconoGoogle } from '../ui.js';
import { subirBorradorPendiente, borrador, misEquipos } from '../equipos.js';

/** Tras entrar: guarda la sesión, sube el equipo pendiente y va a "Mis equipos". */
async function entrar(datos) {
  guardarSesion(datos);
  localStorage.setItem('ha-entrado', '1');   // la cabecera ofrecerá "Login" en vez de "Registrarse"
  try {
    const subido = await subirBorradorPendiente();
    if (subido) aviso(`Tu equipo "${subido.nombre}" se ha guardado en la cuenta`);
  } catch (e) { aviso(`No se pudo guardar el equipo: ${e.message}`, 'error'); }
  window.dispatchEvent(new Event('sesion'));
  // Si se entró para conectar la app de escritorio, se vuelve a la app; si no, a "Mis equipos"
  if (sessionStorage.getItem('escritorio')) {
    try { await completarEscritorio(); } catch (e) { aviso(e.message, 'error'); location.hash = '#/equipos'; }
    return;
  }
  location.hash = '#/equipos';
}

/** Formulario que llama a la API al enviarse y muestra el error en la caja rosa si falla. */
function formulario(campos, textoBoton, alEnviar, { clase = '', peligro = false } = {}) {
  const error = el('p', { class: 'msg error', hidden: true, role: 'alert' });
  const boton = el('button', { class: `btn ${peligro ? 'peligro' : ''}`, type: 'submit' }, textoBoton);
  const form = el('form', { class: clase, onsubmit: async e => {
    e.preventDefault();
    error.hidden = true;
    boton.disabled = true;
    try { await alEnviar(Object.fromEntries(new FormData(form)), form); }
    catch (err) { error.textContent = err.message; error.hidden = false; }
    finally { boton.disabled = false; }
  } }, campos, error, boton);
  return form;
}

const input = (name, type = 'text', extra = {}) => el('input', { name, type, required: true, ...extra });
const googleDisponible = () => !!catalogo?.google_client_id;

/** Carga una vez el script de Google (Google Identity Services). */
let gis = null;
const cargarGis = () => (gis ??= new Promise((ok, fallo) => {
  if (window.google?.accounts) { ok(); return; }
  document.head.append(el('script', { src: 'https://accounts.google.com/gsi/client', async: true, onload: ok,
    onerror: () => { gis = null; fallo(new Error('No se pudo cargar Google')); } }));
}));

/** Botón oficial de Google (en la web y si está configurado). alRecibir recibe el credential. */
function botonGoogle(alRecibir, texto = 'continue_with') {
  if (!googleDisponible()) return null;
  const caja = el('div', { class: 'google' });
  cargarGis().then(() => {
    google.accounts.id.initialize({ client_id: catalogo.google_client_id, callback: async r => {
      try { await alRecibir(r.credential); } catch (e) { aviso(e.message, 'error'); }
    } });
    google.accounts.id.renderButton(caja, { theme: 'outline', size: 'large', text: texto, locale: 'es', width: 300 });
  }, e => poner(caja, el('p', { class: 'msg error' }, e.message)));
  return caja;
}

/*
 * App de escritorio: Google no deja iniciar sesión dentro de la ventana de una app, así que se hace en el navegador.
 * La app (Rust, src-tauri/src/main.rs) abre la web en #/escritorio/<puerto>/<estado> y espera en http://127.0.0.1:<puerto>.
 * La web, con la sesión iniciada, pide un código de 2 minutos y se lo manda a la app; la app lo cambia por su sesión.
 */
async function entrarPorNavegador(boton) {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) { aviso('Esta versión de la app no puede abrir el navegador', 'error'); return; }
  boton.disabled = true;
  aviso('Inicia sesión en el navegador que se ha abierto');
  try {
    const { codigo, estado } = await invoke('entrar_con_navegador', { web: WEB });
    await entrar(await peticion('auth.php?accion=canjear-escritorio', { method: 'POST', body: { codigo, estado } }));
  } catch (e) { aviso(String(e?.message ?? e), 'error'); }
  finally { boton.disabled = false; }
}

/** Web abierta desde la app de escritorio: se apunta adónde volver y, si hace falta, se inicia sesión. */
export async function vistaEscritorio(raiz, puerto, estado) {
  sessionStorage.setItem('escritorio', JSON.stringify({ puerto: +puerto, estado, hora: Date.now() }));
  if (!sesion()) { location.replace('#/login'); return; }
  poner(raiz, el('p', { class: 'nota centro' }, 'Conectando con la app de escritorio…'));
  try { await completarEscritorio(); } catch (e) { poner(raiz, el('p', { class: 'msg error' }, e.message)); }
}

async function completarEscritorio() {
  const p = JSON.parse(sessionStorage.getItem('escritorio') || 'null');
  sessionStorage.removeItem('escritorio');
  if (!p || Date.now() - p.hora > 5 * 60 * 1000) { location.hash = '#/equipos'; return; }   // la app ya no espera
  const { codigo } = await peticion('auth.php?accion=codigo-escritorio', { method: 'POST', body: { estado: p.estado } });
  location.href = `http://127.0.0.1:${p.puerto}/?codigo=${encodeURIComponent(codigo)}&estado=${encodeURIComponent(p.estado)}`;
}

/** Botón de Google + separador "o con tu email". En la app de escritorio abre el navegador. */
function entrarConGoogle(texto) {
  const separador = el('div', { class: 'separador' }, 'o con tu email');
  if (esEscritorio && googleDisponible()) {
    const boton = el('button', { class: 'google', type: 'button', onclick: () => entrarPorNavegador(boton) }, iconoGoogle(), texto);
    return [boton, el('p', { class: 'nota centro' }, 'Se abre en tu navegador y vuelve aquí solo.'), separador];
  }
  if (!googleDisponible()) {
    // Mientras no haya google_client_id en config.php se ve el botón, pero desactivado
    return [el('button', { class: 'google', type: 'button', disabled: true, title: 'Falta configurar google_client_id en config.php' },
      iconoGoogle(), texto), separador];
  }
  const b = botonGoogle(async credential => entrar(await peticion('auth.php?accion=google', { method: 'POST', body: { credential } })),
    texto.startsWith('Registrarse') ? 'signup_with' : 'continue_with');
  return [b, separador];
}

/* ---------- Iniciar sesión ---------- */

export function vistaLogin(raiz) {
  const paraApp = !!sessionStorage.getItem('escritorio');
  poner(raiz,
    el('div', { class: 'encabezado' }, el('h1', {}, 'Iniciar sesión'),
      el('p', { class: 'sub' }, paraApp ? 'Entra para conectar la app de escritorio de Poketon.' : 'Entra para guardar tus equipos.')),
    entrarConGoogle('Continuar con Google'),
    formulario([
      campoForm('Email', input('email', 'email', { autocomplete: 'email', placeholder: 'tu@email.com' })),
      campoForm('Contraseña', input('password', 'password', { autocomplete: 'current-password', placeholder: '••••••••' })),
      el('a', { href: '#/recuperar', class: 'enlace-derecha' }, '¿Has olvidado la contraseña?'),
    ], 'Entrar', async d => entrar(await peticion('auth.php?accion=login', { method: 'POST', body: d }))),
    el('p', { class: 'centro' }, '¿No tienes cuenta? ', el('a', { href: '#/registro' }, 'Regístrate')),
  );
}

/* ---------- Registro ---------- */

export function vistaRegistro(raiz) {
  const b = borrador();
  const pendientes = !b.id && b.miembros.length > 0;
  const password = input('password', 'password', { minlength: 8, autocomplete: 'new-password', placeholder: 'Mínimo 8 caracteres' });
  const repetida = input('repetida', 'password', { minlength: 8, autocomplete: 'new-password' });
  const noCoinciden = el('span', { class: 'error-campo', hidden: true }, 'Las contraseñas no coinciden');
  const comprobar = () => {
    const mal = repetida.value !== '' && repetida.value !== password.value;
    noCoinciden.hidden = !mal;
    repetida.classList.toggle('invalido', mal);
    return !mal;
  };
  password.addEventListener('input', comprobar);
  repetida.addEventListener('input', comprobar);

  poner(raiz,
    el('div', { class: 'encabezado' }, el('h1', {}, 'Crear cuenta'), el('p', { class: 'sub' }, 'Guarda hasta 8 equipos en la web y en la app de escritorio.')),
    entrarConGoogle('Registrarse con Google'),
    formulario([
      campoForm('Nombre de entrenador', input('nombre', 'text', { maxlength: 30, autocomplete: 'nickname', placeholder: 'Ej.: Rojo' })),
      campoForm('Email', input('email', 'email', { autocomplete: 'email', placeholder: 'tu@email.com' })),
      campoForm('Contraseña', password),
      campoForm('Repite la contraseña', repetida, noCoinciden),
      el('label', { class: 'check-legal' }, input('privacidad', 'checkbox', { value: 'si' }),
        el('span', {}, 'Acepto la ', el('a', { href: '#/privacidad', target: '_blank' }, 'política de privacidad'))),
      pendientes && el('p', { class: 'msg info' }, `Tienes 1 equipo sin guardar (${b.miembros.length} Pokémon). Se añadirá a tu cuenta al registrarte.`),
    ], 'Crear cuenta', async d => {
      if (!comprobar()) throw new Error('Las contraseñas no coinciden');
      await entrar(await peticion('auth.php?accion=registro', { method: 'POST', body: d }));
    }),
    el('p', { class: 'centro' }, '¿Ya tienes cuenta? ', el('a', { href: '#/login' }, 'Inicia sesión')),
  );
}

/* ---------- Recuperar contraseña ---------- */

export function vistaRecuperar(raiz) {
  const ok = el('p', { class: 'msg ok', hidden: true }, 'Si ese email tiene cuenta, te hemos enviado un enlace. Caduca en 30 minutos.');
  poner(raiz,
    el('section', { class: 'tarjeta-form' },
      el('span', { class: 'lbl' }, 'Paso 1 · Pedir el enlace'),
      el('h2', {}, 'Recuperar contraseña'),
      el('p', { class: 'sub' }, 'Escribe tu email y te mandamos un enlace para crear una nueva.'),
      formulario([campoForm('Email', input('email', 'email', { autocomplete: 'email', placeholder: 'tu@email.com' }))], 'Enviar enlace', async (d, form) => {
        await peticion('auth.php?accion=recuperar', { method: 'POST', body: d });
        form.reset();
        ok.hidden = false;
      }),
      ok),
    el('p', { class: 'centro' }, el('a', { href: '#/login' }, 'Volver a iniciar sesión')),
  );
}

export function vistaRestablecer(raiz, token) {
  const caducado = el('p', { class: 'msg error', hidden: true }, 'El enlace ha caducado o ya se usó. ', el('a', { href: '#/recuperar' }, 'Pide uno nuevo'), '.');
  const form = formulario([
    campoForm('Nueva contraseña', input('password', 'password', { minlength: 8, autocomplete: 'new-password', placeholder: 'Mínimo 8 caracteres' })),
    campoForm('Repite la contraseña', input('repetida', 'password', { minlength: 8, autocomplete: 'new-password' })),
  ], 'Guardar contraseña', async d => {
    if (d.password !== d.repetida) throw new Error('Las contraseñas no coinciden');
    try {
      await entrar(await peticion('auth.php?accion=restablecer', { method: 'POST', body: { token, password: d.password } }));
      aviso('Contraseña cambiada');
    } catch (e) {
      if (e.status === 410) { caducado.hidden = false; form.hidden = true; return; }
      throw e;
    }
  });
  poner(raiz,
    el('section', { class: 'tarjeta-form' },
      el('span', { class: 'lbl' }, 'Paso 2 · Desde el enlace del email'),
      el('h2', {}, 'Nueva contraseña'),
      form, caducado));
}

/* ---------- Mi cuenta ---------- */

export async function vistaCuenta(raiz) {
  if (!sesion()) { location.hash = '#/login'; return; }
  poner(raiz, el('p', { class: 'nota' }, 'Cargando…'));
  let u, equipos;
  try { [u, equipos] = await Promise.all([peticion('auth.php?accion=yo'), misEquipos()]); }
  catch (e) { poner(raiz, el('p', { class: 'msg error' }, e.message)); return; }

  const salir = () => { cerrarSesion(); window.dispatchEvent(new Event('sesion')); location.hash = '#/'; };

  // Vincular Google: al pulsar "Vincular" se abre directamente la ventana de Google (cliente de tokens de Google
  // Identity Services); el servidor comprueba el access_token con Google. El script se carga ya, para que la
  // ventana se abra en el mismo clic (si no, el navegador la bloquearía como ventana emergente).
  const puedeVincular = googleDisponible() && !esEscritorio;
  let clienteGoogle = null;
  if (puedeVincular && !u.tiene_google) {
    cargarGis().then(() => {
      clienteGoogle = google.accounts.oauth2.initTokenClient({
        client_id: catalogo.google_client_id, scope: 'openid email',
        callback: async r => {
          if (r.error) { aviso('No se pudo vincular la cuenta de Google', 'error'); return; }
          try {
            await peticion('auth.php?accion=vincular-google', { method: 'POST', body: { access_token: r.access_token } });
            aviso('Cuenta de Google vinculada');
            vistaCuenta(raiz);
          } catch (e) { aviso(e.message, 'error'); }
        },
      });
    }, () => {});
  }
  const filaGoogle = el('section', { class: 'tarjeta-fila' },
    el('div', {}, el('b', {}, 'Cuenta de Google'), el('span', { class: 'tenue' }, u.tiene_google ? 'Vinculada' : 'No vinculada')),
    !u.tiene_google && el('button', { class: 'btn-sec-mini', disabled: !puedeVincular,
      title: puedeVincular ? '' : esEscritorio ? 'Vincúlala desde la web' : 'Falta configurar google_client_id', onclick: () => {
        if (clienteGoogle) clienteGoogle.requestAccessToken();
        else aviso('Cargando Google… vuelve a pulsar en un momento');
      } }, 'Vincular'));

  poner(raiz,
    el('div', { class: 'perfil' }, el('span', { class: 'avatar grande' }, u.nombre[0].toUpperCase()),
      el('div', {}, el('b', {}, u.nombre), el('div', { class: 'tenue' }, `${u.email} · ${equipos.length} equipo${equipos.length === 1 ? '' : 's'}`))),

    el('section', { class: 'tarjeta-form compacta' }, el('b', {}, u.tiene_password ? 'Cambiar contraseña' : 'Crear contraseña'),
      formulario([
        u.tiene_password && campoForm('Contraseña actual', input('actual', 'password', { autocomplete: 'current-password' })),
        campoForm('Nueva contraseña', input('nueva', 'password', { minlength: 8, autocomplete: 'new-password', placeholder: 'Mínimo 8 caracteres' })),
      ], 'Guardar contraseña', async d => {
        await peticion('auth.php?accion=cambiar-password', { method: 'POST', body: d });
        aviso('Contraseña guardada');
        vistaCuenta(raiz);
      })),

    filaGoogle,
    el('button', { class: 'btn sec mini', onclick: salir }, 'Cerrar sesión'),

    el('section', { class: 'tarjeta-form compacta peligro' }, el('b', {}, 'Eliminar cuenta'),
      el('p', { class: 'sub', style: { fontSize: '13px' } }, 'Se borran tu cuenta y tus equipos para siempre. Escribe ELIMINAR para confirmar.'),
      formulario([input('confirmacion', 'text', { placeholder: 'ELIMINAR', 'aria-label': 'Confirmación' })], 'Eliminar mi cuenta', async d => {
        await peticion('auth.php?accion=borrar-cuenta', { method: 'POST', body: d });
        aviso('Cuenta eliminada');
        salir();
      }, { peligro: true })),
  );
}

/* ---------- Política de privacidad ---------- */

export function vistaPrivacidad(raiz) {
  poner(raiz,
    el('h1', {}, 'Política de privacidad'),
    el('div', { class: 'texto-legal' },
      el('p', {}, 'Poketon es un proyecto de fin de curso sin ánimo de lucro. Solo guardamos lo necesario para que tu cuenta funcione:'),
      el('p', {}, '• Tu email y tu nombre de entrenador, para identificarte.'),
      el('p', {}, '• Tu contraseña cifrada (nunca se guarda tal cual) o el identificador de tu cuenta de Google si entras con ella.'),
      el('p', {}, '• Tus equipos.'),
      el('p', {}, 'No usamos cookies de seguimiento ni compartimos tus datos con nadie. El equipo que montes sin cuenta se queda en tu navegador.'),
      el('p', {}, 'Puedes borrar tu cuenta y todos tus datos cuando quieras desde "Mi cuenta → Eliminar cuenta".'),
      el('p', { class: 'nota' }, 'Proyecto fan no oficial. Pokémon © Nintendo / Creatures / Game Freak. Datos y sprites: PokeAPI. Sets: Smogon.')),
    el('p', { class: 'centro' }, el('a', { href: '#/' }, 'Volver')),
  );
}
