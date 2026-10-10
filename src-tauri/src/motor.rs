use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Deserialize;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::cba;
use crate::credenciales::{self, rechazada, SIN_SESION};

const VENTANA_MOTOR: &str = "cba-motor";
const MAX_UNIDADES: u32 = 50;

// Búsquedas, paginado y carrito comparten la única ventana del motor: de a una, para que no se mezclen las páginas.
static MOTOR: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

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
pub(crate) async fn evaluar(v: &WebviewWindow, js: &str) -> Option<String> {
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

/// Espera a que el catálogo termine de cargar y devuelve sus datos en JSON. Corta por tiempo: cada consulta
/// puede tardar hasta 5 s, así que contar intentos podía dejar el spinner más de diez minutos.
async fn leer(v: &WebviewWindow) -> Result<String, String> {
  let limite = Instant::now() + Duration::from_secs(40);
  while Instant::now() < limite {
    match evaluar(v, LEER).await.as_deref() {
      Some("SIN_SESION") => return Err("SIN_SESION".into()),
      Some(r) if r.starts_with("ERROR:") => return Err(format!("CM cambió su página ({}).", &r[6..])),
      Some(r) if r != "CARGANDO" => return Ok(r.to_string()),
      _ => tokio::time::sleep(Duration::from_millis(250)).await,
    }
  }
  let _ = v.eval("window.__cba && (__cba.esperando = false)");
  Err("CM tardó demasiado en responder. Probá de nuevo.".into())
}

/// Navega la ventana del motor, marcando la página vieja para no leerla mientras carga la nueva.
async fn ir(v: &WebviewWindow, url: Url) -> Result<(), String> {
  evaluar(v, "window.__cbaVieja = true, 'ok'").await;
  v.navigate(url).map_err(|e| {
    // Si no llegó a navegar, la página vieja sigue en pie y no puede quedar marcada.
    let _ = v.eval("window.__cbaVieja = false");
    e.to_string()
  })
}

/// Espera hasta `segundos` a que el JS devuelva 'SI'.
async fn esperar(v: &WebviewWindow, js: &str, segundos: u64) -> bool {
  let limite = Instant::now() + Duration::from_secs(segundos);
  while Instant::now() < limite {
    if evaluar(v, js).await.as_deref() == Some("SI") {
      return true;
    }
    tokio::time::sleep(Duration::from_millis(300)).await;
  }
  false
}

/// Entra con la cuenta guardada completando el login del sitio. Sin cuenta, deja el login a mano.
async fn entrar(v: &WebviewWindow) -> Result<(), String> {
  let cuenta = credenciales::leer("cba")?.ok_or(SIN_SESION)?;
  ir(v, cba("login.aspx")).await?;
  let listo = "(() => document.readyState === 'complete' && window.gx && document.getElementById('BTNENTER') ? 'SI' : 'NO')()";
  if !esperar(v, listo, 20).await {
    return Err(rechazada("CM no cargó su página de ingreso (está lenta o cambió). Entrá a mano."));
  }
  // JSON escapa usuario y clave como literales de JS. La clave sólo se escribe si la página sigue siendo la de CM.
  let js = format!(
    "(() => {{ if (location.origin !== {}) return 'ORIGEN'; try {{ const p = (id, val) => {{ const e = document.getElementById(id); e.value = val; e.dispatchEvent(new Event('change', {{ bubbles: true }})); }};
     p('vUSERNAME', {}); p('vUSERPASSWORD', {});
     const k = document.getElementById('vKEEPMELOGGEDIN'); if (k && !k.checked) k.click();
     document.getElementById('BTNENTER').click(); return 'ok'; }} catch (e) {{ return 'NO'; }} }})()",
    serde_json::to_string(&cba("").origin().ascii_serialization()).map_err(|e| e.to_string())?,
    serde_json::to_string(&cuenta.usuario).map_err(|e| e.to_string())?,
    serde_json::to_string(&cuenta.clave).map_err(|e| e.to_string())?,
  );
  match evaluar(v, &js).await.as_deref() {
    Some("ok") => {}
    Some("ORIGEN") => return Err(rechazada("CM mandó el ingreso a otro sitio: no se cargó la contraseña. Entrá a mano.")),
    _ => return Err(rechazada("CM cambió su página de ingreso: no se encontraron los campos de usuario y contraseña. Entrá a mano.")),
  }
  // Después del login el sitio va al home interno.
  if esperar(v, "(() => location.pathname.toLowerCase().endsWith('/homeinterno.aspx') ? 'SI' : 'NO')()", 20).await {
    return Ok(());
  }
  // Si sigue en el login, rechazó la cuenta; si no, quedó cargando.
  let en_login = evaluar(v, "(() => location.pathname.toLowerCase().endsWith('/login.aspx') ? 'SI' : 'NO')()").await;
  Err(rechazada(if en_login.as_deref() == Some("SI") {
    "CM no aceptó el usuario o la contraseña."
  } else {
    "CM tardó demasiado en entrar. Probá de nuevo o entrá a mano."
  }))
}

/// Busca por palabras, código o código de barras. Devuelve el JSON del catálogo.
/// Si no hay sesión y hay cuenta guardada, entra solo y repite la búsqueda.
#[tauri::command]
pub async fn cba_buscar(app: AppHandle, texto: String) -> Result<String, String> {
  let _motor = MOTOR.lock().await;
  let mut url = cba("catalogo.aspx");
  url.query_pairs_mut().append_pair("OrigenBusqueda", "1").append_pair("Id", "0").append_pair("Busqueda", &texto);
  let v = match app.get_webview_window(VENTANA_MOTOR) {
    Some(v) => {
      ir(&v, url.clone()).await?;
      v
    }
    None => WebviewWindowBuilder::new(&app, VENTANA_MOTOR, WebviewUrl::External(url.clone()))
      .visible(false)
      .skip_taskbar(true)
      .initialization_script(GANCHO)
      .build()
      .map_err(|e| e.to_string())?,
  };
  match leer(&v).await {
    Err(e) if e == "SIN_SESION" => {
      entrar(&v).await?;
      ir(&v, url).await?;
      leer(&v).await
    }
    r => r,
  }
}

#[derive(Deserialize)]
#[serde(tag = "tipo", rename_all = "camelCase")]
pub(crate) enum Accion {
  Siguiente,
  Anterior,
  Orden { valor: u8 },
}

/// Pagina u ordena la última búsqueda. Sólo estos botones: nada que toque el carrito.
#[tauri::command]
pub async fn cba_accion(app: AppHandle, accion: Accion) -> Result<String, String> {
  let _motor = MOTOR.lock().await;
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
  // Distinto un botón que no existe (la página cambió) de una página que no respondió (timeout).
  match evaluar(&v, &js).await.as_deref() {
    Some("SI") => {}
    Some(_) => return Err("CM cambió su página: no se encontró el botón.".into()),
    None => return Err("CM no respondió a tiempo. Probá de nuevo.".into()),
  }
  leer(&v).await
}

/// Suma `cantidad` unidades al carrito con el + de la fila del artículo (el sitio lo guarda en el pedido en curso).
/// Verifica que la cantidad de la fila haya subido: si no, el sitio no lo aceptó (por ejemplo, sin stock).
#[tauri::command]
pub async fn cba_carrito(app: AppHandle, codigo: String, cantidad: u32) -> Result<(), String> {
  // Cada unidad es un clic real en el sitio.
  if !(1..=MAX_UNIDADES).contains(&cantidad) {
    return Err(format!("A CM se suman de 1 a {MAX_UNIDADES} unidades por vez."));
  }
  let _motor = MOTOR.lock().await;
  let v = app.get_webview_window(VENTANA_MOTOR).ok_or("Buscá algo primero.")?;
  let codigo = serde_json::to_string(&codigo).map_err(|e| e.to_string())?;
  let fila = format!(
    "const o = window.gx && gx.pO && gx.pO.WebComponents && gx.pO.WebComponents.W0006W0058; const i = o && o.AV96Productos ? o.AV96Productos.findIndex((p) => String(p.ProductoId).trim() === {codigo}) : -1; \
     const id = (c) => document.getElementById('W0006W0058' + c + '_' + String(i + 1).padStart(4, '0')); const cant = () => Number((id('vCANTIDAD') || {{}}).value) || 0;"
  );
  // Si corta a la mitad, el error dice cuántas unidades ya quedaron en el carrito.
  let parcial = |sumadas: u32, e: String| {
    if sumadas == 0 {
      return e;
    }
    let e = if e == "SIN_SESION" { "CM cerró la sesión.".to_string() } else { e };
    format!("{e} Ya se habían sumado {sumadas} de {cantidad} unidades: revisá el carrito en la página.")
  };
  for sumadas in 0..cantidad {
    let js = format!(
      "(() => {{ {fila} if (i < 0) return 'FALTA'; const a = id('BTNSUMACANT') && id('BTNSUMACANT').querySelector('a'); if (!a || !window.__cba) return 'NO'; \
       __cba.antes = __cba.hechas; __cba.esperando = true; a.click(); return 'SI:' + cant(); }})()"
    );
    let antes: u32 = match evaluar(&v, &js).await.as_deref() {
      Some("FALTA") => return Err(parcial(sumadas, "El artículo ya no está en la página de CM: buscalo de nuevo.".into())),
      Some(r) if r.starts_with("SI:") => r[3..].parse().unwrap_or(0),
      Some(_) => return Err(parcial(sumadas, "CM cambió su página: no se encontró el botón para sumar al carrito.".into())),
      None => return Err(parcial(sumadas, "CM no respondió a tiempo. Probá de nuevo.".into())),
    };
    leer(&v).await.map_err(|e| parcial(sumadas, e))?;
    // El + dispara más de un pedido al servidor: se espera a que terminen todos.
    tokio::time::sleep(Duration::from_millis(300)).await;
    esperar(&v, "(() => window.__cba && __cba.pend === 0 ? 'SI' : 'NO')()", 10).await;
    let despues: u32 = evaluar(&v, &format!("(() => {{ {fila} return String(cant()); }})()")).await.and_then(|r| r.parse().ok()).unwrap_or(0);
    if despues <= antes {
      return Err(parcial(sumadas, "CM no sumó el artículo al carrito (puede no tener stock).".into()));
    }
  }
  Ok(())
}
