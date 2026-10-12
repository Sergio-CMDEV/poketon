<?php
/**
 * Chats 1 a 1 entre amigos (requiere sesión). Tiempo real por sondeo: la web pregunta cada 3 s con el chat
 * abierto y cada 30 s en el resto de la app (para el número de "Amigos").
 *   GET  mensajes.php?resumen                         → {sin_leer, solicitudes}
 *   GET  mensajes.php?con=<id>|usuario=<nombre>       → últimos 30 mensajes y datos del chat
 *        &desde=<id>                                  → solo los nuevos (máx. 50)
 *        &antes=<id>                                  → 30 anteriores
 *   POST mensajes.php            {con, texto}         → envía un mensaje (solo a amigos)
 *   POST mensajes.php            {con, equipo_id}     → comparte una copia de uno de tus equipos
 *   POST mensajes.php?accion=borrar {con}             → "Borrar chat": lo borra para ti
 */
require __DIR__ . '/../../src/lib.php';
require __DIR__ . '/../../src/online.php';
require __DIR__ . '/../../src/equipos.php';

$yo = usuario_actual();
marcar_conexion($yo);
$accion = $_GET['accion'] ?? '';

const MENSAJES_POR_MINUTO = 20;
const MAX_TEXTO = 1000;

/** Mensaje tal como lo pinta la web. El texto se pinta siempre como texto (nunca HTML). */
function mensaje_publico(array $m, int $yo): array
{
    return ['id' => (int) $m['id'], 'mio' => (int) $m['autor_id'] === $yo, 'texto' => $m['texto'],
            'equipo' => $m['equipo'] === null ? null : json_decode($m['equipo'], true), 'fecha' => (int) $m['fecha']];
}

/** El otro del chat: por id (con=) o por nombre de usuario (usuario=). Tiene que haber relación (amigos o chat). */
function otro_del_chat(int $yo, array $d): array
{
    if (isset($d['usuario'])) {
        $u = consulta('SELECT ' . COLUMNAS_PERFIL . ' FROM usuario u WHERE u.nombre_usuario = ?', [mb_strtolower((string) $d['usuario'])])[0] ?? null;
    } else {
        $id = filter_var($d['con'] ?? null, FILTER_VALIDATE_INT);
        $u = $id ? usuario_por_id($id) : null;
    }
    if (!$u || (int) $u['id'] === $yo || (!son_amigos($yo, (int) $u['id']) && !conversacion_de($yo, (int) $u['id']))) {
        error_api('Chat no encontrado', 404);
    }
    return $u;
}

/** Hasta dónde ha borrado y leído cada uno. */
function estado_chat(int $conv, int $yo): array
{
    $mio = ['borrado' => 0, 'leido' => 0];
    $suyo = 0;
    foreach (consulta('SELECT usuario_id, ultimo_leido, borrado_hasta FROM conversacion_miembro WHERE conversacion_id = ?', [$conv]) as $m) {
        if ((int) $m['usuario_id'] === $yo) $mio = ['borrado' => (int) $m['borrado_hasta'], 'leido' => (int) $m['ultimo_leido']];
        else $suyo = (int) $m['ultimo_leido'];
    }
    return [$mio, $suyo];
}

if (metodo() === 'GET' && isset($_GET['resumen'])) {
    // Solo cuentan los chats con amigos: si le has bloqueado o ya no sois amigos, su chat no sale en la lista
    // y ese número no se podría quitar nunca
    $sin_leer = consulta("SELECT COUNT(*) n FROM conversacion_miembro cm
                            JOIN conversacion c ON c.id = cm.conversacion_id
                            JOIN amistad a ON a.usuario_a = c.usuario_a AND a.usuario_b = c.usuario_b AND a.estado = 'aceptada'
                            JOIN mensaje x ON x.conversacion_id = cm.conversacion_id AND x.autor_id <> cm.usuario_id
                                          AND x.id > GREATEST(cm.ultimo_leido, cm.borrado_hasta)
                           WHERE cm.usuario_id = ?", [$yo])[0]['n'];
    $solicitudes = consulta("SELECT COUNT(*) n FROM amistad WHERE (usuario_a = ? OR usuario_b = ?) AND estado = 'pendiente' AND solicitante_id <> ?",
                            [$yo, $yo, $yo])[0]['n'];
    responder(['sin_leer' => (int) $sin_leer, 'solicitudes' => (int) $solicitudes]);
}

switch (metodo() . ' ' . $accion) {

    case 'GET ':
        $u = otro_del_chat($yo, $_GET);
        $otro = (int) $u['id'];
        $amigos = son_amigos($yo, $otro) && !hay_bloqueo($yo, $otro);
        $conv = conversacion_de($yo, $otro);
        $mensajes = [];
        $hay_mas = false;
        $visto = 0;
        if ($conv) {
            [$mio, $visto] = estado_chat($conv, $yo);
            $cols = 'SELECT id, autor_id, texto, equipo, UNIX_TIMESTAMP(creado_en) AS fecha FROM mensaje WHERE conversacion_id = ?';
            $desde = (int) ($_GET['desde'] ?? 0);
            $antes = (int) ($_GET['antes'] ?? 0);
            if ($desde > 0) {
                $mensajes = consulta("$cols AND id > ? ORDER BY id LIMIT 50", [$conv, max($desde, $mio['borrado'])]);
            } else {
                $filas = $antes > 0
                    ? consulta("$cols AND id < ? AND id > ? ORDER BY id DESC LIMIT 31", [$conv, $antes, $mio['borrado']])
                    : consulta("$cols AND id > ? ORDER BY id DESC LIMIT 31", [$conv, $mio['borrado']]);
                $hay_mas = count($filas) > 30;
                $mensajes = array_reverse(array_slice($filas, 0, 30));
            }
            // Leídos: todo lo que hay en el chat hasta ahora
            consulta('UPDATE conversacion_miembro SET ultimo_leido = GREATEST(ultimo_leido, (SELECT COALESCE(MAX(id), 0) FROM mensaje WHERE conversacion_id = ?))
                       WHERE conversacion_id = ? AND usuario_id = ?', [$conv, $conv, $yo]);
        }
        responder([
            'amigo' => perfil_publico($u),
            'mensajes' => array_map(fn($m) => mensaje_publico($m, $yo), $mensajes),
            'hay_mas' => $hay_mas,
            'visto_hasta' => $visto,   // los míos con id <= este ya los ha visto
            'puede_escribir' => $amigos,
        ]);

    case 'POST ':
        $d = cuerpo();
        $u = otro_del_chat($yo, $d);
        $otro = (int) $u['id'];
        if (!son_amigos($yo, $otro) || hay_bloqueo($yo, $otro)) error_api('Ya no sois amigos: no puedes escribir en este chat', 403);
        $n = consulta('SELECT COUNT(*) n FROM mensaje WHERE autor_id = ? AND creado_en > NOW() - INTERVAL 1 MINUTE', [$yo])[0]['n'];
        if ($n >= MENSAJES_POR_MINUTO) error_api('Vas muy rápido. Espera un momento', 429);
        $texto = null;
        $equipo = null;
        if (isset($d['equipo_id'])) {
            // La copia se lee de la BD, no de lo que mande el navegador: así solo se comparten equipos tuyos y válidos
            $eq = array_values(array_filter(listar_equipos($yo), fn($e) => $e['id'] === $d['equipo_id']))[0] ?? null;
            if (!$eq) error_api('Equipo no encontrado', 404);
            $equipo = json_encode(['nombre' => $eq['nombre'], 'generacion' => $eq['generacion'], 'miembros' => $eq['miembros']], JSON_UNESCAPED_UNICODE);
        } else {
            $texto = trim(str_replace("\r", '', (string) ($d['texto'] ?? '')));
            if ($texto === '') error_api('El mensaje está vacío');
            if (mb_strlen($texto) > MAX_TEXTO) error_api('Máximo ' . MAX_TEXTO . ' caracteres');
        }
        $conv = conversacion_de($yo, $otro, true);
        consulta('INSERT INTO mensaje (conversacion_id, autor_id, texto, equipo) VALUES (?, ?, ?, ?)', [$conv, $yo, $texto, $equipo]);
        $id = (int) db()->lastInsertId();
        consulta('UPDATE conversacion_miembro SET ultimo_leido = ? WHERE conversacion_id = ? AND usuario_id = ?', [$id, $conv, $yo]);
        $m = consulta('SELECT id, autor_id, texto, equipo, UNIX_TIMESTAMP(creado_en) AS fecha FROM mensaje WHERE id = ?', [$id])[0];
        responder(mensaje_publico($m, $yo), 201);

    case 'POST borrar':
        // Solo para ti: el otro sigue viendo el chat. Lo que habéis borrado los dos se elimina del servidor.
        $u = otro_del_chat($yo, cuerpo());
        $conv = conversacion_de($yo, (int) $u['id']);
        if ($conv) {
            $max = (int) consulta('SELECT COALESCE(MAX(id), 0) m FROM mensaje WHERE conversacion_id = ?', [$conv])[0]['m'];
            consulta('UPDATE conversacion_miembro SET borrado_hasta = ?, ultimo_leido = GREATEST(ultimo_leido, ?) WHERE conversacion_id = ? AND usuario_id = ?',
                     [$max, $max, $conv, $yo]);
            $min = (int) consulta('SELECT MIN(borrado_hasta) m FROM conversacion_miembro WHERE conversacion_id = ?', [$conv])[0]['m'];
            if ($min > 0) consulta('DELETE FROM mensaje WHERE conversacion_id = ? AND id <= ?', [$conv, $min]);
        }
        responder(['ok' => true]);

    default:
        error_api('Acción no válida', 404);
}
