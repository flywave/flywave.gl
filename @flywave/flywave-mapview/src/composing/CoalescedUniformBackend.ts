/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Coalesces per-object uniform buffer uploads in the WebGPU backend.
 *
 * three.js r187 issues one `queue.writeBuffer` per render object per frame for
 * the object-scope uniform group (`Nodes.updateGroup` returns `true`
 * unconditionally for `NodeUpdateType.OBJECT` groups), even when the camera
 * and the scene are static. With hundreds of visible tiles this becomes
 * thousands of small transport calls per frame, dominated by per-call CPU
 * overhead.
 *
 * This installer wraps three's WebGPU backend *without modifying three*:
 *
 * 1. Every managed uniform group gets a fixed-size slot (256-byte aligned) in
 *    one shared GPU buffer + staging array. Slots are laid out back-to-back so
 *    consecutive slots are exactly contiguous.
 * 2. `updateBinding` stages the group data into its slot. Slots whose content
 *    is byte-identical to the staging copy are not marked dirty, so static
 *    scenes produce zero GPU traffic.
 * 3. `finishRender` merges dirty slots into contiguous ranges (neighbouring
 *    slots merge by construction) and issues one `writeBuffer` per range —
 *    animated scenes collapse to a handful of calls per frame.
 *
 * Bindings that do not fit the policy (groups that are not purely uniform
 * buffers, groups larger than `MAX_BINDING_BYTES`, or after the shared buffer
 * is exhausted) keep using three's original per-binding path.
 *
 * The installer patches methods on the *backend instance* (own properties that
 * shadow the prototype), so the footprint is limited to the one renderer that
 * opted in — other renderers of the same page are untouched. Every patched
 * method falls back to the original implementation on any error.
 */

// -- Minimal WebGPU surfaces -------------------------------------------------
//
// The repository has no @webgpu/types dependency, so the coalescer declares
// the small slice of the WebGPU API it actually touches.

interface GpuBufferSurface {
    mapState: string;
    destroy(): void;
}

interface GpuQueueSurface {
    writeBuffer(
        buffer: GpuBufferSurface,
        bufferOffset: number,
        data: ArrayBufferView,
        dataOffset?: number,
        size?: number
    ): void;
}

interface GpuBufferDescriptor {
    size: number;
    usage: number;
    label?: string;
}

interface GpuBindGroupEntry {
    binding: number;
    resource: {
        buffer: GpuBufferSurface;
        offset?: number;
        size?: number;
    };
}

interface GpuBindGroupDescriptor {
    label?: string;
    layout: GpuBindGroupLayoutSurface;
    entries: GpuBindGroupEntry[];
}

interface GpuBindGroupLayoutSurface {
    readonly label?: string;
}

interface GpuBindGroupSurface {
    readonly label?: string;
}

interface GpuDeviceSurface {
    queue: GpuQueueSurface;
    createBuffer(descriptor: GpuBufferDescriptor): GpuBufferSurface;
    createBindGroup(descriptor: GpuBindGroupDescriptor): GpuBindGroupSurface;
}

// -- Minimal three.js internal surfaces ---------------------------------------

/**
 * A node uniform buffer binding: one object-scope uniform group plus its CPU
 * staging array. `buffer` is the live CPU copy three's node system mutates.
 */
interface UniformBufferBinding {
    isUniformBuffer: true;
    buffer: Float32Array;
    updateRanges: Array<{ start: number; count: number }>;
}

/** Bindings that are not uniform buffers (textures, samplers, storage). */
interface OtherBinding {
    isUniformBuffer: false;
}

type BindGroupBinding = UniformBufferBinding | OtherBinding;

function isUniformBufferBinding(binding: BindGroupBinding): binding is UniformBufferBinding {
    return binding.isUniformBuffer === true;
}

/** A three.js bind group: a named list of bindings. */
interface ManagedBindGroup {
    name: string;
    bindings: BindGroupBinding[];
}

/** Per-target GPU state three keeps via `backend.get(target)`. */
interface BackendTargetState {
    /** Uniform bindings: the (possibly redirected) GPU buffer. */
    buffer?: GpuBufferSurface;
    /** Bind groups: the bound GPU bind group. */
    group?: GpuBindGroupSurface;
    groups?: Record<string, GpuBindGroupSurface>;
    versions?: Record<string, number>;
}

/** The slice of the three.js WebGPU backend the coalescer interacts with. */
interface CoalesceBackendSurface {
    device: GpuDeviceSurface;
    bindingUtils: {
        createBindings(
            bindGroup: ManagedBindGroup,
            bindings: object,
            cacheKey: string | undefined,
            version: number
        ): void;
        createBindGroup(bindGroup: ManagedBindGroup, layout: GpuBindGroupLayoutSurface): GpuBindGroupSurface;
        createBindingsLayout(bindGroup: ManagedBindGroup): GpuBindGroupLayoutSurface;
    };
    get(target: object): BackendTargetState;
    delete(target: object): void;
    updateBinding?(binding: UniformBufferBinding): void;
    finishRender?(renderContext: object): void;
    destroyUniformBuffer?(binding: UniformBufferBinding): void;
    /** Coalescer state, stored per backend instance. */
    __flywaveCoalesceState?: CoalesceState;
}

// -- Coalescer state ----------------------------------------------------------

interface Slot {
    offset: number;
    /** Actual group data length. */
    byteLength: number;
    /** Aligned stride (offset distance to the next slot). */
    stride: number;
    dirty: boolean;
}

interface CoalesceStats {
    calls: number;
    fallbackCalls: number;
    copies: number;
    compareSame: number;
    flushes: number;
    ranges: number;
    bytes: number;
    groupsRedirected: number;
    rebuildErrors: number;
}

interface CoalesceState {
    slots: Map<UniformBufferBinding, Slot>;
    /** Original per-binding GPU buffers, kept until a redirect is known good. */
    originalBuffers: Map<UniformBufferBinding, GpuBufferSurface>;
    megaGPU: GpuBufferSurface | null;
    staging: Uint8Array | null;
    usedBytes: number;
    capacity: number;
    stats: CoalesceStats;
    orig: {
        updateBinding(binding: UniformBufferBinding): void;
        finishRender(renderContext: object): void;
        destroyUniformBuffer(binding: UniformBufferBinding): void;
    };
}

const ALIGN = 256;
const DEFAULT_CAPACITY = 4 * 1024 * 1024;
/** WebGPU default `maxUniformBufferBindingSize` — slots must stay below. */
const MAX_BINDING_BYTES = 16384;
// UNIFORM | COPY_DST | COPY_SRC (COPY_SRC enables debug readback).
const MEGA_BUFFER_USAGE = 0x40 | 0x8 | 0x4;

function alignTo(value: number, alignment: number): number {
    return Math.ceil(value / alignment) * alignment;
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

/**
 * Runtime guard narrowing an untyped backend to the coalescer surface. Returns
 * `undefined` when the backend does not provide the required members (e.g. the
 * WebGL backend), in which case the caller must not install.
 */
function asCoalesceBackend(backend: unknown): CoalesceBackendSurface | undefined {
    if (typeof backend !== "object" || backend === null) return undefined;
    const candidate = backend as {
        device?: unknown;
        bindingUtils?: unknown;
        get?: unknown;
        updateBinding?: unknown;
        finishRender?: unknown;
        destroyUniformBuffer?: unknown;
        __flywaveCoalesceState?: unknown;
    };
    const device = candidate.device as GpuDeviceSurface | undefined;
    const bindingUtils = candidate.bindingUtils as
        | CoalesceBackendSurface["bindingUtils"]
        | undefined;
    if (
        device === undefined ||
        bindingUtils === undefined ||
        bindingUtils.createBindings === undefined ||
        bindingUtils.createBindGroup === undefined ||
        bindingUtils.createBindingsLayout === undefined ||
        candidate.get === undefined ||
        candidate.updateBinding === undefined ||
        candidate.finishRender === undefined ||
        candidate.destroyUniformBuffer === undefined
    ) {
        return undefined;
    }
    return candidate as CoalesceBackendSurface;
}

function ensureBuffers(backend: CoalesceBackendSurface, state: CoalesceState): void {
    if (state.megaGPU !== null) return;
    state.megaGPU = backend.device.createBuffer({
        size: state.capacity,
        usage: MEGA_BUFFER_USAGE,
        label: "flywave-coalesced-object-uniforms"
    });
    state.staging = new Uint8Array(state.capacity);
}

/**
 * Installs the coalesced uniform upload path on the given renderer's WebGPU
 * backend. Must be called after `renderer.init()` (needs a live device).
 * Returns an uninstall function that removes the instance-level patches and
 * destroys the shared buffer.
 */
export function installCoalescedUniformUploads(
    renderer: { backend?: unknown },
    capacityBytes: number = DEFAULT_CAPACITY
): () => void {
    const backend = asCoalesceBackend(renderer.backend);
    if (backend === undefined) return () => undefined;
    if (backend.__flywaveCoalesceState !== undefined) return () => undefined;

    const state: CoalesceState = {
        slots: new Map(),
        originalBuffers: new Map(),
        megaGPU: null,
        staging: null,
        usedBytes: 0,
        capacity: capacityBytes,
        stats: {
            calls: 0,
            fallbackCalls: 0,
            copies: 0,
            compareSame: 0,
            flushes: 0,
            ranges: 0,
            bytes: 0,
            groupsRedirected: 0,
            rebuildErrors: 0
        },
        orig: {
            updateBinding: backend.updateBinding,
            finishRender: backend.finishRender,
            destroyUniformBuffer: backend.destroyUniformBuffer
        }
    };
    backend.__flywaveCoalesceState = state;

    const bindingUtils = backend.bindingUtils;
    const origBindingUtilsCreate = bindingUtils.createBindings;

    // -- destroyUniformBuffer: never destroy the shared mega buffer ----------
    //
    // three destroys the per-binding GPU buffer when a binding is disposed.
    // Redirected bindings reference the SHARED buffer, so the stock destroy
    // path would tear down the mega buffer for every renderer.

    backend.destroyUniformBuffer = function (binding: UniformBufferBinding): void {
        const bindingData = backend.get(binding);
        if (bindingData.buffer === state.megaGPU) {
            backend.delete(binding); // drop the slot reference; keep the shared buffer alive
            return;
        }
        state.orig.destroyUniformBuffer.call(this, binding);
    };

    // -- updateBinding: stage into the slot, defer the transport -------------

    backend.updateBinding = function (binding: UniformBufferBinding): void {
        state.stats.calls++;
        const slot = state.slots.get(binding);
        if (slot === undefined || state.staging === null) {
            state.stats.fallbackCalls++;
            state.orig.updateBinding.call(this, binding);
            return;
        }
        try {
            const src = binding.buffer;
            if (src.byteLength < slot.byteLength) {
                state.stats.fallbackCalls++;
                state.orig.updateBinding.call(this, binding);
                return;
            }
            const srcU8 = new Uint8Array(src.buffer, src.byteOffset, slot.byteLength);
            const staged = state.staging.subarray(slot.offset, slot.offset + slot.byteLength);
            if (arraysEqual(srcU8, staged)) {
                state.stats.compareSame++;
                binding.updateRanges.length = 0;
                return; // unchanged — no GPU traffic
            }
            state.stats.copies++;
            state.staging.set(srcU8, slot.offset);
            slot.dirty = true;
            binding.updateRanges.length = 0;
            return;
        } catch {
            state.stats.fallbackCalls++;
            state.orig.updateBinding.call(this, binding);
        }
    };

    // -- finishRender: merged coalesced writes for dirty slots ---------------

    backend.finishRender = function (renderContext: object): void {
        const megaGPU = state.megaGPU;
        const staging = state.staging;
        if (megaGPU === null || staging === null) {
            state.orig.finishRender.call(this, renderContext);
            return;
        }
        try {
            const dirty: Slot[] = [];
            for (const slot of state.slots.values()) {
                if (slot.dirty) dirty.push(slot);
            }
            if (dirty.length === 0) {
                state.orig.finishRender.call(this, renderContext);
                return;
            }
            state.stats.flushes++;
            dirty.sort((a, b) => a.offset - b.offset);

            // Merge neighbouring slots (stride-contiguous by construction) and
            // transport one write per merged range.
            let rangeStart = dirty[0].offset;
            let rangeEnd = rangeStart + dirty[0].stride;
            for (let i = 1; i <= dirty.length; i++) {
                const slot = dirty[i];
                if (slot !== undefined && slot.offset === rangeEnd) {
                    rangeEnd += slot.stride;
                    continue;
                }
                backend.device.queue.writeBuffer(
                    megaGPU,
                    rangeStart,
                    staging,
                    rangeStart,
                    rangeEnd - rangeStart
                );
                state.stats.ranges++;
                state.stats.bytes += rangeEnd - rangeStart;
                if (slot !== undefined) {
                    rangeStart = slot.offset;
                    rangeEnd = rangeStart + slot.stride;
                }
            }
            for (const slot of dirty) slot.dirty = false;
        } catch {
            // On any failure fall back to per-slot direct writes.
            for (const slot of state.slots.values()) {
                if (!slot.dirty) continue;
                try {
                    backend.device.queue.writeBuffer(
                        megaGPU,
                        slot.offset,
                        staging,
                        slot.offset,
                        slot.stride
                    );
                    slot.dirty = false;
                } catch {
                    // Keep the slot dirty; the next frame retries.
                }
            }
        }
        state.orig.finishRender.call(this, renderContext);
    };

    // -- bindingUtils.createBindings: allocate slots + redirect buffers ------
    //
    // The original call allocates the per-binding GPU buffer and creates the
    // cached GPU bind group in one pass. Afterwards we swap the binding's GPU
    // buffer reference to the shared mega buffer (at its slot offset, via a
    // rebuilt bind group) and mirror the initial group data into staging.

    bindingUtils.createBindings = function (
        bindGroup: ManagedBindGroup,
        bindings: object,
        cacheKey: string | undefined,
        version: number
    ): void {
        // Only groups that are PURELY uniform buffers are managed; mixed groups
        // (uniform + textures) stay on three's original path so a failed
        // rebuild can never strand their uniforms on a stale buffer.
        const uniforms = bindGroup.bindings.filter(isUniformBufferBinding);
        const managed = uniforms.length === bindGroup.bindings.length;
        const slotable = managed && uniforms.every((binding) => {
            const byteLength = binding.buffer.byteLength;
            return byteLength > 0 && byteLength <= MAX_BINDING_BYTES;
        });
        if (!managed || !slotable) {
            return origBindingUtilsCreate.call(this, bindGroup, bindings, cacheKey, version);
        }

        // Capture the descriptor of the group three is about to create (it
        // references the per-binding GPU buffers and is fully valid). On cache
        // hits three reuses the cached group and never calls createBindGroup.
        const realCreate = backend.device.createBindGroup.bind(backend.device);
        let captured: GpuBindGroupDescriptor | undefined;
        backend.device.createBindGroup = (descriptor: GpuBindGroupDescriptor): GpuBindGroupSurface => {
            // Snapshot immediately: three reuses a module-level descriptor
            // object and resets it right after creation.
            captured = {
                layout: descriptor.layout,
                entries: descriptor.entries.map((entry) => ({
                    binding: entry.binding,
                    resource: {
                        buffer: entry.resource.buffer,
                        offset: entry.resource.offset,
                        size: entry.resource.size
                    }
                }))
            };
            return realCreate(descriptor);
        };
        try {
            origBindingUtilsCreate.call(this, bindGroup, bindings, cacheKey, version);
        } finally {
            backend.device.createBindGroup = realCreate;
        }
        if (captured === undefined) return; // cache hit — nothing to redirect

        ensureBuffers(backend, state);
        const megaGPU = state.megaGPU;
        if (megaGPU === null) return;

        try {
            // Allocate slots, seed the staging mirror and redirect the group's
            // uniform buffer references to the mega buffer.
            for (const binding of uniforms) {
                if (state.slots.has(binding)) continue;
                const byteLength = binding.buffer.byteLength;
                const offset = state.usedBytes;
                const stride = alignTo(byteLength, ALIGN);
                state.staging.set(
                    new Uint8Array(binding.buffer.buffer, binding.buffer.byteOffset, byteLength),
                    offset
                );
                // Dirty so the seeded initial data reaches the GPU on the next flush.
                state.slots.set(binding, { offset, byteLength, stride, dirty: true });
                const bindingData = backend.get(binding);
                if (bindingData.buffer !== undefined) {
                    state.originalBuffers.set(binding, bindingData.buffer);
                }
                bindingData.buffer = megaGPU;
                state.usedBytes += stride;
            }

            // Rewrite the captured descriptor: uniform entries read their slot
            // in the mega buffer; other entries (none for pure-uniform groups)
            // pass through.
            let point = 0;
            for (const binding of uniforms) {
                const entry = captured.entries[point];
                const slot = state.slots.get(binding);
                if (entry !== undefined && slot !== undefined) {
                    entry.resource = {
                        buffer: megaGPU,
                        offset: slot.offset,
                        size: slot.byteLength
                    };
                }
                point++;
            }
            const rebuilt = realCreate(captured);
            state.stats.groupsRedirected++;

            // Overwrite the cached GPU bind group so the render pass binds the
            // slot-corrected group.
            const bindingsData = backend.get(bindGroup);
            if (cacheKey !== undefined && cacheKey !== "") {
                bindingsData.groups = bindingsData.groups ?? {};
                bindingsData.versions = bindingsData.versions ?? {};
                bindingsData.groups[cacheKey] = rebuilt;
                bindingsData.versions[cacheKey] = version;
            }
            bindingsData.group = rebuilt;
        } catch {
            // Roll back: restore the original per-binding GPU buffers so the
            // group stays fully on three's original path.
            for (const binding of uniforms) {
                const originalBuffer = state.originalBuffers.get(binding);
                if (originalBuffer === undefined) continue;
                backend.get(binding).buffer = originalBuffer;
                state.originalBuffers.delete(binding);
                state.slots.delete(binding);
            }
            state.stats.rebuildErrors++;
        }
    };

    return () => {
        delete backend.updateBinding;
        delete backend.finishRender;
        delete backend.destroyUniformBuffer;
        bindingUtils.createBindings = origBindingUtilsCreate;
        backend.__flywaveCoalesceState = undefined;
        if (state.megaGPU !== null) {
            try {
                state.megaGPU.destroy();
            } catch {
                // Buffer may already be destroyed on context loss.
            }
        }
    };
}
