//! Los datos de la app (config, historial, fiados, respaldo): un JSON por archivo en la carpeta de la app.
//! Se escriben a un temporal y se renombran, con una copia `.bak` de la versión anterior: un corte de luz a
//! mitad de un guardado nunca deja el archivo vacío o cortado. Al leer, si el archivo está dañado se aparta
//! y se usa la copia; si tampoco sirve, error (nunca se sigue con datos vacíos que el próximo guardado pisaría).

use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

// Una escritura a la vez: dos guardados del mismo archivo no se mezclan en el temporal.
static ESCRIBIENDO: Mutex<()> = Mutex::new(());

#[derive(Serialize)]
pub struct Leido {
  contenido: String,
  /// El archivo estaba dañado y se leyó la copia anterior.
  desde_copia: bool,
}

fn ruta(app: &AppHandle, archivo: &str) -> Result<PathBuf, String> {
  // Sólo nombres simples: nada de rutas que salgan de la carpeta de la app.
  if archivo.len() < 6 || !archivo.ends_with(".json") || !archivo[..archivo.len() - 5].bytes().all(|b| b.is_ascii_lowercase() || b == b'-') {
    return Err(format!("Nombre de archivo no permitido: {archivo}"));
  }
  Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join(archivo))
}

fn con_extension(p: &Path, ext: &str) -> PathBuf {
  let mut s = p.as_os_str().to_owned();
  s.push(ext);
  PathBuf::from(s)
}

/// Contenido si es un objeto JSON válido.
fn valido(p: &Path) -> Option<String> {
  let t = fs::read_to_string(p).ok()?;
  serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&t).ok()?;
  Some(t)
}

fn escribir_atomico(p: &Path, contenido: &str, con_copia: bool) -> Result<(), String> {
  let _guardia = ESCRIBIENDO.lock().unwrap_or_else(|e| e.into_inner());
  if let Some(dir) = p.parent() {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
  }
  let tmp = con_extension(p, ".tmp");
  let mut f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
  f.write_all(contenido.as_bytes()).map_err(|e| e.to_string())?;
  f.sync_all().map_err(|e| e.to_string())?;
  drop(f);
  // La copia es de la versión anterior y sólo si estaba sana: un archivo dañado nunca pisa una copia buena.
  // También a temporal y rename: un corte a mitad de la copia no deja la copia buena cortada.
  if con_copia && valido(p).is_some() {
    let bak_tmp = con_extension(p, ".bak.tmp");
    fs::copy(p, &bak_tmp).map_err(|e| e.to_string())?;
    fs::rename(&bak_tmp, con_extension(p, ".bak")).map_err(|e| e.to_string())?;
  }
  // En Windows reemplaza el destino de una sola vez (MoveFileEx con REPLACE_EXISTING).
  fs::rename(&tmp, p).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn datos_leer(app: AppHandle, archivo: String) -> Result<Option<Leido>, String> {
  let p = ruta(&app, &archivo)?;
  if let Some(contenido) = valido(&p) {
    return Ok(Some(Leido { contenido, desde_copia: false }));
  }
  let bak = con_extension(&p, ".bak");
  let existe = p.exists();
  if !existe && !bak.exists() {
    return Ok(None); // nunca se guardó nada
  }
  let Some(contenido) = valido(&bak) else {
    return Err(format!("El archivo {} está dañado y no hay una copia sana para recuperarlo. No cargues nada: pedí ayuda para restaurar un backup.", p.display()));
  };
  if existe {
    // Se aparta el dañado (no se borra) para que el próximo guardado no copie basura sobre la copia buena.
    let ms = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    fs::rename(&p, con_extension(&p, &format!(".danado-{ms}"))).map_err(|e| e.to_string())?;
  }
  Ok(Some(Leido { contenido, desde_copia: true }))
}

#[tauri::command]
pub async fn datos_guardar(app: AppHandle, archivo: String, contenido: String) -> Result<(), String> {
  serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&contenido).map_err(|e| format!("Contenido inválido: {e}"))?;
  escribir_atomico(&ruta(&app, &archivo)?, &contenido, true)
}

/// Copia completa de todos los datos en Documentos, una por día del mes: se pisan solas al mes siguiente.
/// Fuera de la carpeta de la app, así sobrevive a una desinstalación que borre los datos.
#[tauri::command]
pub async fn copia_diaria(app: AppHandle, dia: String, contenido: String) -> Result<(), String> {
  if dia.len() != 2 || !dia.bytes().all(|b| b.is_ascii_digit()) {
    return Err(format!("Día inválido: {dia}"));
  }
  let dir = app.path().document_dir().map_err(|e| e.to_string())?.join("Presupuestos Motos Beto").join("copias");
  escribir_atomico(&dir.join(format!("copia-dia-{dia}.json")), &contenido, false)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn escribe_y_deja_copia_de_la_version_anterior() {
    let dir = std::env::temp_dir().join(format!("datos-test-{}", std::process::id()));
    let p = dir.join("x.json");
    escribir_atomico(&p, r#"{"a":1}"#, true).unwrap();
    escribir_atomico(&p, r#"{"a":2}"#, true).unwrap();
    assert_eq!(valido(&p).unwrap(), r#"{"a":2}"#);
    assert_eq!(valido(&con_extension(&p, ".bak")).unwrap(), r#"{"a":1}"#);
    // Un archivo dañado no pisa la copia buena.
    fs::write(&p, "{\"a\":").unwrap();
    escribir_atomico(&p, r#"{"a":3}"#, true).unwrap();
    assert_eq!(valido(&con_extension(&p, ".bak")).unwrap(), r#"{"a":1}"#);
    assert!(!con_extension(&p, ".tmp").exists());
    fs::remove_dir_all(dir).unwrap();
  }
}
