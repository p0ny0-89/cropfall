import { addPropertyControls, ControlType } from "framer"
import { useEffect, useRef, useState } from "react"

// ─── Types ───────────────────────────────────────────────────────────

interface Props {
    // Appearance
    backgroundColor: string
    barColor: string
    barTrackColor: string
    barWidth: number
    barHeight: number
    barBorderRadius: number
    showPercentage: boolean
    percentageColor: string
    percentageFontSize: number
    // @ts-ignore
    percentageFont: any
    // Timing
    fadeOutDuration: number
    delayAfterLoad: number
}

// ─── Component ──────────────────────────────────────────────────────

/**
 * @framerSupportedLayoutHeight any
 * @framerSupportedLayoutWidth any
 * @framerDisableUnlink
 */
export default function LoadingScreen(props: Props) {
    const {
        backgroundColor = "#000000",
        barColor = "#ffffff",
        barTrackColor = "rgba(255,255,255,0.15)",
        barWidth = 200,
        barHeight = 3,
        barBorderRadius = 2,
        showPercentage = true,
        percentageColor = "rgba(255,255,255,0.5)",
        percentageFontSize = 12,
        percentageFont,
        fadeOutDuration = 0.6,
        delayAfterLoad = 0.3,
    } = props

    const [progress, setProgress] = useState(0)
    const [loaded, setLoaded] = useState(false)
    const [dismissed, setDismissed] = useState(false)
    const [hidden, setHidden] = useState(false)
    const pollRef = useRef<number>(0)

    // ── Lock scroll + poll ScrollImageSequence progress ─────────

    useEffect(() => {
        // Lock scroll
        const originalOverflow = document.body.style.overflow
        const originalHeight = document.body.style.height
        document.body.style.overflow = "hidden"
        document.body.style.height = "100vh"

        function poll() {
            const el = document.querySelector("[data-scroll-sequence]")
            if (el) {
                const prog = parseFloat(
                    el.getAttribute("data-load-progress") || "0"
                )
                const done = el.getAttribute("data-loaded") === "true"
                setProgress(prog)
                if (done) {
                    setLoaded(true)
                    return // Stop polling
                }
            }
            pollRef.current = requestAnimationFrame(poll)
        }

        pollRef.current = requestAnimationFrame(poll)

        return () => {
            // Restore scroll
            document.body.style.overflow = originalOverflow
            document.body.style.height = originalHeight
            if (pollRef.current) cancelAnimationFrame(pollRef.current)
        }
    }, [])

    // ── Dismiss after load + delay ──────────────────────────────

    useEffect(() => {
        if (!loaded) return

        const delayTimer = setTimeout(() => {
            setDismissed(true)

            // Unlock scroll
            document.body.style.overflow = ""
            document.body.style.height = ""

            // Remove from DOM after fade completes
            const hideTimer = setTimeout(() => {
                setHidden(true)
            }, fadeOutDuration * 1000)

            return () => clearTimeout(hideTimer)
        }, delayAfterLoad * 1000)

        return () => clearTimeout(delayTimer)
    }, [loaded, delayAfterLoad, fadeOutDuration])

    // ── Fully hidden — render nothing ───────────────────────────

    if (hidden) return null

    // ── Render ──────────────────────────────────────────────────

    const pct = Math.round(progress * 100)

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: backgroundColor,
                opacity: dismissed ? 0 : 1,
                transition: `opacity ${fadeOutDuration}s ease`,
                pointerEvents: dismissed ? "none" : "auto",
            }}
        >
            {/* Progress bar track */}
            <div
                style={{
                    width: barWidth,
                    height: barHeight,
                    borderRadius: barBorderRadius,
                    background: barTrackColor,
                    overflow: "hidden",
                }}
            >
                {/* Progress bar fill */}
                <div
                    style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: barColor,
                        borderRadius: barBorderRadius,
                        transition: "width 0.2s ease-out",
                    }}
                />
            </div>

            {/* Percentage text */}
            {showPercentage && (
                <span
                    style={{
                        marginTop: 12,
                        fontFamily:
                            percentageFont?.fontFamily ||
                            "system-ui, sans-serif",
                        fontSize: percentageFontSize,
                        color: percentageColor,
                        fontVariantNumeric: "tabular-nums",
                    }}
                >
                    {pct}%
                </span>
            )}
        </div>
    )
}

// ─── Property Controls ──────────────────────────────────────────────

addPropertyControls(LoadingScreen, {
    backgroundColor: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: "#000000",
    },
    barColor: {
        type: ControlType.Color,
        title: "Bar Color",
        defaultValue: "#ffffff",
    },
    barTrackColor: {
        type: ControlType.Color,
        title: "Track Color",
        defaultValue: "rgba(255,255,255,0.15)",
    },
    barWidth: {
        type: ControlType.Number,
        title: "Bar Width",
        defaultValue: 200,
        min: 50,
        max: 600,
        step: 1,
        unit: "px",
    },
    barHeight: {
        type: ControlType.Number,
        title: "Bar Height",
        defaultValue: 3,
        min: 1,
        max: 20,
        step: 1,
        unit: "px",
    },
    barBorderRadius: {
        type: ControlType.Number,
        title: "Bar Radius",
        defaultValue: 2,
        min: 0,
        max: 10,
        step: 1,
        unit: "px",
    },
    showPercentage: {
        type: ControlType.Boolean,
        title: "Show %",
        defaultValue: true,
    },
    percentageColor: {
        type: ControlType.Color,
        title: "% Color",
        defaultValue: "rgba(255,255,255,0.5)",
        hidden: (props) => !props.showPercentage,
    },
    percentageFontSize: {
        type: ControlType.Number,
        title: "% Font Size",
        defaultValue: 12,
        min: 8,
        max: 32,
        step: 1,
        unit: "px",
        hidden: (props) => !props.showPercentage,
    },
    // @ts-ignore
    percentageFont: {
        // @ts-ignore
        type: ControlType.Font,
        title: "% Font",
        hidden: (props: Props) => !props.showPercentage,
    },
    fadeOutDuration: {
        type: ControlType.Number,
        title: "Fade Duration",
        defaultValue: 0.6,
        min: 0,
        max: 3,
        step: 0.1,
        unit: "s",
    },
    delayAfterLoad: {
        type: ControlType.Number,
        title: "Delay After Load",
        defaultValue: 0.3,
        min: 0,
        max: 3,
        step: 0.1,
        unit: "s",
        description: "Extra time to hold the loading screen after 100%",
    },
})
