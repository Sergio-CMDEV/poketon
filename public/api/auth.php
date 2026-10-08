<?php
/**
 * Cuentas de usuario. La acción va en ?accion=
 *   POST registro         {nombre, email, password, privacidad: "si"} → {token, usuario}
 *   POST login            {email, password}               → {token, usuario}
 *   POST google           {credential}                    → {token, usuario}
 *   POST vincular-google  {credential}                    → usuario (con sesión iniciada)
 *   GET  yo                                               → usuario de la sesión
 *   POST cambiar-password {actual, nueva}
 *   POST borrar-cuenta    {confirmacion: "ELIMINAR"}
 *   POST recuperar        {email}                         → envía el enlace por email
 *   POST restablecer      {token, password}
 */
require __DIR__ . '/../../src/lib.php';

$accion = $_GET['accion'] ?? '';
$d = metodo() === 'POST' ? cuerpo() : [];

function usuario_publico(int $id): array
{
    $u = consulta('SELECT id, nombre, email, password_hash IS NOT NULL AS tiene_password, google_id IS NOT NULL AS tiene_google
                     FROM usuario WHERE id = ?', [$id])[0] ?? null;
    if (!$u) error_api('La cuenta no existe', 401);
    return ['id' => (int) $u['id'], 'nombre' => $u['nombre'], 'email' => $u['email'],
            'tiene_password' => (bool) $u['tiene_password'], 'tiene_google' => (bool) $u['tiene_google']];
}

function sesion(int $id): never
{
    responder(['token' => crear_token($id), 'usuario' => usuario_publico($id)]);
}

function validar_password(string $p): void
{
    if (mb_strlen($p) < 8) error_api('La contraseña debe tener al menos 8 caracteres');
}

/*
 * Contraseñas con Argon2id (lo que recomienda OWASP), con sus parámetros mínimos: 19 MB de memoria,
 * 2 pasadas y 1 hilo. Además de tiempo gasta memoria, así que probar millones de contraseñas con
 * tarjetas gráficas sale muy caro. Las cuentas antiguas (bcrypt) siguen entrando: password_verify
 * reconoce el algoritmo por el propio hash, y al iniciar sesión se vuelven a guardar en Argon2id.
 */
const OPCIONES_HASH = ['memory_cost' => 19456, 'time_cost' => 2, 'threads' => 1];
if (!defined('PASSWORD_ARGON2ID')) fallo_config('Este PHP no tiene Argon2id (hace falta PHP 7.3+ compilado con argon2 o sodium)');

function hash_password(string $password): string
{
    return password_hash($password, PASSWORD_ARGON2ID, OPCIONES_HASH);
}

function email_valido(string $email): string
{
    $email = mb_strtolower(trim($email));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) error_api('El email no es válido');
    return $email;
}

/** Pregunta a Google si el token de "Continuar con Google" es auténtico. Devuelve sus datos (sub, email, name…). */
function verificar_google(string $credential): array
{
    global $CONFIG;
    if (empty($CONFIG['google_client_id'])) error_api('El inicio con Google no está configurado', 501);
    $info = json_decode(@file_get_contents('https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($credential)) ?: 'null', true);
    if (!$info || ($info['aud'] ?? '') !== $CONFIG['google_client_id'] || ($info['email_verified'] ?? '') !== 'true') {
        error_api('No se pudo verificar la cuenta de Google', 401);
    }
    return $info;
}

switch ($accion) {

    case 'registro':
        $nombre = trim((string) ($d['nombre'] ?? ''));
        $email = email_valido((string) ($d['email'] ?? ''));
        $password = (string) ($d['password'] ?? '');
        if ($nombre === '' || mb_strlen($nombre) > 30) error_api('El nombre debe tener entre 1 y 30 caracteres');
        validar_password($password);
        if (($d['privacidad'] ?? '') !== 'si') error_api('Tienes que aceptar la política de privacidad');
        if (consulta('SELECT 1 FROM usuario WHERE email = ?', [$email])) error_api('Ya existe una cuenta con ese email', 409);
        consulta('INSERT INTO usuario (email, nombre, password_hash) VALUES (?, ?, ?)',
                 [$email, $nombre, hash_password($password)]);
        sesion((int) db()->lastInsertId());

    case 'login':
        $email = mb_strtolower(trim((string) ($d['email'] ?? '')));
        $ip = $_SERVER['REMOTE_ADDR'] ?? '';
        // Bloqueo: 5 intentos fallidos en 15 minutos
        $fallos = consulta('SELECT COUNT(*) n FROM intento_login WHERE email = ? AND fecha > NOW() - INTERVAL 15 MINUTE', [$email])[0]['n'];
        if ($fallos >= 5) error_api('Demasiados intentos. Prueba de nuevo en 15 minutos', 429);
        $u = consulta('SELECT id, password_hash FROM usuario WHERE email = ?', [$email])[0] ?? null;
        if (!$u || !$u['password_hash'] || !password_verify((string) ($d['password'] ?? ''), $u['password_hash'])) {
            consulta('INSERT INTO intento_login (email, ip) VALUES (?, ?)', [$email, $ip]);
            error_api('Email o contraseña incorrectos', 401);   // sin decir cuál de los dos falla
        }
        consulta('DELETE FROM intento_login WHERE email = ?', [$email]);
        // Hash antiguo (bcrypt) o con otros parámetros: se guarda de nuevo en Argon2id
        if (password_needs_rehash($u['password_hash'], PASSWORD_ARGON2ID, OPCIONES_HASH)) {
            consulta('UPDATE usuario SET password_hash = ? WHERE id = ?', [hash_password((string) $d['password']), $u['id']]);
        }
        sesion((int) $u['id']);

    case 'google':
        $info = verificar_google((string) ($d['credential'] ?? ''));
        $email = mb_strtolower($info['email']);
        // Ya entró antes con Google
        $u = consulta('SELECT id FROM usuario WHERE google_id = ?', [$info['sub']])[0] ?? null;
        if ($u) sesion((int) $u['id']);
        // Hay una cuenta con ese email creada con contraseña: no se vincula sola. Al registrarse no se verifica el email,
        // así que podría haberla creado otra persona con tu email; quien sea el dueño entra con su contraseña
        // (o la recupera, que el email le llega a él) y vincula Google desde "Mi cuenta".
        if (consulta('SELECT 1 FROM usuario WHERE email = ?', [$email])) {
            error_api('Ya hay una cuenta con ese email. Entra con tu contraseña y vincula Google desde Mi cuenta', 409);
        }
        consulta('INSERT INTO usuario (email, nombre, google_id) VALUES (?, ?, ?)',
                 [$email, mb_substr($info['given_name'] ?? $info['name'] ?? 'Entrenador', 0, 30), $info['sub']]);
        sesion((int) db()->lastInsertId());

    case 'vincular-google':
        $id = usuario_actual();
        $info = verificar_google((string) ($d['credential'] ?? ''));
        if (consulta('SELECT 1 FROM usuario WHERE google_id = ? AND id <> ?', [$info['sub'], $id])) {
            error_api('Esa cuenta de Google ya está vinculada a otro usuario', 409);
        }
        consulta('UPDATE usuario SET google_id = ? WHERE id = ?', [$info['sub'], $id]);
        responder(usuario_publico($id));

    case 'yo':
        responder(usuario_publico(usuario_actual()));

    case 'cambiar-password':
        $id = usuario_actual();
        $hash = consulta('SELECT password_hash FROM usuario WHERE id = ?', [$id])[0]['password_hash'] ?? null;
        if ($hash && !password_verify((string) ($d['actual'] ?? ''), $hash)) error_api('La contraseña actual no es correcta', 403);
        validar_password((string) ($d['nueva'] ?? ''));
        consulta('UPDATE usuario SET password_hash = ? WHERE id = ?', [hash_password((string) $d['nueva']), $id]);
        responder(['ok' => true]);

    case 'borrar-cuenta':
        $id = usuario_actual();
        if (($d['confirmacion'] ?? '') !== 'ELIMINAR') error_api('Escribe ELIMINAR para confirmar');
        consulta('DELETE FROM usuario WHERE id = ?', [$id]);   // equipos y tokens se borran en cascada
        responder(['ok' => true]);

    case 'recuperar':
        $email = mb_strtolower(trim((string) ($d['email'] ?? '')));
        $u = consulta('SELECT id FROM usuario WHERE email = ?', [$email])[0] ?? null;
        if ($u) {
            $token = bin2hex(random_bytes(32));   // va en el enlace; en la BD solo se guarda su hash
            consulta('INSERT INTO token_recuperacion (usuario_id, token_hash, caduca_en) VALUES (?, ?, NOW() + INTERVAL 30 MINUTE)',
                     [$u['id'], hash('sha256', $token)]);
            $enlace = rtrim($CONFIG['app_url'] ?? 'http://localhost:8000', '/') . "/#/restablecer/$token";
            enviar_email($email, 'Recupera tu contraseña',
                "Hola,\n\nPara crear una contraseña nueva abre este enlace (caduca en 30 minutos):\n$enlace\n\nSi no lo has pedido tú, ignora este email.");
        }
        responder(['ok' => true]);   // misma respuesta exista o no la cuenta, para no revelar qué emails están registrados

    case 'restablecer':
        $t = consulta('SELECT id, usuario_id FROM token_recuperacion
                        WHERE token_hash = ? AND usado_en IS NULL AND caduca_en > NOW()',
                      [hash('sha256', (string) ($d['token'] ?? ''))])[0] ?? null;
        if (!$t) error_api('El enlace ha caducado o ya se usó. Pide uno nuevo', 410);
        validar_password((string) ($d['password'] ?? ''));
        consulta('UPDATE usuario SET password_hash = ? WHERE id = ?', [hash_password((string) $d['password']), $t['usuario_id']]);
        consulta('UPDATE token_recuperacion SET usado_en = NOW() WHERE id = ?', [$t['id']]);
        sesion((int) $t['usuario_id']);

    default:
        error_api('Acción no válida', 404);
}
