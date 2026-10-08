// Sin consola negra detrás de la ventana en la versión final
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};

#[derive(serde::Serialize)]
struct Codigo {
    codigo: String,
    estado: String,
}

/// Login con Google desde la app. Google no deja iniciar sesión dentro de la ventana de una app,
/// así que se abre la web en el navegador (#/escritorio/<puerto>/<estado>) y se espera en
/// http://127.0.0.1:<puerto> a que la web, ya con la sesión iniciada, mande un código de 2 minutos.
/// El JavaScript de la app cambia ese código por su sesión (auth.php?accion=canjear-escritorio).
#[tauri::command]
async fn entrar_con_navegador(ventana: tauri::WebviewWindow, web: String) -> Result<Codigo, String> {
    let resultado = tauri::async_runtime::spawn_blocking(move || esperar_codigo(&web))
        .await
        .map_err(|e| e.to_string())?;
    if resultado.is_ok() {
        // Vuelve a poner delante la ventana de Poketon
        let _ = ventana.unminimize();
        let _ = ventana.set_focus();
    }
    resultado
}

fn esperar_codigo(web: &str) -> Result<Codigo, String> {
    // "estado": número aleatorio que solo conocen la app y la web que ha abierto (evita que otra página
    // le cuele a la app un código suyo)
    let mut azar = [0u8; 24];
    getrandom::fill(&mut azar).map_err(|e| e.to_string())?;
    let estado: String = azar.iter().map(|b| format!("{b:02x}")).collect();

    let escucha = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;   // puerto libre cualquiera
    let puerto = escucha.local_addr().map_err(|e| e.to_string())?.port();
    escucha.set_nonblocking(true).map_err(|e| e.to_string())?;

    open::that(format!("{web}#/escritorio/{puerto}/{estado}"))
        .map_err(|e| format!("No se pudo abrir el navegador: {e}"))?;

    let limite = Instant::now() + Duration::from_secs(300);   // 5 minutos para iniciar sesión
    loop {
        match escucha.accept() {
            Ok((mut conexion, _)) => {
                let _ = conexion.set_nonblocking(false);
                let _ = conexion.set_read_timeout(Some(Duration::from_secs(5)));
                // Primera línea de la petición: "GET /?codigo=...&estado=... HTTP/1.1"
                let mut linea = String::new();
                let _ = BufReader::new(&conexion).read_line(&mut linea);
                let ruta = linea.split_whitespace().nth(1).unwrap_or("").to_string();
                let parametro = |nombre: &str| {
                    ruta.split(['?', '&'])
                        .find_map(|p| p.strip_prefix(&format!("{nombre}=")))
                        .map(decodificar)
                };
                let codigo = parametro("codigo");
                let correcto = codigo.is_some() && parametro("estado").as_deref() == Some(estado.as_str());
                let pagina = if correcto { PAGINA_LISTO } else { PAGINA_ERROR };
                let _ = write!(
                    conexion,
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    pagina.len(),
                    pagina
                );
                if correcto {
                    return Ok(Codigo { codigo: codigo.unwrap_or_default(), estado });
                }
                // Otras peticiones (p. ej. el favicon) se contestan y se sigue esperando
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() > limite {
                    return Err("Se acabó el tiempo. Vuelve a pulsar «Continuar con Google»".into());
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

/// "%2B" → "+", "+" → " " (lo justo para los parámetros de la URL)
fn decodificar(texto: &str) -> String {
    let hex = |c: u8| (c as char).to_digit(16).map(|v| v as u8);
    let b = texto.as_bytes();
    let mut salida = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match (b[i], b.get(i + 1).copied().and_then(hex), b.get(i + 2).copied().and_then(hex)) {
            (b'%', Some(alto), Some(bajo)) => { salida.push(alto * 16 + bajo); i += 3; }
            (b'+', _, _) => { salida.push(b' '); i += 1; }
            (c, _, _) => { salida.push(c); i += 1; }
        }
    }
    String::from_utf8_lossy(&salida).into_owned()
}

const PAGINA_LISTO: &str = "<!doctype html><meta charset=utf-8><title>Poketon</title>\
<body style=\"font-family:Segoe UI,system-ui,sans-serif;background:#eef1f4;display:grid;place-items:center;height:100vh;margin:0\">\
<div style=\"background:#fff;border:1px solid #d5dbe3;border-radius:12px;padding:24px 28px;text-align:center\">\
<b style=\"font-size:18px\">Poke<span style=\"color:#d1343f\">ton</span></b><p>Sesión iniciada. Ya puedes cerrar esta pestaña y volver a la app.</p></div>\
<script>setTimeout(()=>window.close(),1500)</script>";

const PAGINA_ERROR: &str = "<!doctype html><meta charset=utf-8><title>Poketon</title>\
<p style=\"font-family:Segoe UI,system-ui,sans-serif\">Este enlace no es de tu app de Poketon. Vuelve a pulsar «Continuar con Google» en la app.</p>";

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![entrar_con_navegador])
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar Poketon");
}
