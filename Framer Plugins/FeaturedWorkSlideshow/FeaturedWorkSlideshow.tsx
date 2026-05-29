import { addPropertyControls, ControlType, RenderTarget } from "framer"
import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"

interface Project {
    image: string
    title: string
    year: string
    location: string
    link: string
}

interface Props {
    projects: Project[]
    backgroundColor: string
    activeCardWidth: number
    activeCardHeight: number
    thumbSize: number
    showLabels: boolean
    titleFont: Record<string, any>
    labelFont: Record<string, any>
    cornerColorMode: "auto" | "custom"
    cornerColor: string
    arrowIcon: string
    arrowSize: number
    responsive: boolean
    hoverZoom: number
}

const GAP = 20
const SQUARE_SIZE = 10
const INNER_GAP = 12

const LAYOUT_SPRING = {
    type: "spring" as const,
    stiffness: 180,
    damping: 26,
}

const FADE = { duration: 0.35 }

const DEFAULT_CORNERS: [string, string, string, string] = [
    "#212121",
    "#212121",
    "#212121",
    "#212121",
]

function sampleCornerColors(
    src: string
): Promise<[string, string, string, string]> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => {
            try {
                const canvas = document.createElement("canvas")
                const ctx = canvas.getContext("2d")
                if (!ctx) {
                    reject(new Error("no 2d context"))
                    return
                }
                canvas.width = img.naturalWidth
                canvas.height = img.naturalHeight
                ctx.drawImage(img, 0, 0)

                const sample = (sx: number, sy: number): string => {
                    const size = Math.min(
                        30,
                        img.naturalWidth,
                        img.naturalHeight
                    )
                    const data = ctx.getImageData(sx, sy, size, size).data
                    let r = 0,
                        g = 0,
                        b = 0,
                        count = 0
                    for (let i = 0; i < data.length; i += 4) {
                        r += data[i]
                        g += data[i + 1]
                        b += data[i + 2]
                        count++
                    }
                    return `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`
                }

                const w = img.naturalWidth
                const h = img.naturalHeight
                const s = Math.min(30, w, h)
                resolve([
                    sample(0, 0),
                    sample(w - s, 0),
                    sample(0, h - s),
                    sample(w - s, h - s),
                ])
            } catch {
                reject(new Error("canvas sampling failed"))
            }
        }
        img.onerror = () => reject(new Error("image load failed"))
        img.src = src
    })
}

export default function FeaturedWorkSlideshow(props: Props) {
    const {
        projects = [],
        backgroundColor = "#e0e0da",
        activeCardWidth = 780,
        activeCardHeight = 500,
        thumbSize = 160,
        showLabels = true,
        titleFont,
        labelFont,
        cornerColorMode = "auto",
        cornerColor = "#212121",
        arrowIcon,
        arrowSize = 28,
        responsive = false,
        hoverZoom = 1,
    } = props

    const isCanvas = RenderTarget.current() === RenderTarget.canvas
    const count = projects.length
    const [activeIndex, setActiveIndex] = useState(0)
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
    const [cornerColors, setCornerColors] =
        useState<[string, string, string, string]>(DEFAULT_CORNERS)

    /* ---- Responsive scaling ---- */
    const containerRef = useRef<HTMLDivElement>(null)
    const [containerWidth, setContainerWidth] = useState(0)

    useEffect(() => {
        if (!responsive || !containerRef.current) return
        const el = containerRef.current
        setContainerWidth(el.clientWidth)
        const ro = new ResizeObserver(([entry]) => {
            setContainerWidth(entry.contentRect.width)
        })
        ro.observe(el)
        return () => ro.disconnect()
    }, [responsive])

    // In responsive mode, remove internal padding so content fills the container edge-to-edge
    const horizontalPad = responsive ? 0 : 32
    const layoutWidth = activeCardWidth + 2 * (thumbSize + GAP)

    let scale = 1
    if (responsive && containerWidth > 0) {
        scale = Math.min(1, containerWidth / layoutWidth)
    }

    const scaledCardWidth = Math.round(activeCardWidth * scale)
    const scaledCardHeight = Math.round(activeCardHeight * scale)
    const scaledThumb = Math.round(thumbSize * scale)
    const scaledGap = Math.round(GAP * scale)
    const scaledArrowSize = Math.round(arrowSize * scale)

    const activeImage = projects[activeIndex]?.image

    useEffect(() => {
        if (cornerColorMode !== "auto" || !activeImage) {
            setCornerColors(DEFAULT_CORNERS)
            return
        }
        sampleCornerColors(activeImage)
            .then(setCornerColors)
            .catch(() => setCornerColors(DEFAULT_CORNERS))
    }, [activeIndex, activeImage, cornerColorMode])

    const resolvedCorners =
        cornerColorMode === "custom"
            ? ([cornerColor, cornerColor, cornerColor, cornerColor] as [
                  string,
                  string,
                  string,
                  string,
              ])
            : cornerColors

    const titleStyle: React.CSSProperties = {
        fontFamily: titleFont?.fontFamily || "Inter, sans-serif",
        fontWeight: titleFont?.fontWeight ?? 500,
        fontStyle: titleFont?.fontStyle,
        fontSize: titleFont?.fontSize ?? 22,
        lineHeight: titleFont?.lineHeight,
        letterSpacing: titleFont?.letterSpacing ?? "-0.5px",
        color: "#212121",
        flex: 1,
        overflow: "hidden",
    }

    const metaStyle: React.CSSProperties = {
        fontFamily: labelFont?.fontFamily || "Inter, sans-serif",
        fontWeight: labelFont?.fontWeight ?? 500,
        fontStyle: labelFont?.fontStyle,
        fontSize: labelFont?.fontSize ?? 12,
        lineHeight: labelFont?.lineHeight ?? 1.3,
        letterSpacing: labelFont?.letterSpacing,
        color: "#212121",
    }

    if (!projects || count === 0) {
        return (
            <div
                style={{
                    width: "100%",
                    height: 700,
                    background: backgroundColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "Inter, sans-serif",
                    fontSize: 14,
                    color: "#999",
                }}
            >
                Add projects in the property controls →
            </div>
        )
    }

    const handleClick = (projIdx: number) => {
        // Active card navigation is handled by the native <a> overlay so
        // Framer can resolve internal/CMS link tokens correctly.
        if (isCanvas || projIdx === activeIndex) return
        setActiveIndex(projIdx)
    }

    const prevIndex = (activeIndex - 1 + count) % count
    const nextIndex = (activeIndex + 1) % count

    const visible: number[] = []
    const seen = new Set<number>()
    for (const idx of [prevIndex, activeIndex, nextIndex]) {
        if (!seen.has(idx)) {
            seen.add(idx)
            visible.push(idx)
        }
    }

    return (
        <div
            ref={containerRef}
            style={{
                width: "100%",
                background: backgroundColor,
                fontFamily: "inherit",
                padding: `0 ${horizontalPad}px 80px`,
                boxSizing: "border-box",
                position: "relative",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: scaledGap,
                    paddingTop: 80,
                    minHeight: scaledCardHeight,
                    overflow: "visible",
                    position: "relative",
                }}
            >
                <LayoutGroup>
                    <AnimatePresence initial={false} mode="popLayout">
                        {visible.map((projIdx) => {
                            const project = projects[projIdx]
                            const isActive = projIdx === activeIndex
                            const isPrev =
                                projIdx === prevIndex && !isActive

                            return (
                                <motion.div
                                    key={projIdx}
                                    layout="position"
                                    initial={{
                                        opacity: 0,
                                        width: isActive
                                            ? scaledCardWidth
                                            : scaledThumb,
                                        height: isActive
                                            ? scaledCardHeight
                                            : scaledThumb,
                                    }}
                                    animate={{
                                        opacity: 1,
                                        width: isActive
                                            ? scaledCardWidth
                                            : scaledThumb,
                                        height: isActive
                                            ? scaledCardHeight
                                            : scaledThumb,
                                    }}
                                    exit={{ opacity: 0 }}
                                    transition={{
                                        layout: LAYOUT_SPRING,
                                        width: LAYOUT_SPRING,
                                        height: LAYOUT_SPRING,
                                        opacity: { duration: 0.15 },
                                    }}
                                    onClick={() => handleClick(projIdx)}
                                    onMouseEnter={
                                        !isCanvas
                                            ? () =>
                                                  setHoveredIndex(projIdx)
                                            : undefined
                                    }
                                    onMouseLeave={
                                        !isCanvas
                                            ? () =>
                                                  setHoveredIndex(null)
                                            : undefined
                                    }
                                    style={{
                                        width: isActive
                                            ? scaledCardWidth
                                            : scaledThumb,
                                        height: isActive
                                            ? scaledCardHeight
                                            : scaledThumb,
                                        flexShrink: 0,
                                        position: "relative",
                                        cursor: isActive
                                            ? "default"
                                            : "pointer",
                                        borderRadius: 0,
                                        overflow: "visible",
                                    }}
                                >
                                    <div
                                        style={{
                                            position: "absolute",
                                            inset: 0,
                                            overflow: "hidden",
                                        }}
                                    >
                                        <motion.img
                                            src={project.image}
                                            alt={project.title}
                                            animate={{
                                                scale:
                                                    isActive &&
                                                    hoveredIndex ===
                                                        projIdx &&
                                                    hoverZoom > 1
                                                        ? hoverZoom
                                                        : 1,
                                            }}
                                            transition={{
                                                scale: {
                                                    duration: 0.5,
                                                    ease: "easeOut",
                                                },
                                            }}
                                            style={{
                                                position: "absolute",
                                                inset: 0,
                                                width: "100%",
                                                height: "100%",
                                                objectFit: "cover",
                                                display: "block",
                                            }}
                                        />

                                        <motion.div
                                            initial={false}
                                            animate={{
                                                opacity: isActive ? 0 : 0.45,
                                            }}
                                            transition={FADE}
                                            style={{
                                                position: "absolute",
                                                inset: 0,
                                                background: "#000",
                                                pointerEvents: "none",
                                            }}
                                        />
                                        <motion.div
                                            initial={false}
                                            animate={{
                                                opacity: isActive ? 0 : 1,
                                            }}
                                            transition={FADE}
                                            style={{
                                                position: "absolute",
                                                inset: 0,
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                pointerEvents: "none",
                                            }}
                                        >
                                            {arrowIcon ? (
                                                <img
                                                    src={arrowIcon}
                                                    alt=""
                                                    style={{
                                                        width: scaledArrowSize,
                                                        height: scaledArrowSize,
                                                        objectFit: "contain",
                                                        transform: isPrev
                                                            ? "scaleX(-1)"
                                                            : undefined,
                                                    }}
                                                />
                                            ) : (
                                                <svg
                                                    width={scaledArrowSize}
                                                    height={scaledArrowSize}
                                                    viewBox="0 0 28 28"
                                                    fill="none"
                                                >
                                                    {isPrev ? (
                                                        <path
                                                            d="M17 6L9 14L17 22"
                                                            stroke="white"
                                                            strokeWidth="2"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        />
                                                    ) : (
                                                        <path
                                                            d="M11 6L19 14L11 22"
                                                            stroke="white"
                                                            strokeWidth="2"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        />
                                                    )}
                                                </svg>
                                            )}
                                        </motion.div>
                                    </div>

                                    {isActive && project.link && (
                                        <a
                                            href={project.link}
                                            aria-label={project.title}
                                            style={{
                                                position: "absolute",
                                                inset: 0,
                                                zIndex: 5,
                                                cursor: "pointer",
                                                display: "block",
                                            }}
                                        />
                                    )}

                                    {showLabels && (
                                        <motion.div
                                            initial={false}
                                            animate={{
                                                opacity: isActive ? 1 : 0,
                                            }}
                                            transition={FADE}
                                            style={{
                                                position: "absolute",
                                                inset: 0,
                                                overflow: "visible",
                                                pointerEvents: "none",
                                            }}
                                        >
                                            {/* Top row — mirrors bottom row height via invisible text */}
                                            <div
                                                style={{
                                                    position: "absolute",
                                                    bottom: "100%",
                                                    left: -(
                                                        SQUARE_SIZE + INNER_GAP
                                                    ),
                                                    right: -(
                                                        SQUARE_SIZE + INNER_GAP
                                                    ),
                                                    display: "flex",
                                                    alignItems: "flex-start",
                                                    gap: INNER_GAP,
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: SQUARE_SIZE,
                                                        height: SQUARE_SIZE,
                                                        background:
                                                            resolvedCorners[0],
                                                        flexShrink: 0,
                                                    }}
                                                />
                                                <div
                                                    style={{
                                                        flex: 1,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent:
                                                            "space-between",
                                                        padding:
                                                            "0 0 10px 0",
                                                        gap: 12,
                                                        overflow: "hidden",
                                                        visibility: "hidden",
                                                    }}
                                                >
                                                    <div style={titleStyle}>
                                                        {project.title}
                                                    </div>
                                                    <div
                                                        style={{
                                                            textAlign: "right",
                                                            flexShrink: 0,
                                                        }}
                                                    >
                                                        <div
                                                            style={metaStyle}
                                                        >
                                                            {project.year}
                                                        </div>
                                                        <div
                                                            style={metaStyle}
                                                        >
                                                            {project.location}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div
                                                    style={{
                                                        width: SQUARE_SIZE,
                                                        height: SQUARE_SIZE,
                                                        background:
                                                            resolvedCorners[1],
                                                        flexShrink: 0,
                                                    }}
                                                />
                                            </div>
                                            <div
                                                style={{
                                                    position: "absolute",
                                                    top: "100%",
                                                    left: -(
                                                        SQUARE_SIZE + INNER_GAP
                                                    ),
                                                    right: -(
                                                        SQUARE_SIZE + INNER_GAP
                                                    ),
                                                    display: "flex",
                                                    alignItems: "flex-end",
                                                    gap: INNER_GAP,
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: SQUARE_SIZE,
                                                        height: SQUARE_SIZE,
                                                        background:
                                                            resolvedCorners[2],
                                                        flexShrink: 0,
                                                    }}
                                                />
                                                <div
                                                    style={{
                                                        flex: 1,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent:
                                                            "space-between",
                                                        padding: "10px 0 0 0",
                                                        gap: 12,
                                                        overflow: "hidden",
                                                    }}
                                                >
                                                    <div style={titleStyle}>
                                                        {project.title}
                                                    </div>
                                                    <div
                                                        style={{
                                                            textAlign: "right",
                                                            flexShrink: 0,
                                                        }}
                                                    >
                                                        <div style={metaStyle}>
                                                            {project.year}
                                                        </div>
                                                        <div style={metaStyle}>
                                                            {project.location}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div
                                                    style={{
                                                        width: SQUARE_SIZE,
                                                        height: SQUARE_SIZE,
                                                        background:
                                                            resolvedCorners[3],
                                                        flexShrink: 0,
                                                    }}
                                                />
                                            </div>
                                        </motion.div>
                                    )}
                                </motion.div>
                            )
                        })}
                    </AnimatePresence>
                </LayoutGroup>
            </div>
        </div>
    )
}

addPropertyControls(FeaturedWorkSlideshow, {
    projects: {
        type: ControlType.Array,
        title: "Projects",
        control: {
            type: ControlType.Object,
            controls: {
                image: { type: ControlType.Image, title: "Image" },
                title: {
                    type: ControlType.String,
                    title: "Title",
                    defaultValue: "PROJECT TITLE",
                },
                year: {
                    type: ControlType.String,
                    title: "Year",
                    defaultValue: "2024",
                },
                location: {
                    type: ControlType.String,
                    title: "Location",
                    defaultValue: "LOS ANGELES, CA",
                },
                link: {
                    type: ControlType.String,
                    title: "Link URL",
                    placeholder: "/work/project-slug or https://…",
                    description:
                        "Paste the project's URL. Use a full https:// link to a CMS detail page (works in preview + published), or a relative path like /work/slug (published only).",
                },
            },
        },
        defaultValue: [
            {
                image: "",
                title: "PROJECT ONE",
                year: "2022",
                location: "PASO ROBLES, CA",
                link: "",
            },
            {
                image: "",
                title: "PROJECT TWO",
                year: "2023",
                location: "LOS ANGELES, CA",
                link: "",
            },
            {
                image: "",
                title: "PROJECT THREE",
                year: "2024",
                location: "SAN FRANCISCO, CA",
                link: "",
            },
        ],
    },
    backgroundColor: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: "#e0e0da",
    },
    showLabels: {
        type: ControlType.Boolean,
        title: "Show Labels",
        defaultValue: true,
        enabledTitle: "Visible",
        disabledTitle: "Hidden",
    },
    cornerColorMode: {
        type: ControlType.Enum,
        title: "Corner Color",
        options: ["auto", "custom"],
        optionTitles: ["Auto (from image)", "Custom"],
        defaultValue: "auto",
        hidden: (props: Props) => !props.showLabels,
    },
    cornerColor: {
        type: ControlType.Color,
        title: "Custom Color",
        defaultValue: "#212121",
        hidden: (props: Props) =>
            !props.showLabels || props.cornerColorMode !== "custom",
    },
    titleFont: {
        // @ts-ignore — ControlType.Font is undocumented
        type: ControlType.Font,
        title: "Title Font",
        controls: "extended",
        hidden: (props: Props) => !props.showLabels,
    },
    labelFont: {
        // @ts-ignore — ControlType.Font is undocumented
        type: ControlType.Font,
        title: "Label Font",
        controls: "extended",
        hidden: (props: Props) => !props.showLabels,
    },
    arrowIcon: {
        type: ControlType.Image,
        title: "Arrow Icon",
    },
    arrowSize: {
        type: ControlType.Number,
        title: "Arrow Size",
        defaultValue: 28,
        min: 12,
        max: 64,
        step: 2,
        displayStepper: true,
    },
    hoverZoom: {
        type: ControlType.Number,
        title: "Hover Zoom",
        defaultValue: 1,
        min: 1,
        max: 1.5,
        step: 0.05,
        displayStepper: true,
    },
    responsive: {
        type: ControlType.Boolean,
        title: "Responsive",
        defaultValue: false,
        enabledTitle: "On",
        disabledTitle: "Off",
    },
    activeCardWidth: {
        type: ControlType.Number,
        title: "Card Width",
        defaultValue: 780,
        min: 400,
        max: 1200,
        step: 10,
        displayStepper: true,
    },
    activeCardHeight: {
        type: ControlType.Number,
        title: "Card Height",
        defaultValue: 500,
        min: 300,
        max: 800,
        step: 10,
        displayStepper: true,
    },
    thumbSize: {
        type: ControlType.Number,
        title: "Thumb Size",
        defaultValue: 160,
        min: 80,
        max: 300,
        step: 4,
        displayStepper: true,
    },
})
