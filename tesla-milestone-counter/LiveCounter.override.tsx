import { Override } from "framer"
import { useState, useEffect, useRef } from "react"

const KEY = "__teslaMilestoneStore__"

function readCount(): number {
    return (window as any)[KEY]?.count ?? 0
}

function formatNumber(n: number): string {
    return Math.floor(n).toLocaleString("en-US")
}

export function LiveCounter(): Override {
    const [display, setDisplay] = useState(() => formatNumber(readCount()))
    const rafRef = useRef(0)

    useEffect(() => {
        function tick() {
            setDisplay(formatNumber(readCount()))
            rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(rafRef.current)
    }, [])

    return {
        text: display,
    }
}
