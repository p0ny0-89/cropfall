import { addPropertyControls, ControlType } from "framer"
import {
    useState,
    useEffect,
    useRef,
    useMemo,
} from "react"

// ─── Types ───────────────────────────────────────────────────────────

interface Milestone {
    label: string
    frame: number
    range?: number
}

interface Props {
    sourceMode: "pattern" | "manual"
    baseUrl: string
    filePrefix: string
    fileExtension: "webp" | "png" | "jpg"
    startFrame: number
    endFrame: number
    numberPadding: number
    manualUrls: string
    scrollHeightVh: number
    stickyTopOffset: number
    objectFit: "cover" | "contain"
    objectPositionX: number
    objectPositionY: number
    backgroundColor: string
    sequenceOpacity: number
    enablePreload: boolean
    showMilestoneOverlay: boolean
    milestonesJson: string
    enableMilestoneSnap: boolean
    snapStrength: number
    snapRange: number
    snapSmoothing: number
}

// ─── Helpers ─────────────────────────────────────────────────────────

function padNumber(n: number, width: number): string {
    return String(n).padStart(width, "0")
}

function buildFrameUrls(
    baseUrl: string,
    prefix: string,
    ext: string,
    start: number,
    end: number,
    padding: number
): string[] {
    const urls: string[] = []
    const base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/"
    for (let i = start; i <= end; i++) {
        urls.push(`${base}${prefix}${padNumber(i, padding)}.${ext}`)
    }
    return urls
}

function parseMilestones(json: string): Milestone[] {
    if (!json || !json.trim()) return []
    try {
        const parsed = JSON.parse(json)
        if (!Array.isArray(parsed)) return []
        return parsed.filter(
            (m) => typeof m.label === "string" && typeof m.frame === "number"
        )
    } catch {
        return []
    }
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * @framerSupportedLayoutHeight any
 * @framerSupportedLayoutWidth any
 * @framerDisableUnlink
 */
export default function ScrollImageSequence(props: Props) {
    const {
        sourceMode = "pattern",
        baseUrl = "",
        filePrefix = "",
        fileExtension = "webp",
        startFrame = 1,
        endFrame = 100,
        numberPadding = 4,
        manualUrls = "",
        scrollHeightVh = 400,
        stickyTopOffset = 0,
        objectFit = "cover",
        objectPositionX = 50,
        objectPositionY = 50,
        backgroundColor = "#000000",
        sequenceOpacity = 1,
        enablePreload = true,
        showMilestoneOverlay = false,
        milestonesJson = "[]",
        enableMilestoneSnap = false,
        snapStrength = 0.5,
        snapRange = 0.05,
        snapSmoothing = 0.15,
    } = props

    const containerRef = useRef<HTMLDivElement>(null)
    const imagesRef = useRef<HTMLImageElement[]>([])
    const rafRef = useRef<number>(0)
    const smoothedProgressRef = useRef<number>(0)

    const [loadProgress, setLoadProgress] = useState(0)
    const [isLoaded, setIsLoaded] = useState(false)
    const [currentFrame, setCurrentFrame] = useState(0)
    const [activeMilestone, setActiveMilestone] = useState<Milestone | null>(
        null
    )

    // Build the list of frame URLs
    const frameUrls = useMemo(() => {
        if (sourceMode === "manual" && manualUrls.trim()) {
            return manualUrls
                .split("\n")
                .map((u) => u.trim())
                .filter(Boolean)
        }
        if (!baseUrl) return []
        const urls = buildFrameUrls(
            baseUrl,
            filePrefix,
            fileExtension.toLowerCase(),
            startFrame,
            endFrame,
            numberPadding
        )
        if (urls.length > 0) {
            console.log("[ScrollImageSequence] First URL:", urls[0])
        }
        return urls
    }, [
        sourceMode,
        baseUrl,
        filePrefix,
        fileExtension,
        startFrame,
        endFrame,
        numberPadding,
        manualUrls,
    ])

    const totalFrames = frameUrls.length
    const milestones = useMemo(
        () => parseMilestones(milestonesJson),
        [milestonesJson]
    )

    // ── Preload images ──────────────────────────────────────────────

    useEffect(() => {
        if (totalFrames === 0) return

        let cancelled = false
        const images: HTMLImageElement[] = new Array(totalFrames)
        let loaded = 0

        // Prioritise loading: first frame, last frame, then middle-out
        // from the first frame so nearby frames are available fastest.
        const loadOrder = buildLoadOrder(totalFrames)

        function loadNext(queue: number[], concurrency: number) {
            let active = 0

            function kick() {
                while (active < concurrency && queue.length > 0) {
                    const idx = queue.shift()!
                    active++
                    const img = new Image()
                    img.crossOrigin = "anonymous"
                    img.onload = img.onerror = () => {
                        if (cancelled) return
                        images[idx] = img
                        loaded++
                        active--
                        setLoadProgress(loaded / totalFrames)
                        if (loaded === totalFrames) {
                            imagesRef.current = images
                            setIsLoaded(true)
                        }
                        kick()
                    }
                    img.src = frameUrls[idx]
                }
            }

            kick()
        }

        if (enablePreload) {
            // Load with 6 concurrent requests — balanced between speed
            // and not saturating the browser's connection pool.
            loadNext(loadOrder, 6)
        } else {
            // Minimal preload: just the first frame
            const img = new Image()
            img.crossOrigin = "anonymous"
            img.onload = () => {
                if (cancelled) return
                images[0] = img
                imagesRef.current = images
                setIsLoaded(true)
                setLoadProgress(1)
            }
            img.src = frameUrls[0]
        }

        return () => {
            cancelled = true
        }
    }, [frameUrls, totalFrames, enablePreload])

    // ── Scroll handler ──────────────────────────────────────────────

    useEffect(() => {
        if (totalFrames === 0) return

        function onScroll() {
            rafRef.current = requestAnimationFrame(() => {
                const el = containerRef.current
                if (!el) return

                const rect = el.getBoundingClientRect()
                // How far we've scrolled into the container.
                // progress 0 = top of container is at top of viewport
                // progress 1 = bottom of container minus viewport is at top
                const scrollable = rect.height - window.innerHeight
                if (scrollable <= 0) return

                let rawProgress = -rect.top / scrollable
                rawProgress = Math.max(0, Math.min(1, rawProgress))

                let effectiveProgress = rawProgress

                // ── Milestone snap (soft magnetic landing) ──────────
                if (enableMilestoneSnap && milestones.length > 0) {
                    let closestDist = Infinity
                    let closestMilestoneProgress = rawProgress

                    for (const ms of milestones) {
                        const msProgress = ms.frame / (totalFrames - 1)
                        const dist = Math.abs(rawProgress - msProgress)
                        const range = ms.range
                            ? ms.range / (totalFrames - 1)
                            : snapRange

                        if (dist < range && dist < closestDist) {
                            closestDist = dist
                            closestMilestoneProgress = msProgress
                        }
                    }

                    if (closestDist < Infinity) {
                        // Influence falls off linearly within the range
                        const normalizedDist =
                            closestDist /
                            (snapRange || 0.05)
                        const influence =
                            Math.max(0, 1 - normalizedDist) * snapStrength
                        effectiveProgress = lerp(
                            rawProgress,
                            closestMilestoneProgress,
                            influence
                        )
                    }
                }

                // Smooth the progress to avoid frame jitter
                smoothedProgressRef.current = lerp(
                    smoothedProgressRef.current,
                    effectiveProgress,
                    enableMilestoneSnap ? 1 - snapSmoothing : 0.85
                )

                const progress = smoothedProgressRef.current
                const frameIndex = Math.round(
                    progress * (totalFrames - 1)
                )
                const clamped = Math.max(
                    0,
                    Math.min(totalFrames - 1, frameIndex)
                )

                setCurrentFrame(clamped)

                // ── Active milestone detection ──────────────────────
                if (milestones.length > 0) {
                    let active: Milestone | null = null
                    let bestDist = Infinity

                    for (const ms of milestones) {
                        const proximity = ms.range ?? 10
                        const dist = Math.abs(clamped - ms.frame)
                        if (dist <= proximity && dist < bestDist) {
                            bestDist = dist
                            active = ms
                        }
                    }

                    setActiveMilestone(active)
                }
            })
        }

        window.addEventListener("scroll", onScroll, { passive: true })
        onScroll()

        return () => {
            window.removeEventListener("scroll", onScroll)
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
        }
    }, [
        totalFrames,
        milestones,
        enableMilestoneSnap,
        snapStrength,
        snapRange,
        snapSmoothing,
    ])

    // ── Empty state ─────────────────────────────────────────────────

    if (totalFrames === 0) {
        return (
            <div
                style={{
                    width: "100%",
                    height: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: backgroundColor,
                    color: "#888",
                    fontFamily: "system-ui, sans-serif",
                    fontSize: 14,
                }}
            >
                <div style={{ textAlign: "center", maxWidth: 360 }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>
                        ScrollImageSequence
                    </p>
                    <p style={{ margin: "8px 0 0", opacity: 0.7 }}>
                        Configure a base URL and frame range, or paste
                        image URLs in manual mode.
                    </p>
                </div>
            </div>
        )
    }

    // ── Render ───────────────────────────────────────────────────────

    return (
        <div
            ref={containerRef}
            style={{
                position: "relative",
                width: "100%",
                height: `${scrollHeightVh}vh`,
            }}
        >
            {/* Sticky viewport */}
            <div
                style={{
                    position: "sticky",
                    top: stickyTopOffset,
                    width: "100%",
                    height: "100vh",
                    overflow: "hidden",
                    background: backgroundColor,
                }}
            >
                {/* Loading overlay */}
                {!isLoaded && (
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            background: backgroundColor,
                            color: "#fff",
                            fontFamily: "system-ui, sans-serif",
                            zIndex: 10,
                        }}
                    >
                        <div
                            style={{
                                width: 200,
                                height: 3,
                                borderRadius: 2,
                                background: "rgba(255,255,255,0.15)",
                                overflow: "hidden",
                            }}
                        >
                            <div
                                style={{
                                    width: `${loadProgress * 100}%`,
                                    height: "100%",
                                    background: "#fff",
                                    borderRadius: 2,
                                    transition: "width 0.2s ease-out",
                                }}
                            />
                        </div>
                        <span
                            style={{
                                marginTop: 12,
                                fontSize: 12,
                                opacity: 0.5,
                            }}
                        >
                            Loading {Math.round(loadProgress * 100)}%
                        </span>
                    </div>
                )}

                {/* Current frame — native <img> for best scaling quality */}
                {frameUrls[currentFrame] && (
                    <img
                        src={frameUrls[currentFrame]}
                        alt=""
                        style={{
                            display: "block",
                            width: "100%",
                            height: "100%",
                            objectFit: objectFit,
                            objectPosition: `${objectPositionX}% ${objectPositionY}%`,
                            opacity: isLoaded ? sequenceOpacity : 0,
                            transition: "opacity 0.3s ease",
                        }}
                    />
                )}

                {/* Milestone overlay */}
                {showMilestoneOverlay && activeMilestone && (
                    <div
                        style={{
                            position: "absolute",
                            bottom: 48,
                            left: "50%",
                            transform: "translateX(-50%)",
                            padding: "10px 24px",
                            borderRadius: 8,
                            background: "rgba(0,0,0,0.6)",
                            backdropFilter: "blur(12px)",
                            WebkitBackdropFilter: "blur(12px)",
                            color: "#fff",
                            fontFamily: "system-ui, sans-serif",
                            fontSize: 14,
                            fontWeight: 500,
                            letterSpacing: "0.02em",
                            whiteSpace: "nowrap",
                            pointerEvents: "none",
                            zIndex: 5,
                        }}
                    >
                        {activeMilestone.label}
                    </div>
                )}

                {/* DEBUG OVERLAY — remove after testing */}
                <div
                    style={{
                        position: "absolute",
                        top: 12,
                        left: 12,
                        padding: "8px 12px",
                        borderRadius: 6,
                        background: "rgba(0,0,0,0.75)",
                        color: "#0f0",
                        fontFamily: "monospace",
                        fontSize: 11,
                        lineHeight: 1.5,
                        pointerEvents: "none",
                        zIndex: 20,
                        maxWidth: "90%",
                        wordBreak: "break-all",
                    }}
                >
                    <div>Frame: {currentFrame} / {totalFrames - 1}</div>
                    <div>URL: {frameUrls[currentFrame] ?? "—"}</div>
                    <div>Render: native &lt;img&gt; with object-fit: {objectFit}</div>
                </div>
            </div>
        </div>
    )
}

// ─── Load-order builder ──────────────────────────────────────────────
// Loads frame 0 first, then expands outward so the nearest frames
// to the current scroll position are available soonest.

function buildLoadOrder(total: number): number[] {
    if (total <= 0) return []
    const order: number[] = [0]
    const visited = new Set([0])

    // Also prioritise the last frame
    if (total > 1) {
        order.push(total - 1)
        visited.add(total - 1)
    }

    // Middle-out from frame 0
    for (let offset = 1; offset < total; offset++) {
        const forward = offset
        const backward = total - 1 - offset
        if (!visited.has(forward) && forward < total) {
            order.push(forward)
            visited.add(forward)
        }
        if (!visited.has(backward) && backward >= 0) {
            order.push(backward)
            visited.add(backward)
        }
    }

    return order
}

// ─── Property Controls ───────────────────────────────────────────────

addPropertyControls(ScrollImageSequence, {
    sourceMode: {
        type: ControlType.Enum,
        title: "Source Mode",
        options: ["pattern", "manual"],
        optionTitles: ["URL Pattern", "Manual List"],
        defaultValue: "pattern",
    },

    // ── Pattern mode controls ───────────────────────────────────────
    baseUrl: {
        type: ControlType.String,
        title: "Base URL",
        placeholder: "https://cdn.example.com/frames/",
        hidden: (props) => props.sourceMode === "manual",
    },
    filePrefix: {
        type: ControlType.String,
        title: "File Prefix",
        defaultValue: "",
        hidden: (props) => props.sourceMode === "manual",
    },
    fileExtension: {
        type: ControlType.Enum,
        title: "Extension",
        options: ["webp", "png", "jpg"],
        optionTitles: ["webp", "png", "jpg"],
        defaultValue: "webp",
        hidden: (props) => props.sourceMode === "manual",
    },
    startFrame: {
        type: ControlType.Number,
        title: "Start Frame",
        defaultValue: 1,
        min: 0,
        step: 1,
        hidden: (props) => props.sourceMode === "manual",
    },
    endFrame: {
        type: ControlType.Number,
        title: "End Frame",
        defaultValue: 100,
        min: 1,
        step: 1,
        hidden: (props) => props.sourceMode === "manual",
    },
    numberPadding: {
        type: ControlType.Number,
        title: "Number Padding",
        defaultValue: 4,
        min: 1,
        max: 8,
        step: 1,
        hidden: (props) => props.sourceMode === "manual",
    },

    // ── Manual mode control ─────────────────────────────────────────
    manualUrls: {
        type: ControlType.String,
        title: "Image URLs",
        placeholder:
            "One URL per line:\nhttps://cdn.example.com/frame_0001.webp\nhttps://cdn.example.com/frame_0002.webp",
        displayTextArea: true,
        hidden: (props) => props.sourceMode === "pattern",
    },

    // ── Scroll / layout ─────────────────────────────────────────────
    scrollHeightVh: {
        type: ControlType.Number,
        title: "Scroll Height (vh)",
        defaultValue: 400,
        min: 100,
        max: 1000,
        step: 50,
    },
    stickyTopOffset: {
        type: ControlType.Number,
        title: "Sticky Top Offset",
        defaultValue: 0,
        min: 0,
        max: 200,
        step: 1,
        unit: "px",
    },

    // ── Image display ───────────────────────────────────────────────
    objectFit: {
        type: ControlType.Enum,
        title: "Object Fit",
        options: ["cover", "contain"],
        optionTitles: ["Cover", "Contain"],
        defaultValue: "cover",
    },
    objectPositionX: {
        type: ControlType.Number,
        title: "Position X",
        defaultValue: 50,
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
    },
    objectPositionY: {
        type: ControlType.Number,
        title: "Position Y",
        defaultValue: 50,
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
    },
    backgroundColor: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: "#000000",
    },
    sequenceOpacity: {
        type: ControlType.Number,
        title: "Opacity",
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.05,
    },

    // ── Preloading ──────────────────────────────────────────────────
    enablePreload: {
        type: ControlType.Boolean,
        title: "Preload All",
        defaultValue: true,
    },

    // ── Milestones ──────────────────────────────────────────────────
    showMilestoneOverlay: {
        type: ControlType.Boolean,
        title: "Milestone Overlay",
        defaultValue: false,
    },
    milestonesJson: {
        type: ControlType.String,
        title: "Milestones (JSON)",
        placeholder:
            '[{"label":"Ignition","frame":30,"range":10}]',
        displayTextArea: true,
    },

    // ── Milestone snap ──────────────────────────────────────────────
    enableMilestoneSnap: {
        type: ControlType.Boolean,
        title: "Milestone Snap",
        defaultValue: false,
    },
    snapStrength: {
        type: ControlType.Number,
        title: "Snap Strength",
        defaultValue: 0.5,
        min: 0,
        max: 1,
        step: 0.05,
        hidden: (props) => !props.enableMilestoneSnap,
    },
    snapRange: {
        type: ControlType.Number,
        title: "Snap Range",
        defaultValue: 0.05,
        min: 0.01,
        max: 0.2,
        step: 0.01,
        hidden: (props) => !props.enableMilestoneSnap,
    },
    snapSmoothing: {
        type: ControlType.Number,
        title: "Snap Smoothing",
        defaultValue: 0.15,
        min: 0,
        max: 0.5,
        step: 0.01,
        hidden: (props) => !props.enableMilestoneSnap,
    },
})
