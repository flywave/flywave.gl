/* Copyright (C) 2025 flywave.gl contributors */

interface PriorityQueueItem<T> {
    callback: (item: T) => any;
    reject: (reason?: any) => void;
    resolve: (value: any) => void;
    promise: Promise<any>;
}

export class PriorityQueue<T> {
    // returns whether tasks are queued or actively running
    get running(): boolean {
        return this.items.length !== 0 || this.currJobs !== 0;
    }

    // options
    maxJobs: number = 15;

    items: T[] = [];
    callbacks = new Map<T, PriorityQueueItem<T>>();
    currJobs: number = 0;
    scheduled: boolean = false;
    autoUpdate: boolean = true;

    priorityCallback: (a: T, b: T) => number = () => {
        throw new Error("PriorityQueue: PriorityCallback function not defined.");
    };

    // Customizable scheduling callback. Default using requestAnimationFrame()
    schedulingCallback: (func: () => void) => void = func => {
        requestAnimationFrame(func);
    };

    private readonly _runjobs = () => {
        this.scheduled = false;
        this.tryRunJobs();
    };

    sort(): void {
        const priorityCallback = this.priorityCallback;
        const items = this.items;
        items.sort(priorityCallback);
    }

    has(item: T): boolean {
        return this.callbacks.has(item);
    }

    add(item: T, callback: (item: T) => any): Promise<any> {
        const data: Partial<PriorityQueueItem<T>> = {
            callback,
            reject: null,
            resolve: null,
            promise: null
        };

        const promise = new Promise((resolve, reject) => {
            const items = this.items;
            const callbacks = this.callbacks;

            data.resolve = resolve;
            data.reject = reject;

            items.push(item);
            callbacks.set(item, data as PriorityQueueItem<T>);

            if (this.autoUpdate) {
                this.scheduleJobRun();
            }
        });

        data.promise = promise;
        return promise;
    }

    remove(item: T): void {
        const items = this.items;
        const callbacks = this.callbacks;

        const index = items.indexOf(item);
        if (index !== -1) {
            // reject the promise to ensure there are no dangling promises - add a
            // catch here to handle the case where the promise was never used anywhere
            // else.
            const info = callbacks.get(item)!;
            info.promise.catch(() => {});
            info.reject("PriorityQueue: Item removed.");

            items.splice(index, 1);
            callbacks.delete(item);
        }
    }

    removeByFilter(filter: (item: T) => boolean): void {
        const { items } = this;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (filter(item)) {
                this.remove(item);
            }
        }
    }

    tryRunJobs(): void {
        this.sort();

        const items = this.items;
        const callbacks = this.callbacks;
        const maxJobs = this.maxJobs;
        let iterated = 0;

        const completedCallback = () => {
            this.currJobs--;

            if (this.autoUpdate) {
                this.scheduleJobRun();
            }
        };

        while (maxJobs > this.currJobs && items.length > 0 && iterated < maxJobs) {
            this.currJobs++;
            iterated++;
            const item = items.pop()!;
            const { callback, resolve, reject } = callbacks.get(item)!;
            callbacks.delete(item);

            let result;
            try {
                result = callback(item);
            } catch (err) {
                reject(err);
                completedCallback();
                continue;
            }

            if (result instanceof Promise) {
                result.then(resolve).catch(reject).finally(completedCallback);
            } else {
                resolve(result);
                completedCallback();
            }
        }
    }

    scheduleJobRun(): void {
        if (!this.scheduled) {
            this.schedulingCallback(this._runjobs);
            this.scheduled = true;
        }
    }
}
