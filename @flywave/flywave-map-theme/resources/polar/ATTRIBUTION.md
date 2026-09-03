# Polar cap textures

`north_pole.jpg` / `south_pole.jpg` — bundled default imagery for the polar caps
(`PolarTileDataSource`). Both are 2048×2048 polar-aspect discs: the geographic
pole at the center, the Web Mercator latitude limit (~85.0511°) at the rim,
oriented like EPSG:3413 (north: prime meridian pointing down) and EPSG:3031
(south: prime meridian pointing up).

## north_pole.jpg

- Source layer: Esri `Polar/Arctic_Imagery` (Arctic Polar Stereographic,
  EPSG:5936, tile matrix set L9, 466 m/px), fetched 2026-09-03
- Content note: the central Arctic Ocean has no true-color satellite coverage in
  this service (bathymetry-style base fill); the disc has been color-graded to
  match the Esri World Imagery tones at the 85.05°N cap boundary
- Processing: 10×10 tile mosaic centered on the pole (false easting/northing
  2,000,000 m applied), rotated 150° clockwise to match the UV convention,
  cropped to the cap disc, resized to 2048², seam inpainted, corner fill.
- License: Esri imagery — attribution "Sources: Esri, Maxar, Earthstar
  Geographics" required when displaying; redistribution terms per Esri Master
  Agreement — replace with own licensed imagery for production if needed.

## south_pole.jpg

- Source layer: NASA true color `MODIS_Terra_CorrectedReflectance_TrueColor`,
  snapshot date **2023-12-15** (Antarctic polar summer, fully lit ice sheet)
- Service: NASA GIBS WMTS, `https://gibs.earthdata.nasa.gov/wmts/epsg3031/best/`,
  tile matrix set `250m`, level 4 (512 m/px)
- Processing: 6×6 tile mosaic around the pole, cropped to the cap disc, resized
  to 2048².

License: NASA imagery is in the public domain (NASA Earth Observations; no
attribution required, given as courtesy).

