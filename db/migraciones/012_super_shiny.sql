-- Shiny en los equipos: pasa de sí/no a 0 normal, 1 shiny y 2 super shiny (solo Pokémon Añil).
-- Los equipos que ya había se quedan igual (FALSE = 0, TRUE = 1). Se puede ejecutar más de una vez.
ALTER TABLE miembro_equipo MODIFY shiny TINYINT UNSIGNED NOT NULL DEFAULT 0;
