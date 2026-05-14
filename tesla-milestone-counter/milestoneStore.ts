type Listener = (count: number) => void

interface MilestoneStore {
    count: number
    listeners: Set<Listener>
}

const KEY = "__teslaMilestoneStore__"

function getStore(): MilestoneStore {
    const w = window as any
    if (!w[KEY]) {
        w[KEY] = { count: 0, listeners: new Set<Listener>() }
    }
    return w[KEY]
}

export function setCount(value: number) {
    const store = getStore()
    store.count = value
    for (const fn of store.listeners) fn(value)
}

export function getCount(): number {
    return getStore().count
}

export function subscribe(fn: Listener): () => void {
    const store = getStore()
    store.listeners.add(fn)
    return () => store.listeners.delete(fn)
}
