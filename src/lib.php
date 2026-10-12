<?php
/**
 * Funciones comunes de la API. Está fuera de public/ para que no se pueda pedir desde el navegador.
 * Cada archivo de public/api/ empieza con:  require __DIR__ . '/../../src/lib.php';
 */
declare(strict_types=1);

$CONFIG = require __DIR__ . '/../config.php';

// Los avisos de PHP nunca se pintan en la respuesta (romperían el JSON y enseñarían rutas del servidor): van al log
ini_set('display_errors', !empty($CONFIG['debug']) ? '1' : '0');
ini_set('log_errors', '1');

// Antes de nada: que PHP tenga lo que hace falta y que config.php esté completo.
// Si falta algo se dice claramente, en vez de un "Error 500" sin más.
foreach (['pdo_mysql', 'mbstring'] as $ext) {
    if (!extension_loaded($ext)) fallo_config("Falta activar la extensión $ext en php.ini (quita el ; de la línea extension=$ext)");
}
if (strlen((string) ($CONFIG['jwt_secret'] ?? '')) < 32) {
    fallo_config("Falta 'jwt_secret' en config.php (mínimo 32 caracteres). Mira config.example.php");
}
// La clave de ejemplo está en GitHub: con ella cualquiera podría firmar una sesión y entrar en cualquier cuenta
if (str_starts_with((string) $CONFIG['jwt_secret'], 'cambia-esto')) {
    fallo_config("Cambia 'jwt_secret' en config.php: la del ejemplo es pública. Genera una con: php -r \"echo bin2hex(random_bytes(32));\"");
}

function fallo_config(string $mensaje): never
{
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['error' => $mensaje], JSON_UNESCAPED_UNICODE);
    exit;
}

// Cualquier error no controlado: se registra en el log y el cliente recibe un 500 genérico
set_exception_handler(function (Throwable $e) {
    if ($e instanceof ErrorApi) responder(['error' => $e->getMessage()], $e->getCode());
    error_log((string) $e);
    // Falta una tabla o una columna: casi siempre es una migración sin ejecutar (db/migraciones/)
    if ($e instanceof PDOException && in_array($e->getCode(), ['42S02', '42S22'], true)) {
        responder(['error' => 'La base de datos no está al día: falta ejecutar una migración de db/migraciones/ (mira Despliegue)'], 500);
    }
    global $CONFIG;
    // En desarrollo ('debug' => true en config.php) se muestra el error real; en producción, nunca
    responder(['error' => !empty($CONFIG['debug']) ? $e->getMessage() : 'Error interno del servidor'], 500);
});

/** Error que se devuelve al cliente tal cual, con su código HTTP. */
final class ErrorApi extends RuntimeException {}

function error_api(string $mensaje, int $codigo = 400): never
{
    throw new ErrorApi($mensaje, $codigo);
}

/** Conexión a la BD (se crea una sola vez por petición). */
function db(): PDO
{
    global $CONFIG;
    static $pdo = null;
    return $pdo ??= new PDO(
        "mysql:host={$CONFIG['host']};port={$CONFIG['port']};dbname={$CONFIG['database']};charset=utf8mb4",
        $CONFIG['user'],
        $CONFIG['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
         PDO::ATTR_EMULATE_PREPARES => false],
    );
}

/** Ejecuta una consulta preparada y devuelve todas las filas. */
function consulta(string $sql, array $params = []): array
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st->fetchAll();
}

function responder(mixed $datos, int $estado = 200): never
{
    http_response_code($estado);
    header('Content-Type: application/json; charset=utf-8');
    if ($estado >= 400) header('Cache-Control: no-store');   // los errores no se guardan en caché
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Cuerpo de la petición (JSON) como array. */
function cuerpo(): array
{
    $datos = json_decode(file_get_contents('php://input') ?: '[]', true);
    if (!is_array($datos)) error_api('El cuerpo debe ser JSON');
    return $datos;
}

function metodo(): string
{
    return $_SERVER['REQUEST_METHOD'];
}

/**
 * CORS: deja llamar a la API desde la app de escritorio (Tauri) y otros orígenes de la lista.
 * La web servida desde el mismo dominio no lo necesita.
 */
function cors(): void
{
    global $CONFIG;
    $origen = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origen !== '' && in_array($origen, $CONFIG['cors'] ?? [], true)) {
        header("Access-Control-Allow-Origin: $origen");
        header('Vary: Origin');
        header('Access-Control-Allow-Headers: Content-Type, Authorization');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    }
    if (metodo() === 'OPTIONS') { http_response_code(204); exit; }
}
cors();

/* ---------------------------------------------------------------------
   Sesiones con JWT (JSON Web Token, firmado con HMAC-SHA256)
   El token viaja en la cabecera  Authorization: Bearer <token>
   --------------------------------------------------------------------- */

function b64url(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function b64url_dec(string $s): string { return base64_decode(strtr($s, '-_', '+/')); }

function crear_token(int $usuarioId): string
{
    global $CONFIG;
    // v = versión de sesión del usuario: si sube (cambio de contraseña…), este token deja de valer
    $version = (int) (consulta('SELECT version_sesion FROM usuario WHERE id = ?', [$usuarioId])[0]['version_sesion'] ?? 0);
    $cabecera = b64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $datos = b64url(json_encode(['sub' => $usuarioId, 'v' => $version, 'exp' => time() + 7 * 24 * 3600]));   // 7 días
    $firma = b64url(hash_hmac('sha256', "$cabecera.$datos", $CONFIG['jwt_secret'], true));
    return "$cabecera.$datos.$firma";
}

/** Devuelve el id del usuario que hace la petición, o corta con 401 si no hay sesión válida. */
function usuario_actual(): int
{
    global $CONFIG;
    $cab = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(\S+)$/', $cab, $m)) error_api('Inicia sesión', 401);
    $partes = explode('.', $m[1]);
    if (count($partes) !== 3) error_api('Sesión no válida', 401);
    [$c, $d, $f] = $partes;
    $esperada = b64url(hash_hmac('sha256', "$c.$d", $CONFIG['jwt_secret'], true));
    $datos = json_decode(b64url_dec($d), true);
    if (!hash_equals($esperada, $f) || !is_array($datos) || ($datos['exp'] ?? 0) < time()) {
        error_api('La sesión ha caducado. Vuelve a iniciar sesión', 401);
    }
    // La cuenta tiene que existir y la sesión ser de su versión actual (si no, se cerró al cambiar la contraseña)
    $version = consulta('SELECT version_sesion FROM usuario WHERE id = ?', [(int) $datos['sub']])[0]['version_sesion'] ?? null;
    if ($version === null) error_api('La cuenta ya no existe', 401);
    if ((int) $version !== (int) ($datos['v'] ?? 0)) error_api('La sesión se ha cerrado. Vuelve a iniciar sesión', 401);
    return (int) $datos['sub'];
}

/**
 * Texto que escribe el usuario y ven otros (nombres, mensajes, equipos), sin caracteres invisibles: los de control,
 * los que dan la vuelta al texto (con ellos "‮gnp.exe" se ve como "exe.png") y los espacios de ancho cero.
 * El de unión (U+200D) se deja: lo usan los emojis compuestos.
 */
function texto_limpio(string $s, bool $multilinea = false): string
{
    $s = preg_replace('/[\x{200B}\x{200E}\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]/u', '', str_replace("\t", ' ', $s)) ?? '';
    return trim(preg_replace($multilinea ? '/[^\P{Cc}\n]/u' : '/\p{Cc}/u', '', $s) ?? '');
}

/** IP de quien hace la petición (detrás del proxy, nginx la pone con real_ip). */
function ip(): string
{
    return substr($_SERVER['REMOTE_ADDR'] ?? '', 0, 45);
}

/* ---------------------------------------------------------------------
   Email por SMTP con SSL (puerto 465): Gmail, Brevo, Resend…
   Sin SMTP configurado (desarrollo) el email se escribe en el log de PHP.
   --------------------------------------------------------------------- */

function enviar_email(string $para, string $asunto, string $texto): void
{
    global $CONFIG;
    $s = $CONFIG['smtp'] ?? null;
    if (!$s || empty($s['host'])) {
        error_log("[email a $para] $asunto\n$texto");
        return;
    }
    $con = stream_socket_client("ssl://{$s['host']}:{$s['port']}", $errno, $errstr, 15);
    if (!$con) throw new RuntimeException("SMTP: $errstr");
    $leer = function () use ($con) {
        $r = '';
        while (($l = fgets($con, 515)) !== false) { $r .= $l; if ($l[3] === ' ') break; }
        return $r;
    };
    $orden = function (string $cmd, string $espera) use ($con, $leer) {
        fwrite($con, "$cmd\r\n");
        $r = $leer();
        if (!str_starts_with($r, $espera)) throw new RuntimeException("SMTP: $r");
    };
    $leer();
    $orden('EHLO poketon', '250');
    $orden('AUTH LOGIN', '334');
    $orden(base64_encode($s['user']), '334');
    $orden(base64_encode($s['password']), '235');
    $orden("MAIL FROM:<{$s['from']}>", '250');
    $orden("RCPT TO:<$para>", '250');
    $orden('DATA', '354');
    $dominio = substr(strrchr($s['from'], '@') ?: '@poketon.online', 1);
    $cuerpo = preg_replace("/\r?\n/", "\r\n", $texto);                 // los servidores SMTP piden CRLF
    $msg = "From: Poketon <{$s['from']}>\r\nTo: <$para>\r\n"
         . 'Subject: =?UTF-8?B?' . base64_encode($asunto) . "?=\r\n"
         . 'Date: ' . date('r') . "\r\n"
         . 'Message-ID: <' . bin2hex(random_bytes(12)) . "@$dominio>\r\n"
         . "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n"
         . str_replace("\r\n.", "\r\n..", $cuerpo) . "\r\n.";
    $orden($msg, '250');
    fwrite($con, "QUIT\r\n");
    fclose($con);
}
