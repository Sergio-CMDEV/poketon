<?php
/**
 * Funciones del online (perfil, amigos y chats) que usan perfil.php, amigos.php, mensajes.php y auth.php.
 * Tablas: ver db/migraciones/007_amigos.sql.
 */
declare(strict_types=1);

const ALFABETO_CODIGO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   // sin 0/O ni 1/I/L, que se confunden al dictarlo
const DIR_FOTOS = __DIR__ . '/../public/fotos';
const MAX_AMIGOS = 200;
const MAX_ENVIADAS = 30;          // solicitudes enviadas sin contestar
const EN_LINEA_SEGUNDOS = 120;    // "En línea" si ha dado señales en los últimos 2 minutos

/* ---------- Código de amigo y nombre de usuario ---------- */

function codigo_nuevo(): string
{
    do {
        $c = '';
        for ($i = 0; $i < 8; $i++) $c .= ALFABETO_CODIGO[random_int(0, strlen(ALFABETO_CODIGO) - 1)];
    } while (consulta('SELECT 1 FROM usuario WHERE codigo_amigo = ?', [$c]));
    return $c;
}

/** "PKT-7QK2-M9FD", "7qk2m9fd" o "7QK2 M9FD" → "7QK2M9FD". null si no tiene forma de código. */
function leer_codigo(string $texto): ?string
{
    $c = strtoupper(preg_replace('/[\s-]/', '', trim($texto)));
    if (str_starts_with($c, 'PKT')) $c = substr($c, 3);
    return preg_match('/^[2-9A-HJKMNP-Z]{8}$/', $c) ? $c : null;
}

const FORMATO_USUARIO = '/^[a-z0-9_]{3,20}$/';

/** @usuario libre a partir del nombre: "Lucía Pérez" → "lucia_perez" (o "lucia_perez27" si ya existe). */
function nombre_usuario_desde(string $nombre): string
{
    $s = strtr(mb_strtolower(trim($nombre)), ['á' => 'a', 'à' => 'a', 'ä' => 'a', 'â' => 'a', 'é' => 'e', 'è' => 'e', 'ë' => 'e', 'ê' => 'e',
        'í' => 'i', 'ì' => 'i', 'ï' => 'i', 'î' => 'i', 'ó' => 'o', 'ò' => 'o', 'ö' => 'o', 'ô' => 'o', 'ú' => 'u', 'ù' => 'u', 'ü' => 'u',
        'û' => 'u', 'ñ' => 'n', 'ç' => 'c', ' ' => '_', '-' => '_', '.' => '_']);
    $s = substr(trim(preg_replace('/_+/', '_', preg_replace('/[^a-z0-9_]/', '', $s)), '_'), 0, 15);
    if (strlen($s) < 3) $s = 'entrenador';
    $prueba = $s;
    while (consulta('SELECT 1 FROM usuario WHERE nombre_usuario = ?', [$prueba])) $prueba = $s . random_int(10, 9999);
    return $prueba;
}

/** Las cuentas de antes del online no tienen @usuario ni código: se crean la primera vez que hacen falta. */
function asegurar_perfil(int $id): void
{
    $u = consulta('SELECT nombre, nombre_usuario, codigo_amigo FROM usuario WHERE id = ?', [$id])[0] ?? null;
    if (!$u || ($u['nombre_usuario'] && $u['codigo_amigo'])) return;
    consulta('UPDATE usuario SET nombre_usuario = COALESCE(nombre_usuario, ?), codigo_amigo = COALESCE(codigo_amigo, ?) WHERE id = ?',
             [nombre_usuario_desde($u['nombre']), codigo_nuevo(), $id]);
}

/** "En línea" / "Hace 3 h": se apunta como mucho una vez por minuto (la web pregunta cada 30 s). */
function marcar_conexion(int $id): void
{
    consulta('UPDATE usuario SET ultima_conexion = NOW()
               WHERE id = ? AND (ultima_conexion IS NULL OR ultima_conexion < NOW() - INTERVAL 1 MINUTE)', [$id]);
}

/** Columnas de usuario que hacen falta para perfil_publico(). */
const COLUMNAS_PERFIL = 'u.id, u.nombre, u.nombre_usuario, u.foto, u.avatar_pokemon_id, u.muestra_en_linea,
    TIMESTAMPDIFF(SECOND, u.ultima_conexion, NOW()) AS hace';

/** Lo que ven los demás de un usuario. La última conexión solo si la enseña. */
function perfil_publico(array $u): array
{
    $muestra = (bool) $u['muestra_en_linea'] && $u['hace'] !== null;
    return [
        'id' => (int) $u['id'], 'nombre' => $u['nombre'], 'usuario' => $u['nombre_usuario'],
        'foto' => $u['foto'], 'avatar' => $u['avatar_pokemon_id'] === null ? null : (int) $u['avatar_pokemon_id'],
        'en_linea' => $muestra && (int) $u['hace'] <= EN_LINEA_SEGUNDOS,
        'hace' => $muestra ? (int) $u['hace'] : null,   // segundos desde su última conexión
    ];
}

function usuario_por_id(int $id): ?array
{
    return consulta('SELECT ' . COLUMNAS_PERFIL . ', u.acepta_solicitudes FROM usuario u WHERE u.id = ?', [$id])[0] ?? null;
}

/* ---------- Relaciones ---------- */

/** [menor, mayor]: así se guarda cada pareja en amistad y conversacion. */
function pareja(int $a, int $b): array
{
    return $a < $b ? [$a, $b] : [$b, $a];
}

function amistad(int $a, int $b): ?array
{
    return consulta('SELECT solicitante_id, estado, UNIX_TIMESTAMP(aceptada_en) AS desde FROM amistad WHERE usuario_a = ? AND usuario_b = ?',
                    pareja($a, $b))[0] ?? null;
}

function son_amigos(int $a, int $b): bool
{
    return (amistad($a, $b)['estado'] ?? '') === 'aceptada';
}

/** ¿Alguno de los dos ha bloqueado al otro? */
function hay_bloqueo(int $a, int $b): bool
{
    return (bool) consulta('SELECT 1 FROM bloqueo WHERE (usuario_id = ? AND bloqueado_id = ?) OR (usuario_id = ? AND bloqueado_id = ?)', [$a, $b, $b, $a]);
}

function num_amigos(int $id): int
{
    return (int) consulta("SELECT COUNT(*) n FROM amistad WHERE (usuario_a = ? OR usuario_b = ?) AND estado = 'aceptada'", [$id, $id])[0]['n'];
}

/** Chat 1 a 1 de una pareja. Con $crear, si no existe se crea con sus dos miembros. */
function conversacion_de(int $a, int $b, bool $crear = false): ?int
{
    [$x, $y] = pareja($a, $b);
    $c = consulta('SELECT id FROM conversacion WHERE usuario_a = ? AND usuario_b = ?', [$x, $y])[0]['id'] ?? null;
    if ($c || !$crear) return $c === null ? null : (int) $c;
    consulta('INSERT IGNORE INTO conversacion (usuario_a, usuario_b) VALUES (?, ?)', [$x, $y]);   // IGNORE: si dos lo crean a la vez
    $c = (int) consulta('SELECT id FROM conversacion WHERE usuario_a = ? AND usuario_b = ?', [$x, $y])[0]['id'];
    consulta('INSERT IGNORE INTO conversacion_miembro (conversacion_id, usuario_id) VALUES (?, ?), (?, ?)', [$c, $x, $c, $y]);
    return $c;
}

/* ---------- Límites (tabla accion_limitada) ---------- */

/** Corta con 429 si ya se ha hecho $max veces en los últimos $segundos (por usuario o, sin usuario, por IP). */
function limite(string $tipo, int $max, int $segundos, ?int $usuario, string $mensaje): void
{
    [$col, $val] = $usuario === null ? ['ip', ip()] : ['usuario_id', $usuario];
    $n = consulta("SELECT COUNT(*) n FROM accion_limitada WHERE tipo = ? AND $col = ? AND fecha > NOW() - INTERVAL ? SECOND",
                  [$tipo, $val, $segundos])[0]['n'];
    if ($n >= $max) error_api($mensaje, 429);
}

function apuntar(string $tipo, ?int $usuario): void
{
    consulta('INSERT INTO accion_limitada (usuario_id, ip, tipo) VALUES (?, ?, ?)', [$usuario, ip(), $tipo]);
    if (random_int(1, 20) === 1) consulta('DELETE FROM accion_limitada WHERE fecha < NOW() - INTERVAL 2 DAY');   // limpieza de vez en cuando
}

/* ---------- Fotos ---------- */

function borrar_foto(?string $foto): void
{
    if ($foto && preg_match('/^[a-f0-9]{32}\.webp$/', $foto) && is_file(DIR_FOTOS . "/$foto")) @unlink(DIR_FOTOS . "/$foto");
}

/** Sesión opcional (la pantalla del enlace de amigo funciona sin cuenta). */
function usuario_opcional(): ?int
{
    if (empty($_SERVER['HTTP_AUTHORIZATION']) && empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) return null;
    try { return usuario_actual(); } catch (ErrorApi) { return null; }
}
