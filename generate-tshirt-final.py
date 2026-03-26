from google import genai
from google.genai import types
from PIL import Image, ImageDraw, ImageFont
import io

client = genai.Client(api_key="AIzaSyCh25UkgNE01MhuOAYPaTPs1PvLXlyh7iw")
FONT_PATH = "/tmp/VT323-Regular.ttf"

# Generate 4 front graphics (no text)
fronts = [
    {
        "name": "skull-cassette",
        "prompt": "T-shirt graphic on solid black background. A Grateful Dead steal your face skull where the lightning bolt is made of unspooled cassette tape ribbon. Rendered in glowing green phosphor CRT monitor style (#33ff33 green on pure black). Retro terminal aesthetic with scan lines. NO TEXT ANYWHERE. Just the graphic, centered, with lots of black space below. Clean vector illustration."
    },
    {
        "name": "dancing-bear",
        "prompt": "T-shirt graphic on solid black background. A Grateful Dead dancing bear holding a cassette tape high in one paw, rendered in glowing green phosphor CRT monitor style (#33ff33 green on pure black) with horizontal scan lines through the bear. Retro 1980s hacker aesthetic. NO TEXT ANYWHERE. Just the bear graphic, centered, with lots of black space below. Clean illustration."
    },
    {
        "name": "tape-roses",
        "prompt": "T-shirt graphic on solid black background. A cassette tape with roses growing out of it, the roses made of tangled tape ribbon. Grateful Dead aesthetic meets vintage computing. Glowing green phosphor CRT color (#33ff33 green on pure black) with CRT scan lines. NO TEXT ANYWHERE. Just the graphic, centered, with black space below. Clean illustration."
    },
    {
        "name": "skeleton-headphones",
        "prompt": "T-shirt graphic on solid black background. A skeleton from chest up wearing over-ear headphones, eyes closed, blissed out, one bony hand holding a cassette tape. Green phosphor CRT terminal style (#33ff33 on pure black) with subtle scan lines. Grateful Dead skeleton vibe. NO TEXT ANYWHERE. Just the graphic, centered, with black space below."
    }
]

# Collection descriptions for the back
collections = [
    {
        "name": "CORNELL AND COMPANY",
        "meta": "42 shows · 1977",
        "en": "The year the band was perfect.",
        "lang": "Welsh",
        "translated": "Y flwyddyn roedd y band yn berffaith."
    },
    {
        "name": "SIX HUNDRED FOUR",
        "meta": "37 shows · 1974",
        "en": "604 speakers. 26,000 watts. One impossible year.",
        "lang": "Hungarian",
        "translated": "604 hangszóró. 26 000 watt. Egy lehetetlen év."
    },
    {
        "name": "YOUNG BETTYS",
        "meta": "59 shows · 1969–1973",
        "en": "Betty Cantor-Jackson's earliest recordings.",
        "lang": "Romanian",
        "translated": "Primele înregistrări ale lui Betty Cantor-Jackson."
    },
    {
        "name": "NEW ANIMAL",
        "meta": "33 shows · 1979–1980",
        "en": "Brent Mydland arrives and the Dead are reborn.",
        "lang": "Estonian",
        "translated": "Brent Mydland saabub ja Dead sünnib uuesti."
    }
]

def make_front(graphic_img, name):
    """Compose front: graphic + XLIIs text"""
    canvas = Image.new('RGB', (1800, 2400), (0, 0, 0))
    
    # Resize graphic to fit top portion
    g = graphic_img.resize((1200, 1200), Image.LANCZOS)
    canvas.paste(g, (300, 200))
    
    draw = ImageDraw.Draw(canvas)
    font_title = ImageFont.truetype(FONT_PATH, 180)
    
    # Draw "XLIIs" centered below graphic
    text = "XLIIs"
    bbox = draw.textbbox((0, 0), text, font=font_title)
    tw = bbox[2] - bbox[0]
    x = (1800 - tw) // 2
    
    # Glow effect
    for offset in range(3, 0, -1):
        alpha = 40 * offset
        glow_color = (0, int(255 * 0.3), 0)
        draw.text((x, 1480), text, font=font_title, fill=glow_color)
    draw.text((x, 1480), text, font=font_title, fill=(51, 255, 51))
    
    canvas.save(f"tshirt-front-{name}.png", quality=95)
    print(f"  Saved tshirt-front-{name}.png")
    return canvas

def make_back():
    """Compose back: The Collections Spring 2026 + all 4 collections"""
    canvas = Image.new('RGB', (1800, 2400), (0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    
    font_header = ImageFont.truetype(FONT_PATH, 72)
    font_season = ImageFont.truetype(FONT_PATH, 52)
    font_name = ImageFont.truetype(FONT_PATH, 56)
    font_meta = ImageFont.truetype(FONT_PATH, 36)
    font_desc = ImageFont.truetype(FONT_PATH, 38)
    font_trans = ImageFont.truetype(FONT_PATH, 34)
    
    GREEN = (51, 255, 51)
    DIM_GREEN = (34, 170, 34)
    DARK_GREEN = (26, 120, 26)
    
    y = 200
    
    # Header
    text = "THE COLLECTIONS"
    bbox = draw.textbbox((0, 0), text, font=font_header)
    tw = bbox[2] - bbox[0]
    draw.text(((1800 - tw) // 2, y), text, font=font_header, fill=GREEN)
    y += 100
    
    text = "SPRING 2026"
    bbox = draw.textbbox((0, 0), text, font=font_season)
    tw = bbox[2] - bbox[0]
    draw.text(((1800 - tw) // 2, y), text, font=font_season, fill=DIM_GREEN)
    y += 140
    
    # Divider
    draw.line([(400, y), (1400, y)], fill=(51, 255, 51, 40), width=1)
    y += 50
    
    for c in collections:
        # Collection name
        bbox = draw.textbbox((0, 0), c["name"], font=font_name)
        tw = bbox[2] - bbox[0]
        draw.text(((1800 - tw) // 2, y), c["name"], font=font_name, fill=GREEN)
        y += 65
        
        # Meta
        bbox = draw.textbbox((0, 0), c["meta"], font=font_meta)
        tw = bbox[2] - bbox[0]
        draw.text(((1800 - tw) // 2, y), c["meta"], font=font_meta, fill=DARK_GREEN)
        y += 55
        
        # English description
        bbox = draw.textbbox((0, 0), c["en"], font=font_desc)
        tw = bbox[2] - bbox[0]
        draw.text(((1800 - tw) // 2, y), c["en"], font=font_desc, fill=DIM_GREEN)
        y += 50
        
        # Translated description
        bbox = draw.textbbox((0, 0), c["translated"], font=font_trans)
        tw = bbox[2] - bbox[0]
        draw.text(((1800 - tw) // 2, y), c["translated"], font=font_trans, fill=DARK_GREEN)
        y += 90
    
    # Bottom: XLIIs
    font_bottom = ImageFont.truetype(FONT_PATH, 60)
    text = "XLIIs"
    bbox = draw.textbbox((0, 0), text, font=font_bottom)
    tw = bbox[2] - bbox[0]
    draw.text(((1800 - tw) // 2, 2200), text, font=font_bottom, fill=DARK_GREEN)
    
    canvas.save("tshirt-back.png", quality=95)
    print("  Saved tshirt-back.png")

# Generate front graphics
for f in fronts:
    print(f"Generating {f['name']}...")
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash-image",
            contents=f["prompt"],
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"]
            )
        )
        for part in response.candidates[0].content.parts:
            if part.inline_data:
                img = Image.open(io.BytesIO(part.inline_data.data)).convert('RGB')
                make_front(img, f["name"])
                break
        else:
            print(f"  No image returned for {f['name']}")
    except Exception as e:
        print(f"  Error: {e}")

# Generate back
print("Generating back...")
make_back()

print("\nDone!")
