from google import genai
from google.genai import types
from PIL import Image, ImageDraw, ImageFont
import io
import numpy as np

client = genai.Client(api_key="AIzaSyCh25UkgNE01MhuOAYPaTPs1PvLXlyh7iw")
FONT_PATH = "/tmp/VT323-Regular.ttf"

prompts = [
    "Digital art on solid black background. A Grateful Dead dancing bear holding a cassette tape high in one paw, marching to the right. Glowing green (#33ff33) with CRT horizontal scan lines. No text, no border, no frame.",
    "Digital art on solid black background. A Grateful Dead dancing bear mid-stride, holding a cassette tape above his head triumphantly. Bright green phosphor glow (#33ff33) on pure black, with faint scan line texture. No text, no border.",
    "Digital art on solid black background. A Grateful Dead marching bear clutching a cassette tape to his chest with both paws. Green CRT monitor phosphor style (#33ff33). Scan lines. No text, no frame.",
    "Digital art on solid black background. A Grateful Dead dancing bear walking left, one arm extended holding a cassette tape like a torch. Glowing terminal green (#33ff33) on black. CRT aesthetic with scan lines. No text.",
    "Digital art on solid black background. A Grateful Dead dancing bear sitting cross-legged, holding a cassette tape in his lap and looking down at it lovingly. Green phosphor CRT style (#33ff33). Scan lines. No text.",
    "Digital art on solid black background. A Grateful Dead dancing bear dancing with a cassette tape in each paw, arms spread wide. Bright terminal green (#33ff33) on pure black. Scan line texture. No text, no border.",
    "Digital art on solid black background. A Grateful Dead marching bear viewed from the side, cassette tape balanced on his nose. Playful pose. Green CRT phosphor glow (#33ff33). Scan lines. No text.",
    "Digital art on solid black background. Two Grateful Dead dancing bears passing a cassette tape between them, facing each other. Green phosphor CRT style (#33ff33) on pure black. Scan lines. No text, no frame.",
    "Digital art on solid black background. A Grateful Dead dancing bear looking over his shoulder, cassette tape tucked under one arm, walking away. Green terminal phosphor (#33ff33). CRT scan lines. No text.",
    "Digital art on solid black background. A Grateful Dead dancing bear with headphones on, bobbing his head, cassette tape dangling from one paw by the ribbon. Green CRT glow (#33ff33) on black. Scan lines. No text."
]

def crop_to_content(img):
    arr = np.array(img)
    green = arr[:,:,1]
    rows = np.any(green > 20, axis=1)
    cols = np.any(green > 20, axis=0)
    if rows.any() and cols.any():
        rmin, rmax = np.where(rows)[0][[0, -1]]
        cmin, cmax = np.where(cols)[0][[0, -1]]
        pad = 30
        rmin = max(0, rmin - pad)
        rmax = min(arr.shape[0], rmax + pad)
        cmin = max(0, cmin - pad)
        cmax = min(arr.shape[1], cmax + pad)
        return img.crop((cmin, rmin, cmax, rmax))
    return img

def make_front(img, num):
    img = crop_to_content(img)
    canvas = Image.new('RGB', (1800, 2400), (0, 0, 0))
    aspect = img.width / img.height
    target_h = 1200
    target_w = int(target_h * aspect)
    if target_w > 1400:
        target_w = 1400
        target_h = int(target_w / aspect)
    g = img.resize((target_w, target_h), Image.LANCZOS)
    canvas.paste(g, ((1800 - target_w) // 2, 200))
    
    draw = ImageDraw.Draw(canvas)
    font_title = ImageFont.truetype(FONT_PATH, 200)
    text = "XLIIs"
    bbox = draw.textbbox((0, 0), text, font=font_title)
    tw = bbox[2] - bbox[0]
    x = (1800 - tw) // 2
    y_text = 200 + target_h + 80
    
    for r in [6, 4, 2]:
        for dx, dy in [(-r,0),(r,0),(0,-r),(0,r)]:
            draw.text((x+dx, y_text+dy), text, font=font_title, fill=(0, 80, 0))
    draw.text((x, y_text), text, font=font_title, fill=(51, 255, 51))
    
    canvas.save(f"bear-{num:02d}.png", quality=95)
    print(f"  Saved bear-{num:02d}.png")

for i, prompt in enumerate(prompts):
    num = i + 1
    print(f"Generating bear {num}/10...")
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash-image",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"]
            )
        )
        for part in response.candidates[0].content.parts:
            if part.inline_data:
                img = Image.open(io.BytesIO(part.inline_data.data)).convert('RGB')
                make_front(img, num)
                break
        else:
            print(f"  No image returned for bear {num}")
    except Exception as e:
        print(f"  Error: {e}")

print("\nDone!")
