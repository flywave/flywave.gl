# MBStyle render-test 全量基线（2026-09-07）

- 夹具总数: 2721（PASS 599 / FAIL 2122，通过率 22.0%）
- 快照: rendering-test-results/ml260907-baseline-snapshot.json

## 家族汇总（按总 mismatch 排序，Top 25）

| 家族 | 夹具 | PASS | 总 mismatch |
|---|---:|---:|---:|
| model-layer | 187 | 0 | 29082174 |
| lighting-3d-mode | 114 | 12 | 9091261 |
| 3d-intersections | 66 | 1 | 4832233 |
| terrain | 67 | 2 | 4532454 |
| building | 50 | 0 | 3253962 |
| globe | 119 | 12 | 2114741 |
| occlusion | 5 | 0 | 1859813 |
| raster-elevation-tiled | 14 | 0 | 1592099 |
| color-theme | 26 | 3 | 1302038 |
| imports | 39 | 2 | 1293603 |
| front-cutoff | 3 | 0 | 1268874 |
| wireframe | 7 | 0 | 1246239 |
| fog | 62 | 14 | 1114449 |
| regressions | 122 | 52 | 1039185 |
| debug | 49 | 0 | 976726 |
| map-projections | 28 | 2 | 915765 |
| custom-source | 7 | 0 | 669949 |
| raster-elevation | 16 | 1 | 660423 |
| custom-layer-js | 6 | 0 | 605023 |
| image | 20 | 11 | 574629 |
| symbol-elevation | 17 | 0 | 517983 |
| skybox | 33 | 4 | 498720 |
| symbol-spacing | 5 | 0 | 477325 |
| sd-hd-conflation | 14 | 0 | 437234 |
| line-width | 18 | 3 | 399093 |

## 失败夹具 Top 40（按 mismatch 排序）

| 夹具 | mismatch |
|---|---:|
| model-layer/landmark-mbx-meshopt-quantization/high-zoom-model-quantization | 1016979 |
| model-layer/landmark-mbx-meshopt-quantization-lod/high-zoom-model-quantization | 1016408 |
| model-layer/trees-puck-extrusions-terrain-shadows-zoomin | 856015 |
| model-layer/trees-puck-extrusions-terrain-shadows-partial | 835875 |
| lighting-3d-mode/emissive-strength/background-pattern/draped | 625430 |
| lighting-3d-mode/emissive-strength-draped-mrt/background-pattern | 625430 |
| occlusion/symbol-occlusion-no-occlusion-before-3d | 624891 |
| occlusion/symbol-occlusion-data-driven | 612099 |
| model-layer/landmark-part-styling-indirect-update-doors-lod | 610365 |
| occlusion/symbol-occlusion-no-occlusion-after-3d | 591079 |
| model-layer/landmark-mbx-meshopt-quantization-lod/highlights | 585136 |
| model-layer/buildings-trees-shadows-casting | 583410 |
| model-layer/landmark-mbx-meshopt-quantization-lod/castro-theater-quantization | 572989 |
| model-layer/landmark-mbx-meshopt-quantization/highlights | 566522 |
| model-layer/buildings-trees-shadows-fog-fade | 557544 |
| model-layer/landmark-part-styling-indirect-update-doors | 528628 |
| model-layer/landmark-part-styling-indirect-doors-no-shadows | 513830 |
| model-layer/landmark-mbx-meshopt-quantization/castro-theater-quantization | 501154 |
| front-cutoff/nyc-night-buildings | 496088 |
| front-cutoff/nyc-buildings | 491134 |
| model-layer/landmark-mbx-meshopt-quantization/z-offset-v2-port | 466315 |
| wireframe/instanced-rendering | 464641 |
| model-layer/trees-shadows-terrain-high-altitude | 460665 |
| model-layer/landmark-part-styling-indirect-doors-no-shadows-lod | 455418 |
| model-layer/landmark-mbx-meshopt-colors | 437403 |
| wireframe/globe-high-exaggeration | 432364 |
| model-layer/buildings-trees-shadows-fog | 415709 |
| model-layer/model-pbr-light | 407470 |
| model-layer/landmark-mbx-meshopt-quantization-lod/z-offset-v2-station | 397502 |
| model-layer/landmark-mbx-meshopt-quantization/z-offset-v2-station | 396200 |
| model-layer/landmark-z-offset-scale-munich-museum | 375954 |
| model-layer/landmark-mbx-meshopt-quantization-lod/z-offset-v2 | 362122 |
| model-layer/landmark-z-offset-scale-munich-museum-lod | 361657 |
| model-layer/landmark-mbx-meshopt-quantization/z-offset-v2 | 344614 |
| model-layer/model-no-texcooords-textures | 340295 |
| lighting-3d-mode/shadow/shimmering | 311572 |
| model-layer/landmark-z-offset-munich-museum-terrain | 309393 |
| model-layer/landmark-z-offset-munich-museum-terrain-lod | 295886 |
| model-layer/landmark-part-styling-indirect-update-lod | 283557 |
| front-cutoff/nyc-terrain-buildings | 281652 |

