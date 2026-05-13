import { addPropertyControls, ControlType } from "framer"
import {
    useState,
    useEffect,
    useRef,
    useCallback,
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
    enableOverlay: boolean
    streakIntensity: number
    streakSpeed: number
    streakScale: number
    twinkleIntensity: number
    twinkleSpeed: number
    luminanceThreshold: number
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
        enableOverlay = false,
        streakIntensity = 0.4,
        streakSpeed = 0.8,
        streakScale = 3.0,
        twinkleIntensity = 0.6,
        twinkleSpeed = 1.0,
        luminanceThreshold = 0.15,
    } = props

    const containerRef = useRef<HTMLDivElement>(null)
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
    const glRef = useRef<WebGLRenderingContext | null>(null)
    const glProgramRef = useRef<WebGLProgram | null>(null)
    const glTextureRef = useRef<WebGLTexture | null>(null)
    const overlayRafRef = useRef<number>(0)
    const imagesRef = useRef<HTMLImageElement[]>([])
    const rafRef = useRef<number>(0)
    const smoothedProgressRef = useRef<number>(0)
    const currentFrameRef = useRef<number>(0)

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

    // ── WebGL overlay setup ─────────────────────────────────────────

    const initOverlay = useCallback(() => {
        const canvas = overlayCanvasRef.current
        if (!canvas) return

        const gl = canvas.getContext("webgl", {
            alpha: true,
            premultipliedAlpha: false,
            antialias: false,
        })
        if (!gl) return

        glRef.current = gl

        // ── Vertex shader — fullscreen quad ──
        const vsSource = `
            attribute vec2 aPos;
            varying vec2 vUv;
            void main() {
                vUv = aPos * 0.5 + 0.5;
                gl_Position = vec4(aPos, 0.0, 1.0);
            }
        `

        // ── Fragment shader — streak flow + star twinkle ──
        const fsSource = `
            precision mediump float;
            varying vec2 vUv;
            uniform sampler2D uFrame;
            uniform float uTime;
            uniform vec2 uResolution;
            uniform float uStreakIntensity;
            uniform float uStreakSpeed;
            uniform float uStreakScale;
            uniform float uTwinkleIntensity;
            uniform float uTwinkleSpeed;
            uniform float uLuminanceThreshold;

            // ── Simplex-style hash noise ──
            vec2 hash22(vec2 p) {
                p = vec2(dot(p, vec2(127.1, 311.7)),
                         dot(p, vec2(269.5, 183.3)));
                return fract(sin(p) * 43758.5453);
            }

            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                float a = dot(hash22(i), f);
                float b = dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
                float c = dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
                float d = dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
                return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
            }

            float fbm(vec2 p) {
                float v = 0.0;
                float a = 0.5;
                for (int i = 0; i < 4; i++) {
                    v += a * noise(p);
                    p *= 2.0;
                    a *= 0.5;
                }
                return v;
            }

            void main() {
                vec2 uv = vUv;
                // Flip Y — canvas vs texture coords
                vec2 texUv = vec2(uv.x, 1.0 - uv.y);
                vec4 frame = texture2D(uFrame, texUv);
                float lum = dot(frame.rgb, vec3(0.299, 0.587, 0.114));

                vec3 result = vec3(0.0);
                float alpha = 0.0;

                // ── Detect local streak direction via gradient (Sobel) ──
                float dx = 1.0 / uResolution.x;
                float dy = 1.0 / uResolution.y;
                float lumL = dot(texture2D(uFrame, texUv - vec2(dx, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
                float lumR = dot(texture2D(uFrame, texUv + vec2(dx, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
                float lumU = dot(texture2D(uFrame, texUv - vec2(0.0, dy)).rgb, vec3(0.299, 0.587, 0.114));
                float lumD = dot(texture2D(uFrame, texUv + vec2(0.0, dy)).rgb, vec3(0.299, 0.587, 0.114));
                // Gradient = direction of brightness change
                vec2 grad = vec2(lumR - lumL, lumD - lumU);
                // Tangent = perpendicular to gradient = along the streak
                vec2 tangent = normalize(vec2(-grad.y, grad.x) + 0.001);

                // ── Streak flow effect ──
                if (lum > uLuminanceThreshold) {
                    // Flow noise along the tangent direction
                    float streakMask = smoothstep(uLuminanceThreshold, uLuminanceThreshold + 0.15, lum);
                    vec2 flowUv = uv * uStreakScale + tangent * uTime * uStreakSpeed;
                    float flow = fbm(flowUv) * 0.5 + 0.5;
                    // Pulsing glow
                    float pulse = 0.7 + 0.3 * sin(uTime * 2.0 + lum * 6.28);
                    result += frame.rgb * streakMask * flow * pulse * uStreakIntensity;
                    alpha += streakMask * flow * uStreakIntensity * 0.8;
                }

                // ── Star twinkle effect ──
                // Stars = bright but small — check if neighbors are dark
                if (lum > 0.08 && lum < 0.7) {
                    float neighborhood = (lumL + lumR + lumU + lumD) * 0.25;
                    float isIsolated = smoothstep(0.05, 0.0, neighborhood);
                    if (isIsolated > 0.1) {
                        // Per-star random twinkle rate from position
                        vec2 starId = floor(texUv * uResolution / 3.0);
                        float rnd = fract(sin(dot(starId, vec2(12.9898, 78.233))) * 43758.5453);
                        float twinkle = sin(uTime * uTwinkleSpeed * (1.0 + rnd * 3.0) + rnd * 6.28);
                        twinkle = twinkle * 0.5 + 0.5;
                        float starGlow = isIsolated * twinkle * lum * uTwinkleIntensity;
                        result += vec3(starGlow * 1.2, starGlow * 1.1, starGlow);
                        alpha += starGlow * 0.6;
                    }
                }

                gl_FragColor = vec4(result, alpha);
            }
        `

        // ── Compile shaders ──
        const vs = gl.createShader(gl.VERTEX_SHADER)!
        gl.shaderSource(vs, vsSource)
        gl.compileShader(vs)
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            console.error("[Overlay] Vertex shader error:", gl.getShaderInfoLog(vs))
            return
        }

        const fs = gl.createShader(gl.FRAGMENT_SHADER)!
        gl.shaderSource(fs, fsSource)
        gl.compileShader(fs)
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            console.error("[Overlay] Fragment shader error:", gl.getShaderInfoLog(fs))
            return
        }

        const program = gl.createProgram()!
        gl.attachShader(program, vs)
        gl.attachShader(program, fs)
        gl.linkProgram(program)
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error("[Overlay] Program link error:", gl.getProgramInfoLog(program))
            return
        }
        gl.useProgram(program)
        glProgramRef.current = program
        console.log("[Overlay] WebGL initialized successfully")

        // ── Fullscreen quad ──
        const quad = new Float32Array([-1,-1, 1,-1, -1,1, 1,1])
        const buf = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, buf)
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW)
        const aPos = gl.getAttribLocation(program, "aPos")
        gl.enableVertexAttribArray(aPos)
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

        // ── Texture ──
        const tex = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        glTextureRef.current = tex

        // ── Blending (additive / screen) ──
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
    }, [])

    // ── WebGL overlay render loop ───────────────────────────────────

    useEffect(() => {
        if (!enableOverlay || !isLoaded) return

        initOverlay()

        const gl = glRef.current
        const program = glProgramRef.current
        if (!gl || !program) {
            console.error("[Overlay] GL context or program missing after init")
            return
        }

        console.log("[Overlay] Render loop starting, canvas:", overlayCanvasRef.current?.clientWidth, "x", overlayCanvasRef.current?.clientHeight)

        const startTime = performance.now()
        let lastFrame = -1
        let logOnce = true

        function renderLoop() {
            overlayRafRef.current = requestAnimationFrame(renderLoop)

            const canvas = overlayCanvasRef.current
            if (!canvas || !gl || !program) return

            // Resize canvas to match display size
            const parent = canvas.parentElement
            if (parent) {
                const w = parent.clientWidth
                const h = parent.clientHeight
                if (canvas.width !== w || canvas.height !== h) {
                    canvas.width = w
                    canvas.height = h
                    gl.viewport(0, 0, w, h)
                }
            }

            // Upload current frame as texture (only when frame changes)
            const frame = currentFrameRef.current
            const img = imagesRef.current[frame]
            if (img?.complete && img.naturalWidth > 0 && frame !== lastFrame) {
                try {
                    gl.bindTexture(gl.TEXTURE_2D, glTextureRef.current)
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
                    lastFrame = frame
                    if (logOnce) {
                        console.log("[Overlay] First texture uploaded, frame:", frame, "size:", img.naturalWidth, "x", img.naturalHeight)
                        logOnce = false
                    }
                } catch (e) {
                    console.error("[Overlay] Texture upload failed:", e)
                }
            }

            // Set uniforms
            const t = (performance.now() - startTime) / 1000
            gl.useProgram(program)
            gl.uniform1f(gl.getUniformLocation(program, "uTime"), t)
            gl.uniform2f(gl.getUniformLocation(program, "uResolution"), canvas.width, canvas.height)
            gl.uniform1f(gl.getUniformLocation(program, "uStreakIntensity"), streakIntensity)
            gl.uniform1f(gl.getUniformLocation(program, "uStreakSpeed"), streakSpeed)
            gl.uniform1f(gl.getUniformLocation(program, "uStreakScale"), streakScale)
            gl.uniform1f(gl.getUniformLocation(program, "uTwinkleIntensity"), twinkleIntensity)
            gl.uniform1f(gl.getUniformLocation(program, "uTwinkleSpeed"), twinkleSpeed)
            gl.uniform1f(gl.getUniformLocation(program, "uLuminanceThreshold"), luminanceThreshold)

            gl.clear(gl.COLOR_BUFFER_BIT)
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        }

        renderLoop()

        return () => {
            cancelAnimationFrame(overlayRafRef.current)
        }
    }, [
        enableOverlay,
        isLoaded,
        initOverlay,
        streakIntensity,
        streakSpeed,
        streakScale,
        twinkleIntensity,
        twinkleSpeed,
        luminanceThreshold,
    ])

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

                // Raw frame from scroll progress
                let frameIndex = Math.round(
                    rawProgress * (totalFrames - 1)
                )

                // ── Milestone snap (dwell zone) ────────────────────
                // Directly warps the frame index toward the milestone,
                // creating a sticky zone where more scroll = less frame change.
                if (enableMilestoneSnap && milestones.length > 0) {
                    const rangeInFrames = Math.round(
                        snapRange * (totalFrames - 1)
                    )

                    for (const ms of milestones) {
                        const msRange = ms.range ?? rangeInFrames
                        const dist = frameIndex - ms.frame
                        const absDist = Math.abs(dist)

                        if (absDist < msRange) {
                            // t: 0 at edge → 1 at milestone center
                            const t = 1 - absDist / msRange
                            // Quadratic pull — strong near center, gentle at edge
                            const pull = t * t * snapStrength * msRange
                            frameIndex = Math.round(
                                dist > 0
                                    ? frameIndex - pull
                                    : frameIndex + pull
                            )
                            break
                        }
                    }
                }

                const clamped = Math.max(
                    0,
                    Math.min(totalFrames - 1, frameIndex)
                )

                currentFrameRef.current = clamped
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
                        decoding="sync"
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

                {/* WebGL dynamic overlay — streak flow + star twinkle */}
                {enableOverlay && (
                    <canvas
                        ref={overlayCanvasRef}
                        style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            pointerEvents: "none",
                            mixBlendMode: "screen",
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

    // ── Dynamic overlay ───────────────────────────────────────────
    enableOverlay: {
        type: ControlType.Boolean,
        title: "Dynamic Overlay",
        defaultValue: false,
    },
    streakIntensity: {
        type: ControlType.Number,
        title: "Streak Intensity",
        defaultValue: 0.4,
        min: 0,
        max: 1,
        step: 0.05,
        hidden: (props) => !props.enableOverlay,
    },
    streakSpeed: {
        type: ControlType.Number,
        title: "Streak Speed",
        defaultValue: 0.8,
        min: 0.1,
        max: 3,
        step: 0.1,
        hidden: (props) => !props.enableOverlay,
    },
    streakScale: {
        type: ControlType.Number,
        title: "Streak Scale",
        defaultValue: 3,
        min: 1,
        max: 10,
        step: 0.5,
        hidden: (props) => !props.enableOverlay,
    },
    twinkleIntensity: {
        type: ControlType.Number,
        title: "Twinkle Intensity",
        defaultValue: 0.6,
        min: 0,
        max: 1,
        step: 0.05,
        hidden: (props) => !props.enableOverlay,
    },
    twinkleSpeed: {
        type: ControlType.Number,
        title: "Twinkle Speed",
        defaultValue: 1,
        min: 0.1,
        max: 5,
        step: 0.1,
        hidden: (props) => !props.enableOverlay,
    },
    luminanceThreshold: {
        type: ControlType.Number,
        title: "Lum Threshold",
        defaultValue: 0.15,
        min: 0.01,
        max: 0.5,
        step: 0.01,
        hidden: (props) => !props.enableOverlay,
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
