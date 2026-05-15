import { addPropertyControls, ControlType, RenderTarget } from "framer"
import {
    useState,
    useEffect,
    useRef,
    useCallback,
    useMemo,
} from "react"

// ─── Types ───────────────────────────────────────────────────────────

interface Chapter {
    label: string
    startFrame: number
    endFrame: number
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
    // Canvas preview
    canvasFrame: number
    // Frame counter (debug)
    showFrameCounter: boolean
    // Progress overlay
    showProgressOverlay: boolean
    chapters: Chapter[]
    progressMode: "chapter" | "overall"
    progressOrientation: "vertical" | "horizontal"
    progressPosition: "left" | "right" | "top" | "bottom" | "custom"
    progressOffsetX: number
    progressOffsetY: number
    barLength: number
    barThickness: number
    progressGap: number
    labelPlacement: "before" | "after"
    labelRotation: number
    reverseDirection: boolean
    trackColor: string
    progressColor: string
    progressTextColor: string
    activeTextColor: string
    progressFontSize: number
    progressLetterSpacing: number
    progressTextTransform: "uppercase" | "none"
    progressOpacity: number
    progressBorderRadius: number
    progressZIndex: number
    // @ts-ignore
    progressFont: any
    progressFontWeight: number
    // WebGL overlay
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
        canvasFrame = 0,
        showFrameCounter = false,
        showProgressOverlay = false,
        chapters = [],
        progressMode = "chapter",
        progressOrientation = "vertical",
        progressPosition = "right",
        progressOffsetX = 0,
        progressOffsetY = 0,
        barLength = 120,
        barThickness = 1,
        progressGap = 14,
        labelPlacement = "after",
        labelRotation = 0,
        reverseDirection = false,
        trackColor = "rgba(255,255,255,0.2)",
        progressColor = "#ffffff",
        progressTextColor = "rgba(255,255,255,0.5)",
        activeTextColor = "#ffffff",
        progressFontSize = 9,
        progressLetterSpacing = 3,
        progressTextTransform = "uppercase",
        progressOpacity = 1,
        progressBorderRadius = 0,
        progressZIndex = 20,
        progressFont,
        progressFontWeight = 400,
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
    const currentFrameRef = useRef<number>(0)

    const [loadProgress, setLoadProgress] = useState(0)
    const [isLoaded, setIsLoaded] = useState(false)
    const [currentFrame, setCurrentFrame] = useState(0)
    const isCanvas = RenderTarget.current() === RenderTarget.canvas

    // Build the list of frame URLs
    const frameUrls = useMemo(() => {
        if (sourceMode === "manual" && manualUrls.trim()) {
            return manualUrls
                .split("\n")
                .map((u) => u.trim())
                .filter(Boolean)
        }
        if (!baseUrl) return []
        return buildFrameUrls(
            baseUrl,
            filePrefix,
            fileExtension.toLowerCase(),
            startFrame,
            endFrame,
            numberPadding
        )
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

    // On the Framer canvas, show canvasFrame instead of scroll-driven frame
    const displayFrame = isCanvas
        ? Math.max(0, Math.min(canvasFrame, totalFrames - 1))
        : currentFrame

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
            // xy = scale, zw = offset — maps screen UV to texture UV
            uniform vec4 uCoverCrop;

            void main() {
                vec2 uv = vUv;
                vec2 texUv = uv * uCoverCrop.xy + uCoverCrop.zw;
                texUv.y = 1.0 - texUv.y;
                vec4 frame = texture2D(uFrame, texUv);
                float lum = dot(frame.rgb, vec3(0.299, 0.587, 0.114));

                vec3 result = vec3(0.0);

                // ── Two-pass bloom: inner detail + outer glow ──
                float maxRadius = uStreakScale / uResolution.x;
                float goldenAngle = 2.39996323;

                float bloomInner = 0.0;
                vec3 colorInner = vec3(0.0);
                float wInner = 0.0;
                float bloomOuter = 0.0;
                vec3 colorOuter = vec3(0.0);
                float wOuter = 0.0;

                // Center
                bloomInner += lum * 3.0;
                colorInner += frame.rgb * 3.0;
                wInner += 3.0;
                bloomOuter += lum * 1.5;
                colorOuter += frame.rgb * 1.5;
                wOuter += 1.5;

                for (int i = 1; i <= 32; i++) {
                    float fi = float(i);

                    // Inner ring — tight radius, steep falloff
                    float rI = maxRadius * 0.35 * sqrt(fi / 32.0);
                    float tI = fi * goldenAngle;
                    vec2 sI = texUv + vec2(cos(tI), sin(tI)) * rI;
                    vec3 cI = texture2D(uFrame, sI).rgb;
                    float lI = dot(cI, vec3(0.299, 0.587, 0.114));
                    float wI = exp(-fi / 12.0);
                    bloomInner += lI * wI;
                    colorInner += cI * wI;
                    wInner += wI;

                    // Outer ring — full radius, gentle falloff
                    float rO = maxRadius * sqrt(fi / 32.0);
                    float tO = fi * goldenAngle + 0.5;
                    vec2 sO = texUv + vec2(cos(tO), sin(tO)) * rO;
                    vec3 cO = texture2D(uFrame, sO).rgb;
                    float lO = dot(cO, vec3(0.299, 0.587, 0.114));
                    float wO = exp(-fi / 20.0);
                    bloomOuter += lO * wO;
                    colorOuter += cO * wO;
                    wOuter += wO;
                }

                bloomInner /= wInner;
                colorInner /= wInner;
                bloomOuter /= wOuter;
                colorOuter /= wOuter;

                // Blend inner + outer for smooth combined bloom
                float bloom = bloomInner * 0.4 + bloomOuter * 0.6;
                vec3 bloomColor = colorInner * 0.4 + colorOuter * 0.6;

                // Very wide smooth transition
                float glowMask = smoothstep(uLuminanceThreshold * 0.2, uLuminanceThreshold + 0.25, bloom);
                glowMask = sqrt(glowMask);

                // ── Streak tangent from outer bloom gradient ──
                float gStep = 12.0 / uResolution.x;
                float bL = 0.0; float bR = 0.0; float bU = 0.0; float bD = 0.0;
                float gw = 0.0;
                for (int i = 0; i <= 8; i++) {
                    float fi = float(i);
                    float r = gStep * 0.6 * sqrt(fi / 8.0 + 0.1);
                    float t = fi * goldenAngle;
                    vec2 d = vec2(cos(t), sin(t)) * r;
                    float w = exp(-fi / 5.0);
                    bL += dot(texture2D(uFrame, texUv - vec2(gStep, 0.0) + d).rgb, vec3(0.299, 0.587, 0.114)) * w;
                    bR += dot(texture2D(uFrame, texUv + vec2(gStep, 0.0) + d).rgb, vec3(0.299, 0.587, 0.114)) * w;
                    bU += dot(texture2D(uFrame, texUv - vec2(0.0, gStep) + d).rgb, vec3(0.299, 0.587, 0.114)) * w;
                    bD += dot(texture2D(uFrame, texUv + vec2(0.0, gStep) + d).rgb, vec3(0.299, 0.587, 0.114)) * w;
                    gw += w;
                }
                vec2 grad = vec2(bR - bL, bD - bU) / gw;
                vec2 tangent = normalize(vec2(-grad.y, grad.x) + 0.001);

                // ── Streak flow — smooth traveling waves ──
                if (glowMask > 0.01) {
                    float along = dot(uv, tangent);

                    float w1 = sin(along * 12.0 - uTime * uStreakSpeed * 3.5);
                    float w2 = sin(along * 20.0 - uTime * uStreakSpeed * 5.5 + 1.5);
                    float w3 = sin(along * 7.0  - uTime * uStreakSpeed * 2.0 + 3.0);
                    w1 = pow(w1 * 0.5 + 0.5, 3.0);
                    w2 = pow(w2 * 0.5 + 0.5, 3.0);
                    w3 = pow(w3 * 0.5 + 0.5, 3.0);
                    float flow = w1 * 0.5 + w2 * 0.25 + w3 * 0.25;

                    float pulse = 0.85 + 0.15 * sin(uTime * 1.5);
                    vec3 tint = bloomColor / max(bloom, 0.02);

                    result += tint * (glowMask * glowMask) * flow * pulse * uStreakIntensity * 3.0;
                }

                // ── Star twinkle (only on truly dim isolated points) ──
                if (lum > 0.03 && lum < uLuminanceThreshold * 0.5) {
                    float px = 3.0 / uResolution.x;
                    float nL = dot(texture2D(uFrame, texUv - vec2(px, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
                    float nR = dot(texture2D(uFrame, texUv + vec2(px, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
                    float nU = dot(texture2D(uFrame, texUv - vec2(0.0, px)).rgb, vec3(0.299, 0.587, 0.114));
                    float nD = dot(texture2D(uFrame, texUv + vec2(0.0, px)).rgb, vec3(0.299, 0.587, 0.114));
                    float neighborhood = (nL + nR + nU + nD) * 0.25;
                    float isIsolated = smoothstep(0.04, 0.0, neighborhood);
                    if (isIsolated > 0.1) {
                        float rnd = fract(sin(dot(texUv * 317.0, vec2(12.9898, 78.233))) * 43758.5453);
                        float twinkle = sin(uTime * uTwinkleSpeed * (1.0 + rnd * 3.0) + rnd * 6.28);
                        twinkle = twinkle * 0.5 + 0.5;
                        float starGlow = isIsolated * twinkle * uTwinkleIntensity;
                        result += vec3(starGlow, starGlow * 0.95, starGlow * 0.8);
                    }
                }

                float a = max(result.r, max(result.g, result.b));
                gl_FragColor = vec4(result, a);
            }
        `

        // ── Compile shaders ──
        const vs = gl.createShader(gl.VERTEX_SHADER)!
        gl.shaderSource(vs, vsSource)
        gl.compileShader(vs)
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) return

        const fs = gl.createShader(gl.FRAGMENT_SHADER)!
        gl.shaderSource(fs, fsSource)
        gl.compileShader(fs)
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) return

        const program = gl.createProgram()!
        gl.attachShader(program, vs)
        gl.attachShader(program, fs)
        gl.linkProgram(program)
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return

        gl.useProgram(program)
        glProgramRef.current = program

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
        if (!gl || !program) return

        const startTime = performance.now()
        let lastFrame = -1

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
                } catch (e) {
                    // silently skip texture upload errors
                }
            }

            // Compute cover-crop UV offset so overlay aligns with <img>
            const img2 = imagesRef.current[currentFrameRef.current]
            const iw = img2?.naturalWidth || 1920
            const ih = img2?.naturalHeight || 1080
            const cw = canvas.width || 1
            const ch = canvas.height || 1
            const imgRatio = iw / ih
            const canRatio = cw / ch
            let uvScaleX = 1.0, uvScaleY = 1.0
            let uvOffsetX = 0.0, uvOffsetY = 0.0
            if (imgRatio > canRatio) {
                uvScaleX = canRatio / imgRatio
                uvOffsetX = (1.0 - uvScaleX) * (objectPositionX / 100)
            } else {
                uvScaleY = imgRatio / canRatio
                // Invert Y because the shader flips texUv.y (1.0 - y)
                uvOffsetY = (1.0 - uvScaleY) * (1.0 - objectPositionY / 100)
            }

            // Set uniforms
            const t = (performance.now() - startTime) / 1000
            gl.useProgram(program)
            gl.uniform1f(gl.getUniformLocation(program, "uTime"), t)
            gl.uniform2f(gl.getUniformLocation(program, "uResolution"), canvas.width, canvas.height)
            gl.uniform4f(gl.getUniformLocation(program, "uCoverCrop"), uvScaleX, uvScaleY, uvOffsetX, uvOffsetY)
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
        objectPositionX,
        objectPositionY,
    ])

    // ── Scroll handler ──────────────────────────────────────────────

    useEffect(() => {
        if (totalFrames === 0) return

        function onScroll() {
            rafRef.current = requestAnimationFrame(() => {
                const el = containerRef.current
                if (!el) return

                const rect = el.getBoundingClientRect()
                const scrollable = rect.height - window.innerHeight
                if (scrollable <= 0) return

                let rawProgress = -rect.top / scrollable
                rawProgress = Math.max(0, Math.min(1, rawProgress))

                const frameIndex = Math.round(
                    rawProgress * (totalFrames - 1)
                )
                const clamped = Math.max(
                    0,
                    Math.min(totalFrames - 1, frameIndex)
                )

                currentFrameRef.current = clamped
                setCurrentFrame(clamped)
            })
        }

        window.addEventListener("scroll", onScroll, { passive: true })
        onScroll()

        return () => {
            window.removeEventListener("scroll", onScroll)
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
        }
    }, [totalFrames])

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

                {/* Current frame — native <img> for best scaling quality.
                     On canvas, skip rendering if no preload has happened
                     (remote URLs typically can't be fetched on the canvas). */}
                {frameUrls[displayFrame] && !isCanvas && (
                    <img
                        src={frameUrls[displayFrame]}
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

                {/* Frame counter (debug) */}
                {showFrameCounter && (
                    <div
                        style={{
                            position: "absolute",
                            top: 12,
                            left: 12,
                            padding: "4px 10px",
                            borderRadius: 4,
                            background: "rgba(0,0,0,0.6)",
                            color: "#fff",
                            fontFamily: "monospace",
                            fontSize: 11,
                            pointerEvents: "none",
                            zIndex: 20,
                        }}
                    >
                        {displayFrame} / {totalFrames - 1}
                    </div>
                )}

                {/* Chapter progress overlay */}
                {showProgressOverlay && chapters.length > 0 && (
                    <ChapterProgressOverlay
                        currentFrame={displayFrame}
                        totalFrames={totalFrames}
                        chapters={chapters}
                        progressMode={progressMode}
                        orientation={progressOrientation}
                        position={progressPosition}
                        offsetX={progressOffsetX}
                        offsetY={progressOffsetY}
                        barLength={barLength}
                        barThickness={barThickness}
                        gap={progressGap}
                        labelPlacement={labelPlacement}
                        labelRotation={labelRotation}
                        reverseDirection={reverseDirection}
                        trackColor={trackColor}
                        progressColor={progressColor}
                        textColor={progressTextColor}
                        activeTextColor={activeTextColor}
                        fontSize={progressFontSize}
                        letterSpacing={progressLetterSpacing}
                        textTransform={progressTextTransform}
                        opacity={progressOpacity}
                        borderRadius={progressBorderRadius}
                        zIndex={progressZIndex}
                        font={progressFont}
                        fontWeight={progressFontWeight}
                    />
                )}
            </div>
        </div>
    )
}

// ─── Chapter progress overlay ───────────────────────────────────────

function ChapterProgressOverlay({
    currentFrame,
    totalFrames,
    chapters,
    progressMode,
    orientation,
    position,
    offsetX,
    offsetY,
    barLength,
    barThickness,
    gap,
    labelPlacement,
    labelRotation,
    reverseDirection,
    trackColor,
    progressColor,
    textColor,
    activeTextColor,
    fontSize,
    letterSpacing,
    textTransform,
    opacity,
    borderRadius,
    zIndex,
    font,
    fontWeight,
}: {
    currentFrame: number
    totalFrames: number
    chapters: Chapter[]
    progressMode: "chapter" | "overall"
    orientation: "vertical" | "horizontal"
    position: "left" | "right" | "top" | "bottom" | "custom"
    offsetX: number
    offsetY: number
    barLength: number
    barThickness: number
    gap: number
    labelPlacement: "before" | "after"
    labelRotation: number
    reverseDirection: boolean
    trackColor: string
    progressColor: string
    textColor: string
    activeTextColor: string
    fontSize: number
    letterSpacing: number
    textTransform: "uppercase" | "none"
    opacity: number
    borderRadius: number
    zIndex: number
    font: any
    fontWeight: number
}) {
    // Find active chapter
    let activeChapter: Chapter | null = null
    let activeIndex = -1
    for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i]
        if (currentFrame >= ch.startFrame && currentFrame <= ch.endFrame) {
            activeChapter = ch
            activeIndex = i
            break
        }
    }

    // Fallback: nearest upcoming chapter, or first
    if (!activeChapter && chapters.length > 0) {
        let bestDist = Infinity
        for (let i = 0; i < chapters.length; i++) {
            const dist = chapters[i].startFrame - currentFrame
            if (dist > 0 && dist < bestDist) {
                bestDist = dist
                activeChapter = chapters[i]
                activeIndex = i
            }
        }
        if (!activeChapter) {
            activeChapter = chapters[0]
            activeIndex = 0
        }
    }

    // Compute progress
    let progress = 0
    if (progressMode === "overall") {
        progress = totalFrames > 1 ? currentFrame / (totalFrames - 1) : 0
    } else if (activeChapter) {
        const range = activeChapter.endFrame - activeChapter.startFrame
        if (range > 0) {
            progress = (currentFrame - activeChapter.startFrame) / range
        } else {
            progress = currentFrame >= activeChapter.startFrame ? 1 : 0
        }
    }
    progress = Math.max(0, Math.min(1, progress))
    if (reverseDirection) progress = 1 - progress

    const isVertical = orientation === "vertical"
    const label = activeChapter?.label || ""

    // Container positioning
    const containerStyle: React.CSSProperties = {
        position: "absolute",
        display: "flex",
        flexDirection: isVertical
            ? labelPlacement === "before" ? "column" : "column-reverse"
            : labelPlacement === "before" ? "row" : "row-reverse",
        alignItems: "center",
        gap,
        opacity,
        zIndex,
        pointerEvents: "none",
    }

    // Position presets
    switch (position) {
        case "left":
            containerStyle.left = 40 + offsetX
            containerStyle.top = "50%"
            containerStyle.transform = "translateY(-50%)"
            break
        case "right":
            containerStyle.right = 40 - offsetX
            containerStyle.top = "50%"
            containerStyle.transform = "translateY(-50%)"
            break
        case "top":
            containerStyle.top = 40 + offsetY
            containerStyle.left = "50%"
            containerStyle.transform = "translateX(-50%)"
            break
        case "bottom":
            containerStyle.bottom = 40 - offsetY
            containerStyle.left = "50%"
            containerStyle.transform = "translateX(-50%)"
            break
        case "custom":
            containerStyle.left = offsetX
            containerStyle.top = offsetY
            break
    }

    // Track dimensions
    const trackW = isVertical ? barThickness : barLength
    const trackH = isVertical ? barLength : barThickness

    // Fill dimensions
    const fillW = isVertical ? barThickness : barLength * progress
    const fillH = isVertical ? barLength * progress : barThickness

    // Fill alignment: vertical fills from bottom by default
    const fillStyle: React.CSSProperties = {
        position: "absolute",
        background: progressColor,
        borderRadius,
        transition: "width 0.15s ease-out, height 0.15s ease-out",
    }
    if (isVertical) {
        fillStyle.bottom = 0
        fillStyle.left = 0
        fillStyle.width = barThickness
        fillStyle.height = fillH
    } else {
        fillStyle.top = 0
        fillStyle.left = 0
        fillStyle.width = fillW
        fillStyle.height = barThickness
    }

    // Use writing-mode for vertical text so the layout box matches
    // the visual size (no rotate transform needed).
    const useWritingMode = isVertical && labelRotation === 0

    const labelStyle: React.CSSProperties = {
        fontFamily: font?.fontFamily || "system-ui, sans-serif",
        fontSize,
        fontWeight,
        letterSpacing,
        textTransform: textTransform as any,
        color: activeIndex >= 0 ? activeTextColor : textColor,
        whiteSpace: "nowrap",
        transition: "color 0.3s ease",
    }

    if (useWritingMode) {
        labelStyle.writingMode = "vertical-lr"
        labelStyle.textOrientation = "upright"
    } else if (labelRotation) {
        labelStyle.transform = `rotate(${labelRotation}deg)`
    }

    // Anchor the bar in a fixed position; float the label relative
    // to it so that changing label length never shifts the bar.
    // The wrapper uses the bar as the sizing anchor and the label
    // is positioned absolutely so it doesn't affect layout.

    // Determine label offset direction from bar
    const labelBefore = labelPlacement === "before"

    // For vertical orientation: label is above/below the bar
    // For horizontal: label is left/right of the bar
    const labelAbsStyle: React.CSSProperties = {
        ...labelStyle,
        position: "absolute",
    }

    if (isVertical) {
        // Center horizontally on the bar
        labelAbsStyle.left = "50%"
        labelAbsStyle.transform = labelRotation
            ? `translateX(-50%) rotate(${labelRotation}deg)`
            : "translateX(-50%)"
        if (labelBefore) {
            // Label above bar
            labelAbsStyle.bottom = `calc(100% + ${gap}px)`
        } else {
            // Label below bar
            labelAbsStyle.top = `calc(100% + ${gap}px)`
        }
    } else {
        // Center vertically on the bar
        labelAbsStyle.top = "50%"
        labelAbsStyle.transform = labelRotation
            ? `translateY(-50%) rotate(${labelRotation}deg)`
            : "translateY(-50%)"
        if (labelBefore) {
            labelAbsStyle.right = `calc(100% + ${gap}px)`
        } else {
            labelAbsStyle.left = `calc(100% + ${gap}px)`
        }
    }

    // Wrapper positions via the original presets but sizes to the bar only
    const wrapperStyle: React.CSSProperties = {
        ...containerStyle,
        display: "block",
        width: trackW,
        height: trackH,
    }
    // Remove flex properties (no longer flex layout)
    delete (wrapperStyle as any).flexDirection
    delete (wrapperStyle as any).alignItems
    delete (wrapperStyle as any).gap

    return (
        <div style={wrapperStyle}>
            {/* Label — absolutely positioned so it doesn't shift the bar */}
            <span style={labelAbsStyle}>{label}</span>

            {/* Track + fill */}
            <div
                style={{
                    position: "relative",
                    width: trackW,
                    height: trackH,
                    background: trackColor,
                    borderRadius,
                    overflow: "hidden",
                }}
            >
                <div style={fillStyle} />
            </div>
        </div>
    )
}

// ─── Load-order builder ──────────────────────────────────────────────

function buildLoadOrder(total: number): number[] {
    if (total <= 0) return []
    const order: number[] = [0]
    const visited = new Set([0])

    if (total > 1) {
        order.push(total - 1)
        visited.add(total - 1)
    }

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

    // ── Canvas preview ────────────────────────────────────────────
    canvasFrame: {
        type: ControlType.Number,
        title: "Canvas Frame",
        defaultValue: 0,
        min: 0,
        step: 1,
        description: "Frame to display on the Framer canvas for design alignment",
    },

    // ── Frame counter (debug) ──────────────────────────────────────
    showFrameCounter: {
        type: ControlType.Boolean,
        title: "Frame Counter",
        defaultValue: false,
    },

    // ── Chapter progress overlay ────────────────────────────────────
    showProgressOverlay: {
        type: ControlType.Boolean,
        title: "Progress Overlay",
        defaultValue: false,
    },
    chapters: {
        type: ControlType.Array,
        title: "Chapters",
        control: {
            type: ControlType.Object,
            controls: {
                label: {
                    type: ControlType.String,
                    title: "Label",
                    defaultValue: "CHAPTER",
                },
                startFrame: {
                    type: ControlType.Number,
                    title: "Start",
                    defaultValue: 0,
                    min: 0,
                    step: 1,
                },
                endFrame: {
                    type: ControlType.Number,
                    title: "End",
                    defaultValue: 100,
                    min: 0,
                    step: 1,
                },
            },
        },
        defaultValue: [
            { label: "MEMORY LANE", startFrame: 0, endFrame: 100 },
        ],
        hidden: (props) => !props.showProgressOverlay,
    },
    progressMode: {
        type: ControlType.Enum,
        title: "Progress Mode",
        options: ["chapter", "overall"],
        optionTitles: ["Chapter", "Overall"],
        defaultValue: "chapter",
        hidden: (props) => !props.showProgressOverlay,
    },

    // ── Progress layout ─────────────────────────────────────────────
    progressOrientation: {
        type: ControlType.Enum,
        title: "Orientation",
        options: ["vertical", "horizontal"],
        optionTitles: ["Vertical", "Horizontal"],
        defaultValue: "vertical",
        hidden: (props) => !props.showProgressOverlay,
    },
    progressPosition: {
        type: ControlType.Enum,
        title: "Position",
        options: ["left", "right", "top", "bottom", "custom"],
        optionTitles: ["Left", "Right", "Top", "Bottom", "Custom"],
        defaultValue: "right",
        hidden: (props) => !props.showProgressOverlay,
    },
    progressOffsetX: {
        type: ControlType.Number,
        title: "Offset X",
        defaultValue: 0,
        min: -500,
        max: 500,
        step: 1,
        unit: "px",
        hidden: (props) => !props.showProgressOverlay,
    },
    progressOffsetY: {
        type: ControlType.Number,
        title: "Offset Y",
        defaultValue: 0,
        min: -500,
        max: 500,
        step: 1,
        unit: "px",
        hidden: (props) => !props.showProgressOverlay,
    },
    barLength: {
        type: ControlType.Number,
        title: "Bar Length",
        defaultValue: 120,
        min: 20,
        max: 600,
        step: 1,
        unit: "px",
        hidden: (props) => !props.showProgressOverlay,
    },
    barThickness: {
        type: ControlType.Number,
        title: "Bar Thickness",
        defaultValue: 1,
        min: 1,
        max: 20,
        step: 1,
        unit: "px",
        hidden: (props) => !props.showProgressOverlay,
    },
    progressGap: {
        type: ControlType.Number,
        title: "Gap",
        defaultValue: 14,
        min: 0,
        max: 60,
        step: 1,
        unit: "px",
        hidden: (props) => !props.showProgressOverlay,
    },
    labelPlacement: {
        type: ControlType.Enum,
        title: "Label Side",
        options: ["before", "after"],
        optionTitles: ["Before", "After"],
        defaultValue: "after",
        hidden: (props) => !props.showProgressOverlay,
    },
    labelRotation: {
        type: ControlType.Number,
        title: "Label Rotation",
        defaultValue: 0,
        min: -180,
        max: 180,
        step: 1,
        unit: "deg",
        hidden: (props) => !props.showProgressOverlay,
    },
    reverseDirection: {
        type: ControlType.Boolean,
        title: "Reverse Direction",
        defaultValue: false,
        hidden: (props) => !props.showProgressOverlay,
    },

    // ── Progress style ──────────────────────────────────────────────
    trackColor: {
        type: ControlType.Color,
        title: "Track Color",
        defaultValue: "rgba(255,255,255,0.2)",
        hidden: (props) => !props.showProgressOverlay,
    },
    progressColor: {
        type: ControlType.Color,
        title: "Fill Color",
        defaultValue: "#ffffff",
        hidden: (props) => !props.showProgressOverlay,
    },
    progressTextColor: {
        type: ControlType.Color,
        title: "Text Color",
        defaultValue: "rgba(255,255,255,0.5)",
        hidden: (props) => !props.showProgressOverlay,
    },
    activeTextColor: {
        type: ControlType.Color,
        title: "Active Text",
        defaultValue: "#ffffff",
        hidden: (props) => !props.showProgressOverlay,
    },
    // @ts-ignore
    progressFont: {
        // @ts-ignore
        type: ControlType.Font,
        title: "Font",
        hidden: (props: Props) => !props.showProgressOverlay,
    },
    progressFontSize: {
        type: ControlType.Number,
        title: "Font Size",
        defaultValue: 9,
        min: 6,
        max: 48,
        step: 1,
        unit: "px",
        hidden: (props) => !props.showProgressOverlay,
    },
    progressFontWeight: {
        type: ControlType.Enum,
        title: "Weight",
        options: [100, 200, 300, 400, 500, 600, 700, 800, 900],
        optionTitles: [
            "Thin",
            "ExtraLight",
            "Light",
            "Regular",
            "Medium",
            "SemiBold",
            "Bold",
            "ExtraBold",
            "Black",
        ],
        defaultValue: 400,
        hidden: (props) => !props.showProgressOverlay,
    },
    progressLetterSpacing: {
        type: ControlType.Number,
        title: "Letter Spacing",
        defaultValue: 3,
        min: 0,
        max: 20,
        step: 0.5,
        unit: "px",
        hidden: (props) => !props.showProgressOverlay,
    },
    progressTextTransform: {
        type: ControlType.Enum,
        title: "Transform",
        options: ["uppercase", "none"],
        optionTitles: ["Uppercase", "None"],
        defaultValue: "uppercase",
        hidden: (props) => !props.showProgressOverlay,
    },
    progressOpacity: {
        type: ControlType.Number,
        title: "Overlay Opacity",
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.05,
        hidden: (props) => !props.showProgressOverlay,
    },
    progressBorderRadius: {
        type: ControlType.Number,
        title: "Border Radius",
        defaultValue: 0,
        min: 0,
        max: 10,
        step: 1,
        unit: "px",
        hidden: (props) => !props.showProgressOverlay,
    },
    progressZIndex: {
        type: ControlType.Number,
        title: "Z-Index",
        defaultValue: 20,
        min: 1,
        max: 100,
        step: 1,
        hidden: (props) => !props.showProgressOverlay,
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
        title: "Glow Spread",
        defaultValue: 8,
        min: 1,
        max: 30,
        step: 1,
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
})
