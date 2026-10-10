//! Impresión de los presupuestos en la impresora elegida en Configuración, sin diálogo. Usa PowerShell y System.Drawing,
//! que vienen con Windows: no hay nada que instalar. Las hojas llegan como PNG en base64, una por página.

use std::fs;
use std::io::Read;
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use base64::Engine;

/// Sin esto, cada listado o impresión abriría una consola negra un instante.
const SIN_VENTANA: u32 = 0x0800_0000;
/// Tope para listar o mandar a imprimir: `Print()` vuelve al dejar el trabajo en la cola, no al terminar de imprimir.
const TOPE: Duration = Duration::from_secs(60);

const LISTAR: &str = r#"
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
[System.Drawing.Printing.PrinterSettings]::InstalledPrinters | ForEach-Object { $_ }
"#;

/// Cada hoja se escala para entrar en el área imprimible, sin deformarla. Con OriginAtMargins el (0, 0) es la esquina
/// de los márgenes; si no, es la del área física de la impresora y MarginBounds quedaría corrido por su margen duro.
const IMPRIMIR: &str = r#"
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
try {
  $doc = New-Object System.Drawing.Printing.PrintDocument
  if ($env:IMP_IMPRESORA) { $doc.PrinterSettings.PrinterName = $env:IMP_IMPRESORA }
  if (-not $doc.PrinterSettings.IsValid) { throw "La impresora «$($doc.PrinterSettings.PrinterName)» no está disponible. Elegí otra en Configuración." }
  $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins -ArgumentList 25, 25, 25, 25
  $doc.OriginAtMargins = $true
  $hojas = $env:IMP_HOJAS -split "`n"
  $script:n = 0
  $doc.add_PrintPage({
    param($sender, $e)
    $img = [System.Drawing.Image]::FromFile($hojas[$script:n])
    $area = $e.MarginBounds
    $k = [Math]::Min($area.Width / $img.Width, $area.Height / $img.Height)
    $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $e.Graphics.DrawImage($img, 0, 0, [int]($img.Width * $k), [int]($img.Height * $k))
    $img.Dispose()
    $script:n++
    $e.HasMorePages = $script:n -lt $hojas.Count
  })
  $doc.Print()
} catch {
  [Console]::Out.Write($_.Exception.Message)
  exit 1
}
"#;

/// El script viaja en base64 de UTF-16: así no hay comillas ni saltos de línea que escapar.
fn ejecutar(script: &str, env: &[(&str, String)]) -> Result<String, String> {
  let codigo: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
  let mut cmd = Command::new("powershell.exe");
  cmd.args(["-NoProfile", "-NonInteractive", "-EncodedCommand"])
    .arg(base64::engine::general_purpose::STANDARD.encode(codigo))
    .creation_flags(SIN_VENTANA);
  for (clave, valor) in env {
    cmd.env(clave, valor);
  }
  let mut hijo = cmd
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|e| format!("No se pudo ejecutar PowerShell: {e}"))?;
  // stdout se lee aparte: si se llenara el salida_hijo mientras se espera, PowerShell quedaría trabado.
  let mut salida_hijo = hijo.stdout.take().ok_or("No se pudo leer la respuesta de PowerShell.")?;
  let lector = thread::spawn(move || {
    let mut s = Vec::new();
    let _ = salida_hijo.read_to_end(&mut s);
    s
  });
  // Un driver colgado (o "Microsoft Print to PDF" esperando su diálogo) dejaría la impresión girando para siempre.
  let limite = Instant::now() + TOPE;
  let estado = loop {
    if let Some(estado) = hijo.try_wait().map_err(|e| e.to_string())? {
      break estado;
    }
    if Instant::now() >= limite {
      let _ = hijo.kill();
      let _ = hijo.wait();
      return Err(format!("La impresora no respondió en {} segundos: revisá que esté prendida y conectada, o elegí otra en Configuración.", TOPE.as_secs()));
    }
    thread::sleep(Duration::from_millis(100));
  };
  let stdout = lector.join().unwrap_or_default();
  if estado.success() {
    return Ok(String::from_utf8_lossy(&stdout).into_owned());
  }
  // El error va por stdout: stderr sale con el encoding de la consola y se verían mal los acentos.
  let error = String::from_utf8_lossy(&stdout).trim().to_string();
  Err(if error.is_empty() { "No se pudo imprimir.".into() } else { error })
}

/// Nombres de las impresoras instaladas en Windows.
#[tauri::command]
pub async fn impresoras() -> Result<Vec<String>, String> {
  let salida = en_segundo_plano(|| ejecutar(LISTAR, &[])).await?;
  Ok(salida.lines().map(str::trim).filter(|l| !l.is_empty()).map(String::from).collect())
}

/// `impresora` None usa la predeterminada de Windows.
#[tauri::command]
pub async fn imprimir_paginas(impresora: Option<String>, paginas: Vec<String>) -> Result<(), String> {
  en_segundo_plano(move || {
    let carpeta = std::env::temp_dir().join(format!("presupuesto-{}", SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos()));
    fs::create_dir_all(&carpeta).map_err(|e| e.to_string())?;
    let resultado = guardar_hojas(&carpeta, &paginas).and_then(|rutas| ejecutar(IMPRIMIR, &[("IMP_IMPRESORA", impresora.unwrap_or_default()), ("IMP_HOJAS", rutas.join("\n"))]));
    let _ = fs::remove_dir_all(&carpeta);
    resultado.map(|_| ())
  })
  .await
}

/// PowerShell bloquea el hilo mientras corre: fuera de los hilos async, para no frenar el resto de la app.
async fn en_segundo_plano<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
  tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

/// Escribe cada hoja en `carpeta` y devuelve sus rutas.
fn guardar_hojas(carpeta: &Path, paginas: &[String]) -> Result<Vec<String>, String> {
  if paginas.is_empty() {
    return Err("No hay hojas para imprimir.".into());
  }
  paginas
    .iter()
    .enumerate()
    .map(|(i, hoja)| -> Result<String, String> {
      let png = base64::engine::general_purpose::STANDARD.decode(hoja).map_err(|e| e.to_string())?;
      let ruta = carpeta.join(format!("hoja-{i}.png"));
      fs::write(&ruta, png).map_err(|e| e.to_string())?;
      Ok(ruta.to_string_lossy().into_owned())
    })
    .collect()
}

#[cfg(test)]
mod tests {
  use super::guardar_hojas;

  #[test]
  fn rechaza_una_impresion_sin_hojas() {
    assert!(guardar_hojas(&std::env::temp_dir(), &[]).is_err());
  }

  #[test]
  fn escribe_cada_hoja_y_rechaza_base64_roto() {
    let carpeta = std::env::temp_dir().join(format!("impresion-test-{}", std::process::id()));
    std::fs::create_dir_all(&carpeta).unwrap();
    let rutas = guardar_hojas(&carpeta, &["aGVsbG8=".to_string(), "d29ybGQ=".to_string()]).unwrap();
    assert_eq!(std::fs::read(&rutas[1]).unwrap(), b"world");
    assert!(guardar_hojas(&carpeta, &["no es base64!".to_string()]).is_err());
    std::fs::remove_dir_all(&carpeta).unwrap();
  }
}
