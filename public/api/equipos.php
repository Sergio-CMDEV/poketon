<?php
/**
 * Equipos del usuario (requiere sesión).
 *   GET    /api/equipos.php          → lista de sus equipos con sus miembros
 *   POST   /api/equipos.php          → crea un equipo       {nombre?, generacion, miembros: [...]}
 *   PUT    /api/equipos.php?id=3     → reemplaza un equipo  (mismo formato)
 *   DELETE /api/equipos.php?id=3     → borra un equipo
 *
 * Miembro: {posicion 1-8 (7-8 reservas), pokemon_id, apodo?, objeto_id?, habilidad_id?, naturaleza_id?,
 *           teratipo_id?, nivel?, shiny?, evs: [6], ivs: [6], movimientos: [ids, máx. 4]}
 */
require __DIR__ . '/../../src/lib.php';

const MAX_EQUIPOS = 8;
$usuario = usuario_actual();
$id = isset($_GET['id']) ? filter_var($_GET['id'], FILTER_VALIDATE_INT) : null;

/** Comprueba que el equipo existe y es del usuario. */
function equipo_propio(?int $id, int $usuario): int
{
    if (!$id || !consulta('SELECT 1 FROM equipo WHERE id = ? AND usuario_id = ?', [$id, $usuario])) {
        error_api('Equipo no encontrado', 404);   // también si es de otro usuario: no se revela que existe
    }
    return $id;
}

/** Valida y normaliza los miembros que llegan del frontend. */
function miembros_validos(mixed $miembros): array
{
    if (!is_array($miembros) || count($miembros) < 1) error_api('Añade al menos un Pokémon');
    if (count($miembros) > 8) error_api('Máximo 6 titulares y 2 reservas');
    $int = fn($v, $min, $max, $campo) => (is_int($v) && $v >= $min && $v <= $max) ? $v : error_api("Valor no válido en $campo");
    $opc = fn($v) => $v === null || $v === '' ? null : (is_int($v) ? $v : error_api('Id no válido'));
    $out = [];
    $posiciones = [];
    foreach ($miembros as $m) {
        $pos = $int($m['posicion'] ?? null, 1, 8, 'posicion');
        if (isset($posiciones[$pos])) error_api('Hay dos Pokémon en la misma posición');
        $posiciones[$pos] = true;
        $evs = $m['evs'] ?? [0, 0, 0, 0, 0, 0];
        $ivs = $m['ivs'] ?? [31, 31, 31, 31, 31, 31];
        if (!is_array($evs) || count($evs) !== 6 || !is_array($ivs) || count($ivs) !== 6) error_api('EVs/IVs no válidos');
        foreach ($evs as $e) $int($e, 0, 252, 'EVs');
        foreach ($ivs as $v) $int($v, 0, 31, 'IVs');
        if (array_sum($evs) > 510) error_api('Los EVs no pueden sumar más de 510');
        $movs = $m['movimientos'] ?? [];
        if (!is_array($movs) || count($movs) > 4) error_api('Máximo 4 movimientos');
        $out[] = [
            'posicion' => $pos,
            'pokemon_id' => $int($m['pokemon_id'] ?? null, 1, 65535, 'pokemon_id'),
            'apodo' => isset($m['apodo']) && $m['apodo'] !== '' ? mb_substr((string) $m['apodo'], 0, 20) : null,
            'objeto_id' => $opc($m['objeto_id'] ?? null),
            'habilidad_id' => $opc($m['habilidad_id'] ?? null),
            'naturaleza_id' => $opc($m['naturaleza_id'] ?? null),
            'teratipo_id' => $opc($m['teratipo_id'] ?? null),
            'nivel' => $int($m['nivel'] ?? 100, 1, 100, 'nivel'),
            'shiny' => !empty($m['shiny']) ? 1 : 0,
            'evs' => $evs, 'ivs' => $ivs,
            'movimientos' => array_values(array_map(fn($x) => $int($x, 1, 65535, 'movimientos'), $movs)),
        ];
    }
    return $out;
}

/** Nombre libre "Equipo N" con el N más bajo que no use ya. */
function nombre_libre(int $usuario): string
{
    $usados = array_column(consulta('SELECT nombre FROM equipo WHERE usuario_id = ?', [$usuario]), 'nombre');
    for ($n = 1; in_array("Equipo $n", $usados, true); $n++);
    return "Equipo $n";
}

/** Inserta los miembros (y sus movimientos) de un equipo. */
function guardar_miembros(int $equipoId, array $miembros): void
{
    $ins = db()->prepare('INSERT INTO miembro_equipo (equipo_id, posicion, pokemon_id, apodo, objeto_id, habilidad_id, naturaleza_id,
        teratipo_id, nivel, shiny, ev_ps, ev_ataque, ev_defensa, ev_at_esp, ev_def_esp, ev_velocidad,
        iv_ps, iv_ataque, iv_defensa, iv_at_esp, iv_def_esp, iv_velocidad)
        VALUES (?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?,?)');
    $mov = db()->prepare('INSERT INTO miembro_movimiento (miembro_id, slot, movimiento_id) VALUES (?, ?, ?)');
    foreach ($miembros as $m) {
        $ins->execute([$equipoId, $m['posicion'], $m['pokemon_id'], $m['apodo'], $m['objeto_id'], $m['habilidad_id'],
                       $m['naturaleza_id'], $m['teratipo_id'], $m['nivel'], $m['shiny'], ...$m['evs'], ...$m['ivs']]);
        $miembroId = (int) db()->lastInsertId();
        foreach ($m['movimientos'] as $i => $movId) $mov->execute([$miembroId, $i + 1, $movId]);
    }
}

/** Todos los equipos del usuario con sus miembros. */
function listar(int $usuario): array
{
    $equipos = consulta('SELECT id, nombre, generacion, actualizado_en FROM equipo WHERE usuario_id = ? ORDER BY actualizado_en DESC', [$usuario]);
    if (!$equipos) return [];
    $miembros = consulta(
        'SELECT m.*, (SELECT GROUP_CONCAT(mm.movimiento_id ORDER BY mm.slot) FROM miembro_movimiento mm WHERE mm.miembro_id = m.id) AS movs
           FROM miembro_equipo m JOIN equipo e ON e.id = m.equipo_id
          WHERE e.usuario_id = ? ORDER BY m.posicion', [$usuario]);
    $porEquipo = [];
    foreach ($miembros as $m) {
        $stats = ['ps', 'ataque', 'defensa', 'at_esp', 'def_esp', 'velocidad'];
        $porEquipo[$m['equipo_id']][] = [
            'posicion' => (int) $m['posicion'], 'pokemon_id' => (int) $m['pokemon_id'], 'apodo' => $m['apodo'],
            'objeto_id' => $m['objeto_id'] === null ? null : (int) $m['objeto_id'],
            'habilidad_id' => $m['habilidad_id'] === null ? null : (int) $m['habilidad_id'],
            'naturaleza_id' => $m['naturaleza_id'] === null ? null : (int) $m['naturaleza_id'],
            'teratipo_id' => $m['teratipo_id'] === null ? null : (int) $m['teratipo_id'],
            'nivel' => (int) $m['nivel'], 'shiny' => (bool) $m['shiny'],
            'evs' => array_map(fn($s) => (int) $m["ev_$s"], $stats),
            'ivs' => array_map(fn($s) => (int) $m["iv_$s"], $stats),
            'movimientos' => $m['movs'] ? array_map('intval', explode(',', $m['movs'])) : [],
        ];
    }
    return array_map(fn($e) => [
        'id' => (int) $e['id'], 'nombre' => $e['nombre'], 'generacion' => (int) $e['generacion'],
        'actualizado_en' => $e['actualizado_en'], 'miembros' => $porEquipo[$e['id']] ?? [],
    ], $equipos);
}

switch (metodo()) {
    case 'GET':
        responder(listar($usuario));

    case 'POST':
    case 'PUT':
        $d = cuerpo();
        $miembros = miembros_validos($d['miembros'] ?? null);
        $gen = filter_var($d['generacion'] ?? 9, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 9]]) ?: 9;
        $nombre = mb_substr(trim((string) ($d['nombre'] ?? '')), 0, 40);
        if (metodo() === 'PUT') $id = equipo_propio($id ?: null, $usuario);
        elseif (consulta('SELECT COUNT(*) n FROM equipo WHERE usuario_id = ?', [$usuario])[0]['n'] >= MAX_EQUIPOS) {
            error_api('Has llegado al máximo de ' . MAX_EQUIPOS . ' equipos. Borra uno para guardar este', 409);
        }
        if ($nombre === '') $nombre = nombre_libre($usuario);
        if (consulta('SELECT 1 FROM equipo WHERE usuario_id = ? AND nombre = ? AND id <> ?', [$usuario, $nombre, $id ?? 0])) {
            error_api('Ya tienes un equipo con ese nombre', 409);
        }
        db()->beginTransaction();
        try {
            if (metodo() === 'PUT') {
                consulta('UPDATE equipo SET nombre = ?, generacion = ? WHERE id = ?', [$nombre, $gen, $id]);
                consulta('DELETE FROM miembro_equipo WHERE equipo_id = ?', [$id]);   // sus movimientos caen en cascada
            } else {
                consulta('INSERT INTO equipo (usuario_id, nombre, generacion) VALUES (?, ?, ?)', [$usuario, $nombre, $gen]);
                $id = (int) db()->lastInsertId();
            }
            guardar_miembros($id, $miembros);
            db()->commit();
        } catch (PDOException $e) {
            db()->rollBack();
            if ($e->getCode() === '23000') error_api('Algún Pokémon, objeto o movimiento no existe');
            throw $e;
        }
        $equipo = array_values(array_filter(listar($usuario), fn($e) => $e['id'] === $id))[0];
        responder($equipo, metodo() === 'POST' ? 201 : 200);

    case 'DELETE':
        consulta('DELETE FROM equipo WHERE id = ?', [equipo_propio($id ?: null, $usuario)]);
        responder(['ok' => true]);

    default:
        error_api('Método no permitido', 405);
}
