//! Lo común a los proveedores que se consultan por HTTP: mensajes de error que dicen qué pasó y la copia de la
//! sesión que el usuario abrió a mano en una ventana de la app.

use std::sync::{Arc, OnceLock};
use std::time::Duration;

use reqwest::cookie::Jar;
use tauri::{AppHandle, Manager, Url};

/// Cliente con cookies propias y tope de tiempo, para que una página colgada no deje la búsqueda girando.
/// Devuelve error en vez de `expect`: en release `panic = "abort"` cerraría la app sin decir nada si falla TLS.
pub(crate) fn crear(cookies: Option<Arc<Jar>>) -> Result<reqwest::Client, String> {
  let b = reqwest::Client::builder().timeout(Duration::from_secs(30));
  let b = match cookies {
    Some(j) => b.cookie_provider(j),
    None => b,
  };
  b.build().map_err(|e| format!("No se pudo preparar la conexión segura de Windows: {e}"))
}

/// Cliente guardado en `celda`, creado la primera vez que hace falta (si falla, se reintenta en el próximo pedido).
pub(crate) fn compartido(
  celda: &'static OnceLock<reqwest::Client>,
  crear: impl FnOnce() -> Result<reqwest::Client, String>,
) -> Result<&'static reqwest::Client, String> {
  if let Some(c) = celda.get() {
    return Ok(c);
  }
  let c = crear()?;
  Ok(celda.get_or_init(|| c))
}

/// Explica en castellano por qué falló el pedido.
pub(crate) fn falla(sitio: &str, e: reqwest::Error) -> String {
  if e.is_timeout() {
    format!("{sitio} tardó más de 30 segundos en responder. Probá de nuevo en un rato.")
  } else if e.is_connect() {
    format!("No se pudo conectar con {sitio}. Revisá que haya internet; si hay, la página puede estar caída.")
  } else if e.is_body() || e.is_decode() {
    format!("{sitio} cortó la respuesta a la mitad. Probá de nuevo.")
  } else {
    format!("Falló la conexión con {sitio}: {e}")
  }
}

/// Deja pasar sólo las respuestas 2xx; las demás se traducen a un mensaje con el código.
pub(crate) fn revisar(sitio: &str, r: reqwest::Response) -> Result<reqwest::Response, String> {
  let s = r.status();
  if s.is_success() {
    return Ok(r);
  }
  Err(match s.as_u16() {
    401 | 403 => format!("{sitio} no dejó entrar (error {s}): la sesión venció o la cuenta no tiene permiso."),
    404 => format!("{sitio} cambió su página: la dirección de búsqueda ya no existe (error 404)."),
    429 => format!("{sitio} pidió esperar por demasiadas búsquedas seguidas. Probá en un minuto."),
    500..=599 => format!("{sitio} tiene un problema en su servidor (error {s}). Probá más tarde."),
    _ => format!("{sitio} respondió con un error inesperado ({s})."),
  })
}

/// Texto de la respuesta, con el error ya explicado.
pub(crate) async fn texto(sitio: &str, r: reqwest::Response) -> Result<String, String> {
  revisar(sitio, r)?.text().await.map_err(|e| falla(sitio, e))
}

/// Copia al cliente HTTP las cookies que dejó el login a mano (el WebView las guarda aunque se cierre la app).
/// Devuelve si había alguna.
pub(crate) fn copiar_sesion(app: &AppHandle, jar: &Jar, sitio: &str) -> bool {
  let (Some(v), Ok(url)) = (app.get_webview_window("main"), Url::parse(sitio)) else { return false };
  let cookies = v.cookies_for_url(url.clone()).unwrap_or_default();
  for c in &cookies {
    jar.add_cookie_str(&format!("{}={}; Path=/", c.name(), c.value()), &url);
  }
  !cookies.is_empty()
}
