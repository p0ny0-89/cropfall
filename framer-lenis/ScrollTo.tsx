import { addPropertyControls, ControlType } from "framer"
import { useCallback } from "react"

/**
 * @framerSupportedLayoutHeight any
 * @framerSupportedLayoutWidth any
 * @framerDisableUnlink
 */
export default function ScrollTo({
    target,
    offset,
    duration,
    align,
    showHint,
}) {
    const handleClick = useCallback(() => {
        const lenis = (window as any).lenis
        if (!lenis || !target?.current) return

        lenis.scrollTo(target.current, {
            offset,
            duration: duration > 0 ? duration : undefined,
            align,
        })
    }, [target, offset, duration, align])

    return (
        <div
            onClick={handleClick}
            style={{
                width: "100%",
                height: "100%",
                cursor: "pointer",
                background: showHint ? "rgba(0, 153, 255, 0.15)" : "transparent",
                outline: showHint ? "1px dashed rgba(0, 153, 255, 0.8)" : "none",
                pointerEvents: "auto",
            }}
        />
    )
}

ScrollTo.displayName = "Scroll To Section"

addPropertyControls(ScrollTo, {
    target: {
        title: "Target Section",
        type: ControlType.ScrollSectionRef,
        description:
            "Place this hotspot over your arrow / button on the canvas, then pick the section to jump to.",
    },
    align: {
        type: ControlType.Enum,
        title: "Align",
        defaultValue: "start",
        displaySegmentedControl: true,
        options: ["start", "center", "end"],
        optionTitles: ["Top", "Center", "Bottom"],
    },
    offset: {
        type: ControlType.Number,
        title: "Offset",
        defaultValue: 0,
        step: 1,
        unit: "px",
    },
    duration: {
        type: ControlType.Number,
        title: "Duration",
        defaultValue: 0,
        step: 0.1,
        min: 0,
        max: 5,
        unit: "s",
        description: "0 = use Lenis default.",
    },
    showHint: {
        type: ControlType.Boolean,
        title: "Show Hotspot",
        defaultValue: true,
        description:
            "Visualize the clickable area in Preview. Turn off before publishing.",
    },
})
