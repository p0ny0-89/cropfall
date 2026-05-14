import { Override } from "framer"
import { useState, useEffect } from "react"
import { getCount, subscribe } from "./milestoneStore.ts"

function formatNumber(n: number): string {
    return Math.floor(n).toLocaleString("en-US")
}

export function LiveCounter(): Override {
    const [count, setCount] = useState(getCount)

    useEffect(() => subscribe(setCount), [])

    return {
        text: formatNumber(count),
    }
}
