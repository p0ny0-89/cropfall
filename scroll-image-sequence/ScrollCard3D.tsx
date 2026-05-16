import { addPropertyControls, ControlType, RenderTarget } from "framer"
import { useEffect, useRef, useState } from "react"

// ─── Types ───────────────────────────────────────────────────────────

interface Props {
    children: React.ReactNode[]
    // Timing
    totalFrames: number
    enterFrame: number
    peakFrame: number
    exitFrame: number
    // Perspective container
    perspective: number
    perspectiveOriginX: number
    perspectiveOriginY: number
    // Start keyframe (enter)
    startX: number
    startY: number
    startScale: number
    startRotateX: number
    startRotateY: number
    startRotateZ: number
    startOpacity: number
    // Peak keyframe (closest)
    peakX: number
    peakY: number
    peakScale: number
    peakRotateX: number
    peakRotateY: number
    peakRotateZ: number
    peakOpacity: number
    // End keyframe (exit)
    endX: number
    endY: number
    endScale: number
    endRotateX: number
    endRotateY: number
    endRotateZ: number
    endOpacity: number
    // Easing
    easing: "linear" | "ease-in" | "ease-out" | "ease-in-out"
    // Canvas preview
    previewKeyframe: "hidden" | "start" | "peak" | "end"
}

// ─── Easing functions ───────────────────────────────────────────────

function easeIn(t: number): number {
    return t * t
}

function easeOut(t: number): number {
    return 1 - (1 - t) * (1 - t)
}

function easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

function applyEasing(t: number, type: string): number {
    switch (type) {
        case "ease-in":
            return easeIn(t)
        case "ease-out":
            return easeOut(t)
        case "ease-in-out":
            return easeInOut(t)
        default:
            return t
    }
}

// ─── Interpolation ──────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
}

// ─── Component ──────────────────────────────────────────────────────

/**
 * @framerSupportedLayoutHeight any
 * @framerSupportedLayoutWidth any
 * @framerDisableUnlink
 */
export default function ScrollCard3D(props: Props) {
    const {
        children,
        totalFrames = 400,
        enterFrame = 60,
        peakFrame = 90,
        exitFrame = 120,
        perspective = 1000,
        perspectiveOriginX = 50,
        perspectiveOriginY = 50,
        // Start
        startX = -200,
        startY = 100,
        startScale = 0.4,
        startRotateX = 0,
        startRotateY = 35,
        startRotateZ = -3,
        startOpacity = 0,
        // Peak
        peakX = 200,
        peakY = -50,
        peakScale = 1,
        peakRotateX = 0,
        peakRotateY = 8,
        peakRotateZ = 0,
        peakOpacity = 1,
        // End
        endX = 500,
        endY = -200,
        endScale = 1.3,
        endRotateX = 0,
        endRotateY = -15,
        endRotateZ = 3,
        endOpacity = 0,
        easing = "ease-in-out",
        previewKeyframe = "peak",
    } = props

    const isCanvas = RenderTarget.current() === RenderTarget.canvas
    const containerRef = useRef<HTMLDivElement>(null)
    const rafRef = useRef<number>(0)
    const [currentFrame, setCurrentFrame] = useState(0)

    // ── Find the scroll reference element ─────────────────────────
    // 1. If a ScrollImageSequence exists, use its [data-scroll-sequence]
    //    container so both components share identical progress.
    // 2. Otherwise, walk up the DOM to find the nearest tall ancestor
    //    (height > 1.5× viewport) — this lets ScrollCard3D work
    //    standalone in any tall section.

    const scrollElRef = useRef<HTMLElement | null>(null)

    function findTallAncestor(el: HTMLElement): HTMLElement | null {
        let node: HTMLElement | null = el.parentElement
        while (node) {
            if (node.offsetHeight > window.innerHeight * 1.5) {
                return node
            }
            node = node.parentElement
        }
        return null
    }

    useEffect(() => {
        const seq = document.querySelector("[data-scroll-sequence]") as HTMLElement | null
        if (seq) {
            scrollElRef.current = seq
        } else if (containerRef.current) {
            scrollElRef.current = findTallAncestor(containerRef.current)
        }
    }, [])

    // ── Scroll handler ─────────────────────────────────────────────

    useEffect(() => {
        if (totalFrames === 0) return

        function onScroll() {
            rafRef.current = requestAnimationFrame(() => {
                // Try cached ref first, then re-discover
                let scrollEl = scrollElRef.current
                if (!scrollEl) {
                    scrollEl =
                        (document.querySelector("[data-scroll-sequence]") as HTMLElement | null) ||
                        (containerRef.current ? findTallAncestor(containerRef.current) : null)
                    if (!scrollEl) return
                    scrollElRef.current = scrollEl
                }

                const rect = scrollEl.getBoundingClientRect()
                const scrollable = rect.height - window.innerHeight
                if (scrollable <= 0) return

                let rawProgress = -rect.top / scrollable
                rawProgress = Math.max(0, Math.min(1, rawProgress))

                const frame = Math.round(rawProgress * (totalFrames - 1))
                setCurrentFrame(Math.max(0, Math.min(totalFrames - 1, frame)))
            })
        }

        window.addEventListener("scroll", onScroll, { passive: true })
        onScroll()

        return () => {
            window.removeEventListener("scroll", onScroll)
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
        }
    }, [totalFrames])

    // ── Compute interpolated values ─────────────────────────────────

    let x: number,
        y: number,
        scale: number,
        rotX: number,
        rotY: number,
        rotZ: number,
        opacity: number

    if (isCanvas) {
        // ── Canvas preview: show static keyframe pose ──────────────
        switch (previewKeyframe) {
            case "start":
                x = startX; y = startY; scale = startScale
                rotX = startRotateX; rotY = startRotateY; rotZ = startRotateZ
                opacity = startOpacity
                break
            case "peak":
                x = peakX; y = peakY; scale = peakScale
                rotX = peakRotateX; rotY = peakRotateY; rotZ = peakRotateZ
                opacity = peakOpacity
                break
            case "end":
                x = endX; y = endY; scale = endScale
                rotX = endRotateX; rotY = endRotateY; rotZ = endRotateZ
                opacity = endOpacity
                break
            default: // "hidden"
                x = 0; y = 0; scale = 1
                rotX = 0; rotY = 0; rotZ = 0
                opacity = 0
                break
        }
    } else {
        // ── Live preview: scroll-driven interpolation ──────────────
        const isVisible =
            currentFrame >= enterFrame && currentFrame <= exitFrame
        const isPre = currentFrame < enterFrame
        const isPost = currentFrame > exitFrame

        if (isPre || !isVisible) {
            x = startX; y = startY; scale = startScale
            rotX = startRotateX; rotY = startRotateY; rotZ = startRotateZ
            opacity = 0
        } else if (isPost) {
            x = endX; y = endY; scale = endScale
            rotX = endRotateX; rotY = endRotateY; rotZ = endRotateZ
            opacity = 0
        } else if (currentFrame <= peakFrame) {
            const range = peakFrame - enterFrame
            const rawT = range > 0 ? (currentFrame - enterFrame) / range : 1
            const t = applyEasing(rawT, easing)
            x = lerp(startX, peakX, t)
            y = lerp(startY, peakY, t)
            scale = lerp(startScale, peakScale, t)
            rotX = lerp(startRotateX, peakRotateX, t)
            rotY = lerp(startRotateY, peakRotateY, t)
            rotZ = lerp(startRotateZ, peakRotateZ, t)
            opacity = lerp(startOpacity, peakOpacity, t)
        } else {
            const range = exitFrame - peakFrame
            const rawT = range > 0 ? (currentFrame - peakFrame) / range : 1
            const t = applyEasing(rawT, easing)
            x = lerp(peakX, endX, t)
            y = lerp(peakY, endY, t)
            scale = lerp(peakScale, endScale, t)
            rotX = lerp(peakRotateX, endRotateX, t)
            rotY = lerp(peakRotateY, endRotateY, t)
            rotZ = lerp(peakRotateZ, endRotateZ, t)
            opacity = lerp(peakOpacity, endOpacity, t)
        }
    }

    // Clamp opacity
    opacity = Math.max(0, Math.min(1, opacity))

    // ── Empty state ─────────────────────────────────────────────────

    if (!children || (Array.isArray(children) && children.length === 0)) {
        return (
            <div
                ref={containerRef}
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#888",
                    fontFamily: "system-ui, sans-serif",
                    fontSize: 13,
                    border: "1px dashed rgba(255,255,255,0.2)",
                    borderRadius: 8,
                }}
            >
                Drop a card here
            </div>
        )
    }

    // ── Render ───────────────────────────────────────────────────────

    // Canvas: relative positioning for preview inside the Framer frame.
    // Live: fixed to viewport so the card stays centered regardless of
    //       how the parent frame is sized or positioned in the page.
    return (
        <div
            ref={containerRef}
            style={{
                position: isCanvas ? "relative" : "fixed",
                top: 0,
                left: 0,
                width: isCanvas ? "100%" : "100vw",
                height: isCanvas ? "100%" : "100vh",
                pointerEvents: "none",
                overflow: "visible",
                perspective,
                perspectiveOrigin: `${perspectiveOriginX}% ${perspectiveOriginY}%`,
                zIndex: 10,
            }}
        >
            <div
                style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: `
                        translate(-50%, -50%)
                        translate3d(${x}px, ${y}px, 0px)
                        rotateX(${rotX}deg)
                        rotateY(${rotY}deg)
                        rotateZ(${rotZ}deg)
                        scale(${scale})
                    `,
                    opacity,
                    willChange: "transform, opacity",
                    pointerEvents: opacity > 0.1 ? "auto" : "none",
                    transformStyle: "preserve-3d",
                }}
            >
                {children}
            </div>
        </div>
    )
}

// ─── Property Controls ──────────────────────────────────────────────

addPropertyControls(ScrollCard3D, {
    children: {
        type: ControlType.ComponentInstance,
        title: "Card",
    },

    // ── Timing ──────────────────────────────────────────────────────
    totalFrames: {
        type: ControlType.Number,
        title: "Total Frames",
        defaultValue: 400,
        min: 1,
        step: 1,
    },
    enterFrame: {
        type: ControlType.Number,
        title: "Enter Frame",
        defaultValue: 60,
        min: 0,
        step: 1,
    },
    peakFrame: {
        type: ControlType.Number,
        title: "Peak Frame",
        defaultValue: 90,
        min: 0,
        step: 1,
    },
    exitFrame: {
        type: ControlType.Number,
        title: "Exit Frame",
        defaultValue: 120,
        min: 0,
        step: 1,
    },
    easing: {
        type: ControlType.Enum,
        title: "Easing",
        options: ["linear", "ease-in", "ease-out", "ease-in-out"],
        optionTitles: ["Linear", "Ease In", "Ease Out", "Ease In-Out"],
        defaultValue: "ease-in-out",
    },
    previewKeyframe: {
        type: ControlType.Enum,
        title: "Canvas Preview",
        options: ["hidden", "start", "peak", "end"],
        optionTitles: ["Hidden", "Start", "Peak", "End"],
        defaultValue: "peak",
    },

    // ── Perspective ─────────────────────────────────────────────────
    perspective: {
        type: ControlType.Number,
        title: "Perspective",
        defaultValue: 1000,
        min: 200,
        max: 3000,
        step: 50,
        unit: "px",
    },
    perspectiveOriginX: {
        type: ControlType.Number,
        title: "Vanishing X",
        defaultValue: 50,
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
    },
    perspectiveOriginY: {
        type: ControlType.Number,
        title: "Vanishing Y",
        defaultValue: 50,
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
    },

    // ── Start keyframe ──────────────────────────────────────────────
    startX: {
        type: ControlType.Number,
        title: "Start X",
        defaultValue: -200,
        min: -1000,
        max: 1000,
        step: 1,
        unit: "px",
    },
    startY: {
        type: ControlType.Number,
        title: "Start Y",
        defaultValue: 100,
        min: -1000,
        max: 1000,
        step: 1,
        unit: "px",
    },
    startScale: {
        type: ControlType.Number,
        title: "Start Scale",
        defaultValue: 0.4,
        min: 0,
        max: 3,
        step: 0.05,
    },
    startRotateX: {
        type: ControlType.Number,
        title: "Start Rot X",
        defaultValue: 0,
        min: -90,
        max: 90,
        step: 1,
        unit: "deg",
    },
    startRotateY: {
        type: ControlType.Number,
        title: "Start Rot Y",
        defaultValue: 35,
        min: -90,
        max: 90,
        step: 1,
        unit: "deg",
    },
    startRotateZ: {
        type: ControlType.Number,
        title: "Start Rot Z",
        defaultValue: -3,
        min: -45,
        max: 45,
        step: 1,
        unit: "deg",
    },
    startOpacity: {
        type: ControlType.Number,
        title: "Start Opacity",
        defaultValue: 0,
        min: 0,
        max: 1,
        step: 0.05,
    },

    // ── Peak keyframe ───────────────────────────────────────────────
    peakX: {
        type: ControlType.Number,
        title: "Peak X",
        defaultValue: 200,
        min: -1000,
        max: 1000,
        step: 1,
        unit: "px",
    },
    peakY: {
        type: ControlType.Number,
        title: "Peak Y",
        defaultValue: -50,
        min: -1000,
        max: 1000,
        step: 1,
        unit: "px",
    },
    peakScale: {
        type: ControlType.Number,
        title: "Peak Scale",
        defaultValue: 1,
        min: 0,
        max: 3,
        step: 0.05,
    },
    peakRotateX: {
        type: ControlType.Number,
        title: "Peak Rot X",
        defaultValue: 0,
        min: -90,
        max: 90,
        step: 1,
        unit: "deg",
    },
    peakRotateY: {
        type: ControlType.Number,
        title: "Peak Rot Y",
        defaultValue: 8,
        min: -90,
        max: 90,
        step: 1,
        unit: "deg",
    },
    peakRotateZ: {
        type: ControlType.Number,
        title: "Peak Rot Z",
        defaultValue: 0,
        min: -45,
        max: 45,
        step: 1,
        unit: "deg",
    },
    peakOpacity: {
        type: ControlType.Number,
        title: "Peak Opacity",
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.05,
    },

    // ── End keyframe ────────────────────────────────────────────────
    endX: {
        type: ControlType.Number,
        title: "End X",
        defaultValue: 500,
        min: -1000,
        max: 1000,
        step: 1,
        unit: "px",
    },
    endY: {
        type: ControlType.Number,
        title: "End Y",
        defaultValue: -200,
        min: -1000,
        max: 1000,
        step: 1,
        unit: "px",
    },
    endScale: {
        type: ControlType.Number,
        title: "End Scale",
        defaultValue: 1.3,
        min: 0,
        max: 3,
        step: 0.05,
    },
    endRotateX: {
        type: ControlType.Number,
        title: "End Rot X",
        defaultValue: 0,
        min: -90,
        max: 90,
        step: 1,
        unit: "deg",
    },
    endRotateY: {
        type: ControlType.Number,
        title: "End Rot Y",
        defaultValue: -15,
        min: -90,
        max: 90,
        step: 1,
        unit: "deg",
    },
    endRotateZ: {
        type: ControlType.Number,
        title: "End Rot Z",
        defaultValue: 3,
        min: -45,
        max: 45,
        step: 1,
        unit: "deg",
    },
    endOpacity: {
        type: ControlType.Number,
        title: "End Opacity",
        defaultValue: 0,
        min: 0,
        max: 1,
        step: 0.05,
    },
})
