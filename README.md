# Presupuestos Motos Beto

App de escritorio para Windows con la que los vendedores de Motos Beto (Las Varillas, Córdoba) arman presupuestos de motos y los guardan en PDF para entregar al cliente.

Funciona 100 % local y sin internet: no hay servidor, ni login, ni base de datos remota. Todo queda guardado en la misma computadora.

## Instalar

1. Descargar [`instalador/Presupuestos Motos Beto_1.2.0_x64-setup.exe`](instalador/).
2. Ejecutarlo. Instala sólo para el usuario actual (no pide permisos de administrador) y crea accesos directos en el Escritorio y en el menú Inicio.
3. Abrir la app y cargar los datos en **Configuración**: datos del local, vendedores, planes de tarjeta, gastos y catálogo de motos.

Para actualizar, se cierra la app y se ejecuta el instalador nuevo encima: la configuración y el historial se conservan.

Windows puede mostrar «Windows protegió su PC» porque el instalador no está firmado: *Más información → Ejecutar de todas formas*.

## Qué hace

### Nuevo presupuesto

- **Vendedor y cliente.** Se elige quién hace el presupuesto; su nombre y celular salen primero en el PDF, junto con un código QR que abre su WhatsApp. Abajo, el nombre y teléfono del cliente.
- **Una o varias motos.** Cada moto sale en una hoja aparte del mismo PDF, con el mismo cliente y las mismas formas de pago. Por cada moto: modelo del catálogo (o «Otra moto…» escrita a mano), color, precio de lista, patentamiento y observaciones propias.
- **Lo que se cambia queda guardado.** Si en el presupuesto se cambia el precio o el patentamiento de una moto del catálogo, o se agrega un color, queda guardado en esa moto.
- **Formas de pago.** Contado / transferencia con descuento y cada plan de tarjeta con su recargo y valor de cuota; se pueden destildar las que no van.
- **Gastos.** El patentamiento de la moto más los gastos generales tildados.
- **Validez** hasta el último día del mes de emisión.
- **Vista previa en vivo** del PDF y **Generar PDF** (también con `Ctrl + Enter`).

### Métricas

Cada PDF que se guarda queda anotado: fecha, número, cliente, vendedor, motos y dónde quedó el archivo. La pantalla muestra, por día, semana, mes, trimestre, año o todo el histórico (con flechas para ir a períodos anteriores):

- presupuestos (y la diferencia con el período anterior), motos presupuestadas, clientes distintos y cuántos volvieron a pedir;
- total presupuestado (suma de precios de lista) y precio promedio por moto;
- gráfico de presupuestos por día, semana, mes o año;
- presupuestos y montos por vendedor, y las cinco motos más pedidas;
- la lista de presupuestos, con búsqueda, para abrir el PDF o sacarlo del historial.

### Configuración

Datos del local (nombre, dirección, contacto, texto legal, prefijo del número, carpeta de los PDF), vendedores, descuento de contado y planes de tarjeta, gastos generales, catálogo de motos (precio, patentamiento y colores) y backup.

El menú de la izquierda se puede esconder con el botón de arriba; la app recuerda cómo quedó.

## Dónde se guardan los datos

| Qué | Dónde |
|---|---|
| Configuración (local, vendedores, pagos, gastos, catálogo) | `%APPDATA%\com.motosbeto.presupuestos\config.json` |
| Historial de presupuestos (lo que usan las Métricas) | `%APPDATA%\com.motosbeto.presupuestos\historial.json` |
| PDF | Donde se elija en «Guardar como». Por defecto `Documentos\Presupuestos Motos Beto` o la carpeta configurada en *Datos del local* |

- Todo se guarda solo en cada cambio.
- **Backup:** *Configuración → Backup* exporta e importa la configuración como `.json`, para tener una copia o pasarla a otra PC. El historial **no** entra en ese backup: para conservarlo hay que copiar `historial.json` a mano.
- Si `config.json` llega a estar dañado, la app arranca con la configuración vacía y deja una copia del original como `config-danada-<fecha>.json` en la misma carpeta. Con el historial, los registros dañados se dejan afuera y se guarda una copia como `historial-danado-<fecha>.json`.

## Cálculos

En `src/lib/calculos.ts` (funciones puras, con tests en `calculos.test.ts`):

- **Contado / transferencia:** precio = P × (1 − descuento/100); total = precio + gastos.
- **Cada plan de tarjeta:** precio = P × (1 + recargo/100); cuota = precio / cuotas; total = precio + gastos.
- Los gastos no llevan descuento ni recargo. Se redondea al peso recién en el resultado de cada línea.

Las métricas están en `src/lib/metricas.ts` (con tests): la semana va de lunes a domingo y el trimestre es el calendario (enero–marzo, abril–junio…).

## Desarrollo

### Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| [Node.js](https://nodejs.org) | 20 o más nueva | Interfaz (Vite + React) |
| [Rust](https://rustup.rs) (toolchain `stable-x86_64-pc-windows-msvc`) | 1.90 o más nueva | Tauri |
| Visual Studio Build Tools 2022, carga **Desarrollo de escritorio con C++** | — | Compilador y linker de Rust en Windows |
| WebView2 Runtime | — | Viene con Windows 10/11. Si falta, el instalador lo descarga |

Con winget:

```bash
winget install Rustlang.Rustup
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

### Correr

```bash
npm install
npm run tauri dev
```

Abre la app en una ventana nativa con recarga en caliente. Con `npm run dev` sola se ve la interfaz en el navegador (`http://localhost:1420`); ahí los datos van a `localStorage` y guardar el PDF no está disponible.

```bash
npm test
```

### Generar el instalador

```bash
npm run tauri build
```

Deja el instalador en `src-tauri/target/release/bundle/nsis/Presupuestos Motos Beto_<versión>_x64-setup.exe`. Para publicarlo, se copia a `instalador/`. La versión se cambia en `package.json` (Tauri la toma de ahí) y en `src-tauri/Cargo.toml`.

### Ícono

El ícono es la moto del logo, separada de la palabra por color y reimpresa en naranja sobre tinta. Si cambia el logo:

```bash
python tools/producir-icono.py
npx tauri icon app-icon.png
```

El script necesita Python con Pillow y NumPy, y se niega a generar el ícono si la moto no se separa limpia de la palabra.

## Stack

Tauri v2 · React 19 · TypeScript · Vite · Tailwind CSS v4 · shadcn/ui · zod · @react-pdf/renderer (PDF) · pdf.js (vista previa) · qrcode · Vitest.

## Estructura

```
src/
├── lib/            calculos, metricas, formato, schema (zod), storage y config (configuración), historial
├── pdf/            PresupuestoPDF.tsx (@react-pdf) y generar.tsx
├── screens/        NuevoPresupuesto.tsx, Historial.tsx (pantalla Métricas) y Configuracion/ (una sección por archivo)
├── components/     barra lateral, inputs de dinero, combobox de motos, selector de color, vista previa, etc.
│   └── ui/         shadcn/ui
└── assets/         fuentes (Archivo y Bitter, en TTF) y logos
src-tauri/          app Tauri v2: plugins, permisos (capabilities/default.json), íconos
instalador/         instalador de Windows listo para descargar
tools/              producir-icono.py
```

## Tipografía y colores

Archivo y Bitter, las mismas del sitio motosbeto.com, empaquetadas como TTF en `src/assets/fuentes` (licencia OFL). La interfaz y el PDF cargan los mismos archivos.

La paleta es la de cuatro tintas de la marca (naranja, tinta, gris, papel), definida en `src/index.css`. La paleta por defecto de Tailwind está desactivada (`--color-*: initial`), así que sólo existen esos tokens más un rojo de error y un verde de éxito apagados.
