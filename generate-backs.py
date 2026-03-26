import json
from PIL import Image, ImageDraw, ImageFont

FONT_PATH = "/tmp/VT323-Regular.ttf"

collections = [
    {
        "name": "CORNELL AND COMPANY",
        "meta": "42 shows · 1977",
        "en": "The year the band was perfect.",
        "translated": "Y flwyddyn roedd y band yn berffaith.",
        "shows": [
            "2/26 Swing Auditorium, San Bernardino", "3/18 Winterland Arena, San Francisco", "3/19 Winterland Arena, San Francisco",
            "4/22 The Spectrum, Philadelphia", "4/23 Civic Center, Springfield", "4/25 Capitol Theatre, Passaic",
            "4/27 Capitol Theatre, Passaic", "4/29 The Palladium, New York", "4/30 The Palladium, New York",
            "5/4 The Palladium, New York", "5/5 Coliseum, New Haven", "5/7 Boston Garden, Boston",
            "5/8 Barton Hall, Ithaca", "5/9 War Memorial, Buffalo", "5/11 Civic Center, St. Paul",
            "5/13 Auditorium Theatre, Chicago", "5/17 Memorial Coliseum, Tuscaloosa", "5/18 Fox Theatre, Atlanta",
            "5/19 Fox Theatre, Atlanta", "5/21 Civic Center, Lakeland", "5/22 Sportatorium, Pembroke Pines",
            "5/25 The Mosque, Richmond", "5/26 Civic Center, Baltimore", "6/8 Winterland, San Francisco",
            "6/9 Winterland, San Francisco", "9/3 Raceway Park, Englishtown", "9/28 Paramount, Seattle",
            "10/1 Memorial Coliseum, Portland", "10/2 Paramount, Portland", "10/7 Johnson Gym, Albuquerque",
            "10/9 McNichols Arena, Denver", "10/11 Lloyd Noble Center, Norman", "10/28 Memorial Hall, Kansas City",
            "10/29 Convocation Center, DeKalb", "10/30 Cobo Arena, Detroit", "11/1 Cobo Arena, Detroit",
            "11/2 Colgate University, Hamilton", "11/5 War Memorial, Rochester", "11/6 Veterans Arena, Binghamton",
            "12/27 Winterland, San Francisco", "12/29 Winterland, San Francisco", "12/30 Winterland, San Francisco"
        ]
    },
    {
        "name": "SIX HUNDRED FOUR",
        "meta": "37 shows · 1974",
        "en": "604 speakers. 26,000 watts. One impossible year.",
        "translated": "604 hangszóró. 26 000 watt. Egy lehetetlen év.",
        "shows": [
            "2/22 Winterland, San Francisco", "2/23 Winterland, San Francisco", "2/24 Winterland, San Francisco",
            "3/23 Cow Palace, Daly City", "5/12 Univ. of Nevada, Reno", "5/14 Adams Field House, Missoula",
            "5/17 P.N.E. Coliseum, Vancouver", "5/19 Memorial Coliseum, Portland", "5/21 Edmundson Pavilion, Seattle",
            "6/8 Coliseum Stadium, Oakland", "6/16 State Fairgrounds, Des Moines", "6/18 Freedom Hall, Louisville",
            "6/20 The Omni, Atlanta", "6/22 Jai-Alai Fronton, Miami", "6/23 Jai-Alai Fronton, Miami",
            "6/26 Civic Center, Providence", "6/28 Boston Garden, Boston", "6/30 Civic Center, Springfield",
            "7/19 Selland Arena, Fresno", "7/25 Intl Amphitheatre, Chicago", "7/27 Civic Center, Roanoke",
            "7/29 Capital Centre, Landover", "7/31 Dillon Stadium, Hartford", "8/4 Civic Center, Philadelphia",
            "8/5 Roosevelt Stadium, Jersey City", "8/6 Roosevelt Stadium, Jersey City",
            "9/9 Alexandra Palace, London", "9/10 Alexandra Palace, London", "9/11 Alexandra Palace, London",
            "9/18 Parc des Expositions, Dijon", "9/20 Palais des Sports, Paris", "9/21 Palais des Sports, Paris",
            "10/16 Winterland, San Francisco", "10/17 Winterland, San Francisco", "10/18 Winterland, San Francisco",
            "10/19 Winterland, San Francisco", "10/20 Winterland, San Francisco"
        ]
    },
    {
        "name": "YOUNG BETTYS",
        "meta": "59 shows · 1969–1973",
        "en": "Betty Cantor-Jackson's earliest recordings.",
        "translated": "Primele înregistrări ale lui Betty Cantor-Jackson.",
        "shows": [
            "2/27/69 Fillmore West, SF", "2/28/69 Fillmore West, SF", "3/1/69 Fillmore West, SF",
            "3/2/69 Fillmore West, SF", "5/23/69 Seminole Village, Hollywood",
            "2/18/71 Capitol Theater, Port Chester", "2/19/71 Capitol Theater, Port Chester",
            "2/20/71 Capitol Theater, Port Chester", "2/21/71 Capitol Theater, Port Chester",
            "2/23/71 Capitol Theater, Port Chester", "2/24/71 Capitol Theater, Port Chester",
            "4/4/71 Manhattan Center, NYC", "4/5/71 Manhattan Center, NYC", "4/6/71 Manhattan Center, NYC",
            "4/7/71 Manhattan Center, NYC", "4/8/71 Manhattan Center, NYC",
            "4/25/71 Fillmore East, NYC", "4/26/71 Fillmore East, NYC", "4/27/71 Fillmore East, NYC",
            "4/28/71 Fillmore East, NYC", "4/29/71 Fillmore East, NYC",
            "8/6/71 Palladium, Hollywood", "12/14/71 Hill Auditorium, Ann Arbor", "12/15/71 Hill Auditorium, Ann Arbor",
            "3/21/72 Academy of Music, NYC", "3/22/72 Academy of Music, NYC", "3/23/72 Academy of Music, NYC",
            "3/25/72 Academy of Music, NYC", "3/26/72 Academy of Music, NYC", "3/27/72 Academy of Music, NYC",
            "3/28/72 Academy of Music, NYC", "4/8/72 Wembley, London", "4/8/72 Wembley, London",
            "4/26/72 Hundred Acres, Bickershaw", "5/3/72 Olympia, Paris", "5/4/72 Olympia, Paris",
            "5/7/72 Bickershaw Festival, Wigan", "5/26/72 Lyceum, London",
            "7/18/72 Roosevelt Stadium, Jersey City", "8/12/72 Memorial Aud., Sacramento",
            "8/20/72 Berkeley Community, Berkeley", "8/21/72 Berkeley Community, Berkeley",
            "8/22/72 Berkeley Community, Berkeley", "8/24/72 Berkeley Community, Berkeley",
            "8/25/72 Berkeley Community, Berkeley", "8/27/72 Faire Grounds, Veneta",
            "9/21/72 The Spectrum, Philadelphia", "11/19/72 Hofheinz Pavilion, Houston",
            "2/9/73 Maples Pavilion, Palo Alto", "2/15/73 Dane County, Madison",
            "2/21/73 Assembly Hall, Champaign", "2/22/73 Dane County, Madison",
            "3/24/73 The Spectrum, Philadelphia", "6/10/73 RFK Stadium, Washington",
            "6/22/73 P.N.E. Coliseum, Vancouver", "6/24/73 Memorial Coliseum, Portland",
            "7/28/73 Watkins Glen Raceway", "11/11/73 Winterland, San Francisco",
            "11/14/73 Sports Arena, San Diego"
        ]
    },
    {
        "name": "NEW ANIMAL",
        "meta": "33 shows · 1979–1980",
        "en": "Brent Mydland arrives and the Dead are reborn.",
        "translated": "Brent Mydland saabub ja Dead sünnib uuesti.",
        "shows": [
            "4/22/79 Spartan Stadium, San Jose", "5/5/79 Civic Center, Baltimore",
            "8/4/79 Auditorium Arena, Oakland", "9/2/79 Civic Center, Augusta",
            "10/25/79 Coliseum, New Haven", "10/27/79 Cape Cod Coliseum, S. Yarmouth",
            "10/31/79 Nassau Coliseum, Uniondale", "11/1/79 Nassau Coliseum, Uniondale",
            "11/2/79 Nassau Coliseum, Uniondale", "11/6/79 The Spectrum, Philadelphia",
            "11/9/79 War Memorial, Buffalo", "11/10/79 Crisler Arena, Ann Arbor",
            "12/26/79 Oakland Auditorium", "12/28/79 Auditorium Arena, Oakland",
            "12/30/79 Auditorium Arena, Oakland", "12/31/79 Auditorium Arena, Oakland",
            "1/13/80 Coliseum, Oakland", "3/30/80 Capitol Theatre, Passaic",
            "5/15/80 Nassau Coliseum, Uniondale", "5/16/80 Nassau Coliseum, Uniondale",
            "6/20/80 West High Aud., Anchorage", "8/19/80 Uptown Theater, Chicago",
            "9/2/80 War Memorial, Rochester", "10/4/80 Warfield, San Francisco",
            "10/14/80 Warfield, San Francisco", "10/26/80 Radio City, New York",
            "10/30/80 Radio City, New York", "10/31/80 Radio City, New York",
            "11/28/80 Civic Center, Lakeland", "11/30/80 Fox Theatre, Atlanta",
            "12/26/80 Auditorium Arena, Oakland", "12/28/80 Auditorium Arena, Oakland",
            "12/31/80 Auditorium Arena, Oakland"
        ]
    }
]

GREEN = (51, 255, 51)
DIM_GREEN = (34, 170, 34)
DARK_GREEN = (26, 120, 26)
FAINT_GREEN = (18, 90, 18)

# Calculate height needed
# Each collection: name + meta + en + translated + shows in 3 cols
# Estimate ~2800px tall for safety
canvas = Image.new('RGB', (1800, 3600), (0, 0, 0))
draw = ImageDraw.Draw(canvas)

font_header = ImageFont.truetype(FONT_PATH, 72)
font_season = ImageFont.truetype(FONT_PATH, 52)
font_name = ImageFont.truetype(FONT_PATH, 52)
font_meta = ImageFont.truetype(FONT_PATH, 32)
font_desc = ImageFont.truetype(FONT_PATH, 34)
font_trans = ImageFont.truetype(FONT_PATH, 30)
font_show = ImageFont.truetype(FONT_PATH, 20)
font_bottom = ImageFont.truetype(FONT_PATH, 48)

y = 120

# Header
text = "THE COLLECTIONS"
bbox = draw.textbbox((0, 0), text, font=font_header)
draw.text(((1800 - (bbox[2]-bbox[0])) // 2, y), text, font=font_header, fill=GREEN)
y += 90

text = "SPRING 2026"
bbox = draw.textbbox((0, 0), text, font=font_season)
draw.text(((1800 - (bbox[2]-bbox[0])) // 2, y), text, font=font_season, fill=DIM_GREEN)
y += 100

draw.line([(300, y), (1500, y)], fill=FAINT_GREEN, width=1)
y += 40

for c in collections:
    # Collection name
    bbox = draw.textbbox((0, 0), c["name"], font=font_name)
    draw.text(((1800 - (bbox[2]-bbox[0])) // 2, y), c["name"], font=font_name, fill=GREEN)
    y += 58

    # Meta
    bbox = draw.textbbox((0, 0), c["meta"], font=font_meta)
    draw.text(((1800 - (bbox[2]-bbox[0])) // 2, y), c["meta"], font=font_meta, fill=DARK_GREEN)
    y += 42

    # English
    bbox = draw.textbbox((0, 0), c["en"], font=font_desc)
    draw.text(((1800 - (bbox[2]-bbox[0])) // 2, y), c["en"], font=font_desc, fill=DIM_GREEN)
    y += 40

    # Translated
    bbox = draw.textbbox((0, 0), c["translated"], font=font_trans)
    draw.text(((1800 - (bbox[2]-bbox[0])) // 2, y), c["translated"], font=font_trans, fill=DARK_GREEN)
    y += 40

    # Shows in 3 columns
    shows = c["shows"]
    col_width = 540
    col_starts = [100, 640, 1180]
    row_height = 22
    rows_needed = (len(shows) + 2) // 3

    for i, show in enumerate(shows):
        col = i // rows_needed
        row = i % rows_needed
        if col > 2:
            col = 2
            row = rows_needed
        x = col_starts[min(col, 2)]
        sy = y + row * row_height
        draw.text((x, sy), show, font=font_show, fill=FAINT_GREEN)

    y += rows_needed * row_height + 35

    # Divider between collections
    draw.line([(500, y), (1300, y)], fill=FAINT_GREEN, width=1)
    y += 35

# Bottom XLIIs
y += 20
text = "XLIIs"
bbox = draw.textbbox((0, 0), text, font=font_bottom)
draw.text(((1800 - (bbox[2]-bbox[0])) // 2, y), text, font=font_bottom, fill=DARK_GREEN)
y += 80

# Crop to actual content
canvas = canvas.crop((0, 0, 1800, y + 40))
canvas.save("tshirt-back.png", quality=95)
print(f"Saved tshirt-back.png ({canvas.size[0]}x{canvas.size[1]})")
