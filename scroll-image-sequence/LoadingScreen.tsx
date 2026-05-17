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
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // ── Lock scroll + hide content to prevent appear-on-view effects ──

    const loaderRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        // Lock scroll — only overflow, don't constrain height
        // so Framer still renders off-screen components
        const originalOverflow = document.body.style.overflow
        document.body.style.overflow = "hidden"

        // Hide page content so IntersectionObserver-based "appear on view"
        // effects don't fire while the loading screen is visible.
        // Strategy: walk up from the loader to find its nearest "section" ancestor
        // (where siblings represent other page sections), then hide those siblings.
        // visibility:hidden prevents IO triggers while keeping layout intact for preload.
        const hiddenEls: HTMLElement[] = []
        if (loaderRef.current) {
            // Walk up to find the loader's section-level container.
            // In Framer, sections are siblings inside a page wrapper.
            // We look for the ancestor whose parent has multiple children (sections).
            let sectionEl: HTMLElement | null = loaderRef.current
            while (sectionEl && sectionEl.parentElement) {
                const parent = sectionEl.parentElement
                // Stop when we find a parent with multiple element children
                // (i.e. the page wrapper containing sections)
                if (parent.children.length > 1 && parent !== document.body) {
                    break
                }
                // Also stop at body
                if (parent === document.body) break
                sectionEl = parent
            }

            // Hide all sibling sections
            if (sectionEl && sectionEl.parentElement) {
                const siblings = sectionEl.parentElement.children
                for (let i = 0; i < siblings.length; i++) {
                    const el = siblings[i] as HTMLElement
                    if (el !== sectionEl && el.style !== undefined) {
                        el.dataset.loaderHiddenVis = el.style.visibility || ""
                        el.style.visibility = "hidden"
                        hiddenEls.push(el)
                    }
                }
            }
        }
        ;(window as any).__loaderHiddenEls = hiddenEls

        // Poll window globals set by ScrollImageSequence
        pollRef.current = setInterval(() => {
            const w = window as any
            const prog = typeof w.__seqProgress === "number" ? w.__seqProgress : 0
            const done = w.__seqLoaded === true
            setProgress(prog)
            if (done || prog >= 1) {
                setLoaded(true)
                if (pollRef.current) clearInterval(pollRef.current)
            }
        }, 100)

        // Safety timeout: dismiss after 30s no matter what
        const safetyTimer = setTimeout(() => {
            setLoaded(true)
            if (pollRef.current) clearInterval(pollRef.current)
        }, 30000)

        return () => {
            document.body.style.overflow = originalOverflow
            if (pollRef.current) clearInterval(pollRef.current)
            clearTimeout(safetyTimer)
        }
    }, [])

    // ── Dismiss after load + delay ──────────────────────────────

    useEffect(() => {
        if (!loaded) return

        const delayTimer = setTimeout(() => {
            // Restore visibility on page content so appear effects can now fire
            const hiddenEls: HTMLElement[] =
                (window as any).__loaderHiddenEls || []
            hiddenEls.forEach((el) => {
                el.style.visibility = el.dataset.loaderHiddenVis || ""
                delete el.dataset.loaderHiddenVis
            })
            ;(window as any).__loaderHiddenEls = []

            setDismissed(true)
            document.body.style.overflow = ""

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

    // Compute overflow-reveal styles for the fill mask.
    // The mask container clips the SVG; the inner positions the SVG
    // so it stays aligned with the track layer underneath.
    const p = progress * 100
    function getFillMaskStyle(): React.CSSProperties {
        switch (fillDirection) {
            case "up":
                return { bottom: 0, left: 0, width: "100%", height: `${p}%` }
            case "down":
                return { top: 0, left: 0, width: "100%", height: `${p}%` }
            case "left":
                return { top: 0, right: 0, width: `${p}%`, height: "100%" }
            case "right":
                return { top: 0, left: 0, width: `${p}%`, height: "100%" }
            default:
                return { bottom: 0, left: 0, width: "100%", height: `${p}%` }
        }
    }
    // Position the SVG inside the mask so it aligns with the track
    function getFillInnerStyle(): React.CSSProperties {
        switch (fillDirection) {
            case "up":
                return { position: "absolute" as const, bottom: 0, left: 0, width: svgSize, height: svgSize }
            case "down":
                return { position: "absolute" as const, top: 0, left: 0, width: svgSize, height: svgSize }
            case "left":
                return { position: "absolute" as const, top: 0, right: 0, width: svgSize, height: svgSize }
            case "right":
                return { position: "absolute" as const, top: 0, left: 0, width: svgSize, height: svgSize }
            default:
                return { position: "absolute" as const, bottom: 0, left: 0, width: svgSize, height: svgSize }
        }
    }

    // Framer passes ComponentInstance as a single element or an array
    const svgChild = loaderMode === "svg"
        ? (Array.isArray(children) ? children[0] : children) || null
        : null
    const hasSvgChild = !!svgChild

    return (
        <div
            ref={loaderRef}
            data-loading-screen
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
                        }}
                    >
                        {svgChild}
                    </div>

                    {/* Fill layer — revealed via overflow:hidden mask */}
                    <div
                        style={{
                            position: "absolute",
                            overflow: "hidden",
                            transition: "width 0.2s ease-out, height 0.2s ease-out",
                            color: svgFillColor,
                            ...getFillMaskStyle(),
                        }}
                    >
                        <div style={getFillInnerStyle()}>
                            {svgChild}
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
