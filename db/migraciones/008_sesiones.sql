-- Sesiones que se pueden cerrar desde el servidor (fallo M3 del informe).
-- Cada sesión (JWT) lleva la "versión de sesión" del usuario. Al cambiar o restablecer la contraseña, o con
-- "Cerrar sesión en los demás dispositivos", sube en 1 y las sesiones anteriores dejan de valer.
-- También un índice para contar los intentos de login por IP (fallo M1).
-- Uso: ejecútalo una vez como root en phpMyAdmin (no hace falta volver a importar).
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS version_sesion INT UNSIGNED NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS intento_ip ON intento_login (ip, fecha);
