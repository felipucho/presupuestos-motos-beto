use std::sync::Mutex;
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

const CBA: &str = "https://cbamotos.com.ar/";
const VENTANA_LOGIN: &str = "cba-login";
const VENTANA_PAGINA: &str = "cba-pagina";
const VENTANA_MOTOR: &str = "cba-motor";

fn cba(ruta: &str) -> Url {
  Url::parse(CBA).and_then(|u| u.join(ruta)).expect("URL fija válida")
}

fn ficha_url(codigo: &str) -> Url {
  let mut url = cba("infoproducto.aspx");
  url.query_pairs_mut().append_pair("ProductoId", codigo);
  url
}

/// GET al sitio con la sesión que dejó la ventana de login.
/// La app no guarda usuario ni contraseña: la sesión vive en las cookies del WebView.
async fn get(app: &AppHandle, url: Url) -> Result<String, String> {
  let ventana = app.get_webview_window("main").ok_or("No se encontró la ventana principal")?;
  let cookies = ventana.cookies_for_url(cba("")).map_err(|e| e.to_string())?;
  let cookie = cookies.iter().map(|c| format!("{}={}", c.name(), c.value())).collect::<Vec<_>>().join("; ");
  let r = reqwest::Client::new()
    .get(url.as_str())
    .header(reqwest::header::COOKIE, cookie)
    .send()
    .await
    .map_err(|e| format!("No se pudo conectar con Córdoba Motos: {e}"))?;
  // Sin sesión el sitio redirige al login.
  if r.url().path().eq_ignore_ascii_case("/login.aspx") {
    return Err("SIN_SESION".into());
  }
  let r = r.error_for_status().map_err(|e| format!("Córdoba Motos respondió con error: {e}"))?;
  r.text().await.map_err(|e| e.to_string())
}

/// HTML de la ficha (Más Info) de un artículo.
#[tauri::command]
async fn cba_ficha(app: AppHandle, codigo: String) -> Result<String, String> {
  get(&app, ficha_url(&codigo)).await
}

// El paginado y el orden del catálogo son eventos AJAX de GeneXus con tokens firmados: en vez de imitarlos,
// una ventana oculta carga el catálogo real y aprieta sus botones. Sin capabilities: no puede llamar a la app.

// Cuenta los XHR del sitio para saber cuándo terminó el evento que disparó un botón.
const GANCHO: &str = r#"(() => {
  if (window.__cba) return;
  window.__cba = { pend: 0, hechas: 0, antes: 0, esperando: false };
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...a) {
    __cba.pend++;
    this.addEventListener('loadend', () => { __cba.pend--; __cba.hechas++; });
    return send.apply(this, a);
  };
})();"#;

// Variables vivas del componente del catálogo (W0006W0058) y el semáforo de stock de cada fila.
const LEER: &str = r#"(() => { try {
  if (window.__cbaVieja) return 'CARGANDO';
  if (/\/login\.aspx$/i.test(location.pathname)) return 'SIN_SESION';
  const c = window.__cba;
  if (c && c.esperando) {
    if (c.hechas > c.antes && c.pend === 0) c.esperando = false;
    else return 'CARGANDO';
  }
  const o = window.gx && gx.pO && gx.pO.WebComponents && gx.pO.WebComponents.W0006W0058;
  if (document.readyState !== 'complete' || !o || !o.AV96Productos) return 'CARGANDO';
  const el = (id) => document.getElementById('W0006W0058' + id);
  return JSON.stringify({
    productos: o.AV96Productos,
    bonificaciones: o.AV227BonificacionesBolsa,
    total: o.AV33GridCantProductos,
    porPagina: o.AV166PageSize,
    orden: o.AV51Orden,
    semaforos: o.AV96Productos.map((_, i) => el('vIMAGEESTADOSEMAFORO_' + String(i + 1).padStart(4, '0'))?.getAttribute('src') ?? ''),
  });
} catch (e) { return 'ERROR:' + e; } })()"#;

/// Corre JS en la página y devuelve el string que retorna (None si no respondió).
async fn evaluar(v: &WebviewWindow, js: &str) -> Option<String> {
  let (tx, rx) = tokio::sync::oneshot::channel();
  let tx = Mutex::new(Some(tx));
  v.eval_with_callback(js, move |r| {
    if let Some(tx) = tx.lock().ok().and_then(|mut t| t.take()) {
      let _ = tx.send(r);
    }
  })
  .ok()?;
  let r = tokio::time::timeout(Duration::from_secs(5), rx).await.ok()?.ok()?;
  serde_json::from_str(&r).ok()
}

/// Espera a que el catálogo termine de cargar y devuelve sus datos en JSON.
async fn leer(v: &WebviewWindow) -> Result<String, String> {
  for _ in 0..120 {
    match evaluar(v, LEER).await.as_deref() {
      Some("SIN_SESION") => return Err("SIN_SESION".into()),
      Some(r) if r.starts_with("ERROR:") => return Err(format!("Córdoba Motos cambió su página ({}).", &r[6..])),
      Some(r) if r != "CARGANDO" => return Ok(r.to_string()),
      _ => tokio::time::sleep(Duration::from_millis(250)).await,
    }
  }
  let _ = v.eval("window.__cba && (__cba.esperando = false)");
  Err("Córdoba Motos tardó demasiado en responder. Probá de nuevo.".into())
}

#[tauri::command]
async fn cba_buscar(app: AppHandle, texto: String) -> Result<String, String> {
  let mut url = cba("catalogo.aspx");
  url.query_pairs_mut().append_pair("OrigenBusqueda", "1").append_pair("Id", "0").append_pair("Busqueda", &texto);
  let v = match app.get_webview_window(VENTANA_MOTOR) {
    Some(v) => {
      // Marca la página vieja para no leerla mientras navega a la nueva.
      evaluar(&v, "window.__cbaVieja = true, 'ok'").await;
      v.navigate(url).map_err(|e| e.to_string())?;
      v
    }
    None => WebviewWindowBuilder::new(&app, VENTANA_MOTOR, WebviewUrl::External(url))
      .visible(false)
      .skip_taskbar(true)
      .initialization_script(GANCHO)
      .build()
      .map_err(|e| e.to_string())?,
  };
  leer(&v).await
}

#[derive(Deserialize)]
#[serde(tag = "tipo", rename_all = "camelCase")]
enum Accion {
  Siguiente,
  Anterior,
  Orden { valor: u8 },
}

/// Pagina u ordena la última búsqueda. Sólo estos botones: nada que toque el carrito.
#[tauri::command]
async fn cba_accion(app: AppHandle, accion: Accion) -> Result<String, String> {
  let v = app.get_webview_window(VENTANA_MOTOR).ok_or("Buscá algo primero.")?;
  let (id, efecto) = match accion {
    Accion::Siguiente => ("BTNSIGUIENTE", "e.click()".to_string()),
    Accion::Anterior => ("BTNANTERIOR", "e.click()".to_string()),
    Accion::Orden { valor } => ("vORDEN", format!("e.value = '{valor}'; e.dispatchEvent(new Event('change', {{ bubbles: true }}))")),
  };
  let js = format!(
    "(() => {{ const e = document.getElementById('W0006W0058{id}'); if (!e || !window.__cba) return 'NO'; \
     __cba.antes = __cba.hechas; __cba.esperando = true; {efecto}; return 'SI'; }})()"
  );
  if evaluar(&v, &js).await.as_deref() != Some("SI") {
    return Err("Córdoba Motos cambió su página: no se encontró el botón.".into());
  }
  leer(&v).await
}

/// Abre el artículo en el sitio, en una ventana de la app que ya tiene la sesión.
#[tauri::command]
async fn cba_abrir(app: AppHandle, codigo: String) -> Result<(), String> {
  let url = ficha_url(&codigo);
  if let Some(v) = app.get_webview_window(VENTANA_PAGINA) {
    v.navigate(url).map_err(|e| e.to_string())?;
    return v.set_focus().map_err(|e| e.to_string());
  }
  WebviewWindowBuilder::new(&app, VENTANA_PAGINA, WebviewUrl::External(url))
    .title("Córdoba Motos")
    .inner_size(1100.0, 800.0)
    .center()
    .build()
    .map(|_| ())
    .map_err(|e| e.to_string())
}

/// Abre el login de Córdoba Motos en una ventana aparte, sin acceso a la app.
/// Al cerrarse (sola tras loguearse, o a mano) avisa a la app con el evento `cba-sesion`.
#[tauri::command]
async fn cba_login(app: AppHandle) -> Result<(), String> {
  if let Some(v) = app.get_webview_window(VENTANA_LOGIN) {
    return v.set_focus().map_err(|e| e.to_string());
  }
  let app_nav = app.clone();
  let ventana = WebviewWindowBuilder::new(&app, VENTANA_LOGIN, WebviewUrl::External(cba("login.aspx")))
    .title("Córdoba Motos · Iniciar sesión")
    .inner_size(900.0, 720.0)
    .center()
    .on_navigation(move |u| {
      // Después del login el sitio va al home interno: ya hay sesión.
      if u.path().eq_ignore_ascii_case("/homeinterno.aspx") {
        let app = app_nav.clone();
        tauri::async_runtime::spawn(async move {
          if let Some(v) = app.get_webview_window(VENTANA_LOGIN) {
            let _ = v.close();
          }
        });
      }
      true
    })
    .build()
    .map_err(|e| e.to_string())?;
  let app_evt = app.clone();
  ventana.on_window_event(move |e| {
    if let WindowEvent::Destroyed = e {
      let _ = app_evt.emit("cba-sesion", ());
    }
  });
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::new().build())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![cba_buscar, cba_accion, cba_ficha, cba_abrir, cba_login])
    // La ventana oculta del catálogo mantendría viva la app: al cerrar la principal se cierra todo.
    .on_window_event(|w, e| {
      if w.label() == "main" && matches!(e, WindowEvent::Destroyed) {
        w.app_handle().exit(0);
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
