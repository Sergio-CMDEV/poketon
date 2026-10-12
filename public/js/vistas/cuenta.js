// Pantallas 2, 3, 4, 8, 8b y 8c · Iniciar sesión, registro, recuperar contraseña (pasos 1 y 2), Mi cuenta,
// Editar perfil (con el recorte de la foto) y privacidad.

import { peticion, sesion, guardarSesion, cerrarSesion, esEscritorio, WEB, subirArchivo, actualizarUsuario } from '../api.js';
import { catalogo, buscar } from '../datos.js';
import { el, campoForm, aviso, poner, iconoGoogle, avatarUsuario, confirmar, sprite, ventana } from '../ui.js';
import { formatoCodigo } from '../online.js';
import { recortarFoto, TIPOS_FOTO } from '../recorte.js';
import { subirBorradorPendiente, borrador, misEquipos, guardarBorrador, equipoVacio } from '../equipos.js';

/** Tras entrar: guarda la sesión, sube el equipo pendiente y va a "Mis equipos". */
async function entrar(datos) {
  // Un equipo en edición que era de una cuenta (tiene id) no es de esta sesión: se empieza uno nuevo
  if (borrador().id) guardarBorrador(equipoVacio());
  guardarSesion(datos);
  localStorage.setItem('ha-entrado', '1');   // la cabecera ofrecerá "Login" en vez de "Registrarse"
  try {
    const subido = await subirBorradorPendiente();
    if (subido) aviso(`Tu equipo "${subido.nombre}" se ha guardado en la cuenta`);
  } catch (e) { aviso(`No se pudo guardar el equipo: ${e.message}`, 'error'); }
  window.dispatchEvent(new Event('sesion'));
  // Se entró desde un enlace de amigo: la solicitud se manda ahora
  const amigo = sessionStorage.getItem('amigo-pendiente');
  if (amigo) {
    sessionStorage.removeItem('amigo-pendiente');
    try {
      const r = await peticion('amigos.php?accion=solicitar', { method: 'POST', body: { destino: amigo } });
      aviso(r.estado === 'aceptada' ? 'Ya sois amigos' : 'Solicitud de amistad enviada');
    } catch (e) { aviso(e.message, 'error'); }
    location.hash = '#/amigos';
    return;
  }
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
        // Se abre en una ventana encima: así no se sale del registro ni se pierde lo escrito
        el('span', {}, 'Acepto la ', el('a', { href: '#/privacidad', onclick: e => {
          e.preventDefault();
          ventana(cerrar => [textoPrivacidad(), el('button', { class: 'btn', type: 'button', onclick: cerrar }, 'Entendido')], { titulo: 'Política de privacidad' });
        } }, 'política de privacidad'))),
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
  let u, equipos, perfil;
  try { [u, equipos, perfil] = await Promise.all([peticion('auth.php?accion=yo'), misEquipos(), peticion('perfil.php')]); }
  catch (e) { poner(raiz, el('p', { class: 'msg error' }, e.message)); return; }
  actualizarUsuario({ nombre: u.nombre, usuario: u.usuario, foto: u.foto, avatar: u.avatar });

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
    el('div', { class: 'perfil' }, avatarUsuario(u, 52, { propio: true }),
      el('div', { class: 'perfil-texto' }, el('b', {}, u.nombre, ' ', el('span', { class: 'arroba' }, `@${u.usuario}`)),
        el('div', { class: 'tenue' }, `${u.email} · ${equipos.length} equipo${equipos.length === 1 ? '' : 's'} · ${perfil.amigos} amigo${perfil.amigos === 1 ? '' : 's'}`)),
      el('a', { class: 'btn-contorno', href: '#/perfil' }, 'Editar perfil')),

    el('section', { class: 'tarjeta-form compacta' }, el('b', {}, u.tiene_password ? 'Cambiar contraseña' : 'Crear contraseña'),
      formulario([
        u.tiene_password && campoForm('Contraseña actual', input('actual', 'password', { autocomplete: 'current-password' })),
        campoForm('Nueva contraseña', input('nueva', 'password', { minlength: 8, autocomplete: 'new-password', placeholder: 'Mínimo 8 caracteres' })),
      ], 'Guardar contraseña', async d => {
        const r = await peticion('auth.php?accion=cambiar-password', { method: 'POST', body: d });
        guardarSesion({ ...sesion(), token: r.token });   // esta sesión sigue; las de otros dispositivos se cierran
        aviso('Contraseña guardada. Se ha cerrado la sesión en los demás dispositivos');
        vistaCuenta(raiz);
      })),

    filaGoogle,
    el('button', { class: 'btn sec mini', onclick: salir }, 'Cerrar sesión'),
    el('button', { class: 'enlace-btn centrado', type: 'button', onclick: async () => {
      if (!await confirmar('¿Cerrar la sesión en los demás dispositivos?', 'Tendrán que volver a iniciar sesión. En este sigues dentro.', 'Cerrar sesiones', { peligro: false })) return;
      try {
        const r = await peticion('auth.php?accion=cerrar-sesiones', { method: 'POST' });
        guardarSesion({ ...sesion(), token: r.token });
        aviso('Sesión cerrada en los demás dispositivos');
      } catch (e) { aviso(e.message, 'error'); }
    } }, 'Cerrar sesión en los demás dispositivos'),

    el('section', { class: 'tarjeta-form compacta peligro' }, el('b', {}, 'Eliminar cuenta'),
      el('p', { class: 'sub', style: { fontSize: '13px' } }, 'Se borran tu cuenta, tus equipos, tus amigos y tus chats para siempre. Escribe ELIMINAR para confirmar'
        + (u.tiene_password ? ' y tu contraseña.' : '.')),
      formulario([
        input('confirmacion', 'text', { placeholder: 'ELIMINAR', 'aria-label': 'Confirmación' }),
        u.tiene_password && input('password', 'password', { placeholder: 'Contraseña', 'aria-label': 'Contraseña', autocomplete: 'current-password' }),
      ], 'Eliminar mi cuenta', async d => {
        await peticion('auth.php?accion=borrar-cuenta', { method: 'POST', body: d });
        aviso('Cuenta eliminada');
        salir();
      }, { peligro: true })),
  );
}

/* ---------- 8b · Editar perfil ---------- */

// Pokémon que salen para elegir como avatar (con el buscador se puede elegir cualquiera)
const AVATARES = [25, 7, 1, 4, 94, 135, 131, 700, 133, 150, 212, 149];

export async function vistaPerfil(raiz) {
  if (!sesion()) { location.hash = '#/login'; return; }
  poner(raiz, el('p', { class: 'nota' }, 'Cargando…'));
  let p;
  try { p = await peticion('perfil.php'); } catch (e) { poner(raiz, el('p', { class: 'msg error' }, e.message)); return; }

  // Cada cambio que devuelve la API se aplica a la pantalla y a la sesión (la cabecera enseña la foto)
  const aplicar = nuevo => {
    p = nuevo;
    actualizarUsuario({ nombre: p.nombre, usuario: p.usuario, foto: p.foto, avatar: p.avatar });
    pintarFoto();
    poner(codigo, formatoCodigo(p.codigo));
    pintarBloqueados();
    window.dispatchEvent(new Event('perfil'));
  };

  /* Foto o Pokémon */
  const caja = el('div', { class: 'foto-actual' });
  const notaFoto = el('p', { class: 'nota' });
  const archivo = el('input', { type: 'file', accept: TIPOS_FOTO.join(','), hidden: true, onchange: async () => {
    const f = archivo.files[0];
    archivo.value = '';
    if (!f) return;
    try {
      const recorte = await recortarFoto(f);
      if (!recorte) return;
      aviso('Subiendo foto…');
      aplicar(await subirArchivo('perfil.php?accion=foto', 'foto', recorte, recorte.type === 'image/webp' ? 'foto.webp' : 'foto.jpg'));
      aviso('Foto guardada');
    } catch (e) { aviso(e.message, 'error'); }
  } });
  const subir = el('button', { class: 'btn-contorno', type: 'button', onclick: () => archivo.click() }, 'Subir una foto');
  const quitar = el('button', { class: 'enlace-btn tenue', type: 'button', onclick: async () => {
    try { aplicar(await peticion('perfil.php?accion=foto', { method: 'DELETE' })); aviso('Foto quitada'); } catch (e) { aviso(e.message, 'error'); }
  } }, 'Quitar foto');
  const rejilla = el('div', { class: 'rejilla-avatares' });
  const buscador = el('input', { type: 'search', placeholder: 'Buscar otro Pokémon…', 'aria-label': 'Buscar un Pokémon para el avatar',
    oninput: () => pintarRejilla() });

  function pintarFoto() {
    poner(caja, avatarUsuario(p, 76, { propio: true }));
    quitar.hidden = !p.foto;
    subir.disabled = p.fotos_restantes === 0;
    poner(notaFoto, 'JPG, PNG, WebP o GIF (se usa el primer fotograma) de hasta 8 MB. Antes de guardarla la colocas y ajustas el zoom. ',
      p.fotos_restantes === 0 ? 'Ya has cambiado la foto 3 veces hoy: prueba mañana.' : `Puedes cambiarla 3 veces al día (hoy te quedan ${p.fotos_restantes}).`);
    pintarRejilla();
  }
  function pintarRejilla() {
    const q = buscador.value.trim();
    const ids = q ? buscar(q, 9, 12).map(x => x.id) : AVATARES;
    poner(rejilla, ids.length ? ids.map(id => el('button', { type: 'button', class: `avatar-poke${!p.foto && p.avatar === id ? ' on' : ''}`,
      'aria-label': `Usar como avatar`, onclick: async () => {
        try { aplicar(await peticion('perfil.php?accion=avatar', { method: 'POST', body: { avatar: id } })); aviso('Avatar cambiado'); }
        catch (e) { aviso(e.message, 'error'); }
      } }, sprite(id, { tam: 44 }))) : el('p', { class: 'nota' }, 'No hay ningún Pokémon con ese nombre.'));
  }

  /* Nombre y @usuario (con "✓ Libre" mientras se escribe) */
  const usuario = el('input', { name: 'usuario', value: p.usuario, required: true, maxlength: 20, autocomplete: 'off', spellcheck: false, 'aria-label': 'Nombre de usuario' });
  const estado = el('span', { class: 'estado-usuario' });
  const marco = el('span', { class: 'con-arroba' }, el('span', { class: 'arroba' }, '@'), usuario, estado);
  let espera;
  usuario.addEventListener('input', () => {
    usuario.value = usuario.value.toLowerCase().replace(/\s/g, '_');
    clearTimeout(espera);
    poner(estado, '');
    marco.className = 'con-arroba';
    if (usuario.value === p.usuario) return;
    espera = setTimeout(async () => {
      try {
        const r = await peticion(`perfil.php?libre=${encodeURIComponent(usuario.value)}`);
        const bien = r.valido && r.libre;
        poner(estado, !r.valido ? '✗ No vale' : r.libre ? '✓ Libre' : '✗ Cogido');
        marco.className = `con-arroba ${bien ? 'bien' : 'mal'}`;
      } catch { /* sin conexión: se comprobará al guardar */ }
    }, 400);
  });

  /* Código de amigo */
  const codigo = el('b', { class: 'codigo-amigo' }, formatoCodigo(p.codigo));
  const nuevoCodigo = async () => {
    if (!await confirmar('¿Generar otro código?', 'El código y el enlace que tienes ahora dejarán de funcionar. Tus amigos no cambian.', 'Generar otro', { peligro: false })) return;
    try { aplicar(await peticion('perfil.php?accion=nuevo-codigo', { method: 'POST' })); aviso('Código nuevo'); } catch (e) { aviso(e.message, 'error'); }
  };

  /* Privacidad y bloqueados */
  const interruptor = (name, titulo, detalle, on) => el('label', { class: 'opcion-interruptor' },
    el('span', {}, el('span', { class: 'titulo' }, titulo), el('small', {}, detalle)),
    el('input', { type: 'checkbox', role: 'switch', name, checked: on }));
  const bloqueados = el('div', { class: 'bloqueados' });
  function pintarBloqueados() {
    poner(bloqueados, el('span', { class: 'titulo' }, 'Usuarios bloqueados ', el('span', { class: 'tenue' }, `· ${p.bloqueados.length}`)),
      p.bloqueados.length === 0 ? el('small', { class: 'tenue' }, 'No has bloqueado a nadie.')
        : p.bloqueados.map(b => el('div', { class: 'fila-persona' }, avatarUsuario(b, 32),
          el('div', { class: 'quien' }, el('b', {}, b.nombre, ' ', el('span', { class: 'arroba' }, `@${b.usuario}`))),
          el('button', { class: 'btn-mini sec', type: 'button', onclick: async () => {
            try {
              await peticion('amigos.php?accion=desbloquear', { method: 'POST', body: { usuario_id: b.id } });
              p.bloqueados = p.bloqueados.filter(x => x.id !== b.id);
              pintarBloqueados();
              aviso(`Has desbloqueado a ${b.nombre}`);
            } catch (e) { aviso(e.message, 'error'); }
          } }, 'Desbloquear'))));
  }

  pintarFoto();
  pintarBloqueados();
  poner(raiz,
    el('h1', {}, 'Editar perfil'),
    el('section', { class: 'tarjeta' },
      el('b', { class: 'tarjeta-titulo' }, 'Foto de perfil'),
      el('div', { class: 'fila-foto' }, caja, el('div', { class: 'botones-foto' }, subir, quitar, archivo)),
      el('span', { class: 'sub pequeño' }, 'O elige un Pokémon como avatar:'),
      buscador, rejilla, notaFoto),
    formulario([
      el('section', { class: 'tarjeta' },
        campoForm('Nombre', el('input', { name: 'nombre', value: p.nombre, required: true, maxlength: 30, autocomplete: 'nickname' })),
        el('label', { class: 'campo-form' }, el('span', {}, 'Nombre de usuario'), marco,
          el('small', { class: 'tenue' }, '3-20 letras (sin tildes), números o _. Con él te pueden buscar para añadirte.'))),
      el('section', { class: 'tarjeta' },
        el('span', { class: 'lbl' }, 'Código de amigo'),
        el('div', { class: 'fila' }, codigo, el('button', { class: 'btn-mini sec', type: 'button', onclick: nuevoCodigo }, 'Generar otro')),
        el('p', { class: 'nota' }, 'Si generas otro, el anterior y su enlace dejan de funcionar. Tus amigos no cambian.')),
      el('section', { class: 'tarjeta' },
        el('b', { class: 'tarjeta-titulo' }, 'Privacidad'),
        interruptor('acepta_solicitudes', 'Recibir solicitudes de amistad', 'Si lo quitas, nadie puede añadirte con tu código ni tu @', p.acepta_solicitudes),
        interruptor('muestra_en_linea', 'Mostrar si estoy en línea', 'Tus amigos ven el punto verde y "Hace 3 h"', p.muestra_en_linea),
        bloqueados),
    ], 'Guardar cambios', async d => {
      aplicar(await peticion('perfil.php', { method: 'POST', body: {
        nombre: d.nombre, usuario: d.usuario, acepta_solicitudes: d.acepta_solicitudes === 'on', muestra_en_linea: d.muestra_en_linea === 'on' } }));
      poner(estado, '');
      marco.className = 'con-arroba';
      aviso('Perfil guardado');
    }, { clase: 'form-perfil' }),
  );
}

/* ---------- Política de privacidad ---------- */

export function vistaPrivacidad(raiz) {
  poner(raiz,
    el('h1', {}, 'Política de privacidad'),
    textoPrivacidad(),
    // "Volver" vuelve a donde se estaba (si se llegó desde otra pantalla); si se abrió el enlace directamente, al inicio
    el('p', { class: 'centro' }, el('a', { href: '#/', onclick: e => { if (history.length > 1) { e.preventDefault(); history.back(); } } }, 'Volver')),
  );
}

function textoPrivacidad() {
  return el('div', { class: 'texto-legal' },
      el('p', {}, 'Poketon es un proyecto de fin de curso sin ánimo de lucro. Solo guardamos lo necesario para que tu cuenta funcione:'),
      el('p', {}, '• Tu email y tu nombre de entrenador, para identificarte.'),
      el('p', {}, '• Tu contraseña cifrada (nunca se guarda tal cual) o el identificador de tu cuenta de Google si entras con ella.'),
      el('p', {}, '• Tus equipos.'),
      el('p', {}, '• Si usas la parte online: tu nombre de usuario, tu foto o Pokémon de perfil, tus amigos, solicitudes y bloqueos, '
        + 'tus mensajes y los equipos que compartes, y tu última conexión (para "En línea"; puedes ocultarla en Editar perfil).'),
      el('p', {}, 'La foto se guarda recortada en 256 × 256 y sin datos de la cámara ni de ubicación. Tus amigos y quien abra tu enlace de amigo '
        + 've tu nombre, tu @usuario y tu foto. Los mensajes solo los ven las dos personas del chat. "Borrar chat" lo borra para ti; '
        + 'cuando los dos lo habéis borrado, se elimina del servidor.'),
      el('p', {}, 'No usamos cookies de seguimiento ni compartimos tus datos con nadie. El equipo que montes sin cuenta se queda en tu navegador.'),
      el('p', {}, 'Puedes borrar tu cuenta y todos tus datos (también tu foto, tus amigos y tus chats) cuando quieras desde "Mi cuenta → Eliminar cuenta".'),
      el('p', { class: 'nota' }, 'Proyecto fan no oficial. Pokémon © Nintendo / Creatures / Game Freak. Datos y sprites: PokeAPI. Sets: Smogon.'));
}
