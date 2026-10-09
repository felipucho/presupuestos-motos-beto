//! Usuario y contraseña de cada proveedor, en el Administrador de credenciales de Windows (cifrado con la
//! cuenta de Windows). Nunca van a la configuración ni a los backups, y la contraseña no vuelve a la interfaz.

use keyring::Entry;
use serde::{Deserialize, Serialize};

pub(crate) const SERVICIO: &str = "Presupuestos Motos Beto";
const PROVEEDORES: [&str; 4] = ["cba", "neumat", "ab", "changomax"];

#[derive(Serialize, Deserialize)]
pub(crate) struct Cuenta {
  pub usuario: String,
  pub clave: String,
}

fn entrada(proveedor: &str) -> Result<Entry, String> {
  if !PROVEEDORES.contains(&proveedor) {
    return Err(format!("Proveedor desconocido: {proveedor}"));
  }
  Entry::new(SERVICIO, proveedor).map_err(|e| e.to_string())
}

/// La cuenta guardada del proveedor (None si no hay).
pub(crate) fn leer(proveedor: &str) -> Result<Option<Cuenta>, String> {
  match entrada(proveedor)?.get_password() {
    Ok(s) => Ok(serde_json::from_str(&s).ok()),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
pub fn cred_guardar(proveedor: String, usuario: String, clave: String) -> Result<(), String> {
  let (usuario, clave) = (usuario.trim().to_string(), clave);
  if usuario.is_empty() || clave.is_empty() {
    return Err("Completá usuario y contraseña.".into());
  }
  let s = serde_json::to_string(&Cuenta { usuario, clave }).map_err(|e| e.to_string())?;
  entrada(&proveedor)?.set_password(&s).map_err(|e| e.to_string())?;
  crate::ab::olvidar();
  Ok(())
}

#[tauri::command]
pub fn cred_borrar(proveedor: String) -> Result<(), String> {
  crate::ab::olvidar();
  match entrada(&proveedor)?.delete_credential() {
    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
    Err(e) => Err(e.to_string()),
  }
}

/// Sólo el usuario, para mostrar en Configuración.
#[tauri::command]
pub fn cred_usuario(proveedor: String) -> Result<Option<String>, String> {
  Ok(leer(&proveedor)?.map(|c| c.usuario))
}

/// Error para la interfaz: no hay sesión ni cuenta guardada, hay que entrar a mano.
pub(crate) const SIN_SESION: &str = "SIN_SESION";
/// Error para la interfaz: falló la entrada automática con la cuenta guardada (queda el login a mano).
pub(crate) fn rechazada(msg: &str) -> String {
  format!("LOGIN_FALLIDO:{msg}")
}
