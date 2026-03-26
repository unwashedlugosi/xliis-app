from google import genai
from google.genai import types

client = genai.Client(api_key="AIzaSyCh25UkgNE01MhuOAYPaTPs1PvLXlyh7iw")

designs = [
    {
        "name": "tshirt-skull-cassette",
        "prompt": "T-shirt graphic design on solid black background. A Grateful Dead steal your face skull where the lightning bolt is made of unspooled cassette tape ribbon. Rendered in glowing green phosphor CRT monitor style (#33ff33 green on pure black). Retro terminal computer aesthetic. Below the skull in monospace font: XLII. No other text. Clean vector-style illustration suitable for screen printing on a black t-shirt."
    },
    {
        "name": "tshirt-dancing-bear-tape",
        "prompt": "T-shirt graphic design on solid black background. A single Grateful Dead dancing bear holding a cassette tape, drawn in glowing green phosphor CRT monitor style (#33ff33 green on pure black). The bear is made of scan lines like an old computer terminal. Retro 1980s hacker aesthetic. Below the bear in monospace font: XLII. No other text. Clean illustration suitable for screen printing on a black t-shirt."
    },
    {
        "name": "tshirt-tape-roses",
        "prompt": "T-shirt graphic design on solid black background. A cassette tape with roses growing out of it — the roses are made of tangled tape ribbon. Grateful Dead aesthetic meets vintage computing. Everything rendered in glowing green phosphor CRT monitor color (#33ff33 green on pure black) with CRT scan lines. Below in monospace type: XLII. No other text. Clean illustration suitable for screen printing on a black t-shirt."
    },
    {
        "name": "tshirt-skeleton-headphones",
        "prompt": "T-shirt graphic design on solid black background. A skeleton from the chest up wearing headphones, eyes closed, blissed out listening to music. One bony hand holds a cassette tape. Drawn in glowing green phosphor CRT terminal style (#33ff33 green on pure black) with subtle scan lines. Grateful Dead skeleton art vibe. Below in monospace font: XLII. No other text. Clean illustration suitable for screen printing on a black t-shirt."
    }
]

for d in designs:
    print(f"Generating {d['name']}...")
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash-image",
            contents=d["prompt"],
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"]
            )
        )
        for part in response.candidates[0].content.parts:
            if part.inline_data:
                img_bytes = part.inline_data.data
                with open(f"{d['name']}.png", "wb") as f:
                    f.write(img_bytes)
                print(f"  Saved {d['name']}.png ({len(img_bytes)} bytes)")
                break
        else:
            print(f"  No image returned")
            for part in response.candidates[0].content.parts:
                if hasattr(part, 'text'):
                    print(f"  Text: {part.text[:200]}")
    except Exception as e:
        print(f"  Error: {e}")

print("\nDone!")
