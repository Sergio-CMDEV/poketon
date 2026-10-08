-- Añade los nombres en inglés (para importar/exportar texto de Pokémon Showdown)
-- y el identificador de cada Pokémon ('raichu-alola').
-- Uso: ejecútalo una vez sobre la BD que ya existe y después vuelve a ejecutar php db/import.php
ALTER TABLE especie    ADD COLUMN IF NOT EXISTS nombre_en VARCHAR(40) NOT NULL DEFAULT '' AFTER nombre;
ALTER TABLE pokemon    ADD COLUMN IF NOT EXISTS identificador VARCHAR(60) NULL AFTER especie_id;
ALTER TABLE habilidad  ADD COLUMN IF NOT EXISTS nombre_en VARCHAR(40) NOT NULL DEFAULT '' AFTER nombre;
ALTER TABLE movimiento ADD COLUMN IF NOT EXISTS nombre_en VARCHAR(40) NOT NULL DEFAULT '' AFTER nombre;
ALTER TABLE objeto     ADD COLUMN IF NOT EXISTS nombre_en VARCHAR(60) NOT NULL DEFAULT '' AFTER nombre;
ALTER TABLE naturaleza ADD COLUMN IF NOT EXISTS nombre_en VARCHAR(20) NOT NULL DEFAULT '' AFTER nombre;
