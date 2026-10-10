//! Neumat Motos: páginas ASP.NET armadas en el servidor. La sesión vive en las cookies de este cliente HTTP:
//! se copia del login a mano o se inicia sola con la cuenta guardada.

use std::sync::{Arc, OnceLock};

use reqwest::cookie::Jar;
use serde_json::Value;
use tauri::AppHandle;

use crate::credenciales::{self, rechazada, SIN_SESION};
use crate::red::{self, falla};

pub(crate) const SITIO: &str = "https://neumatmotos.com.ar";
const NOMBRE: &str = "PIRELLI";

fn cookies() -> &'static Arc<Jar> {
  static JAR: OnceLock<Arc<Jar>> = OnceLock::new();
  JAR.get_or_init(|| Arc::new(Jar::default()))
}

fn cliente() -> Result<&'static reqwest::Client, String> {
  static CLIENTE: OnceLock<reqwest::Client> = OnceLock::new();
  red::compartido(&CLIENTE, || red::crear(Some(cookies().clone())))
}

async fn get(url: &str) -> Result<String, String> {
  let r = cliente()?.get(url).send().await.map_err(|e| falla(NOMBRE, e))?;
  red::texto(NOMBRE, r).await
}

// Con sesión, el menú trae "Salir" (/Logout).
fn con_sesion(html: &str) -> bool {
  html.to_ascii_lowercase().contains("href=\"/logout\"")
}

/// Valor del token antifalsificación que el sitio pide en el header XSRF-TOKEN, sin depender del orden de los atributos.
fn token(html: &str) -> Option<&str> {
  let i = html.find("__RequestVerificationToken")?;
  let inicio = html[..i].rfind('<')?;
  let etiqueta = &html[inicio..i + html[i..].find('>')?];
  let v = etiqueta.find("value=\"")? + 7;
  etiqueta[v..].split('"').next().filter(|t| !t.is_empty())
}

async fn login() -> Result<(), String> {
  let cuenta = credenciales::leer("neumat")?.ok_or(SIN_SESION)?;
  let home = get(&format!("{SITIO}/Home")).await?;
  let token = token(&home).ok_or_else(|| rechazada("PIRELLI cambió su página: no se encontró el formulario de ingreso. Entrá a mano."))?;
  let r = cliente()?
    .post(format!("{SITIO}/Login/?handler=LoginModal"))
    .header("XSRF-TOKEN", token)
    .form(&[("user", cuenta.usuario.as_str()), ("pass", cuenta.clave.as_str()), ("currentpage", &format!("{SITIO}/Home"))])
    .send()
    .await
    .map_err(|e| falla(NOMBRE, e))?;
  let r: Value = serde_json::from_str(&red::texto(NOMBRE, r).await?)
    .map_err(|_| rechazada("PIRELLI cambió su forma de ingresar: respondió algo que la app no entiende. Entrá a mano."))?;
  // El sitio usa 0 y 1 para ingresos válidos; lo demás trae el motivo. A veces el número viene como texto.
  let status = r["status"].as_i64().or_else(|| r["status"].as_str()?.trim().parse().ok());
  match status {
    Some(0 | 1) => Ok(()),
    _ => Err(rechazada(r["msg"].as_str().filter(|m| !m.trim().is_empty()).unwrap_or("PIRELLI no aceptó el usuario o la contraseña."))),
  }
}

/// HTML del listado de la búsqueda. Sin sesión, prueba la del login a mano y después la cuenta guardada.
#[tauri::command]
pub async fn neumat_buscar(app: AppHandle, texto: String) -> Result<String, String> {
  let mut url = reqwest::Url::parse(&format!("{SITIO}/ProductosFiltrados")).expect("URL fija válida");
  url.query_pairs_mut().append_pair("aBuscar", &texto).append_pair("handler", "Busqueda");
  let html = get(url.as_str()).await?;
  if con_sesion(&html) {
    return Ok(html);
  }
  if red::copiar_sesion(&app, cookies(), SITIO) {
    let html = get(url.as_str()).await?;
    if con_sesion(&html) {
      return Ok(html);
    }
  }
  login().await?;
  let html = get(url.as_str()).await?;
  if con_sesion(&html) { Ok(html) } else { Err(rechazada("PIRELLI aceptó la cuenta pero no abrió la sesión. Entrá a mano.")) }
}

/// Deja `cantidad` unidades del artículo en el carrito: el sitio recibe el total, no lo que se suma.
#[tauri::command]
pub async fn neumat_carrito(app: AppHandle, articulo: String, cantidad: f64, tipo: String, pres: String, promo: String) -> Result<(), String> {
  let mut url = reqwest::Url::parse(&format!("{SITIO}/ProductosFiltrados")).expect("URL fija válida");
  url
    .query_pairs_mut()
    .append_pair("handler", "SumarCarrito")
    .append_pair("articuloID", &articulo)
    .append_pair("cantidad", &format!("{cantidad:.2}"))
    .append_pair("tipo", &tipo)
    .append_pair("idPres", &pres)
    .append_pair("idPromo", &promo);
  // Sin sesión el sitio responde una página en vez de JSON: se entra y se repite.
  let v: Value = match serde_json::from_str(&get(url.as_str()).await?) {
    Ok(v) => v,
    Err(_) => {
      if !(red::copiar_sesion(&app, cookies(), SITIO) && con_sesion(&get(&format!("{SITIO}/Home")).await?)) {
        login().await?;
      }
      serde_json::from_str(&get(url.as_str()).await?).map_err(|_| format!("{NOMBRE} cambió su carrito: respondió algo que la app no entiende."))?
    }
  };
  let rta = &v["sumarCarrito"];
  match rta["rta"].as_i64().or_else(|| rta["rta"].as_str()?.trim().parse().ok()) {
    Some(0) => Ok(()),
    _ => Err(match rta["rtatxt"].as_str().map(str::trim).filter(|t| !t.is_empty()) {
      Some(t) => format!("{NOMBRE}: {t}"),
      None => format!("{NOMBRE} no agregó el artículo al carrito."),
    }),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn lee_el_token() {
    let html = r#"<form><input name="__RequestVerificationToken" type="hidden" value="CfDJ8abc-_x" /></form>"#;
    assert_eq!(token(html), Some("CfDJ8abc-_x"));
    // Con los atributos en otro orden.
    assert_eq!(token(r#"<input type="hidden" value="CfDJ8z" name="__RequestVerificationToken">"#), Some("CfDJ8z"));
    assert_eq!(token("<form></form>"), None);
  }

  #[test]
  fn detecta_la_sesion() {
    assert!(con_sesion(r#"<a class="dropdown-item" href="/Logout">Salir</a>"#));
    assert!(con_sesion(r#"<a href="/logout">"#));
    assert!(!con_sesion(r#"<button id="btnLogin">Ingresar</button>"#));
  }
}
