//! Copia de los fiados en un repositorio privado de GitHub, por la API de contenidos (no hace falta git instalado).
//! Repo y token van al Administrador de credenciales de Windows, igual que las cuentas de los proveedores: nunca a la
//! configuración ni a los backups, y el token no vuelve a la interfaz.

use base64::Engine;
use keyring::Entry;
use reqwest::{RequestBuilder, Response, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{credenciales, red};

const API: &str = "https://api.github.com";
const SITIO: &str = "GitHub";
/// Archivo dentro del repo. Cada subida es un commit nuevo, así queda el historial de versiones.
const ARCHIVO: &str = "fiados.json";
const CLAVE: &str = "respaldo-fiados";

#[derive(Serialize, Deserialize)]
struct Conexion {
  repo: String,
  token: String,
}

fn entrada() -> Result<Entry, String> {
  Entry::new(credenciales::SERVICIO, CLAVE).map_err(|e| e.to_string())
}

/// La conexión guardada (None si no hay).
fn leer() -> Result<Option<Conexion>, String> {
  match entrada()?.get_password() {
    Ok(s) => Ok(serde_json::from_str(&s).ok()),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

fn nombre_ok(p: &str) -> bool {
  !p.is_empty() && p.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

/// Acepta `usuario/repo` o la URL copiada del navegador.
fn normalizar(repo: &str) -> Result<String, String> {
  let r = repo.trim().trim_end_matches('/');
  let r = r.strip_prefix("https://github.com/").unwrap_or(r);
  let r = r.strip_suffix(".git").unwrap_or(r);
  let partes: Vec<&str> = r.split('/').collect();
  match partes.as_slice() {
    [dueño, nombre] if nombre_ok(dueño) && nombre_ok(nombre) => Ok(r.to_string()),
    _ => Err("Escribí el repositorio como usuario/nombre, por ejemplo felipe/fiados-motos-beto.".into()),
  }
}

fn con_cabeceras(b: RequestBuilder, token: &str) -> RequestBuilder {
  b.bearer_auth(token)
    .header("Accept", "application/vnd.github+json")
    .header("X-GitHub-Api-Version", "2022-11-28")
    .header("User-Agent", "Presupuestos-Motos-Beto") // GitHub rechaza los pedidos sin User-Agent
}

/// Sólo deja seguir si el repo es privado (los fiados tienen DNI y teléfonos) y el token puede escribir en él.
async fn verificar_repo(cli: &reqwest::Client, repo: &str, token: &str) -> Result<(), String> {
  let r = con_cabeceras(cli.get(format!("{API}/repos/{repo}")), token).send().await.map_err(|e| red::falla(SITIO, e))?;
  if r.status() == StatusCode::NOT_FOUND {
    return Err(format!("No encontré «{repo}» con este token. Revisá el nombre y que el token tenga acceso a ese repositorio."));
  }
  let datos: Value = serde_json::from_str(&red::texto(SITIO, r).await?).map_err(|e| e.to_string())?;
  if datos["private"] != true {
    return Err(format!("«{repo}» es público. Los fiados tienen DNI y teléfonos: el repositorio tiene que ser privado."));
  }
  if datos["permissions"]["push"] == false {
    return Err(format!("El token no puede escribir en «{repo}». Dale permiso «Contents: Read and write» para ese repositorio."));
  }
  Ok(())
}

/// sha actual del archivo en el repo (None si todavía no existe).
async fn sha_actual(cli: &reqwest::Client, url: &str, token: &str) -> Result<Option<String>, String> {
  let r = con_cabeceras(cli.get(url), token).send().await.map_err(|e| red::falla(SITIO, e))?;
  if r.status() == StatusCode::NOT_FOUND {
    return Ok(None);
  }
  let datos: Value = serde_json::from_str(&red::texto(SITIO, r).await?).map_err(|e| e.to_string())?;
  Ok(datos["sha"].as_str().map(String::from))
}

async fn subir_una_vez(cli: &reqwest::Client, url: &str, token: &str, mensaje: &str, contenido: &str) -> Result<Response, String> {
  let mut cuerpo = json!({ "message": mensaje, "content": base64::engine::general_purpose::STANDARD.encode(contenido) });
  if let Some(sha) = sha_actual(cli, url, token).await? {
    cuerpo["sha"] = sha.into();
  }
  con_cabeceras(cli.put(url), token).json(&cuerpo).send().await.map_err(|e| red::falla(SITIO, e))
}

/// Guarda repo y token si el repo es privado y el token puede escribir. Devuelve el repo normalizado.
#[tauri::command]
pub async fn respaldo_conectar(repo: String, token: String) -> Result<String, String> {
  let repo = normalizar(&repo)?;
  let token = token.trim().to_string();
  if token.is_empty() {
    return Err("Pegá el token de acceso.".into());
  }
  verificar_repo(&red::crear(None)?, &repo, &token).await?;
  let guardado = serde_json::to_string(&Conexion { repo: repo.clone(), token }).map_err(|e| e.to_string())?;
  entrada()?.set_password(&guardado).map_err(|e| e.to_string())?;
  Ok(repo)
}

/// El repo conectado, sin el token (None si no hay).
#[tauri::command]
pub fn respaldo_estado() -> Result<Option<String>, String> {
  Ok(leer()?.map(|c| c.repo))
}

#[tauri::command]
pub fn respaldo_desconectar() -> Result<(), String> {
  match entrada()?.delete_credential() {
    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
    Err(e) => Err(e.to_string()),
  }
}

/// Sube el archivo como commit nuevo. Si cambió entre la lectura del sha y la subida (409), reintenta una vez.
#[tauri::command]
pub async fn respaldo_subir(contenido: String, mensaje: String) -> Result<(), String> {
  let c = leer()?.ok_or("No hay una cuenta de GitHub conectada.")?;
  let cli = red::crear(None)?;
  verificar_repo(&cli, &c.repo, &c.token).await?;
  let url = format!("{API}/repos/{}/contents/{ARCHIVO}", c.repo);
  let mut r = subir_una_vez(&cli, &url, &c.token, &mensaje, &contenido).await?;
  if r.status() == StatusCode::CONFLICT {
    r = subir_una_vez(&cli, &url, &c.token, &mensaje, &contenido).await?;
  }
  red::revisar(SITIO, r)?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::normalizar;

  #[test]
  fn acepta_usuario_repo_y_url_de_github() {
    assert_eq!(normalizar(" felipe/fiados-motos-beto ").unwrap(), "felipe/fiados-motos-beto");
    assert_eq!(normalizar("https://github.com/felipe/fiados.git/").unwrap(), "felipe/fiados");
  }

  #[test]
  fn rechaza_lo_que_no_es_usuario_repo() {
    assert!(normalizar("felipe").is_err());
    assert!(normalizar("felipe/fiados/extra").is_err());
    assert!(normalizar("felipe/fi ados").is_err());
  }
}
