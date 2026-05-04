import { addPropertyControls, ControlType } from "framer"
import { useCallback, Children, isValidElement, cloneElement } from "react"

/**
 * @framerSupportedLayoutHeight any
 * @framerSupportedLayoutWidth any
 * @framerDisableUnlink
 */
export default function ScrollTo({
    children,
    target,
    offset,
    duration,
    easing,
    align,
}) {
    const handleClick = useCallback(() => {
        const lenis = (window as any).lenis
        if (!lenis) return

        if (target?.current) {
            lenis.scrollTo(target.current, {
                offset,
                duration: duration > 0 ? duration : undefined,
                align,
            })
        }
    }, [target, offset, duration, align])

    return (
        <div
            onClick={handleClick}
            style={{
                cursor: "pointer",
                width: "100%",
                height: "100%",
                display: "contents",
            }}
        >
            {Children.map(children, (child) =>
                isValidElement(child)
                    ? cloneElement(child, {
                          style: {
                              ...child.props.style,
                              pointerEvents: "auto",
                          },
                      })
                    : child
            )}
        </div>
    )
}

ScrollTo.displayName = "Scroll To Section"

addPropertyControls(ScrollTo, {
    children: {
        type: ControlType.ComponentInstance,
        title: "Trigger",
        description: "The clickable element (arrow, button, etc.)",
    },
    target: {
        title: "Target Section",
        type: ControlType.ScrollSectionRef,
        description: "The scroll section to jump to.",
    },
    align: {
        type: ControlType.Enum,
        title: "Align",
        defaultValue: "start",
        displaySegmentedControl: true,
        options: ["start", "center", "end"],
        optionTitles: ["Top", "Center", "Bottom"],
        description: "Where the target aligns in the viewport.",
    },
    offset: {
        type: ControlType.Number,
        title: "Offset",
        defaultValue: 0,
        step: 1,
        unit: "px",
        description: "Extra pixel offset from the target.",
    },
    duration: {
        type: ControlType.Number,
        title: "Duration",
        defaultValue: 0,
        step: 0.1,
        min: 0,
        max: 5,
        unit: "s",
        description: "Scroll duration in seconds. 0 = use Lenis default.",
    },
})
