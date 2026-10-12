<?php
/**
 * Mi perfil del online (requiere sesión).
 *   GET    perfil.php                      → nombre, @usuario, código, foto/avatar, privacidad, bloqueados, nº de amigos
 *   GET    perfil.php?libre=rojo           → {libre, valido} para el "✓ Libre" mientras se escribe
 *   POST   perfil.php                      {nombre, usuario, acepta_solicitudes, muestra_en_linea} → guarda
 *   POST   perfil.php?accion=avatar        {avatar: id de Pokémon | null} → Pokémon como avatar (quita la foto)
 *   POST   perfil.php?accion=foto          multipart "foto" (ya recortada en el navegador) → la guarda (3 al día)
 *   DELETE perfil.php?accion=foto          → quita la foto
 *   POST   perfil.php?accion=nuevo-codigo  → código de amigo nuevo (el anterior deja de valer)
 */
require __DIR__ . '/../../src/lib.php';
require __DIR__ . '/../../src/online.php';

$yo = usuario_actual();
asegurar_perfil($yo);
marcar_conexion($yo);
$accion = $_GET['accion'] ?? '';

const FOTOS_AL_DIA = 3;
const FOTO_MAX_BYTES = 1024 * 1024;   // llega ya recortada (512 × 512 WebP, unos 30-80 KB)
const FOTO_LADO = 256;

function mi_perfil(int $yo): array
{
    $u = consulta('SELECT id, nombre, nombre_usuario, codigo_amigo, foto, avatar_pokemon_id, acepta_solicitudes, muestra_en_linea
                     FROM usuario WHERE id = ?', [$yo])[0];
    $bloqueados = consulta('SELECT ' . COLUMNAS_PERFIL . ' FROM bloqueo b JOIN usuario u ON u.id = b.bloqueado_id
                             WHERE b.usuario_id = ? ORDER BY b.creado_en DESC', [$yo]);
    $fotos = consulta("SELECT COUNT(*) n FROM accion_limitada WHERE tipo = 'foto' AND usuario_id = ? AND fecha > NOW() - INTERVAL 1 DAY", [$yo])[0]['n'];
    return [
        'id' => (int) $u['id'], 'nombre' => $u['nombre'], 'usuario' => $u['nombre_usuario'], 'codigo' => $u['codigo_amigo'],
        'foto' => $u['foto'], 'avatar' => $u['avatar_pokemon_id'] === null ? null : (int) $u['avatar_pokemon_id'],
        'acepta_solicitudes' => (bool) $u['acepta_solicitudes'], 'muestra_en_linea' => (bool) $u['muestra_en_linea'],
        'amigos' => num_amigos($yo),
        'fotos_restantes' => max(0, FOTOS_AL_DIA - (int) $fotos),
        'bloqueados' => array_map(fn($b) => array_intersect_key(perfil_publico($b), array_flip(['id', 'nombre', 'usuario', 'foto', 'avatar'])), $bloqueados),
    ];
}

switch (metodo() . ' ' . $accion) {

    case 'GET ':
        if (isset($_GET['libre'])) {
            $n = (string) $_GET['libre'];
            $valido = (bool) preg_match(FORMATO_USUARIO, $n);
            $libre = $valido && !consulta('SELECT 1 FROM usuario WHERE nombre_usuario = ? AND id <> ?', [$n, $yo]);
            responder(['valido' => $valido, 'libre' => $libre]);
        }
        responder(mi_perfil($yo));

    case 'POST ':
        $d = cuerpo();
        $nombre = trim((string) ($d['nombre'] ?? ''));
        $usuario = mb_strtolower(trim((string) ($d['usuario'] ?? '')));
        if ($nombre === '' || mb_strlen($nombre) > 30) error_api('El nombre debe tener entre 1 y 30 caracteres');
        if (!preg_match(FORMATO_USUARIO, $usuario)) error_api('El nombre de usuario lleva de 3 a 20 letras (sin tildes), números o _');
        if (consulta('SELECT 1 FROM usuario WHERE nombre_usuario = ? AND id <> ?', [$usuario, $yo])) error_api('Ese nombre de usuario ya es de otra persona', 409);
        consulta('UPDATE usuario SET nombre = ?, nombre_usuario = ?, acepta_solicitudes = ?, muestra_en_linea = ? WHERE id = ?',
                 [$nombre, $usuario, empty($d['acepta_solicitudes']) ? 0 : 1, empty($d['muestra_en_linea']) ? 0 : 1, $yo]);
        responder(mi_perfil($yo));

    case 'POST avatar':
        $d = cuerpo();
        $avatar = $d['avatar'] ?? null;
        if ($avatar !== null && (!is_int($avatar) || !consulta('SELECT 1 FROM pokemon WHERE id = ?', [$avatar]))) error_api('Ese Pokémon no existe');
        $antes = consulta('SELECT foto FROM usuario WHERE id = ?', [$yo])[0]['foto'];
        consulta('UPDATE usuario SET avatar_pokemon_id = ?, foto = NULL WHERE id = ?', [$avatar, $yo]);
        borrar_foto($antes);
        responder(mi_perfil($yo));

    case 'POST foto':
        if (!extension_loaded('gd') || !function_exists('imagewebp')) error_api('Falta la extensión gd (con WebP) en el PHP del servidor', 501);
        limite('foto', FOTOS_AL_DIA, 86400, $yo, 'Solo puedes cambiar la foto ' . FOTOS_AL_DIA . ' veces al día. Prueba mañana');
        $f = $_FILES['foto'] ?? null;
        if ($f && in_array($f['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) error_api('La foto pesa demasiado', 413);
        if (!$f || $f['error'] !== UPLOAD_ERR_OK) error_api('No ha llegado la foto');
        if ($f['size'] > FOTO_MAX_BYTES) error_api('La foto pesa demasiado', 413);
        // Que sea de verdad una imagen (no basta con la extensión ni con lo que diga el navegador)
        $info = @getimagesize($f['tmp_name']);
        if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) error_api('El archivo no es una imagen JPG, PNG o WebP');
        [$w, $h] = $info;
        if (abs($w - $h) > 2 || $w < 128 || $w > 1024) error_api('La foto tiene que llegar recortada en cuadrado');
        $origen = @imagecreatefromstring((string) file_get_contents($f['tmp_name']));
        if (!$origen) error_api('No se pudo leer la imagen');
        // Se vuelve a dibujar en una imagen nueva: se pierde todo lo que no es la imagen (EXIF con GPS, código escondido…)
        $foto = imagecreatetruecolor(FOTO_LADO, FOTO_LADO);
        imagefill($foto, 0, 0, imagecolorallocate($foto, 255, 255, 255));   // fondo blanco si la imagen tenía transparencia
        imagecopyresampled($foto, $origen, 0, 0, 0, 0, FOTO_LADO, FOTO_LADO, $w, $h);
        if (!is_dir(DIR_FOTOS)) @mkdir(DIR_FOTOS, 0755, true);
        if (!is_writable(DIR_FOTOS)) error_api('El servidor no puede guardar fotos (la carpeta public/fotos no tiene permiso de escritura)', 500);
        $nombre = bin2hex(random_bytes(16)) . '.webp';
        if (!imagewebp($foto, DIR_FOTOS . "/$nombre", 85)) error_api('No se pudo guardar la foto', 500);
        $antes = consulta('SELECT foto FROM usuario WHERE id = ?', [$yo])[0]['foto'];
        consulta('UPDATE usuario SET foto = ? WHERE id = ?', [$nombre, $yo]);
        borrar_foto($antes);
        apuntar('foto', $yo);
        responder(mi_perfil($yo));

    case 'DELETE foto':
        $antes = consulta('SELECT foto FROM usuario WHERE id = ?', [$yo])[0]['foto'];
        consulta('UPDATE usuario SET foto = NULL WHERE id = ?', [$yo]);
        borrar_foto($antes);
        responder(mi_perfil($yo));

    case 'POST nuevo-codigo':
        consulta('UPDATE usuario SET codigo_amigo = ? WHERE id = ?', [codigo_nuevo(), $yo]);
        responder(mi_perfil($yo));

    default:
        error_api('Acción no válida', 404);
}
