# textrnr filter

Open-source **lo-fi night** image filter: soft focus, amber bloom, cool shadows, vignette, and dense colored film grain.

Runs in the browser (GitHub Pages) or via a small Python CLI. In the web app, photos stay on your device.

## Live demo

**https://arjunkshah12345-hash.github.io/textrnr-filter/**

## Web app

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

1. Drop, paste (⌘V / Ctrl+V), or try the sample  
2. Pick a preset (Classic / Soft / Heavy / Cold) or tweak sliders  
3. Filter auto-applies — drag the compare slider, then **Download PNG**

## Python CLI

```bash
pip install -r python/requirements.txt
python python/textrnr_filter.py input.jpg -o out.png
python python/textrnr_filter.py input.jpg --strength 1.2 --blur 16 --grain 42
```

## Pipeline

1. Soft focus (stacked blur)  
2. Halation / bloom on highlights  
3. Warm highlights + cool teal shadows  
4. Contrast / saturation nudge  
5. Light chromatic aberration  
6. Vignette  
7. Multicolored film grain  

## License

MIT
