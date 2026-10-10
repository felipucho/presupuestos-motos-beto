//! Changomax (Mercomax): tienda PrestaShop cerrada con login. La búsqueda responde JSON si se pide por AJAX.
//! La sesión vive en las cookies de este cliente HTTP: se copia del login a mano o se inicia sola con la cuenta guardada.

use std::future::Future;
use std::sync::{Arc, OnceLock};

use reqwest::cookie::Jar;
use serde_json::Value;
use tauri::AppHandle;

use crate::credenciales::{self, rechazada, SIN_SESION};
use crate::red::{self, falla};

pub(crate) const SITIO: &str = "https://changomax.mercomaxsa.com.ar/prestashop";
const NOMBRE: &str = "MAX";
const POR_PAGINA: &str = "60";

fn cookies() -> &'static Arc<Jar> {
  static JAR: OnceLock<Arc<Jar>> = OnceLock::new();
  JAR.get_or_init(|| Arc::new(Jar::default()))
}

fn cliente() -> Result<&'static reqwest::Client, String> {
  static CLIENTE: OnceLock<reqwest::Client> = OnceLock::new();
  red::compartido(&CLIENTE, || red::crear(Some(cookies().clone())))
}

// Sin sesión, toda la tienda redirige al login (con URL amigable o la clásica de PrestaShop).
fn al_login(r: &reqwest::Response) -> bool {
  let u = r.url();
  u.path().ends_with("/inicio-sesion") || u.query().is_some_and(|q| q.contains("controller=authentication"))
}

async fn login() -> Result<(), String> {
  let cuenta = credenciales::leer("changomax")?.ok_or(SIN_SESION)?;
  let r = cliente()?
    .post(format!("{SITIO}/inicio-sesion"))
    .form(&[("email", cuenta.usuario.as_str()), ("password", cuenta.clave.as_str()), ("submitLogin", "1"), ("back", "")])
    .send()
    .await
    .map_err(|e| falla(NOMBRE, e))?;
  let r = red::revisar(NOMBRE, r)?;
  // Con login válido redirige a la cuenta; si no, vuelve a mostrar el formulario.
  if al_login(&r) {
    return Err(rechazada("MAX no aceptó el correo o la contraseña."));
  }
  Ok(())
}

async fn buscar(texto: &str) -> Result<reqwest::Response, String> {
  cliente()?
    .get(format!("{SITIO}/buscar"))
    .query(&[("s", texto), ("resultsPerPage", POR_PAGINA), ("ajax", "1"), ("from-xhr", "1")])
    .header(reqwest::header::ACCEPT, "application/json")
    .header("X-Requested-With", "XMLHttpRequest")
    .send()
    .await
    .map_err(|e| falla(NOMBRE, e))
}

/// Hace el pedido; si el sitio manda al login, prueba la sesión del login a mano y después la cuenta guardada.
async fn con_sesion<F, Fut>(app: &AppHandle, pedir: F) -> Result<reqwest::Response, String>
where
  F: Fn() -> Fut,
  Fut: Future<Output = Result<reqwest::Response, String>>,
{
  let mut r = pedir().await?;
  if al_login(&r) && red::copiar_sesion(app, cookies(), "https://changomax.mercomaxsa.com.ar/") {
    r = pedir().await?;
  }
  if al_login(&r) {
    login().await?;
    r = pedir().await?;
    if al_login(&r) {
      return Err(rechazada("MAX aceptó la cuenta pero no abrió la sesión. Entrá a mano."));
    }
  }
  Ok(r)
}

/// JSON de la búsqueda.
#[tauri::command]
pub async fn changomax_buscar(app: AppHandle, texto: String) -> Result<String, String> {
  red::texto(NOMBRE, con_sesion(&app, || buscar(&texto)).await?).await
}

/// Token que el sitio pide para cambiar el carrito; viene en cada página.
fn token(html: &str) -> Option<&str> {
  let i = html.find("\"static_token\":\"")? + 16;
  html[i..].split('"').next().filter(|t| !t.is_empty())
}

/// Suma `cantidad` unidades del producto (con su combinación, si tiene) al carrito.
#[tauri::command]
pub async fn changomax_carrito(app: AppHandle, producto: String, combinacion: String, cantidad: u32) -> Result<(), String> {
  let pagina = || async { cliente()?.get(format!("{SITIO}/carrito")).send().await.map_err(|e| falla(NOMBRE, e)) };
  let html = red::texto(NOMBRE, con_sesion(&app, pagina).await?).await?;
  let token = token(&html).ok_or_else(|| format!("{NOMBRE} cambió su carrito: no se encontró el token."))?;
  let qty = cantidad.to_string();
  let r = cliente()?
    .post(format!("{SITIO}/carrito"))
    .header(reqwest::header::ACCEPT, "application/json")
    .header("X-Requested-With", "XMLHttpRequest")
    .form(&[
      ("token", token),
      ("id_product", producto.as_str()),
      ("id_product_attribute", combinacion.as_str()),
      ("id_customization", "0"),
      ("qty", qty.as_str()),
      ("add", "1"),
      ("action", "update"),
      ("ajax", "1"),
    ])
    .send()
    .await
    .map_err(|e| falla(NOMBRE, e))?;
  let v: Value = serde_json::from_str(&red::texto(NOMBRE, r).await?).map_err(|_| format!("{NOMBRE} cambió su carrito: respondió algo que la app no entiende."))?;
  if v["hasError"].as_bool() == Some(true) || v["success"].as_bool() == Some(false) {
    let errores: Vec<&str> = v["errors"].as_array().map(|e| e.iter().filter_map(Value::as_str).collect()).unwrap_or_default();
    return Err(if errores.is_empty() { format!("{NOMBRE} no agregó el artículo al carrito.") } else { format!("{NOMBRE}: {}", errores.join(" ")) });
  }
  Ok(())
}
