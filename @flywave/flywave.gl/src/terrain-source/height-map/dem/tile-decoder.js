/*
 * Copyright © 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import DEMData from "./dem_data";
import {RGBAImage} from '../util/image.js';
import { RESTER_DEM_TILE_DECODER_ID } from "../constants";

const { ImageBitmap } = self;

class RasterDEMTileWorkerSource { 

  connect() {
    return Promise.resolve()
  }

  configure(){}

  decodeTile(params) {
    const { uid, encoding, rawImageData, padding, buildQuadTree } = params;
    // Main thread will transfer ImageBitmap if offscreen decode with OffscreenCanvas is supported, else it will transfer an already decoded image.
    const imagePixels = (ImageBitmap && rawImageData instanceof ImageBitmap) ? this.getImageData(rawImageData, padding) : rawImageData;
    const dem = new DEMData(uid, imagePixels, encoding, padding < 1, buildQuadTree);
    dem._buildDisplacementMap();
    dem._buildQuadTree();
    return Promise.resolve({dem,geometries:[],techniques:[]})
  }

  getImageData(imgBitmap, padding) {
    // Lazily initialize OffscreenCanvas
    if (!this.offscreenCanvas || !this.offscreenCanvasContext) {
      // Dem tiles are typically 256x256
      this.offscreenCanvas = new OffscreenCanvas(imgBitmap.width, imgBitmap.height);
      this.offscreenCanvasContext = this.offscreenCanvas.getContext('2d');
      this.offscreenCanvas.imageSmoothingEnabled = true;
    }

    this.offscreenCanvas.width = imgBitmap.width;
    this.offscreenCanvas.height = imgBitmap.height;

    this.offscreenCanvasContext.drawImage(imgBitmap, 0, 0, imgBitmap.width, imgBitmap.height);
    
    // Insert or remove defined padding around the image to allow backfilling for neighboring data.
    const imgData = this.offscreenCanvasContext.getImageData(-padding, -padding, imgBitmap.width + 2 * padding, imgBitmap.height + 2 * padding);
    this.offscreenCanvasContext.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
    return new RGBAImage({ width: imgData.width, height: imgData.height }, imgData.data);
  }
}

export { RESTER_DEM_TILE_DECODER_ID, RasterDEMTileWorkerSource }