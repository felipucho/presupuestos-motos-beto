"""
Produce app-icon.png (1024x1024) desde src/assets/marca/origen.png: separa la moto de la
palabra por croma (la moto es naranja, la palabra gris parejo), la reimprime en naranja-vivo
y la centra sobre un cuadrado redondeado de tinta. Mismo criterio que
motos-beto/trastienda/tools/producir-marca.mjs.

Uso, desde la raíz:  python tools/producir-icono.py && npx tauri icon app-icon.png
Falla (sin escribir nada) si la moto no se separa limpia de la palabra.
"""
import sys
import numpy as np
from PIL import Image, ImageDraw

ORIGEN = 'src/assets/marca/origen.png'
SALIDA = 'app-icon.png'
TINTA = (0x19, 0x17, 0x13)
NARANJA_VIVO = (0xe8, 0x76, 0x3a)
RUIDO = 24   # alfa por debajo de esto es neblina de la exportación, no dibujo
CROMA = 45   # más croma que esto es tinta naranja
LADO = 1024
RADIO = 0.22  # radio del cuadrado, proporción del lado
OCUPA = 0.74  # ancho de la moto, proporción del lado

im = np.asarray(Image.open(ORIGEN).convert('RGBA')).astype(np.int16)
rgb, a = im[..., :3], im[..., 3]
opaco = a > RUIDO
croma = rgb.max(axis=2) - rgb.min(axis=2)
moto = opaco & (croma > CROMA)
palabra = opaco & ~moto

ys, xs = np.nonzero(moto)
y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
# Separación limpia: ningún trazo de la palabra puede tocar la moto. La «t» de «Motos» queda
# entre las ruedas, dentro de la caja de la moto, pero separada por aire: se mide contacto
# (palabra a 3 px o menos de la moto), no superposición de cajas.
cerca = moto.copy()
for _ in range(3):
    cerca[1:, :] |= cerca[:-1, :]; cerca[:-1, :] |= cerca[1:, :]
    cerca[:, 1:] |= cerca[:, :-1]; cerca[:, :-1] |= cerca[:, 1:]
contacto = int((palabra & cerca).sum())
total = int(moto.sum())
print(f'moto: caja x{x0}-{x1} y{y0}-{y1} ({x1-x0}x{y1-y0}), {total} px; palabra en contacto: {contacto} px')
if contacto > total * 0.002:
    sys.exit('La moto no se separa limpia de la palabra: no se genera el ícono.')

recorte = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
recorte[..., :3] = NARANJA_VIVO
recorte[..., 3] = np.where(moto[y0:y1, x0:x1], a[y0:y1, x0:x1], 0)
dibujo = Image.fromarray(recorte, 'RGBA')

# Fondo dibujado a 4x y reducido, para bordes suaves.
S = 4
fondo = Image.new('RGBA', (LADO * S, LADO * S), (0, 0, 0, 0))
ImageDraw.Draw(fondo).rounded_rectangle((0, 0, LADO * S - 1, LADO * S - 1), radius=int(LADO * S * RADIO), fill=TINTA + (255,))
fondo = fondo.resize((LADO, LADO), Image.LANCZOS)

ancho = round(LADO * OCUPA)
alto = round(dibujo.height * ancho / dibujo.width)
dibujo = dibujo.resize((ancho, alto), Image.LANCZOS)
fondo.alpha_composite(dibujo, ((LADO - ancho) // 2, (LADO - alto) // 2))
fondo.save(SALIDA)
print(f'{SALIDA}: {LADO}x{LADO}, moto {ancho}x{alto}')
