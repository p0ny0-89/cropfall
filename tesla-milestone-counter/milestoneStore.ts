type Listener = (count: number) => void

let currentCount = 0
const listeners = new Set<Listener>()

export function setCount(value: number) {
    currentCount = value
    for (const fn of listeners) fn(currentCount)
}

export function getCount(): number {
    return currentCount
}

export function subscribe(fn: Listener): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
}
