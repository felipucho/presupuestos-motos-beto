use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use crate::motor::evaluar;
use crate::{ab, cba, changomax, ficha_url, neumat};

const VENTANA_PAGINA: &str = "cba-pagina";

/// Abre el artículo en el sitio, en una ventana de la app que ya tiene la sesión.
#[tauri::command]
pub async fn cba_abrir(app: AppHandle, codigo: String) -> Result<(), String> {
  let url = ficha_url(&codigo);
  if let Some(v) = app.get_webview_window(VENTANA_PAGINA) {
    v.navigate(url).map_err(|e| e.to_string())?;
    return v.set_focus().map_err(|e| e.to_string());
  }
  WebviewWindowBuilder::new(&app, VENTANA_PAGINA, WebviewUrl::External(url))
    .title("CM")
    .inner_size(1100.0, 800.0)
    .center()
    .build()
    .map(|_| ())
    .map_err(|e| e.to_string())
}

// JS que devuelve 'NO' mientras no haya sesión. Ab guarda el token en el almacenamiento de la página: se devuelve
// para usarlo desde la app (si ya venció, cuenta como sin sesión).
const LISTO_CBA: &str = "(() => location.pathname.toLowerCase().endsWith('/homeinterno.aspx') ? 'SI' : 'NO')()";
const LISTO_NEUMAT: &str = "(() => [...document.links].some((a) => a.pathname.toLowerCase().endsWith('/logout')) ? 'SI' : 'NO')()";
const LISTO_CHANGOMAX: &str = "(() => window.prestashop && prestashop.customer && prestashop.customer.is_logged ? 'SI' : 'NO')()";
const LISTO_AB: &str = r#"(() => { try {
  const t = localStorage.getItem('token');
  if (!t) return 'NO';
  const exp = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp;
  if (exp && exp * 1000 < Date.now()) return 'NO';
  return JSON.stringify({ token: t, usuario: localStorage.getItem('user') || '', lista: localStorage.getItem('listPrice') || '1', descuentos: JSON.parse(localStorage.getItem('descuento') || '[]') });
} catch (e) { return 'NO'; } })()"#;

/// Login a mano en la página del proveedor, en una ventana aparte sin acceso a la app: para cuando no hay cuenta
/// guardada o la entrada automática falla. Se cierra sola al detectar la sesión y, al cerrarse (sola o a mano),
/// avisa a la app con el evento `sesion-proveedor`.
#[tauri::command]
pub async fn prov_login(app: AppHandle, proveedor: String) -> Result<(), String> {
  let (nombre, url, listo) = match proveedor.as_str() {
    "cba" => ("CM", cba("login.aspx"), LISTO_CBA),
    "neumat" => ("PIRELLI", url(&format!("{}/Home", neumat::SITIO))?, LISTO_NEUMAT),
    "ab" => ("AB", url("https://ventas.fundasparamotosab.com.ar/")?, LISTO_AB),
    "changomax" => ("MAX", url(&format!("{}/inicio-sesion?back=my-account", changomax::SITIO))?, LISTO_CHANGOMAX),
    _ => return Err(format!("Proveedor desconocido: {proveedor}")),
  };
  let etiqueta = format!("login-{proveedor}");
  if let Some(v) = app.get_webview_window(&etiqueta) {
    return v.set_focus().map_err(|e| e.to_string());
  }
  let ventana = WebviewWindowBuilder::new(&app, &etiqueta, WebviewUrl::External(url))
    .title(format!("{nombre} · Iniciar sesión"))
    .inner_size(900.0, 720.0)
    .center()
    .build()
    .map_err(|e| format!("No se pudo abrir la ventana de ingreso: {e}"))?;
  let app_evt = app.clone();
  let id = proveedor.clone();
  ventana.on_window_event(move |e| {
    if let WindowEvent::Destroyed = e {
      let _ = app_evt.emit("sesion-proveedor", &id);
    }
  });
  tauri::async_runtime::spawn(async move {
    // Mira si ya entró hasta que se cierre la ventana.
    while let Some(v) = app.get_webview_window(&etiqueta) {
      match evaluar(&v, listo).await.as_deref() {
        None | Some("NO") => tokio::time::sleep(Duration::from_millis(500)).await,
        Some(datos) => {
          if proveedor == "ab" {
            ab::usar(datos);
          }
          let _ = v.close();
          break;
        }
      }
    }
  });
  Ok(())
}

fn url(s: &str) -> Result<Url, String> {
  Url::parse(s).map_err(|e| e.to_string())
}
