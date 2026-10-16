<?php
/**
 * Lectura de equipos, compartida por equipos.php y mensajes.php (equipos compartidos en el chat).
 */
declare(strict_types=1);

/** Todos los equipos del usuario con sus miembros. */
function listar_equipos(int $usuario): array
{
    $equipos = consulta('SELECT id, nombre, generacion, randomlocke, actualizado_en FROM equipo WHERE usuario_id = ? ORDER BY actualizado_en DESC', [$usuario]);
    if (!$equipos) return [];
    $miembros = consulta(
        'SELECT m.*, (SELECT GROUP_CONCAT(mm.movimiento_id ORDER BY mm.slot) FROM miembro_movimiento mm WHERE mm.miembro_id = m.id) AS movs
           FROM miembro_equipo m JOIN equipo e ON e.id = m.equipo_id
          WHERE e.usuario_id = ? ORDER BY m.posicion', [$usuario]);
    $porEquipo = [];
    foreach ($miembros as $m) {
        $stats = ['ps', 'ataque', 'defensa', 'at_esp', 'def_esp', 'velocidad'];
        $porEquipo[$m['equipo_id']][] = [
            'posicion' => (int) $m['posicion'], 'pokemon_id' => $m['pokemon_id'] === null ? null : (int) $m['pokemon_id'],
            'anil_id' => $m['anil_id'], 'apodo' => $m['apodo'],
            'objeto_id' => $m['objeto_id'] === null ? null : (int) $m['objeto_id'],
            'habilidad_id' => $m['habilidad_id'] === null ? null : (int) $m['habilidad_id'],
            'naturaleza_id' => $m['naturaleza_id'] === null ? null : (int) $m['naturaleza_id'],
            'teratipo_id' => $m['teratipo_id'] === null ? null : (int) $m['teratipo_id'],
            'nivel' => (int) $m['nivel'], 'shiny' => (int) $m['shiny'],
            'evs' => array_map(fn($s) => (int) $m["ev_$s"], $stats),
            'ivs' => array_map(fn($s) => (int) $m["iv_$s"], $stats),
            'movimientos' => $m['movs'] ? array_map('intval', explode(',', $m['movs'])) : [],
        ];
    }
    return array_map(fn($e) => [
        'id' => (int) $e['id'], 'nombre' => $e['nombre'], 'generacion' => (int) $e['generacion'], 'randomlocke' => (bool) $e['randomlocke'],
        'actualizado_en' => $e['actualizado_en'], 'miembros' => $porEquipo[$e['id']] ?? [],
    ], $equipos);
}
