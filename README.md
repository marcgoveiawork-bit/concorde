# Concorde: a scroll-driven 3D story

A single-page, scroll-driven 3D website about Concorde in the style of a travel poster: a white studio with a red
runway, turning blue as the aircraft climbs.
Designed by Marc Pio Goveia as a personal learning project in cinematic web design.
Built from the [SR-71 Blackbird template](https://github.com/marcgoveiawork-bit/sr71-blackbird): read its `PLAYBOOK.md`
for the architecture, the problems already solved and the style system.

## The story

| Chapter | What happens |
|---|---|
| Loader | An Olympus 593 compressor face spins up with the loading progress, then the page flies through it |
| Poster | Thin, widely spaced CONCORDE / MACH 2 type across a red runway (red on white, white on red); the aircraft taxis up the runway onto it, top-down, casting a real shadow |
| Painted to keep cool | Walkaround: aluminium airframe, reflective white paint, 127 °C nose |
| Drawn in two languages | Front view against the pre-series exploded-view drawing (navy on white); the text pins while the sheet scrolls away |
| Exterior tour | Droop nose (it drops to 12.5° and the visor is down), ogee delta wing, intakes, Olympus nozzles, trim tanks |
| Takeoff | Pinned: four engines in reheat |
| The price of speed | Unit cost, number built, a 1996 ticket; side-on lift-off as the gear retracts and the doors close |
| Climb, cruise | Nose up and visor closed, reheat through the sound barrier, then off for the Mach 2 cruise |
| Records | Animated figures |
| The last of its kind | The aircraft shrinks into the distance and disappears |
| Finale | Closing poster ("Arrive before you leave") scrolls into place; the aircraft flies in from the left into the gap |

Auto-play tour, replay loop and full screen work as in the SR-71 site.

Releasing: bump `?v=` on the `main.js` script tag in `index.html`, so browsers fetch the new files.

## Run it locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## What's new compared with the SR-71 template (`main.js`)

- **Droop nose and visor**: the skin ahead of the hinge is bent on the vertices (`prepareDroop` / `updateNose`), so the
  nose drops 5° for taxi, 12.5° at its tour stop and rises flush in flight; the visor and its glass slide down into it.
  Key fields: `droop` (degrees), `visor` (1 = lowered).
- **Gear doors**: the model has open and closed gear doors, swapped once the legs are stowed, so the camera may look
  at the underside (the SR-71's "camera stays above the jet" rule is gone). Gear legs are split out of merged meshes
  by position (`splitMesh`, `legOf`).
- **Four reheat flames** at the nozzle pairs (normal blending, so they show on white); no green flash, no heat glow.
- **Poster look**: the backdrop is a gradient canvas driven by the `sky` key field (0 = white studio, 1 = altitude
  blue, via a bright sky blue so the blend never turns grey); `html.sky` switches the text from navy to white past 0.45.
  The floor is shadow-only over that backdrop; the red runway is its own strip; the blue edge vignette is CSS (`#veil`).
  Neutral tone mapping keeps the whites white.
- Points on the aircraft (`ANCHORS`, `NOZZLES`, `NOSE_HINGE`) are written in the model's raw coordinates, measured with
  `tools/inspect.html`, and converted to jet units after loading.

## Files

| Path | What |
|---|---|
| `index.html` | Page, styles, chapter text, loader |
| `main.js` | The 3D scene and scroll engine |
| `assets/concorde.json`, `assets/blueprint.json` | Model and blueprint packed as base64 (loaded with the `?v=` tag from index.html) |
| `source/blueprint.png` | The blueprint sheet as an image |
| `source/reference/` | The original exploded-view drawing |
| `tools/clean-blueprint.py` | Removes the drawing's callouts, leader lines and legend and writes the blueprint (OpenCV) |
| `tools/build-model.mjs` | Builds `assets/concorde.json` from the Sketchfab glTF download (textures to 2k JPEG, quantized) |
| `tools/blueprint.html`, `tools/make-blueprint.js` | Earlier blueprint drawn from the model (linework + silhouette), kept as an alternative |
| `tools/inspect.html` | Model inspection page: part bounds and orthographic views |
| `tools/screenshot.js` | Headless screenshots for testing (`PHONE=1` for a touch phone viewport) |

Tools setup: `cd tools && npm install`. To rebuild the model, download the glTF from the Sketchfab page below, unzip it,
and run `node tools/build-model.mjs <unzipped folder> assets` (writes `concorde.glb` and `concorde.json`; keep the .json).

## Credits

- 3D model: [Concorde 3D Model](https://sketchfab.com/3d-models/concorde-3d-model-d2222f34152d4850afff0124872fc9ba)
  by [thomas333](https://sketchfab.com/thomas333), licensed under [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/).
  The model carries British Airways livery.
- Blueprint: Concorde pre-series manufacturing breakdown drawing (Sud Aviation / BAC), callouts removed. Check its
  rights before wider publication.
- Libraries: [three.js](https://threejs.org), [Lenis](https://lenis.darkroom.engineering) (loaded from jsDelivr).
- Fonts: Anton, Exo 2, Great Vibes, Barlow, Barlow Condensed (Google Fonts).

A fan tribute and learning project. Not affiliated with Airbus, BAE Systems, British Airways or Air France.
