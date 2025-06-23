type RemoveCallback<T> = (item: T) => void;
type PriorityCallback<T> = (item: T) => number;

export class LRUCache<T> {
    // Options
    public maxSize: number;
    public minSize: number;
    public unloadPercent: number;

    // Internal state
    private itemSet: Map<T, number>; // Maps items to their last used timestamp
    private itemList: T[]; // List of all items in cache
    private usedSet: Set<T>; // Tracks items used in current period
    private callbacks: Map<T, RemoveCallback<T>>;
    private scheduled: boolean;
    private unloadPriorityCallback: PriorityCallback<T> | null;

    constructor() {
        // Options
        this.maxSize = 800;
        this.minSize = 600;
        this.unloadPercent = 0.05;

        // Internal state
        this.itemSet = new Map();
        this.itemList = [];
        this.usedSet = new Set();
        this.callbacks = new Map();
        this.scheduled = false;
        this.unloadPriorityCallback = null;
    }

    private defaultPriorityCallback = (item: T): number => {
        return this.itemSet.get(item) || 0;
    };

    // Returns whether the cache has reached maximum size
    public isFull(): boolean {
        return this.itemSet.size >= this.maxSize;
    }

    // Add an item to the cache
    public add(item: T, removeCb: RemoveCallback<T>): boolean {
        if (this.itemSet.has(item) || this.isFull()) {
            return false;
        }

        this.itemList.push(item);
        this.usedSet.add(item);
        this.itemSet.set(item, Date.now());
        this.callbacks.set(item, removeCb);

        return true;
    }

    // Remove a specific item from the cache
    public remove(item: T): boolean {
        if (!this.itemSet.has(item)) {
            return false;
        }

        this.callbacks.get(item)!(item);

        const index = this.itemList.indexOf(item);
        this.itemList.splice(index, 1);
        this.usedSet.delete(item);
        this.itemSet.delete(item);
        this.callbacks.delete(item);

        return true;
    }

    // Mark an item as used
    public markUsed(item: T): void {
        if (this.itemSet.has(item) && !this.usedSet.has(item)) {
            this.itemSet.set(item, Date.now());
            this.usedSet.add(item);
        }
    }

    // Mark all items as unused
    public markAllUnused(): void {
        this.usedSet.clear();
    }

    // Clean up unused content to reach minimum size
    public unloadUnusedContent(): void {
        const { unloadPercent, minSize, itemList, itemSet, usedSet, callbacks } = this;
        const unloadPriorityCallback = this.unloadPriorityCallback || this.defaultPriorityCallback;

        const unused = itemList.length - usedSet.size;
        const excess = itemList.length - minSize;

        if (excess <= 0 || unused <= 0) {
            return;
        }

        // Sort items - unused items first, ordered by priority
        itemList.sort((a, b) => {
            const usedA = usedSet.has(a);
            const usedB = usedSet.has(b);

            if (usedA && usedB) {
                return 0;
            } else if (!usedA && !usedB) {
                // Higher priority items come first
                return unloadPriorityCallback(b) - unloadPriorityCallback(a);
            } else {
                return usedA ? 1 : -1;
            }
        });

        // Calculate how many items to unload
        const unusedExcess = Math.min(excess, unused);
        const maxUnload = Math.max(minSize * unloadPercent, unusedExcess * unloadPercent);
        let nodesToUnload = Math.min(maxUnload, unused);
        nodesToUnload = Math.ceil(nodesToUnload);

        // Remove the items
        const removedItems = itemList.splice(0, nodesToUnload);
        removedItems.forEach(item => {
            callbacks.get(item)!(item);
            itemSet.delete(item);
            callbacks.delete(item);
        });
    }

    // Schedule an unload operation
    public scheduleUnload(markAllUnused: boolean = true): void {
        if (this.scheduled) {
            return;
        }

        this.scheduled = true;
        enqueueMicrotask(() => {
            this.scheduled = false;
            this.unloadUnusedContent();
            if (markAllUnused) {
                this.markAllUnused();
            }
        });
    }

    // Set a custom priority callback for unloading
    public setUnloadPriorityCallback(callback: PriorityCallback<T> | null): void {
        this.unloadPriorityCallback = callback;
    }
}

// Helper function
function enqueueMicrotask(callback: () => void): void {
    Promise.resolve().then(callback);
}
