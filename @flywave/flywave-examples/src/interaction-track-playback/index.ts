/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Track playback (v2): the digital-twin staple — a mover following a GPS
 * track with an optional chase camera.
 *
 * Engine contracts used here (all verified in mapview source):
 * - MapAnchor position updates EVERY FRAME are legal and cheap:
 *   `MapAnchors.update()` re-projects `anchor.anchor` before re-parenting the
 *   anchor into the per-frame rebuilt scene root (rule 2), so assigning the
 *   anchor property per tick costs one projection — no re-decode.
 * - The playback clock is driven by `MapViewEventNames.Update`, which only
 *   fires while `mapView.animating`; `beginAnimation()` on play and
 *   `endAnimation()` on pause keep the on-demand render loop ticking without
 *   a private requestAnimationFrame loop (rule 3).
 * - Camera follow uses a bare `mapView.lookAt({ target })` per tick, NOT
 *   `flyTo`: `flyTo` starts a one-shot CameraKeyTrackAnimation that would be
 *   restarted on every tick (stutter). A direct lookAt is exact per frame, so
 *   the follow is smooth by construction.
 * - The traveled-path highlight is a MapAnchor-hosted THREE.Line whose
 *   positions are precomputed relative to the anchor origin and revealed with
 *   `setDrawRange` per tick — no re-upload, and unlike a FeaturesDataSource
 *   `setFromGeojson` re-push there is no worker re-decode per tick.
 */

import {
    type MapAnchor,
    type MapView,
    GeoCoordinates,
    MapViewEventNames,
    FeaturesDataSource
} from "@flywave/flywave.gl";
import * as THREE from "three/webgpu";

import {
    applyPanelStyle,
    attachTerrainImagery,
    createExampleGui,
    createExampleMap,
    demoTerrain,
    logExampleInfo
} from "../common";

import {
    buildTheme,
    createMover,
    generateTrack,
    HOVER_HEIGHT,
    SITE,
    trackGeojson,
    TRACK_DURATION,
    TRACK_POINTS,
    type TrackPoint
} from "./demo-track";

/** Mutable playback state, bound to the dat.GUI panel. */
interface PlaybackState {
    playing: boolean;
    /** Speed multiplier: 0.5x .. 8x. */
    speed: number;
    /** Normalized progress 0..1 (also the GUI scrub slider). */
    progress: number;
    follow: boolean;
}

/** Track playback demo: mover, polyline, traveled highlight, chase camera. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    const { mapView } = await createExampleMap(canvas, {
        themeObject: buildTheme(),
        lookAt: { target: { lat: SITE.lat, lng: SITE.lng }, zoomLevel: 14, tilt: 50 }
    });
    logExampleInfo("interaction-track-playback", mapView);

    // Local DEM gives the mover a terrain-following altitude.
    const terrain = demoTerrain();
    mapView.setElevationSource(terrain);
    // Imagery ground draped into the terrain tiles: with an elevation source
    // active, an independent imagery layer would be coplanar and depth-fight.
    attachTerrainImagery(terrain);

    const track: TrackPoint[] = generateTrack();

    // ---- Full planned route: one FeaturesDataSource polyline ----------------
    // (HighPrecisionLine lives in @flywave/flywave-lines, which the aggregate
    // package does not re-export — FeaturesDataSource is the supported path.)
    const routeSource = new FeaturesDataSource({
        name: "planned-route",
        styleSetName: "track",
        maxDataLevel: 14
    });
    routeSource.setFromGeojson(trackGeojson(track));
    await mapView.addDataSource(routeSource);

    // ---- Traveled highlight: MapAnchor + preallocated line ------------------
    // Vertices are stored RELATIVE to the projected track start (the anchor
    // origin): MapAnchors re-projects only the root every frame, and small
    // kilometer-scale offsets stay float32-precise.
    const anchorOrigin = mapView.projection.projectPoint(
        new GeoCoordinates(track[0].lat, track[0].lng, 0),
        new THREE.Vector3()
    );
    const trailPositions = new Float32Array(TRACK_POINTS * 3);
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
    trailGeometry.setDrawRange(0, 0);
    const trail = new THREE.Line(
        trailGeometry,
        new THREE.LineBasicMaterial({ color: 0xff4436, linewidth: 2 })
    );
    trail.frustumCulled = false; // draw range grows; skip re-culling
    const trailAnchor: MapAnchor = new THREE.Group();
    trailAnchor.name = "traveled-trail";
    trailAnchor.anchor = new GeoCoordinates(track[0].lat, track[0].lng, 0);
    trailAnchor.add(trail);
    mapView.mapAnchors.add(trailAnchor);

    // ---- Mover and playback engine --------------------------------------------
    const mover = createMover(mapView);
    const state: PlaybackState = { playing: false, speed: 1, progress: 0, follow: true };
    let lastTickTime = 0;
    let revealedCount = 0;
    let lastAltitude = 0;

    const hud = document.createElement("div");
    Object.assign(hud.style, {
        position: "absolute",
        left: "12px",
        top: "12px",
        padding: "10px 14px",
        font: "12px/1.7 monospace",
        color: "#e8eaed",
        whiteSpace: "pre-line",
        pointerEvents: "none",
        minWidth: "240px"
    } as CSSStyleDeclaration);
    applyPanelStyle(hud);
    document.body.appendChild(hud);

    /** Terrain-following altitude; falls back to the last query while the
     * DEM tiles for the area are still loading. */
    const altitudeAt = (lat: number, lng: number): number => {
        const height = terrain.getElevationProvider()?.getHeight(new GeoCoordinates(lat, lng));
        lastAltitude = typeof height === "number" ? height : lastAltitude;
        return lastAltitude + HOVER_HEIGHT;
    };

    /** Place the mover (and extend the trail) at normalized progress. */
    const applyProgress = (progress: number): void => {
        const clamped = Math.min(Math.max(progress, 0), 1);
        const index = Math.min(TRACK_POINTS - 1, Math.floor(clamped * (TRACK_POINTS - 1) + 1e-6));
        const point = track[index];
        const alt = altitudeAt(point.lat, point.lng);
        const geo = new GeoCoordinates(point.lat, point.lng, alt);
        // Per-frame anchor updates are the sanctioned animation pattern.
        mover.anchor = geo;

        // Yaw the mover along the local track direction: project the tangent
        // endpoints so the orientation is exact under any projection.
        const next = track[Math.min(index + 1, TRACK_POINTS - 1)];
        const tangent = mapView.projection.projectPoint(
            new GeoCoordinates(next.lat, next.lng, alt),
            new THREE.Vector3()
        );
        const current = mapView.projection.projectPoint(geo, new THREE.Vector3());
        tangent.sub(current);
        // +z is the mover's forward axis (see createMover).
        mover.rotation.y = Math.atan2(tangent.x, tangent.z);

        // Reveal the trail up to the current index, one vertex per point.
        while (revealedCount <= index) {
            const revealed = track[revealedCount];
            const revealedAlt =
                revealedCount === index ? alt : altitudeAt(revealed.lat, revealed.lng);
            const relative = mapView.projection.projectPoint(
                new GeoCoordinates(revealed.lat, revealed.lng, revealedAlt),
                new THREE.Vector3()
            );
            relative.sub(anchorOrigin);
            relative.toArray(trailPositions, revealedCount * 3);
            revealedCount++;
        }
        trailGeometry.setDrawRange(0, revealedCount);
        (trailGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

        if (state.follow) {
            // Direct per-tick lookAt: exact each frame, no tween to fight.
            mapView.lookAt({ target: new GeoCoordinates(point.lat, point.lng, 0) });
        }
        hud.textContent =
            `t: ${point.t.toFixed(1)}s / ${TRACK_DURATION}s (x${state.speed})\n` +
            `point: ${index + 1}/${TRACK_POINTS}\n` +
            `lat/lng: ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}\n` +
            `altitude: ${alt.toFixed(0)} m | follow: ${state.follow ? "on" : "off"}`;
        mapView.update();
    };

    const setPlaying = (playing: boolean): void => {
        if (state.playing === playing) {
            return;
        }
        state.playing = playing;
        // begin/endAnimation drive the on-demand render loop; nesting is
        // counted, so pairing them keeps `animating` exact.
        if (playing) {
            lastTickTime = 0;
            mapView.beginAnimation();
        } else {
            mapView.endAnimation();
        }
    };

    // The clock: Update fires per rendered frame while animating.
    mapView.addEventListener(MapViewEventNames.Update, () => {
        if (!state.playing) {
            return;
        }
        const now = performance.now();
        const dt = lastTickTime > 0 ? (now - lastTickTime) / 1000 : 0;
        lastTickTime = now;
        state.progress += (dt * state.speed) / TRACK_DURATION;
        if (state.progress >= 1) {
            state.progress = 1;
            setPlaying(false);
        }
        applyProgress(state.progress);
        gui.updateDisplay();
    });

    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);
    const folder = gui.addFolder("Playback");
    folder
        .add(state, "playing")
        .name("playing")
        .listen()
        .onChange(value => setPlaying(value));
    folder.add(state, "speed", 0.5, 8, 0.5).name("speed (x)");
    folder
        .add(state, "progress", 0, 1, 0.001)
        .name("timeline")
        .onChange(value => applyProgress(value));
    folder
        .add(state, "follow")
        .name("camera follow")
        .onChange(follow => {
            if (!follow) {
                // Free the camera: reframe the whole loop area.
                mapView.lookAt({
                    target: new GeoCoordinates(SITE.lat, SITE.lng, 0),
                    zoomLevel: 13.5
                });
            }
            mapView.update();
        });
    folder
        .add(
            {
                reset: () => {
                    setPlaying(false);
                    state.progress = 0;
                    revealedCount = 0;
                    trailGeometry.setDrawRange(0, 0);
                    applyProgress(0);
                    gui.updateDisplay();
                }
            },
            "reset"
        )
        .name("Reset");
    folder.open();

    applyProgress(0);
    gui.updateDisplay();
}

void main();
