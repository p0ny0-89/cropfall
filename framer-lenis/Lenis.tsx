import { addPropertyControls, ControlType } from "framer"
import Lenis from "https://unpkg.com/lenis@1.3.19/dist/lenis.mjs"
import Snap from "https://unpkg.com/lenis@1.3.19/dist/lenis-snap.mjs"
import {
    useEffect,
    useRef,
    Children,
    isValidElement,
    cloneElement,
} from "react"

/**
 * @framerSupportedLayoutHeight any
 * @framerSupportedLayoutWidth any
 * @framerDisableUnlink
 */
export default function Component({
    smooth,
    infinite,
    orientation,
    intensity,
    children,
    snap,
}) {
    const wrapperRef = useRef<HTMLDivElement>()
    const contentRef = useRef<HTMLDivElement>()

    const lenisRef = useRef()

    useEffect(() => {
        if (children && (!wrapperRef.current || !contentRef.current)) return

        if (wrapperRef.current && contentRef.current) {
            if (orientation === "horizontal") {
                wrapperRef.current.style.setProperty("overflowX", "auto")
            } else {
                wrapperRef.current.style.setProperty("overflowY", "auto")
            }
        }

        const lenis = new Lenis({
            smoothWheel: smooth,
            infinite,
            orientation,
            gestureOrientation:
                orientation === "horizontal" ? "both" : "vertical",
            autoRaf: true,
            autoToggle: true,
            anchors: true,
            allowNestedScroll: true,
            wrapper: wrapperRef.current,
            content: contentRef.current,
            syncTouch: Boolean(infinite) || orientation === "horizontal",
            stopInertiaOnNavigate: true,
        })
        lenisRef.current = lenis

        let lenisSnap

        if (snap && snap.snaps.length > 0) {
            lenisSnap = new Snap(lenis, {
                type: snap.type,
                distanceThreshold: snap.threshold + "%",
            })

            snap.snaps.forEach((item) => {
                if (!item.target?.current) return

                const id = item.target.current.id

                const elements = document.querySelectorAll(`#${id}`)

                elements.forEach((element) => {
                    lenisSnap.addElement(element, {
                        align: item.align,
                    })
                })
            })
        }

        window.lenis = lenis
        window.lenisSnap = snap

        return () => {
            if (lenis) lenis.destroy()
            if (lenisSnap) lenisSnap.destroy()
        }
    }, [smooth, infinite, orientation, intensity, children, snap])

    return (
        <>
            <link
                href="https://unpkg.com/lenis@1.3.19/dist/lenis.css"
                rel="stylesheet"
            />

            {children && (
                <>
                    <div
                        ref={wrapperRef}
                        style={
                            orientation === "horizontal"
                                ? {
                                      overflowX: "auto",
                                      width: "100%",
                                  }
                                : {
                                      overflowY: "auto",
                                      height: "100%",
                                  }
                        }
                    >
                        <div ref={contentRef} style={{ width: "100%" }}>
                            {Children.map(children, (child) =>
                                isValidElement(child)
                                    ? cloneElement(child, {
                                          style: {
                                              ...child.props.style,
                                              width: "100%",
                                          },
                                      })
                                    : child
                            )}
                        </div>
                    </div>
                </>
            )}
        </>
    )
}

Component.displayName = "Lenis"

addPropertyControls(Component, {
    smooth: {
        type: ControlType.Boolean,
        title: "Smooth",
        defaultValue: true,
    },
    intensity: {
        type: ControlType.Number,
        title: "Intensity",
        defaultValue: 12,
        step: 1,
        min: 1,
        max: 100,
        hidden(props) {
            return props.smooth === false
        },
        description: "This will be ignored on mobile.",
    },
    infinite: {
        type: ControlType.Boolean,
        title: "Infinite",
        defaultValue: false,
        hidden(props) {
            return props.smooth === false
        },
    },
    orientation: {
        type: ControlType.Enum,
        defaultValue: "Vertical",
        displaySegmentedControl: true,
        options: ["vertical", "horizontal"],
        optionTitles: ["Vertical", "Horizontal"],
        hidden(props) {
            return props.smooth === false
        },
    },
    children: {
        type: ControlType.ComponentInstance,
        title: "Content",
    },
    snap: {
        type: ControlType.Object,
        optional: true,
        description:
            "Cooked and served by [darkroom.engineering](https://darkroom.engineering).",
        controls: {
            type: {
                type: ControlType.Enum,
                defaultValue: "proximity",
                displaySegmentedControl: true,
                segmentedControlDirection: "vertical",
                options: ["proximity", "mandatory", "lock"],
                optionTitles: ["Proximity", "Mandatory", "Lock"],
            },
            threshold: {
                type: ControlType.Number,
                defaultValue: 50,
                min: 0,
                max: 100,
                unit: "%",
                hidden: (props) => {
                    return props.snap.type === "mandatory"
                },
            },
            snaps: {
                type: ControlType.Array,
                control: {
                    type: ControlType.Object,
                    controls: {
                        target: {
                            title: "Target",
                            type: ControlType.ScrollSectionRef,
                        },
                        align: {
                            type: ControlType.Enum,
                            defaultValue: "center",
                            displaySegmentedControl: true,
                            segmentedControlDirection: "horizontal",
                            options: ["start", "center", "end"],
                            optionIcons: [
                                "align-top",
                                "align-middle",
                                "align-bottom",
                            ],
                        },
                    },
                },
            },
        },
    },
})
