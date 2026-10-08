<?php
/**
 * Funciones comunes de la API. Está fuera de public/ para que no se pueda pedir desde el navegador.
 * Cada archivo de public/api/ empieza con:  require __DIR__ . '/../../src/lib.php';
 */
declare(strict_types=1);

$CONFIG = require __DIR__ . '/../config.php';

// Antes de nada: que PHP tenga lo que hace falta y que config.php esté completo.
// Si falta algo se dice claramente, en vez de un "Error 500" sin más.
foreach (['pdo_mysql', 'mbstring'] as $ext) {
    if (!extension_loaded($ext)) fallo_config("Falta activar la extensión $ext en php.ini (quita el ; de la línea extension=$ext)");
}
if (strlen((string) ($CONFIG['jwt_secret'] ?? '')) < 32) {
    fallo_config("Falta 'jwt_secret' en config.php (mínimo 32 caracteres). Mira config.example.php");
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
    $cabecera = b64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $datos = b64url(json_encode(['sub' => $usuarioId, 'exp' => time() + 7 * 24 * 3600]));   // 7 días
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
    return (int) $datos['sub'];
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
    $msg = "From: Poketon <{$s['from']}>\r\nTo: <$para>\r\n"
         . 'Subject: =?UTF-8?B?' . base64_encode($asunto) . "?=\r\n"
         . "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n"
         . str_replace("\n.", "\n..", $texto) . "\r\n.";
    $orden($msg, '250');
    fwrite($con, "QUIT\r\n");
    fclose($con);
}
