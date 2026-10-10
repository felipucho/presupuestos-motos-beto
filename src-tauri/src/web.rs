use std::sync::OnceLock;
use std::time::Duration;

use tauri::{AppHandle, Manager, Url};

use crate::{cba, ficha_url, red};

/// Cliente HTTP compartido: reutiliza conexiones y tiene tope, para que una página lenta no cuelgue la ficha.
fn cliente() -> Result<&'static reqwest::Client, String> {
  static CLIENTE: OnceLock<reqwest::Client> = OnceLock::new();
  red::compartido(&CLIENTE, || {
    reqwest::Client::builder().timeout(Duration::from_secs(20)).build().map_err(|e| format!("No se pudo preparar la conexión segura de Windows: {e}"))
  })
}

/// GET al sitio con la sesión que dejó la ventana de login.
/// La app no guarda usuario ni contraseña: la sesión vive en las cookies del WebView.
async fn get(app: &AppHandle, url: Url) -> Result<String, String> {
  let ventana = app.get_webview_window("main").ok_or("No se encontró la ventana principal")?;
  let cookies = ventana.cookies_for_url(cba("")).map_err(|e| e.to_string())?;
  let cookie = cookies.iter().map(|c| format!("{}={}", c.name(), c.value())).collect::<Vec<_>>().join("; ");
  let r = cliente()?
    .get(url.as_str())
    .header(reqwest::header::COOKIE, cookie)
    .send()
    .await
    .map_err(|e| red::falla("CM", e))?;
  // Sin sesión el sitio redirige al login.
  if r.url().path().eq_ignore_ascii_case("/login.aspx") {
    return Err("SIN_SESION".into());
  }
  red::texto("CM", r).await
}

/// HTML de la ficha (Más Info) de un artículo.
#[tauri::command]
pub async fn cba_ficha(app: AppHandle, codigo: String) -> Result<String, String> {
  get(&app, ficha_url(&codigo)).await
}
