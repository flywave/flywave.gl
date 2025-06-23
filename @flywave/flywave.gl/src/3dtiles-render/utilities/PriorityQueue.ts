type JobCallback<T> = (item: T) => Promise<void>;
type PriorityCallback<T> = (a: T, b: T) => number;
type SchedulingCallback = (func: () => void) => void;

interface PrioritizedItem {
    __t: number; // Timestamp when added
}

export class PriorityQueue<T extends PrioritizedItem> {
    // Configuration options
    public maxJobs: number;
    public autoUpdate: boolean;

    // Internal state
    private items: T[];
    private callbacks: Map<T, JobCallback<T>>;
    private currJobs: number;
    private scheduled: boolean;
    private priorityCallback: PriorityCallback<T>;
    private schedulingCallback: SchedulingCallback;
    private _runjobs: () => void;

    constructor() {
        // Options
        this.maxJobs = 6;
        this.autoUpdate = true;

        // Internal state
        this.items = [];
        this.callbacks = new Map();
        this.currJobs = 0;
        this.scheduled = false;

        // Default priority callback throws if not overridden
        this.priorityCallback = () => {
            throw new Error("PriorityQueue: PriorityCallback function not defined.");
        };

        // Default scheduling uses requestAnimationFrame
        this.schedulingCallback = func => {
            requestAnimationFrame(func);
        };

        // Pre-bind the runjobs function
        this._runjobs = () => {
            this.tryRunJobs();
            this.scheduled = false;
        };
    }

    /**
     * Sort the items in the queue using the priority callback
     */
    public sort(): void {
        this.items.sort(this.priorityCallback);
    }

    /**
     * Add an item to the queue with a processing callback
     * @param item The item to add
     * @param callback The callback that will process the item
     * @returns A promise that resolves when the item is processed
     */
    public add(item: T, callback: (item: T) => Promise<void>): Promise<void> {
        return new Promise((resolve, reject) => {
            // Wrap the callback to handle promise resolution
            const prCallback: JobCallback<T> = (...args) =>
                callback(...args)
                    .then(resolve)
                    .catch(reject);

            // Add timestamp to item
            item.__t = Date.now();

            // Add to queue
            this.items.push(item);
            this.callbacks.set(item, prCallback);

            // Schedule processing if auto-update is enabled
            if (this.autoUpdate) {
                this.scheduleJobRun();
            }
        });
    }

    /**
     * Remove an item from the queue
     * @param item The item to remove
     */
    public remove(item: T): void {
        const index = this.items.indexOf(item);
        if (index !== -1) {
            this.items.splice(index, 1);
            this.callbacks.delete(item);
        }
    }

    /**
     * Attempt to run jobs from the queue, respecting maxJobs limit
     */
    public tryRunJobs(): void {
        this.sort();

        const { items, callbacks, maxJobs } = this;
        let { currJobs } = this;

        while (maxJobs > currJobs && items.length > 0) {
            currJobs++;
            const item = items.pop()!;
            const callback = callbacks.get(item)!;

            callbacks.delete(item);

            callback(item).finally(() => {
                this.currJobs--;
                if (this.autoUpdate) {
                    this.scheduleJobRun();
                }
            });
        }

        this.currJobs = currJobs;
    }

    /**
     * Schedule the job runner to execute
     */
    public scheduleJobRun(): void {
        if (!this.scheduled) {
            this.schedulingCallback(this._runjobs);
            this.scheduled = true;
        }
    }

    /**
     * Set a custom priority callback function
     * @param callback The function to compare two items
     */
    public setPriorityCallback(callback: PriorityCallback<T>): void {
        this.priorityCallback = callback;
    }

    /**
     * Set a custom scheduling callback
     * @param callback The function to schedule job execution
     */
    public setSchedulingCallback(callback: SchedulingCallback): void {
        this.schedulingCallback = callback;
    }
}
