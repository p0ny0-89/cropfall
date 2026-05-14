import { addPropertyControls, ControlType } from "framer"
import { useState, useEffect, useRef, useMemo } from "react"

interface TimeLeft {
    days: number
    hours: number
    minutes: number
    seconds: number
    total: number
}

function getTimeLeft(targetMs: number): TimeLeft {
    const total = Math.max(0, targetMs - Date.now())
    return {
        days: Math.floor(total / 86400000),
        hours: Math.floor((total % 86400000) / 3600000),
        minutes: Math.floor((total % 3600000) / 60000),
        seconds: Math.floor((total % 60000) / 1000),
        total,
    }
}

function pad(n: number): string {
    return String(n).padStart(2, "0")
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

const REVEAL_KEYFRAMES = `
@keyframes countdown-reveal {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: var(--reveal-opacity, 1);
        transform: translateY(0);
    }
}
`

function revealStyle(
    appeared: boolean,
    delayMs: number
): Record<string, any> {
    if (!appeared) {
        return { opacity: 0, transform: "translateY(20px)" }
    }
    return {
        animation: `countdown-reveal 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delayMs}ms both`,
    }
}

/**
 * @framerSupportedLayoutHeight any
 * @framerSupportedLayoutWidth any
 * @framerDisableUnlink
 */
export default function EventCountdown({
    eventDateISO = "2026-08-24T17:00:00-07:00",
    eventLabel = "THE ROAD TO 2 MILLION",
    eventSubLabel = "",
    showDays = true,
    showHours = true,
    showMinutes = true,
    showSeconds = true,
    showLabels = true,
    showEventLabel = true,
    showEventEnded = true,
    endedMessage = "THE EVENT HAS BEGUN",
    separatorStyle = "Colon",
    counterFontSize = 64,
    labelFontSize = 9,
    counterFont,
    labelFont,
    backgroundColor = "transparent",
    textColor = "#e8e8e8",
    accentColor = "#c0392b",
    dimColor = "rgba(255,255,255,0.4)",
    separatorColor = "rgba(255,255,255,0.2)",
    paddingX = 0,
    paddingY = 0,
    debugMode = false,
}: Record<string, any>) {
    const FALLBACK_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    const counterFontFamily = counterFont?.fontFamily || FALLBACK_FONT
    const labelFontFamily = labelFont?.fontFamily || FALLBACK_FONT

    const containerRef = useRef<HTMLDivElement>(null)
    const isInView = useInView(containerRef)
    const [hasAppeared, setHasAppeared] = useState(false)
    useEffect(() => {
        if (isInView && !hasAppeared) setHasAppeared(true)
    }, [isInView, hasAppeared])

    const targetMs = useMemo(() => {
        const d = new Date(eventDateISO)
        return isNaN(d.getTime()) ? new Date("2026-08-24T17:00:00-07:00").getTime() : d.getTime()
    }, [eventDateISO])

    const [time, setTime] = useState(() => getTimeLeft(targetMs))
    const rafRef = useRef(0)

    useEffect(() => {
        let lastSecond = -1
        function tick() {
            const t = getTimeLeft(targetMs)
            const sec = t.seconds
            if (sec !== lastSecond) {
                lastSecond = sec
                setTime(t)
            }
            if (t.total > 0) {
                rafRef.current = requestAnimationFrame(tick)
            }
        }
        rafRef.current = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(rafRef.current)
    }, [targetMs])

    const ended = time.total <= 0

    const segments: { value: string; label: string; key: string }[] = []
    if (showDays) segments.push({ value: String(time.days), label: "DAYS", key: "d" })
    if (showHours) segments.push({ value: pad(time.hours), label: "HRS", key: "h" })
    if (showMinutes) segments.push({ value: pad(time.minutes), label: "MIN", key: "m" })
    if (showSeconds) segments.push({ value: pad(time.seconds), label: "SEC", key: "s" })

    const useColon = separatorStyle === "Colon"

    return (
        <div
            ref={containerRef}
            style={{
                width: "100%",
                backgroundColor,
                color: textColor,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: `${paddingY}px ${paddingX}px`,
                boxSizing: "border-box",
                fontFamily: labelFontFamily,
            }}
        >
            <style>{REVEAL_KEYFRAMES}</style>

            {showEventLabel && eventLabel && (
                <div
                    style={{
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "0.2em",
                        textTransform: "uppercase",
                        color: dimColor,
                        marginBottom: eventSubLabel ? 6 : 24,
                        ...revealStyle(hasAppeared, 0),
                    }}
                >
                    {eventLabel}
                </div>
            )}

            {showEventLabel && eventSubLabel && (
                <div
                    style={{
                        fontSize: 13,
                        fontWeight: 400,
                        letterSpacing: "0.06em",
                        color: dimColor,
                        marginBottom: 24,
                        ...revealStyle(hasAppeared, 60),
                    }}
                >
                    {eventSubLabel}
                </div>
            )}

            {ended && showEventEnded ? (
                <div
                    style={{
                        fontSize: "clamp(18px, 3vw, 28px)",
                        fontWeight: 500,
                        fontFamily: counterFontFamily,
                        letterSpacing: "0.15em",
                        color: accentColor,
                        ...revealStyle(hasAppeared, 120),
                    }}
                >
                    {endedMessage}
                </div>
            ) : (
                <div
                    style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: useColon ? 0 : counterFontSize * 0.5,
                        ...revealStyle(hasAppeared, 120),
                    }}
                >
                    {segments.map((seg, i) => (
                        <div
                            key={seg.key}
                            style={{
                                display: "flex",
                                alignItems: "baseline",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    minWidth: seg.key === "d" ? undefined : counterFontSize * 1.3,
                                }}
                            >
                                <span
                                    style={{
                                        fontFamily: counterFontFamily,
                                        fontSize: counterFontSize,
                                        fontWeight: 200,
                                        lineHeight: 1,
                                        fontVariantNumeric: "tabular-nums",
                                        letterSpacing: "-0.01em",
                                        color: textColor,
                                    }}
                                >
                                    {ended ? (seg.key === "d" ? "0" : "00") : seg.value}
                                </span>
                                {showLabels && (
                                    <span
                                        style={{
                                            fontSize: labelFontSize,
                                            fontWeight: 600,
                                            letterSpacing: "0.18em",
                                            color: dimColor,
                                            marginTop: counterFontSize * 0.12,
                                        }}
                                    >
                                        {seg.label}
                                    </span>
                                )}
                            </div>

                            {useColon && i < segments.length - 1 && (
                                <span
                                    style={{
                                        fontFamily: counterFontFamily,
                                        fontSize: counterFontSize * 0.7,
                                        fontWeight: 200,
                                        lineHeight: 1,
                                        color: separatorColor,
                                        padding: `0 ${counterFontSize * 0.2}px`,
                                        alignSelf: "flex-start",
                                    }}
                                >
                                    :
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {debugMode && (
                <div
                    style={{
                        marginTop: 24,
                        background: "rgba(0,0,0,0.85)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8,
                        padding: "10px 14px",
                        fontSize: 11,
                        fontFamily: "monospace",
                        color: "#8f8",
                        lineHeight: 1.8,
                    }}
                >
                    <div>target: {new Date(targetMs).toISOString()}</div>
                    <div>ended: {ended ? "true" : "false"}</div>
                    <div>remaining: {time.days}d {time.hours}h {time.minutes}m {time.seconds}s</div>
                    <div>visitor TZ: {Intl.DateTimeFormat().resolvedOptions().timeZone}</div>
                </div>
            )}
        </div>
    )
}

addPropertyControls(EventCountdown, {
    eventDateISO: {
        type: ControlType.String,
        title: "Event Date",
        defaultValue: "2026-08-24T17:00:00-07:00",
        description: "ISO 8601 date/time with timezone offset",
    },
    eventLabel: {
        type: ControlType.String,
        title: "Event Label",
        defaultValue: "THE ROAD TO 2 MILLION",
    },
    eventSubLabel: {
        type: ControlType.String,
        title: "Sub Label",
        defaultValue: "",
    },
    showEventLabel: {
        type: ControlType.Boolean,
        title: "Show Label",
        defaultValue: true,
    },
    showDays: {
        type: ControlType.Boolean,
        title: "Days",
        defaultValue: true,
    },
    showHours: {
        type: ControlType.Boolean,
        title: "Hours",
        defaultValue: true,
    },
    showMinutes: {
        type: ControlType.Boolean,
        title: "Minutes",
        defaultValue: true,
    },
    showSeconds: {
        type: ControlType.Boolean,
        title: "Seconds",
        defaultValue: true,
    },
    showLabels: {
        type: ControlType.Boolean,
        title: "Unit Labels",
        defaultValue: true,
    },
    separatorStyle: {
        type: ControlType.Enum,
        title: "Separator",
        options: ["Colon", "Space"],
        defaultValue: "Colon",
    },
    showEventEnded: {
        type: ControlType.Boolean,
        title: "Show Ended Msg",
        defaultValue: true,
    },
    endedMessage: {
        type: ControlType.String,
        title: "Ended Message",
        defaultValue: "THE EVENT HAS BEGUN",
        hidden: (props: any) => !props.showEventEnded,
    },
    counterFontSize: {
        type: ControlType.Number,
        title: "Counter Size",
        defaultValue: 64,
        min: 16,
        max: 200,
        step: 1,
        unit: "px",
    },
    labelFontSize: {
        type: ControlType.Number,
        title: "Label Size",
        defaultValue: 9,
        min: 6,
        max: 24,
        step: 1,
        unit: "px",
    },
    counterFont: {
        //@ts-ignore
        type: ControlType.Font,
        title: "Counter Font",
        controls: "basic",
    },
    labelFont: {
        //@ts-ignore
        type: ControlType.Font,
        title: "Label Font",
        controls: "basic",
    },
    backgroundColor: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: "transparent",
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
    dimColor: {
        type: ControlType.Color,
        title: "Dim Color",
        defaultValue: "rgba(255,255,255,0.4)",
    },
    separatorColor: {
        type: ControlType.Color,
        title: "Separator Color",
        defaultValue: "rgba(255,255,255,0.2)",
    },
    paddingX: {
        type: ControlType.Number,
        title: "Padding X",
        defaultValue: 0,
        min: 0,
        max: 200,
        step: 1,
        unit: "px",
    },
    paddingY: {
        type: ControlType.Number,
        title: "Padding Y",
        defaultValue: 0,
        min: 0,
        max: 200,
        step: 1,
        unit: "px",
    },
    debugMode: {
        type: ControlType.Boolean,
        title: "Debug Mode",
        defaultValue: false,
    },
})
