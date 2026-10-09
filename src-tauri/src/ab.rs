//! ab Repuestos: API JSON con token. Se entra con la cuenta guardada y el token queda en memoria.

use std::future::Future;
use std::sync::{Mutex, OnceLock};

use serde_json::{json, Value};

use crate::credenciales::{self, rechazada, SIN_SESION};
use crate::red::{self, falla};

const API: &str = "https://abfundas.estudiorocha.ar";
const NOMBRE: &str = "AB";
const POR_PAGINA: &str = "60";

/// Lo que devuelve el login y hace falta para los precios.
#[derive(Clone)]
struct Sesion {
  token: String,
  /// Id de la cuenta: el carrito se guarda a su nombre.
  usuario: String,
  lista: String,
  descuentos: Value,
}

fn sesion() -> &'static Mutex<Option<Sesion>> {
  static S: OnceLock<Mutex<Option<Sesion>>> = OnceLock::new();
  S.get_or_init(|| Mutex::new(None))
}

fn cliente() -> &'static reqwest::Client {
  static CLIENTE: OnceLock<reqwest::Client> = OnceLock::new();
  CLIENTE.get_or_init(|| red::cliente(None))
}

/// La lista de precios viene como texto o como número según el endpoint.
fn lista(v: &Value) -> String {
  match v {
    Value::String(s) if !s.is_empty() => s.clone(),
    Value::Number(n) => n.to_string(),
    _ => "1".into(),
  }
}

fn id(v: &Value) -> String {
  match v {
    Value::String(s) => s.clone(),
    Value::Number(n) => n.to_string(),
    _ => String::new(),
  }
}

async fn login() -> Result<Sesion, String> {
  let cuenta = credenciales::leer("ab")?.ok_or(SIN_SESION)?;
  let r = cliente()
    .post(format!("{API}/account/login"))
    .json(&json!({ "usuario": cuenta.usuario, "password": cuenta.clave }))
    .send()
    .await
    .map_err(|e| falla(NOMBRE, e))?;
  let ok = r.status().is_success();
  if r.status().is_server_error() {
    return Err(red::revisar(NOMBRE, r).err().unwrap_or_default());
  }
  let v: Value = r.json().await.unwrap_or(Value::Null);
  // La respuesta puede venir envuelta en `data`.
  let d = if v.get("token").is_some() { &v } else { &v["data"] };
  let token = d["token"].as_str().filter(|t| ok && !t.is_empty());
  let Some(token) = token else {
    let msg = v["error"].as_str().or(v["msg"].as_str()).or(v["message"].as_str());
    return Err(rechazada(msg.unwrap_or("AB no aceptó el usuario o la contraseña.")));
  };
  let usuario = if d["id"].is_null() { id(&d["_id"]) } else { id(&d["id"]) };
  Ok(Sesion { token: token.into(), usuario, lista: lista(&d["lista_de_precio"]), descuentos: d["descuento"].clone() })
}

async fn productos(s: &Sesion, texto: &str) -> Result<reqwest::Response, String> {
  cliente()
    .get(format!("{API}/product"))
    .query(&[("filter[search]", texto), ("filter[list]", &s.lista), ("limit", POR_PAGINA), ("page", "1")])
    .bearer_auth(&s.token)
    .send()
    .await
    .map_err(|e| falla(NOMBRE, e))
}

/// Hace el pedido con la sesión que hay (o entra con la cuenta guardada); si el token venció, entra de nuevo una vez.
async fn con_sesion<F, Fut>(pedir: F) -> Result<(Sesion, reqwest::Response), String>
where
  F: Fn(Sesion) -> Fut,
  Fut: Future<Output = Result<reqwest::Response, String>>,
{
  // shortcut: la sesión del login a mano vive sólo en memoria; al reiniciar la app hay que entrar de nuevo (o tener la cuenta guardada).
  let guardada = sesion().lock().map_err(|e| e.to_string())?.clone();
  let mut s = match guardada {
    Some(s) => s,
    None => login().await?,
  };
  let mut r = pedir(s.clone()).await?;
  if matches!(r.status().as_u16(), 401 | 403) {
    s = login().await?;
    r = pedir(s.clone()).await?;
  }
  *sesion().lock().map_err(|e| e.to_string())? = Some(s.clone());
  Ok((s, r))
}

/// Busca y devuelve `{ lista, descuentos, respuesta }` para calcular los precios en la interfaz.
#[tauri::command]
pub async fn ab_buscar(texto: String) -> Result<String, String> {
  let texto = texto.as_str();
  let (s, r) = con_sesion(|s| async move { productos(&s, texto).await }).await?;
  let respuesta: Value = serde_json::from_str(&red::texto(NOMBRE, r).await?)
    .map_err(|_| "AB cambió su página: la búsqueda respondió algo que la app no entiende.".to_string())?;
  Ok(json!({ "lista": s.lista, "descuentos": s.descuentos, "respuesta": respuesta }).to_string())
}

/// Suma `cantidad` unidades del producto (tal como vino de la búsqueda) al carrito de la cuenta.
#[tauri::command]
pub async fn ab_carrito(producto: Value, cantidad: u32) -> Result<(), String> {
  let id = producto["_id"].as_str().ok_or_else(|| format!("{NOMBRE} cambió su página: el artículo no trae su identificador."))?.to_string();
  let (s, r) = con_sesion(|s| async move {
    cliente()
      .get(format!("{API}/cart"))
      .query(&[("user", s.usuario.as_str()), ("mode", "normal")])
      .bearer_auth(&s.token)
      .send()
      .await
      .map_err(|e| falla(NOMBRE, e))
  })
  .await?;
  if s.usuario.is_empty() {
    return Err(format!("{NOMBRE} no informó el usuario de la cuenta: entrá a mano de nuevo."));
  }
  let carrito: Value = serde_json::from_str(&red::texto(NOMBRE, r).await?).map_err(|_| format!("{NOMBRE} cambió su carrito: respondió algo que la app no entiende."))?;
  // Si ya está en el carrito se suma a esa línea; si no, va el producto con el precio de la lista de la cuenta.
  let item = match carrito["data"]["cart"].as_array().and_then(|c| c.iter().find(|i| i["_id"] == id.as_str())) {
    Some(i) => {
      let mut i = i.clone();
      i["quantity"] = (i["quantity"].as_u64().unwrap_or(0) + u64::from(cantidad)).into();
      i
    }
    None => {
      let precio = producto["lista_de_precios"].as_array().and_then(|l| l.iter().find(|p| lista(&p["list_id"]) == s.lista)).cloned();
      let Some(precio) = precio else { return Err(format!("{NOMBRE} no tiene precio de tu lista para este artículo.")) };
      let mut i = producto;
      i["price"] = precio["precio"].clone();
      i["matched_price"] = precio;
      i["quantity"] = cantidad.into();
      i
    }
  };
  let r = cliente()
    .patch(format!("{API}/cart/item"))
    .json(&json!({ "user": s.usuario, "mode": "normal", "item": item }))
    .bearer_auth(&s.token)
    .send()
    .await
    .map_err(|e| falla(NOMBRE, e))?;
  red::revisar(NOMBRE, r).map(|_| ())
}

/// Usa la sesión del login a mano: `{ token, usuario, lista, descuentos }` leído del almacenamiento de la página.
pub(crate) fn usar(datos: &str) {
  let Ok(v) = serde_json::from_str::<Value>(datos) else { return };
  let Some(token) = v["token"].as_str().filter(|t| !t.is_empty()) else { return };
  if let Ok(mut s) = sesion().lock() {
    *s = Some(Sesion { token: token.into(), usuario: id(&v["usuario"]), lista: lista(&v["lista"]), descuentos: v["descuentos"].clone() });
  }
}

/// Al cambiar la cuenta en Configuración se olvida el token viejo.
pub(crate) fn olvidar() {
  if let Ok(mut s) = sesion().lock() {
    *s = None;
  }
}
