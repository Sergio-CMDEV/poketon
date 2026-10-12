<?php
// Copia este archivo como config.php y pon tus datos. config.php NO se sube a GitHub.
return [
    // true solo en tu PC: muestra el error real en la web. En el servidor, false
    'debug' => false,

    // Base de datos
    'host'     => '192.168.1.X',     // IP local de la máquina de la base de datos
    'port'     => 3306,
    'database' => 'tablatipos_dev',
    'user'     => 'tablatipos',
    'password' => 'cambia-esto',

    // Clave para firmar las sesiones. Genera una con:  php -r "echo bin2hex(random_bytes(32));"
    'jwt_secret' => 'cambia-esto-por-una-clave-larga-y-aleatoria',

    // Dirección de la web (para el enlace de "recuperar contraseña")
    'app_url' => 'http://localhost:8000',   // en el servidor: https://poketon.online

    // Orígenes que pueden llamar a la API desde otro sitio: la app de escritorio (Tauri)
    'cors' => ['http://tauri.localhost', 'tauri://localhost'],

    // Opcional: inicio de sesión con Google (Client ID de Google Cloud Console). Vacío = botón oculto
    'google_client_id' => '',

    // Opcional: envío de emails por SMTP con SSL (puerto 465). Vacío = el email se escribe en el log
    'smtp' => [
        'host'     => '',               // smtp.gmail.com, smtp-relay.brevo.com…
        'port'     => 465,
        'user'     => '',
        'password' => '',               // en Gmail: una "contraseña de aplicación"
        'from'     => '',
    ],
];
