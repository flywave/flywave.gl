# @flywave/flywave-kriging-gl

Kriging interpolation library with Three.js WebGL renderer, based on [oeo4b/kriging.js](https://github.com/oeo4b/kriging.js).

## Installation

```bash
npm install @flywave/flywave-kriging-gl
```

## Modern API Usage

```javascript
import { KrigingSurface } from '@flywave/flywave-kriging-gl';

// Create kriging surface with data points
const surface = new KrigingSurface(values, xCoords, yCoords);

// Train the variogram
surface.train('exponential', 0, 100);

// Generate surface texture
const texture = surface.generateColoredTexture(
  [0, 0],           // llCorner
  [10, 10],         // urCorner
  [100, 100],       // gridSize
  [
    { value: 0, color: '#ff0000' },
    { value: 25, color: '#00ff00' },
    { value: 50, color: '#0000ff' }
  ]
);

// Predict at specific point
const value = surface.predict(5, 5);

// Clean up resources
surface.dispose();
```

## Legacy API Usage

```javascript
import { train, predict, generate } from '@flywave/flywave-kriging-gl';

// Train the variogram
const variogram = train(t, x, y, 'exponential', 0, 100);

// Predict at specific point
const value = predict(10, 20, variogram);

// Generate WebGL rendered grid with Three.js
const imageBitmap = await generate({
  variogram,
  llCorner: [0, 0],
  gridSize: [100, 100],
  cellSize: 1,
  outputFormat: 'imagebitmap',
  colorMapping: [
    { min: 0, max: 10, color: '#ff0000' },
    { min: 10, max: 20, color: '#00ff00' },
    { min: 20, max: 30, color: '#0000ff' }
  ]
});
```

## API

### Modern API

#### KrigingSurface

Main class for kriging interpolation surface.

##### Constructor

```javascript
new KrigingSurface(values, xCoords, yCoords, glContext?)
```

##### Methods

- `train(model, sigma2, alpha)` - Train a variogram model
- `predict(x, y)` - Predict a value at coordinates (x, y)
- `generateTexture(llCorner, urCorner, gridSize)` - Generate interpolation texture
- `generateColoredTexture(llCorner, urCorner, gridSize, colorStops)` - Generate colored interpolation texture
- `getVariogramInfo()` - Get variogram information
- `dispose()` - Clean up resources

### Legacy API

#### train(t, x, y, model, sigma2, alpha)

Train a variogram model.

#### predict(x, y, variogram)

Predict a value at coordinates (x, y).

#### generate(options)

Generate a WebGL rendered grid using Three.js.

Options:
- `variogram`: Trained variogram
- `llCorner`: Lower left corner coordinates [x, y]
- `gridSize`: Grid dimensions [width, height]
- `cellSize`: Cell size in coordinate units
- `outputFormat`: 'value-buffer', 'packed-imagebitmap', or 'imagebitmap'
- `packValueRange`: Required for 'packed-imagebitmap' format
- `colorMapping`: Required for 'imagebitmap' format

## License

Apache-2.0