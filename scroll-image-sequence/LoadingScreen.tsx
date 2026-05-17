import { addPropertyControls, ControlType } from "framer"
import { useEffect, useRef, useState, cloneElement } from "react"

// ─── Types ───────────────────────────────────────────────────────────

interface Props {
    children: React.ReactNode[]
    // Mode
    loaderMode: "bar" | "svg"
    // Fill direction for SVG mode
    fillDirection: "up" | "down" | "left" | "right"
    // SVG appearance
    svgTrackOpacity: number
    svgFillColor: string
    svgTrackColor: string
    svgSize: number
    // Bar appearance
    backgroundColor: string
    barColor: string
    barTrackColor: string
    barWidth: number
    barHeight: number
    barBorderRadius: number
    // Percentage
    showPercentage: boolean
    percentageColor: string
    percentageFontSize: number
    // @ts-ignore
    percentageFont: any
    percentageOffsetY: number
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
        children,
        loaderMode = "bar",
        fillDirection = "up",
        svgTrackOpacity = 0.15,
        svgFillColor = "#ffffff",
        svgTrackColor = "#ffffff",
        svgSize = 80,
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
        percentageOffsetY = 12,
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
                    return
                }
            }
            pollRef.current = requestAnimationFrame(poll)
        }

        pollRef.current = requestAnimationFrame(poll)

        return () => {
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
            document.body.style.overflow = ""
            document.body.style.height = ""

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

    // Compute clip-path for SVG fill based on direction
    function getClipPath(prog: number): string {
        const p = prog * 100
        switch (fillDirection) {
            case "up":
                return `inset(${100 - p}% 0 0 0)`
            case "down":
                return `inset(0 0 ${100 - p}% 0)`
            case "left":
                return `inset(0 ${100 - p}% 0 0)`
            case "right":
                return `inset(0 0 0 ${100 - p}%)`
            default:
                return `inset(${100 - p}% 0 0 0)`
        }
    }

    const hasSvgChild =
        loaderMode === "svg" &&
        children &&
        Array.isArray(children) &&
        children.length > 0

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
            {/* ── SVG fill mode ─────────────────────────────── */}
            {loaderMode === "svg" && hasSvgChild && (
                <div
                    style={{
                        position: "relative",
                        width: svgSize,
                        height: svgSize,
                    }}
                >
                    {/* Track layer — dim version of the SVG */}
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            opacity: svgTrackOpacity,
                            color: svgTrackColor,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <div style={{ width: "100%", height: "100%" }}>
                            {children[0]}
                        </div>
                    </div>

                    {/* Fill layer — clipped to progress */}
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            clipPath: getClipPath(progress),
                            transition: "clip-path 0.2s ease-out",
                            color: svgFillColor,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <div style={{ width: "100%", height: "100%" }}>
                            {children[0]}
                        </div>
                    </div>
                </div>
            )}

            {/* ── SVG mode empty state ──────────────────────── */}
            {loaderMode === "svg" && !hasSvgChild && (
                <div
                    style={{
                        width: svgSize,
                        height: svgSize,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "1px dashed rgba(255,255,255,0.3)",
                        borderRadius: 8,
                        color: "#666",
                        fontFamily: "system-ui, sans-serif",
                        fontSize: 11,
                        textAlign: "center",
                    }}
                >
                    Drop SVG here
                </div>
            )}

            {/* ── Bar mode ──────────────────────────────────── */}
            {loaderMode === "bar" && (
                <div
                    style={{
                        width: barWidth,
                        height: barHeight,
                        borderRadius: barBorderRadius,
                        background: barTrackColor,
                        overflow: "hidden",
                    }}
                >
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
            )}

            {/* ── Percentage text ───────────────────────────── */}
            {showPercentage && (
                <span
                    style={{
                        marginTop: percentageOffsetY,
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
    loaderMode: {
        type: ControlType.Enum,
        title: "Loader",
        options: ["bar", "svg"],
        optionTitles: ["Progress Bar", "SVG Fill"],
        defaultValue: "bar",
    },
    children: {
        type: ControlType.ComponentInstance,
        title: "SVG",
        hidden: (props) => props.loaderMode !== "svg",
    },
    fillDirection: {
        type: ControlType.Enum,
        title: "Fill Direction",
        options: ["up", "down", "left", "right"],
        optionTitles: ["Up", "Down", "Left", "Right"],
        defaultValue: "up",
        hidden: (props) => props.loaderMode !== "svg",
    },
    svgSize: {
        type: ControlType.Number,
        title: "SVG Size",
        defaultValue: 80,
        min: 20,
        max: 400,
        step: 1,
        unit: "px",
        hidden: (props) => props.loaderMode !== "svg",
    },
    svgFillColor: {
        type: ControlType.Color,
        title: "Fill Color",
        defaultValue: "#ffffff",
        hidden: (props) => props.loaderMode !== "svg",
    },
    svgTrackColor: {
        type: ControlType.Color,
        title: "Track Color",
        defaultValue: "#ffffff",
        hidden: (props) => props.loaderMode !== "svg",
    },
    svgTrackOpacity: {
        type: ControlType.Number,
        title: "Track Opacity",
        defaultValue: 0.15,
        min: 0,
        max: 1,
        step: 0.05,
        hidden: (props) => props.loaderMode !== "svg",
    },
    backgroundColor: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: "#000000",
    },
    barColor: {
        type: ControlType.Color,
        title: "Bar Color",
        defaultValue: "#ffffff",
        hidden: (props) => props.loaderMode !== "bar",
    },
    barTrackColor: {
        type: ControlType.Color,
        title: "Track Color",
        defaultValue: "rgba(255,255,255,0.15)",
        hidden: (props) => props.loaderMode !== "bar",
    },
    barWidth: {
        type: ControlType.Number,
        title: "Bar Width",
        defaultValue: 200,
        min: 50,
        max: 600,
        step: 1,
        unit: "px",
        hidden: (props) => props.loaderMode !== "bar",
    },
    barHeight: {
        type: ControlType.Number,
        title: "Bar Height",
        defaultValue: 3,
        min: 1,
        max: 20,
        step: 1,
        unit: "px",
        hidden: (props) => props.loaderMode !== "bar",
    },
    barBorderRadius: {
        type: ControlType.Number,
        title: "Bar Radius",
        defaultValue: 2,
        min: 0,
        max: 10,
        step: 1,
        unit: "px",
        hidden: (props) => props.loaderMode !== "bar",
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
    percentageOffsetY: {
        type: ControlType.Number,
        title: "% Offset Y",
        defaultValue: 12,
        min: 0,
        max: 60,
        step: 1,
        unit: "px",
        hidden: (props) => !props.showPercentage,
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
