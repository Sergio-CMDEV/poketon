<?php
/**
 * Amigos, solicitudes y bloqueos.
 *   GET  amigos.php                      → mi código, amigos (con último mensaje y sin leer) y solicitudes
 *   GET  amigos.php?codigo=7QK2M9FD      → SIN sesión: quién invita (pantalla del enlace de amigo)
 *   GET  amigos.php?usuario=marcos_vgc   → perfil de un amigo y los equipos que te ha compartido
 *   POST amigos.php?accion=solicitar     {destino: "PKT-7QK2-M9FD" | "@usuario"}
 *   POST amigos.php?accion=aceptar|rechazar|cancelar|quitar|bloquear|desbloquear   {usuario_id}
 *
 * Si el destino no existe, no acepta solicitudes o hay un bloqueo, el error es el mismo:
 * así nadie sabe si le han bloqueado ni puede ir probando qué códigos existen.
 */
require __DIR__ . '/../../src/lib.php';
require __DIR__ . '/../../src/online.php';

$accion = $_GET['accion'] ?? '';
const NADIE = 'No hay nadie con ese código o usuario, o no acepta solicitudes';

/* ---------- Enlace de amigo: funciona sin sesión ---------- */
if (metodo() === 'GET' && isset($_GET['codigo'])) {
    $yo = usuario_opcional();
    limite('buscar', 30, 3600, null, 'Demasiadas búsquedas. Prueba dentro de un rato');
    $codigo = leer_codigo((string) $_GET['codigo']);
    $u = $codigo ? (consulta('SELECT ' . COLUMNAS_PERFIL . ', u.acepta_solicitudes FROM usuario u WHERE u.codigo_amigo = ?', [$codigo])[0] ?? null) : null;
    if (!$u || ($yo && $yo !== (int) $u['id'] && hay_bloqueo($yo, (int) $u['id']))) {
        apuntar('buscar', null);
        error_api('Este enlace de amigo ya no vale', 404);
    }
    $id = (int) $u['id'];
    $relacion = null;   // qué botón enseñar
    if ($yo === $id) $relacion = 'tu';
    elseif ($yo && ($a = amistad($yo, $id))) $relacion = $a['estado'] === 'aceptada' ? 'amigos' : ((int) $a['solicitante_id'] === $yo ? 'enviada' : 'recibida');
    $p = perfil_publico($u);
    responder(['id' => $id, 'nombre' => $p['nombre'], 'usuario' => $p['usuario'], 'foto' => $p['foto'], 'avatar' => $p['avatar'],
               'codigo' => $codigo, 'acepta' => (bool) $u['acepta_solicitudes'], 'relacion' => $relacion]);
}

$yo = usuario_actual();
asegurar_perfil($yo);
marcar_conexion($yo);

/** Amigos y solicitudes, con el último mensaje de cada chat y los sin leer. */
function lista(int $yo): array
{
    $filas = consulta('SELECT ' . COLUMNAS_PERFIL . ', a.estado, a.solicitante_id,
                              UNIX_TIMESTAMP(a.aceptada_en) AS desde, UNIX_TIMESTAMP(a.creado_en) AS creada
                         FROM amistad a JOIN usuario u ON u.id = IF(a.usuario_a = ?, a.usuario_b, a.usuario_a)
                        WHERE a.usuario_a = ? OR a.usuario_b = ?', [$yo, $yo, $yo]);
    // Último mensaje visible (después de "Borrar chat") y sin leer de cada chat 1 a 1
    $chats = [];
    foreach (consulta('SELECT IF(c.usuario_a = ?, c.usuario_b, c.usuario_a) AS otro, m.autor_id, m.texto,
                              JSON_VALUE(m.equipo, \'$.nombre\') AS equipo, UNIX_TIMESTAMP(m.creado_en) AS fecha,
                              (SELECT COUNT(*) FROM mensaje x WHERE x.conversacion_id = c.id AND x.autor_id <> cm.usuario_id
                                  AND x.id > GREATEST(cm.ultimo_leido, cm.borrado_hasta)) AS sin_leer
                         FROM conversacion_miembro cm
                         JOIN conversacion c ON c.id = cm.conversacion_id AND c.usuario_a IS NOT NULL
                         LEFT JOIN mensaje m ON m.id = (SELECT MAX(y.id) FROM mensaje y WHERE y.conversacion_id = c.id AND y.id > cm.borrado_hasta)
                        WHERE cm.usuario_id = ?', [$yo, $yo]) as $c) {
        $chats[(int) $c['otro']] = $c;
    }
    $amigos = $recibidas = $enviadas = [];
    foreach ($filas as $f) {
        $p = perfil_publico($f);
        if ($f['estado'] === 'aceptada') {
            $c = $chats[$p['id']] ?? null;
            $p['desde'] = (int) $f['desde'];
            $p['sin_leer'] = (int) ($c['sin_leer'] ?? 0);
            $p['ultimo'] = $c && $c['fecha'] ? ['mio' => (int) $c['autor_id'] === $yo, 'texto' => $c['texto'], 'equipo' => $c['equipo'],
                                                 'fecha' => (int) $c['fecha']] : null;
            $amigos[] = $p;
        } else {
            $p = array_intersect_key($p, array_flip(['id', 'nombre', 'usuario', 'foto', 'avatar'])) + ['fecha' => (int) $f['creada']];
            if ((int) $f['solicitante_id'] === $yo) $enviadas[] = $p; else $recibidas[] = $p;
        }
    }
    // Primero los que tienen mensajes más recientes; luego por nombre
    usort($amigos, fn($a, $b) => [$b['ultimo']['fecha'] ?? 0, $a['nombre']] <=> [$a['ultimo']['fecha'] ?? 0, $b['nombre']]);
    usort($recibidas, fn($a, $b) => $b['fecha'] <=> $a['fecha']);
    usort($enviadas, fn($a, $b) => $b['fecha'] <=> $a['fecha']);
    $codigo = consulta('SELECT codigo_amigo FROM usuario WHERE id = ?', [$yo])[0]['codigo_amigo'];
    return ['codigo' => $codigo, 'amigos' => $amigos, 'recibidas' => $recibidas, 'enviadas' => $enviadas];
}

function aceptar(int $yo, int $otro): void
{
    if (num_amigos($yo) >= MAX_AMIGOS) error_api('Has llegado al máximo de ' . MAX_AMIGOS . ' amigos', 409);
    if (num_amigos($otro) >= MAX_AMIGOS) error_api('Esa persona ha llegado al máximo de amigos', 409);
    consulta("UPDATE amistad SET estado = 'aceptada', aceptada_en = NOW() WHERE usuario_a = ? AND usuario_b = ?", pareja($yo, $otro));
}

/** usuario_id del cuerpo: tiene que existir y no ser uno mismo. */
function otro(array $d, int $yo): int
{
    $id = $d['usuario_id'] ?? null;
    if (!is_int($id) || $id === $yo || !consulta('SELECT 1 FROM usuario WHERE id = ?', [$id])) error_api('Usuario no encontrado', 404);
    return $id;
}

switch (metodo() . ' ' . $accion) {

    case 'GET ':
        if (isset($_GET['usuario'])) {
            // Perfil de un amigo: solo si sois amigos
            $u = consulta('SELECT ' . COLUMNAS_PERFIL . ' FROM usuario u WHERE u.nombre_usuario = ?', [mb_strtolower((string) $_GET['usuario'])])[0] ?? null;
            $a = $u ? amistad($yo, (int) $u['id']) : null;
            if (!$u || ($a['estado'] ?? '') !== 'aceptada') error_api('No sois amigos', 404);
            $id = (int) $u['id'];
            $conv = conversacion_de($yo, $id);
            $equipos = [];
            if ($conv) {
                $borrado = (int) consulta('SELECT borrado_hasta FROM conversacion_miembro WHERE conversacion_id = ? AND usuario_id = ?', [$conv, $yo])[0]['borrado_hasta'];
                foreach (consulta('SELECT id, equipo, UNIX_TIMESTAMP(creado_en) AS fecha FROM mensaje
                                    WHERE conversacion_id = ? AND autor_id = ? AND equipo IS NOT NULL AND id > ? ORDER BY id DESC LIMIT 20',
                                  [$conv, $id, $borrado]) as $m) {
                    $equipos[] = ['mensaje_id' => (int) $m['id'], 'fecha' => (int) $m['fecha'], 'equipo' => json_decode($m['equipo'], true)];
                }
            }
            responder(perfil_publico($u) + ['desde' => (int) $a['desde'], 'equipos' => $equipos]);
        }
        responder(lista($yo));

    case 'POST solicitar':
        $d = cuerpo();
        $destino = trim((string) ($d['destino'] ?? ''));
        limite('solicitud', 20, 3600, $yo, 'Has mandado muchas solicitudes. Prueba dentro de un rato');
        limite('buscar', 30, 3600, null, 'Demasiadas búsquedas. Prueba dentro de un rato');
        apuntar('solicitud', $yo);
        // Código (PKT-XXXX-XXXX) o @usuario
        $u = null;
        $codigo = str_starts_with($destino, '@') ? null : leer_codigo($destino);
        if ($codigo) $u = consulta('SELECT id, acepta_solicitudes FROM usuario WHERE codigo_amigo = ?', [$codigo])[0] ?? null;
        if (!$u) {
            $nombre = mb_strtolower(ltrim($destino, '@'));
            if (preg_match(FORMATO_USUARIO, $nombre)) $u = consulta('SELECT id, acepta_solicitudes FROM usuario WHERE nombre_usuario = ?', [$nombre])[0] ?? null;
        }
        if ($u && (int) $u['id'] === $yo) error_api('Ese eres tú');
        if (!$u || hay_bloqueo($yo, (int) $u['id'])) { apuntar('buscar', null); error_api(NADIE, 404); }
        $otro = (int) $u['id'];
        $a = amistad($yo, $otro);
        if ($a && $a['estado'] === 'aceptada') error_api('Ya sois amigos', 409);
        if ($a && (int) $a['solicitante_id'] === $yo) error_api('Ya le has mandado una solicitud', 409);
        if ($a) {   // él ya te la había mandado: quedáis como amigos
            aceptar($yo, $otro);
            responder(['estado' => 'aceptada']);
        }
        if (!$u['acepta_solicitudes']) { apuntar('buscar', null); error_api(NADIE, 404); }
        $pendientes = consulta("SELECT COUNT(*) n FROM amistad WHERE solicitante_id = ? AND estado = 'pendiente'", [$yo])[0]['n'];
        if ($pendientes >= MAX_ENVIADAS) error_api('Tienes ' . MAX_ENVIADAS . ' solicitudes sin contestar. Cancela alguna para mandar más', 429);
        if (num_amigos($yo) >= MAX_AMIGOS) error_api('Has llegado al máximo de ' . MAX_AMIGOS . ' amigos', 409);
        [$x, $y] = pareja($yo, $otro);
        consulta('INSERT INTO amistad (usuario_a, usuario_b, solicitante_id) VALUES (?, ?, ?)', [$x, $y, $yo]);
        responder(['estado' => 'enviada'], 201);

    case 'POST aceptar':
        $otro = otro(cuerpo(), $yo);
        $a = amistad($yo, $otro);
        if (!$a || $a['estado'] !== 'pendiente' || (int) $a['solicitante_id'] !== $otro) error_api('Esa solicitud ya no existe', 404);
        aceptar($yo, $otro);
        responder(lista($yo));

    case 'POST rechazar':
    case 'POST cancelar':
        $otro = otro(cuerpo(), $yo);
        // Rechazar: la mandó él. Cancelar: la mandé yo. No se avisa a nadie.
        consulta("DELETE FROM amistad WHERE usuario_a = ? AND usuario_b = ? AND estado = 'pendiente' AND solicitante_id = ?",
                 [...pareja($yo, $otro), $accion === 'rechazar' ? $otro : $yo]);
        responder(lista($yo));

    case 'POST quitar':
        $otro = otro(cuerpo(), $yo);
        consulta("DELETE FROM amistad WHERE usuario_a = ? AND usuario_b = ? AND estado = 'aceptada'", pareja($yo, $otro));
        responder(lista($yo));

    case 'POST bloquear':
        $otro = otro(cuerpo(), $yo);
        consulta('INSERT IGNORE INTO bloqueo (usuario_id, bloqueado_id) VALUES (?, ?)', [$yo, $otro]);
        consulta('DELETE FROM amistad WHERE usuario_a = ? AND usuario_b = ?', pareja($yo, $otro));   // amistad o solicitud
        responder(lista($yo));

    case 'POST desbloquear':
        $otro = otro(cuerpo(), $yo);
        consulta('DELETE FROM bloqueo WHERE usuario_id = ? AND bloqueado_id = ?', [$yo, $otro]);
        responder(['ok' => true]);

    default:
        error_api('Acción no válida', 404);
}
