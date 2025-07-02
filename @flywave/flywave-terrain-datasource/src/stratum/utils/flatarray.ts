
export class FlatArray<T = number> {
    private itemSize_ = 2
    private array_: T[] = []

    static create<T>({ array, itemSize }: { array: T[], itemSize: number }): FlatArray<T> {
        return new FlatArray<T>({ array, itemSize })
    }

    get array() {
        return this.array_
    }

    get itemSize() {
        return this.itemSize_
    }

    get count() {
        return this.array_.length / this.itemSize_
    }

    itemAt(i: number): T[] {
        const size = this.itemSize_
        const start = i * size
        const r = new Array<T>(size)
        for (let j = 0; j < size; ++j) {
            r[j] = this.array_[start + j]
        }
        return r
    }

    push(item: T[]) {
        if (item.length !== this.itemSize_) {
            throw new Error('item size not match')
        }
        this.array_.push(...item)
    }

    forEach(callback: (item: T[], i: number, serie: FlatArray<T>) => void) {
        for (let i = 0; i < this.count; ++i) {
            callback(this.itemAt(i), i, this)
        }
    }

    private constructor({ array, itemSize }: { array: T[], itemSize: number }) {
        this.array_ = array
        this.itemSize_ = itemSize
    }
}