//! Integración con los proveedores. Córdoba Motos: HTTP con la sesión del WebView (`web`), catálogo desde una
//! ventana oculta (`motor`) y ventanas de login y de página (`ventanas`). Neumat, ab Repuestos y Changomax: HTTP
//! directo (`neumat`, `ab`, `changomax`, con lo común en `red`). Todos tienen login a mano (`ventanas`) y automático. Las cuentas guardadas viven en el Administrador de credenciales (`credenciales`).

mod ab;
mod changomax;
mod credenciales;
mod datos;
mod impresion;
mod motor;
mod neumat;
mod red;
mod respaldo;
mod ventanas;
mod web;

use tauri::{Manager, Url, WindowEvent};

const CBA: &str = "https://cbamotos.com.ar/";

/// URL de una ruta del sitio.
pub(crate) fn cba(ruta: &str) -> Url {
  Url::parse(CBA).and_then(|u| u.join(ruta)).expect("URL fija válida")
}

/// Ficha (Más Info) de un artículo.
pub(crate) fn ficha_url(codigo: &str) -> Url {
  let mut url = cba("infoproducto.aspx");
  url.query_pairs_mut().append_pair("ProductoId", codigo);
  url
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // Primero: una segunda instancia sólo trae al frente la abierta. Dos ventanas pisarían los datos una de otra.
    .plugin(tauri_plugin_single_instance::init(|app, _, _| {
      if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.set_focus();
      }
    }))
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![motor::cba_buscar, motor::cba_accion, web::cba_ficha, ventanas::cba_abrir, ventanas::prov_login, motor::cba_carrito,
      neumat::neumat_buscar, neumat::neumat_carrito, ab::ab_buscar, ab::ab_carrito, changomax::changomax_buscar, changomax::changomax_carrito, credenciales::cred_guardar, credenciales::cred_borrar, credenciales::cred_usuario,
      respaldo::respaldo_conectar, respaldo::respaldo_estado, respaldo::respaldo_desconectar, respaldo::respaldo_subir,
      impresion::impresoras, impresion::imprimir_paginas,
      datos::datos_leer, datos::datos_guardar, datos::copia_diaria,
    ])
    // La ventana oculta del catálogo mantendría viva la app: al cerrar la principal se cierra todo.
    .on_window_event(|w, e| {
      if w.label() == "main" && matches!(e, WindowEvent::Destroyed) {
        w.app_handle().exit(0);
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
