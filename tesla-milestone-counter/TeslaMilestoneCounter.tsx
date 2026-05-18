import { addPropertyControls, ControlType } from "framer"
import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { setCount as publishCount } from "./milestoneStore.ts"

interface ModelData {
    name: string
    count: number
    rate: number
    status: string
}

const DEFAULT_MODEL_DATA: ModelData[] = [
    { name: "Model Y", count: 812481, rate: 0.7, status: "Active" },
    { name: "Model 3", count: 704219, rate: 0.55, status: "Active" },
    { name: "Model S", count: 214882, rate: 0.08, status: "Legacy / Active" },
    { name: "Model X", count: 151090, rate: 0.06, status: "Legacy / Active" },
    { name: "Cybertruck", count: 42810, rate: 0.12, status: "Active" },
    { name: "Semi", count: 4112, rate: 0.03, status: "Commercial" },
    { name: "Cybercab", count: 0, rate: 0, status: "Future" },
    { name: "Robovan", count: 0, rate: 0, status: "Future" },
]

function formatNumber(n: number): string {
    return Math.floor(n).toLocaleString("en-US")
}

function parseModels(json: string): ModelData[] | null {
    try {
        const parsed = JSON.parse(json)
        if (!Array.isArray(parsed)) return null
        return parsed.map((m: any) => ({
            name: String(m.name ?? "Unknown"),
            count: Number(m.count) || 0,
            rate: Number(m.rate) || 0,
            status: String(m.status ?? "Unknown"),
        }))
    } catch {
        return null
    }
}

function useInView(ref: React.RefObject<HTMLDivElement | null>): boolean {
    const [inView, setInView] = useState(false)
    useEffect(() => {
        const el = ref.current
        if (!el) return
        const obs = new IntersectionObserver(
            ([entry]) => setInView(entry.isIntersecting),
            { threshold: 0.1 }
        )
        obs.observe(el)
        return () => obs.disconnect()
    }, [ref])
    return inView
}

/**
 * @framerSupportedLayoutHeight any
 * @framerSupportedLayoutWidth any
 * @framerDisableUnlink
 */
export default function TeslaMilestoneCounter({
    initialCount = 1945672,
    milestoneCount = 2000000,
    countRatePerSecond = 1.2,
    demoSpeedMultiplier = 1,
    estimatedMilestoneDate = "June 15, 2026",
    reachedDate = "June 15, 2026",
    startCountingOnView = true,
    animationSmoothing = 0.08,
    heightVh = 100,
    showModelBreakdown = true,
    layoutMode = "Bento Grid",
    modelDataJson = JSON.stringify(DEFAULT_MODEL_DATA, null, 2),
    showStatusLabel = true,
    showDate = true,
    showPercentages = true,
    backgroundColor = "#0a0a0a",
    textColor = "#e8e8e8",
    accentColor = "#c0392b",
    activeColor = "#66bb6a",
    counterFont,
    bodyFont,
    cardBackgroundColor = "rgba(255,255,255,0.04)",
    borderColor = "rgba(255,255,255,0.08)",
    repeatReveal = false,
    debugMode = false,
}: Record<string, any>) {
    const FALLBACK_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    const counterFontFamily = counterFont?.fontFamily || FALLBACK_FONT
    const bodyFontFamily = bodyFont?.fontFamily || FALLBACK_FONT

    const containerRef = useRef<HTMLDivElement>(null)
    const isInView = useInView(containerRef)
    const [hasAppeared, setHasAppeared] = useState(false)
    useEffect(() => {
        if (repeatReveal) {
            setHasAppeared(isInView)
        } else if (isInView && !hasAppeared) {
            setHasAppeared(true)
        }
    }, [isInView, hasAppeared, repeatReveal])
    const rafRef = useRef<number>(0)
    const startTimeRef = useRef<number>(0)
    const mainCountRef = useRef(initialCount)
    const smoothedRef = useRef(initialCount)
    const modelCountsRef = useRef<number[]>([])
    const [displayCount, setDisplayCount] = useState(initialCount)
    const [modelDisplayCounts, setModelDisplayCounts] = useState<number[]>([])
    const [milestoneReached, setMilestoneReached] = useState(
        initialCount >= milestoneCount
    )
    const [elapsed, setElapsed] = useState(0)

    const models = useMemo(() => {
        const parsed = parseModels(modelDataJson)
        return parsed ?? DEFAULT_MODEL_DATA
    }, [modelDataJson])

    const jsonError = useMemo(() => {
        return parseModels(modelDataJson) === null
    }, [modelDataJson])

    useEffect(() => {
        mainCountRef.current = initialCount
        smoothedRef.current = initialCount
        modelCountsRef.current = models.map((m) => m.count)
        setDisplayCount(initialCount)
        setModelDisplayCounts(models.map((m) => m.count))
        setMilestoneReached(initialCount >= milestoneCount)
        startTimeRef.current = 0
    }, [initialCount, milestoneCount, models])

    const shouldAnimate = true

    const animate = useCallback(
        (timestamp: number) => {
            if (!startTimeRef.current) startTimeRef.current = timestamp
            const dt = (timestamp - startTimeRef.current) / 1000
            startTimeRef.current = timestamp

            const effectiveRate = countRatePerSecond * demoSpeedMultiplier
            mainCountRef.current += effectiveRate * dt

            const newModels = modelCountsRef.current.map((count, i) => {
                const model = models[i]
                if (!model || model.status === "Future") return count
                return count + model.rate * demoSpeedMultiplier * dt
            })
            modelCountsRef.current = newModels

            const smoothing = Math.max(0.01, Math.min(1, animationSmoothing))
            smoothedRef.current +=
                (mainCountRef.current - smoothedRef.current) * smoothing

            setDisplayCount(smoothedRef.current)
            publishCount(smoothedRef.current)
            setModelDisplayCounts(newModels.map(Math.floor))
            setMilestoneReached(mainCountRef.current >= milestoneCount)
            setElapsed((e) => e + dt)

            rafRef.current = requestAnimationFrame(animate)
        },
        [
            countRatePerSecond,
            demoSpeedMultiplier,
            models,
            animationSmoothing,
            milestoneCount,
        ]
    )

    useEffect(() => {
        if (shouldAnimate) {
            startTimeRef.current = 0
            rafRef.current = requestAnimationFrame(animate)
        }
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
        }
    }, [shouldAnimate, animate])

    const totalModelCount = useMemo(
        () =>
            modelDisplayCounts.reduce((sum, c, i) => {
                if (models[i]?.status === "Future") return sum
                return sum + c
            }, 0),
        [modelDisplayCounts, models]
    )

    const statusLabel = milestoneReached
        ? `${formatNumber(milestoneCount)} MILESTONE REACHED`
        : "APPROACHING 2 MILLION"

    const dateLabel = milestoneReached ? reachedDate : estimatedMilestoneDate

    const isBento = layoutMode === "Bento Grid"

    return (
        <div
            ref={containerRef}
            style={{
                width: "100%",
                minHeight: `${heightVh}vh`,
                backgroundColor,
                color: textColor,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "60px 24px",
                boxSizing: "border-box",
                fontFamily: bodyFontFamily,
                position: "relative",
                overflow: "hidden",
            }}
        >
            <style>{SHARED_KEYFRAMES}</style>

            {/* Main counter */}
            <div
                style={{
                    textAlign: "center",
                    marginBottom: showModelBreakdown ? 80 : 0,
                    position: "relative",
                    zIndex: 1,
                }}
            >
                {showStatusLabel && (
                    <div
                        style={{
                            fontSize: 13,
                            fontWeight: 500,
                            letterSpacing: "0.2em",
                            textTransform: "uppercase",
                            color: milestoneReached
                                ? accentColor
                                : `${textColor}99`,
                            marginBottom: 20,
                            transition: "color 0.6s ease",
                            ...revealStyle(hasAppeared, 0),
                        }}
                    >
                        {statusLabel}
                    </div>
                )}

                <div
                    style={{
                        fontFamily: counterFontFamily,
                        fontSize: "clamp(48px, 10vw, 120px)",
                        fontWeight: 200,
                        letterSpacing: "-0.02em",
                        lineHeight: 1,
                        fontVariantNumeric: "tabular-nums",
                        textShadow: milestoneReached
                            ? `0 0 60px ${accentColor}33, 0 0 120px ${accentColor}11`
                            : `0 0 60px ${textColor}0d, 0 0 120px ${textColor}05`,
                        transition: "text-shadow 1s ease",
                        ...revealStyle(hasAppeared, 120),
                    }}
                >
                    {formatNumber(displayCount)}
                </div>

                {showDate && (
                    <div
                        style={{
                            marginTop: 20,
                            textAlign: "center",
                            ...revealStyle(hasAppeared, 240),
                        }}
                    >
                        <div
                            style={{
                                fontSize: 10,
                                fontWeight: 500,
                                letterSpacing: "0.15em",
                                textTransform: "uppercase",
                                color: `${textColor}55`,
                                marginBottom: 6,
                            }}
                        >
                            {milestoneReached
                                ? "MILESTONE DATE"
                                : "PROJECTED MILESTONE DATE"}
                        </div>
                        <div
                            style={{
                                fontSize: 15,
                                fontWeight: 400,
                                color: `${textColor}99`,
                                letterSpacing: "0.04em",
                            }}
                        >
                            {dateLabel}
                        </div>
                    </div>
                )}
            </div>

            {/* Model breakdown */}
            {showModelBreakdown && (
                <div
                    style={{
                        width: "100%",
                        maxWidth: isBento ? 960 : undefined,
                        position: "relative",
                        zIndex: 1,
                    }}
                >
                    {jsonError && (
                        <div
                            style={{
                                padding: "16px 20px",
                                background: "rgba(192,57,43,0.15)",
                                border: `1px solid ${accentColor}44`,
                                borderRadius: 8,
                                fontSize: 13,
                                color: accentColor,
                                marginBottom: 24,
                            }}
                        >
                            Invalid JSON in modelDataJson. Showing default
                            model data.
                        </div>
                    )}

                    {isBento ? (
                        <BentoGrid
                            models={models}
                            counts={modelDisplayCounts}
                            total={totalModelCount}
                            showPercentages={showPercentages}
                            textColor={textColor}
                            accentColor={accentColor}
                            activeColor={activeColor}
                            cardBg={cardBackgroundColor}
                            borderColor={borderColor}
                            hasAppeared={hasAppeared}
                        />
                    ) : (
                        <DataRows
                            models={models}
                            counts={modelDisplayCounts}
                            total={totalModelCount}
                            showPercentages={showPercentages}
                            textColor={textColor}
                            accentColor={accentColor}
                            activeColor={activeColor}
                            borderColor={borderColor}
                            hasAppeared={hasAppeared}
                        />
                    )}
                </div>
            )}

            {/* Debug overlay */}
            {debugMode && (
                <div
                    style={{
                        position: "absolute",
                        top: 16,
                        right: 16,
                        background: "rgba(0,0,0,0.85)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8,
                        padding: "12px 16px",
                        fontSize: 11,
                        fontFamily: "monospace",
                        color: "#8f8",
                        lineHeight: 1.8,
                        zIndex: 10,
                    }}
                >
                    <div>count: {Math.floor(displayCount)}</div>
                    <div>milestone: {milestoneReached ? "true" : "false"}</div>
                    <div>elapsed: {elapsed.toFixed(1)}s</div>
                    <div>models: {models.length}</div>
                    <div>label: {statusLabel}</div>
                </div>
            )}
        </div>
    )
}

function DotMatrixBar({
    fillPercent,
    rows,
    cols,
    dotSize,
    accentColor,
    trackColor,
}: {
    fillPercent: number
    rows: number
    cols: number
    dotSize: number
    accentColor: string
    trackColor: string
}) {
    const filledCols = Math.round((fillPercent / 100) * cols)
    const gap = Math.max(1, dotSize * 0.35)
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: `repeat(${cols}, ${dotSize}px)`,
                gridTemplateRows: `repeat(${rows}, ${dotSize}px)`,
                gap,
                width: "fit-content",
            }}
        >
            {Array.from({ length: rows * cols }, (_, i) => {
                const col = i % cols
                const filled = col < filledCols
                return (
                    <div
                        key={i}
                        style={{
                            width: dotSize,
                            height: dotSize,
                            borderRadius: 1,
                            backgroundColor: filled ? accentColor : trackColor,
                            opacity: filled ? 0.85 : 1,
                        }}
                    />
                )
            })}
        </div>
    )
}

function BentoGrid({
    models,
    counts,
    total,
    showPercentages,
    textColor,
    accentColor,
    activeColor,
    cardBg,
    borderColor,
    hasAppeared,
}: {
    models: ModelData[]
    counts: number[]
    total: number
    showPercentages: boolean
    textColor: string
    accentColor: string
    activeColor: string
    cardBg: string
    borderColor: string
    hasAppeared: boolean
}) {
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 12,
            }}
        >
            {models.map((model, i) => {
                const isFuture = model.status === "Future"
                const count = counts[i] ?? model.count
                const pct =
                    total > 0 && !isFuture ? ((count / total) * 100).toFixed(1) : null

                return (
                    <div
                        key={model.name}
                        style={{
                            background: cardBg,
                            border: `1px solid ${borderColor}`,
                            borderRadius: 12,
                            padding: "20px 18px",
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                            ...revealStyle(
                                hasAppeared,
                                400 + i * 60,
                                isFuture ? 0.45 : undefined
                            ),
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                            }}
                        >
                            <span
                                style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    letterSpacing: "0.03em",
                                    color: textColor,
                                }}
                            >
                                {model.name}
                            </span>
                            <span
                                style={{
                                    fontSize: 10,
                                    fontWeight: 500,
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                    color:
                                        model.status === "Active"
                                            ? activeColor
                                            : model.status === "Future"
                                              ? `${textColor}44`
                                              : `${textColor}66`,
                                }}
                            >
                                {model.status}
                            </span>
                        </div>

                        <div
                            style={{
                                fontSize: isFuture ? 14 : 24,
                                fontWeight: 300,
                                fontVariantNumeric: "tabular-nums",
                                color: isFuture ? `${textColor}55` : textColor,
                            }}
                        >
                            {isFuture ? "—" : formatNumber(count)}
                        </div>

                        {!isFuture && (
                            <DotMatrixBar
                                fillPercent={Number(pct ?? 0)}
                                rows={3}
                                cols={20}
                                dotSize={3}
                                accentColor={accentColor}
                                trackColor={`${textColor}0d`}
                            />
                        )}

                        {showPercentages && pct && (
                            <div
                                style={{
                                    fontSize: 11,
                                    color: `${textColor}55`,
                                    fontVariantNumeric: "tabular-nums",
                                }}
                            >
                                {pct}%
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

const SHARED_KEYFRAMES = `
@keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
}
@keyframes reveal-up {
    from {
        opacity: 0;
        transform: translateY(24px);
    }
    to {
        opacity: var(--reveal-opacity, 1);
        transform: translateY(0);
    }
}
`

function revealStyle(
    appeared: boolean,
    delayMs: number,
    finalOpacity?: number
): Record<string, any> {
    if (!appeared) {
        return { opacity: 0, transform: "translateY(24px)" }
    }
    return {
        ...(finalOpacity != null
            ? { "--reveal-opacity": String(finalOpacity) }
            : {}),
        animation: `reveal-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delayMs}ms both`,
    }
}

function useContainerWidth(
    ref: React.RefObject<HTMLDivElement | null>
): number {
    const [width, setWidth] = useState(640)
    useEffect(() => {
        const el = ref.current
        if (!el) return
        const obs = new ResizeObserver(([entry]) => {
            setWidth(entry.contentRect.width)
        })
        obs.observe(el)
        return () => obs.disconnect()
    }, [ref])
    return width
}

const MOBILE_BREAKPOINT = 480

function DataRows({
    models,
    counts,
    total,
    showPercentages,
    textColor,
    accentColor,
    activeColor,
    borderColor,
    hasAppeared,
}: {
    models: ModelData[]
    counts: number[]
    total: number
    showPercentages: boolean
    textColor: string
    accentColor: string
    activeColor: string
    borderColor: string
    hasAppeared: boolean
}) {
    const containerRef = useRef<HTMLDivElement>(null)
    const containerWidth = useContainerWidth(containerRef)
    const compact = containerWidth < MOBILE_BREAKPOINT

    const maxActiveCount = useMemo(() => {
        let max = 0
        for (let i = 0; i < models.length; i++) {
            if (models[i].status !== "Future") {
                const c = counts[i] ?? models[i].count
                if (c > max) max = c
            }
        }
        return max
    }, [models, counts])

    const headerStyle: React.CSSProperties = {
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: `${textColor}44`,
    }

    return (
        <div
            ref={containerRef}
            style={{ display: "flex", flexDirection: "column" }}
        >
            {/* Column headers — hidden on mobile */}
            {!compact && (
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                        paddingBottom: 10,
                        borderBottom: `1px solid ${borderColor}`,
                        marginBottom: 2,
                        ...revealStyle(hasAppeared, 360),
                    }}
                >
                    <div
                        style={{ ...headerStyle, width: 120, flexShrink: 0 }}
                    >
                        Model
                    </div>
                    <div style={{ ...headerStyle, flex: 1 }}>
                        Contribution
                    </div>
                    <div
                        style={{
                            ...headerStyle,
                            width: 100,
                            textAlign: "right",
                            flexShrink: 0,
                        }}
                    >
                        Count
                    </div>
                    {showPercentages && (
                        <div
                            style={{
                                ...headerStyle,
                                width: 50,
                                textAlign: "right",
                                flexShrink: 0,
                            }}
                        >
                            Share
                        </div>
                    )}
                    <div
                        style={{
                            ...headerStyle,
                            minWidth: 110,
                            textAlign: "right",
                            flexShrink: 0,
                        }}
                    >
                        Status
                    </div>
                </div>
            )}

            {models.map((model, i) => {
                const isFuture = model.status === "Future"
                const count = counts[i] ?? model.count
                const pct =
                    total > 0 && !isFuture
                        ? ((count / total) * 100).toFixed(1)
                        : null
                const barPct =
                    maxActiveCount > 0 && !isFuture
                        ? (count / maxActiveCount) * 100
                        : 0
                const isActive = model.status === "Active"

                if (compact) {
                    return (
                        <div
                            key={model.name}
                            style={{
                                padding: "14px 0",
                                borderBottom: `1px solid ${borderColor}`,
                                display: "flex",
                                flexDirection: "column",
                                gap: 8,
                                ...revealStyle(
                                    hasAppeared,
                                    400 + i * 50,
                                    isFuture ? 0.35 : undefined
                                ),
                            }}
                        >
                            {/* Top line: name, status dot, count */}
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                    }}
                                >
                                    {isActive && (
                                        <span
                                            style={{
                                                display: "inline-block",
                                                width: 5,
                                                height: 5,
                                                borderRadius: "50%",
                                                backgroundColor: activeColor,
                                                animation:
                                                    "pulse-dot 2.4s ease-in-out infinite",
                                                flexShrink: 0,
                                            }}
                                        />
                                    )}
                                    <span
                                        style={{
                                            fontSize: 12,
                                            fontWeight: 600,
                                            letterSpacing: "0.04em",
                                            color: isFuture
                                                ? `${textColor}55`
                                                : textColor,
                                        }}
                                    >
                                        {model.name}
                                    </span>
                                    {isFuture && (
                                        <span
                                            style={{
                                                fontSize: 9,
                                                fontWeight: 500,
                                                letterSpacing: "0.1em",
                                                textTransform: "uppercase",
                                                color: `${textColor}44`,
                                            }}
                                        >
                                            FUTURE
                                        </span>
                                    )}
                                </div>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "baseline",
                                        gap: 8,
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 14,
                                            fontWeight: 300,
                                            fontVariantNumeric: "tabular-nums",
                                            color: isFuture
                                                ? `${textColor}44`
                                                : `${textColor}dd`,
                                        }}
                                    >
                                        {isFuture
                                            ? "—"
                                            : formatNumber(count)}
                                    </span>
                                    {showPercentages && pct && (
                                        <span
                                            style={{
                                                fontSize: 10,
                                                color: `${textColor}55`,
                                                fontVariantNumeric:
                                                    "tabular-nums",
                                            }}
                                        >
                                            {pct}%
                                        </span>
                                    )}
                                </div>
                            </div>
                            {/* Bar — full width */}
                            {!isFuture && (
                                <DotMatrixBar
                                    fillPercent={barPct}
                                    rows={2}
                                    cols={Math.min(
                                        32,
                                        Math.floor(
                                            (containerWidth - 4) / 3
                                        )
                                    )}
                                    dotSize={2}
                                    accentColor={accentColor}
                                    trackColor={`${textColor}0d`}
                                />
                            )}
                        </div>
                    )
                }

                return (
                    <div
                        key={model.name}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            padding: "13px 0",
                            borderBottom: `1px solid ${borderColor}`,
                            gap: 16,
                            ...revealStyle(
                                hasAppeared,
                                400 + i * 50,
                                isFuture ? 0.35 : undefined
                            ),
                        }}
                    >
                        <div
                            style={{
                                width: 120,
                                fontSize: 12,
                                fontWeight: 600,
                                letterSpacing: "0.04em",
                                color: isFuture
                                    ? `${textColor}55`
                                    : textColor,
                                flexShrink: 0,
                            }}
                        >
                            {model.name}
                        </div>

                        <div style={{ flex: 1 }}>
                            {!isFuture ? (
                                <DotMatrixBar
                                    fillPercent={barPct}
                                    rows={2}
                                    cols={24}
                                    dotSize={2}
                                    accentColor={accentColor}
                                    trackColor={`${textColor}0d`}
                                />
                            ) : (
                                <div
                                    style={{
                                        height: 4,
                                        background: `${textColor}06`,
                                        borderRadius: 1,
                                    }}
                                />
                            )}
                        </div>

                        <div
                            style={{
                                width: 100,
                                textAlign: "right",
                                fontSize: 14,
                                fontWeight: 300,
                                fontVariantNumeric: "tabular-nums",
                                color: isFuture
                                    ? `${textColor}44`
                                    : `${textColor}dd`,
                                flexShrink: 0,
                            }}
                        >
                            {isFuture ? "—" : formatNumber(count)}
                        </div>

                        {showPercentages && (
                            <div
                                style={{
                                    width: 50,
                                    textAlign: "right",
                                    fontSize: 11,
                                    color: isFuture
                                        ? `${textColor}33`
                                        : `${textColor}77`,
                                    fontVariantNumeric: "tabular-nums",
                                    flexShrink: 0,
                                }}
                            >
                                {pct ? `${pct}%` : "—"}
                            </div>
                        )}

                        <div
                            style={{
                                minWidth: 110,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "flex-end",
                                gap: 6,
                                flexShrink: 0,
                                whiteSpace: "nowrap",
                            }}
                        >
                            {isActive && (
                                <span
                                    style={{
                                        display: "inline-block",
                                        width: 5,
                                        height: 5,
                                        borderRadius: "50%",
                                        backgroundColor: activeColor,
                                        animation:
                                            "pulse-dot 2.4s ease-in-out infinite",
                                        flexShrink: 0,
                                    }}
                                />
                            )}
                            <span
                                style={{
                                    fontSize: 9,
                                    fontWeight: 500,
                                    letterSpacing: "0.1em",
                                    textTransform: "uppercase",
                                    color: isActive
                                        ? `${textColor}55`
                                        : `${textColor}44`,
                                }}
                            >
                                {model.status}
                            </span>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

addPropertyControls(TeslaMilestoneCounter, {
    initialCount: {
        type: ControlType.Number,
        title: "Initial Count",
        defaultValue: 1945672,
        min: 0,
        step: 1000,
    },
    milestoneCount: {
        type: ControlType.Number,
        title: "Milestone Count",
        defaultValue: 2000000,
        min: 0,
        step: 100000,
    },
    countRatePerSecond: {
        type: ControlType.Number,
        title: "Count Rate / sec",
        defaultValue: 1.2,
        min: 0,
        step: 0.1,
    },
    demoSpeedMultiplier: {
        type: ControlType.Number,
        title: "Demo Speed ×",
        defaultValue: 1,
        min: 1,
        max: 100000,
        step: 10,
    },
    estimatedMilestoneDate: {
        type: ControlType.String,
        title: "Est. Date",
        defaultValue: "June 15, 2026",
    },
    reachedDate: {
        type: ControlType.String,
        title: "Reached Date",
        defaultValue: "June 15, 2026",
    },
    startCountingOnView: {
        type: ControlType.Boolean,
        title: "Count on View",
        defaultValue: true,
    },
    animationSmoothing: {
        type: ControlType.Number,
        title: "Smoothing",
        defaultValue: 0.08,
        min: 0.01,
        max: 1,
        step: 0.01,
    },
    heightVh: {
        type: ControlType.Number,
        title: "Height (vh)",
        defaultValue: 100,
        min: 20,
        max: 200,
        step: 5,
    },
    showStatusLabel: {
        type: ControlType.Boolean,
        title: "Show Label",
        defaultValue: true,
    },
    showDate: {
        type: ControlType.Boolean,
        title: "Show Date",
        defaultValue: true,
    },
    showModelBreakdown: {
        type: ControlType.Boolean,
        title: "Model Breakdown",
        defaultValue: true,
    },
    layoutMode: {
        type: ControlType.Enum,
        title: "Layout Mode",
        options: ["Bento Grid", "Minimal Data Rows"],
        defaultValue: "Bento Grid",
        hidden: (props: any) => !props.showModelBreakdown,
    },
    modelDataJson: {
        type: ControlType.String,
        title: "Model Data JSON",
        defaultValue: JSON.stringify(DEFAULT_MODEL_DATA, null, 2),
        displayTextArea: true,
        hidden: (props: any) => !props.showModelBreakdown,
    },
    showPercentages: {
        type: ControlType.Boolean,
        title: "Show %",
        defaultValue: true,
        hidden: (props: any) => !props.showModelBreakdown,
    },
    counterFont: {
        //@ts-ignore — ControlType.Font is undocumented but functional in Framer
        type: ControlType.Font,
        title: "Counter Font",
        controls: "basic",
    },
    bodyFont: {
        //@ts-ignore — ControlType.Font is undocumented but functional in Framer
        type: ControlType.Font,
        title: "Body Font",
        controls: "basic",
    },
    backgroundColor: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: "#0a0a0a",
    },
    textColor: {
        type: ControlType.Color,
        title: "Text Color",
        defaultValue: "#e8e8e8",
    },
    accentColor: {
        type: ControlType.Color,
        title: "Accent Color",
        defaultValue: "#c0392b",
    },
    activeColor: {
        type: ControlType.Color,
        title: "Active Color",
        defaultValue: "#66bb6a",
        hidden: (props: any) => !props.showModelBreakdown,
    },
    cardBackgroundColor: {
        type: ControlType.Color,
        title: "Card BG",
        defaultValue: "rgba(255,255,255,0.04)",
        hidden: (props: any) =>
            !props.showModelBreakdown || props.layoutMode !== "Bento Grid",
    },
    borderColor: {
        type: ControlType.Color,
        title: "Border Color",
        defaultValue: "rgba(255,255,255,0.08)",
        hidden: (props: any) => !props.showModelBreakdown,
    },
    repeatReveal: {
        type: ControlType.Boolean,
        title: "Repeat Reveal",
        defaultValue: false,
    },
    debugMode: {
        type: ControlType.Boolean,
        title: "Debug Mode",
        defaultValue: false,
    },
})
