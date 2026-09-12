/*
 * =========================================================
 * Useless Project 3.0
 * Receiver Web Interface
 * =========================================================
 *
 * Phone camera
 *      ↓
 * jsQR
 *      ↓
 * RAW QR BINARY BYTES
 *      ↓
 * Python Receiver /frame
 *
 * IMPORTANT:
 * The Sender uses QR byte mode.
 * We MUST use result.binaryData from jsQR.
 * Do NOT convert result.data back to bytes.
 * =========================================================
 */


/* ---------------------------------------------------------
   QR decoder
   --------------------------------------------------------- */

const JSQR_URL =
    "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";


/* ---------------------------------------------------------
   DOM
   --------------------------------------------------------- */

const camera =
    document.getElementById("camera");

const cameraMessage =
    document.getElementById("cameraMessage");

const startCameraButton =
    document.getElementById("startCameraButton");

const stopCameraButton =
    document.getElementById("stopCameraButton");

const resetButton =
    document.getElementById("resetButton");

const connectionStatus =
    document.getElementById("connectionStatus");

const sessionIdElement =
    document.getElementById("sessionId");

const fileNameElement =
    document.getElementById("fileName");

const frameCountElement =
    document.getElementById("frameCount");

const duplicateCountElement =
    document.getElementById("duplicateCount");

const progressElement =
    document.getElementById("progress");

const progressText =
    document.getElementById("progressText");

const transferStatus =
    document.getElementById("transferStatus");

const resultCard =
    document.getElementById("resultCard");

const resultFileName =
    document.getElementById("resultFileName");

const verificationStatus =
    document.getElementById("verificationStatus");

const downloadButton =
    document.getElementById("downloadButton");

const errorMessage =
    document.getElementById("errorMessage");


/* ---------------------------------------------------------
   State
   --------------------------------------------------------- */

let stream = null;

let scanning = false;

let scanAnimationFrame = null;

let jsQRLoaded = false;

let canvas = null;

let canvasContext = null;

let lastPayloadKey = null;

let lastPayloadTime = 0;

let statusTimer = null;


/*
 * Same QR frame can remain visible for many camera frames.
 * Do not POST the exact same payload repeatedly.
 */

const DUPLICATE_SCAN_INTERVAL = 350;


/* ---------------------------------------------------------
   Server
   --------------------------------------------------------- */

/*
 * The Receiver webpage and Receiver API are now hosted
 * by the SAME Render service.
 *
 * Therefore we do not need:
 *
 *   http://192.168.x.x:8000
 *
 * or a manual connection box.
 *
 * The API is simply the current website origin.
 */

function getServerUrl() {

    return window.location.origin;
}


/* ---------------------------------------------------------
   UI helpers
   --------------------------------------------------------- */

function setConnectionStatus(
    message,
    connected
) {

    if (!connectionStatus) {
        return;
    }

    connectionStatus.textContent =
        message;

    connectionStatus.classList.toggle(
        "connected",
        connected
    );

    connectionStatus.classList.toggle(
        "disconnected",
        !connected
    );
}


function setTransferStatus(
    message,
    type = "waiting"
) {

    if (!transferStatus) {
        return;
    }

    transferStatus.textContent =
        message;

    transferStatus.className =
        `status ${type}`;
}


function showError(message) {

    if (!errorMessage) {
        return;
    }

    errorMessage.textContent =
        message;

    errorMessage.classList.remove(
        "hidden"
    );
}


function clearError() {

    if (!errorMessage) {
        return;
    }

    errorMessage.textContent =
        "";

    errorMessage.classList.add(
        "hidden"
    );
}


function updateProgress(
    received,
    total
) {

    const safeTotal =
        Number(total) || 0;

    const safeReceived =
        Number(received) || 0;

    const percent =
        safeTotal > 0
            ? Math.min(
                100,
                (safeReceived / safeTotal) * 100
            )
            : 0;

    if (progressElement) {

        progressElement.style.width =
            `${percent}%`;
    }

    if (progressText) {

        progressText.textContent =
            `${percent.toFixed(1)}%`;
    }

    if (frameCountElement) {

        frameCountElement.textContent =
            `${safeReceived} / ${safeTotal}`;
    }
}


/* ---------------------------------------------------------
   Load jsQR
   --------------------------------------------------------- */

function loadJsQR() {

    return new Promise(
        (resolve, reject) => {

            if (
                typeof window.jsQR ===
                "function"
            ) {

                jsQRLoaded = true;

                resolve();

                return;
            }

            const script =
                document.createElement(
                    "script"
                );

            script.src =
                JSQR_URL;

            script.async =
                true;

            script.onload =
                () => {

                    if (
                        typeof window.jsQR !==
                        "function"
                    ) {

                        reject(
                            new Error(
                                "jsQR loaded but is unavailable."
                            )
                        );

                        return;
                    }

                    jsQRLoaded =
                        true;

                    resolve();
                };

            script.onerror =
                () => {

                    reject(
                        new Error(
                            "Unable to load jsQR."
                        )
                    );
                };

            document.head.appendChild(
                script
            );
        }
    );
}


/* ---------------------------------------------------------
   Camera
   --------------------------------------------------------- */

async function startCamera() {

    clearError();

    if (scanning) {
        return;
    }

    try {

        await loadJsQR();

        cameraMessage.textContent =
            "Requesting camera permission...";

        stream =
            await navigator.mediaDevices
                .getUserMedia(
                    {
                        video: {
                            facingMode: {
                                ideal: "environment"
                            },

                            width: {
                                ideal: 1920
                            },

                            height: {
                                ideal: 1080
                            }
                        },

                        audio: false
                    }
                );

        camera.srcObject =
            stream;

        await camera.play();

        /*
         * Wait until the browser has actual
         * camera dimensions.
         */

        await waitForVideoReady();

        canvas =
            document.createElement(
                "canvas"
            );

        canvas.width =
            camera.videoWidth;

        canvas.height =
            camera.videoHeight;

        canvasContext =
            canvas.getContext(
                "2d",
                {
                    willReadFrequently: true
                }
            );

        scanning =
            true;

        startCameraButton.disabled =
            true;

        stopCameraButton.disabled =
            false;

        cameraMessage.textContent =
            "Scanning for QR codes...";

        setConnectionStatus(
            "Receiver ready",
            true
        );

        setTransferStatus(
            "Scanning...",
            "receiving"
        );

        /*
         * Automatically verify that the Render
         * Receiver backend is reachable.
         */

        checkReceiver();

        scanLoop();

    } catch (error) {

        stopCamera();

        showError(
            getCameraErrorMessage(error)
        );

        cameraMessage.textContent =
            "Camera unavailable";
    }
}


/* ---------------------------------------------------------
   Wait for video
   --------------------------------------------------------- */

function waitForVideoReady() {

    return new Promise(
        (resolve, reject) => {

            if (
                camera.videoWidth > 0 &&
                camera.videoHeight > 0
            ) {

                resolve();

                return;
            }

            const timeout =
                window.setTimeout(
                    () => {

                        reject(
                            new Error(
                                "Camera video did not become ready."
                            )
                        );

                    },
                    5000
                );

            camera.onloadedmetadata =
                () => {

                    window.clearTimeout(
                        timeout
                    );

                    resolve();
                };
        }
    );
}


/* ---------------------------------------------------------
   Receiver health check
   --------------------------------------------------------- */

async function checkReceiver() {

    try {

        const response =
            await fetch(
                `${getServerUrl()}/status`,
                {
                    method: "GET",
                    cache: "no-store"
                }
            );

        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );
        }

        const status =
            await response.json();

        setConnectionStatus(
            "Receiver connected",
            true
        );

        applyStatus(
            status
        );

        startStatusPolling();

    } catch (error) {

        setConnectionStatus(
            "Receiver unavailable",
            false
        );

        showError(
            `Receiver connection failed: ${error.message}`
        );
    }
}


/* ---------------------------------------------------------
   Camera errors
   --------------------------------------------------------- */

function getCameraErrorMessage(error) {

    if (!error) {

        return (
            "Unable to start the camera."
        );
    }

    if (
        error.name ===
        "NotAllowedError"
    ) {

        return (
            "Camera permission was denied. "
            + "Allow camera access and try again."
        );
    }

    if (
        error.name ===
        "NotFoundError"
    ) {

        return (
            "No camera was found."
        );
    }

    if (
        error.name ===
        "NotReadableError"
    ) {

        return (
            "The camera is already being used "
            + "by another application."
        );
    }

    if (
        error.name ===
        "SecurityError"
    ) {

        return (
            "Camera access requires HTTPS."
        );
    }

    return (
        `Camera error: ${error.message || error.name}`
    );
}


/* ---------------------------------------------------------
   Stop camera
   --------------------------------------------------------- */

function stopCamera() {

    scanning =
        false;

    if (
        scanAnimationFrame !== null
    ) {

        cancelAnimationFrame(
            scanAnimationFrame
        );

        scanAnimationFrame =
            null;
    }

    if (stream) {

        for (
            const track
            of stream.getTracks()
        ) {

            track.stop();
        }

        stream =
            null;
    }

    if (camera) {

        camera.srcObject =
            null;
    }

    if (startCameraButton) {

        startCameraButton.disabled =
            false;
    }

    if (stopCameraButton) {

        stopCameraButton.disabled =
            true;
    }

    if (cameraMessage) {

        cameraMessage.textContent =
            "Camera stopped";
    }
}


/* ---------------------------------------------------------
   QR scanning
   --------------------------------------------------------- */

function scanLoop() {

    if (!scanning) {
        return;
    }

    if (
        !camera.videoWidth ||
        !camera.videoHeight
    ) {

        scanAnimationFrame =
            requestAnimationFrame(
                scanLoop
            );

        return;
    }

    if (
        !canvas ||
        !canvasContext
    ) {

        canvas =
            document.createElement(
                "canvas"
            );

        canvas.width =
            camera.videoWidth;

        canvas.height =
            camera.videoHeight;

        canvasContext =
            canvas.getContext(
                "2d",
                {
                    willReadFrequently: true
                }
            );
    }

    canvasContext.drawImage(
        camera,
        0,
        0,
        canvas.width,
        canvas.height
    );

    const imageData =
        canvasContext.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
        );

    let result =
        null;

    try {

        result =
            window.jsQR(
                imageData.data,
                imageData.width,
                imageData.height,
                {
                    /*
                     * Sender QR is black on white.
                     * dontInvert is faster and avoids
                     * wasting processing on inverted frames.
                     */

                    inversionAttempts:
                        "dontInvert"
                }
            );

    } catch (error) {

        console.error(
            "jsQR scan error:",
            error
        );
    }

    if (result) {

        handleQRCode(
            result
        );
    }

    scanAnimationFrame =
        requestAnimationFrame(
            scanLoop
        );
}


/* ---------------------------------------------------------
   RAW QR BYTE EXTRACTION
   --------------------------------------------------------- */

/*
 * THIS IS THE IMPORTANT FIX.
 *
 * Sender:
 *
 *   Uint8Array
 *       ↓
 *   QR byte mode
 *
 * jsQR:
 *
 *   QR image
 *       ↓
 *   binaryData
 *
 * Therefore:
 *
 *   result.binaryData
 *
 * is used directly.
 *
 * We do NOT use result.data.
 */

function qrResultToBytes(result) {

    if (!result) {
        return null;
    }

    if (
        result.binaryData &&
        result.binaryData.length > 0
    ) {

        return new Uint8Array(
            result.binaryData
        );
    }

    /*
     * Fallback for unusual decoder builds.
     *
     * This should not normally be needed.
     */

    if (
        typeof result.data ===
        "string" &&
        result.data.length > 0
    ) {

        const bytes =
            new Uint8Array(
                result.data.length
            );

        for (
            let i = 0;
            i < result.data.length;
            i++
        ) {

            bytes[i] =
                result.data.charCodeAt(i) &
                0xff;
        }

        return bytes;
    }

    return null;
}


/* ---------------------------------------------------------
   Payload fingerprint
   --------------------------------------------------------- */

function payloadFingerprint(bytes) {

    let hash =
        2166136261;

    for (
        let i = 0;
        i < bytes.length;
        i++
    ) {

        hash ^=
            bytes[i];

        hash +=
            (hash << 1) +
            (hash << 4) +
            (hash << 7) +
            (hash << 8) +
            (hash << 24);
    }

    return (
        hash >>> 0
    ).toString(16);
}


/* ---------------------------------------------------------
   Process decoded QR
   --------------------------------------------------------- */

async function handleQRCode(result) {

    const bytes =
        qrResultToBytes(
            result
        );

    if (
        !bytes ||
        bytes.length === 0
    ) {

        return;
    }

    /*
     * Useful diagnostic.
     *
     * Protocol V1:
     *
     * 0x00 = METADATA
     * 0x01 = DATA
     * 0x02 = END
     */

    const frameType =
        bytes[0];

    if (
        frameType !== 0x00 &&
        frameType !== 0x01 &&
        frameType !== 0x02
    ) {

        console.warn(
            "QR decoded, but unknown protocol byte:",
            frameType,
            "length:",
            bytes.length
        );

        return;
    }

    const fingerprint =
        payloadFingerprint(
            bytes
        );

    const now =
        performance.now();

    if (
        fingerprint ===
            lastPayloadKey &&
        now - lastPayloadTime <
            DUPLICATE_SCAN_INTERVAL
    ) {

        return;
    }

    lastPayloadKey =
        fingerprint;

    lastPayloadTime =
        now;

    cameraMessage.textContent =
        `QR detected — frame ${bytes.length} bytes`;

    await sendFrame(
        bytes
    );
}


/* ---------------------------------------------------------
   Send frame to Python Receiver
   --------------------------------------------------------- */

async function sendFrame(bytes) {

    try {

        const response =
            await fetch(
                `${getServerUrl()}/frame`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/octet-stream"
                    },

                    body: bytes,

                    cache: "no-store"
                }
            );

        const result =
            await response.json();

        if (!response.ok) {

            throw new Error(
                result.error ||
                `HTTP ${response.status}`
            );
        }

        applyFrameResult(
            result
        );

        cameraMessage.textContent =
            "QR frame received";

    } catch (error) {

        showError(
            `Frame send failed: ${error.message}`
        );

        cameraMessage.textContent =
            "Frame transmission error";
    }
}


/* ---------------------------------------------------------
   Frame result
   --------------------------------------------------------- */

function applyFrameResult(result) {

    if (!result) {
        return;
    }

    if (
        result.type ===
        "METADATA"
    ) {

        sessionIdElement.textContent =
            result.session_id ?? "—";

        fileNameElement.textContent =
            result.filename ?? "—";

        updateProgress(
            0,
            result.total_frames
        );

        duplicateCountElement.textContent =
            "0";

        setTransferStatus(
            "Metadata received",
            "receiving"
        );

        return;
    }


    if (
        result.type ===
        "DATA"
    ) {

        if (
            result.session_id !==
            undefined
        ) {

            sessionIdElement.textContent =
                result.session_id;
        }

        updateProgress(
            result.received_frames,
            result.total_frames
        );

        duplicateCountElement.textContent =
            result.duplicate_frames ?? 0;

        setTransferStatus(
            result.complete
                ? "All data frames received"
                : "Receiving data...",
            "receiving"
        );

        return;
    }


    if (
        result.type ===
            "END" &&
        result.complete
    ) {

        showCompletion(
            result
        );
    }
}


/* ---------------------------------------------------------
   Status
   --------------------------------------------------------- */

function applyStatus(status) {

    if (!status) {
        return;
    }

    if (
        status.session_id !==
            undefined &&
        status.session_id !==
            null
    ) {

        sessionIdElement.textContent =
            status.session_id;
    }

    if (status.filename) {

        fileNameElement.textContent =
            status.filename;
    }

    updateProgress(
        status.received_frames,
        status.total_frames
    );

    duplicateCountElement.textContent =
        status.duplicate_frames ?? 0;

    if (
        status.completed
    ) {

        showCompletion(
            status
        );

    } else if (
        status.session_active
    ) {

        setTransferStatus(
            "Receiving...",
            "receiving"
        );
    }
}


/* ---------------------------------------------------------
   Completion
   --------------------------------------------------------- */

function showCompletion(result) {

    if (resultCard) {

        resultCard.classList.remove(
            "hidden"
        );
    }

    if (resultFileName) {

        resultFileName.textContent =
            result.filename ||
            fileNameElement.textContent ||
            "received_file";
    }

    if (verificationStatus) {

        verificationStatus.textContent =
            result.verified
                ? "✓ VERIFIED"
                : "Verification pending";
    }

    setTransferStatus(
        result.verified
            ? "Transfer complete — SHA-256 verified"
            : "Transfer complete",
        result.verified
            ? "complete"
            : "waiting"
    );

    /*
     * Download endpoint will be enabled
     * in the next Receiver step.
     */

    if (downloadButton) {

        downloadButton.classList.add(
            "hidden"
        );
    }
}


/* ---------------------------------------------------------
   Status polling
   --------------------------------------------------------- */

function startStatusPolling() {

    if (
        statusTimer !== null
    ) {

        return;
    }

    statusTimer =
        window.setInterval(
            refreshStatus,
            1000
        );
}


async function refreshStatus() {

    try {

        const response =
            await fetch(
                `${getServerUrl()}/status`,
                {
                    method: "GET",
                    cache: "no-store"
                }
            );

        if (!response.ok) {

            return;
        }

        const status =
            await response.json();

        applyStatus(
            status
        );

        setConnectionStatus(
            "Receiver connected",
            true
        );

    } catch {

        setConnectionStatus(
            "Receiver unavailable",
            false
        );
    }
}


/* ---------------------------------------------------------
   Reset
   --------------------------------------------------------- */

async function resetReceiver() {

    clearError();

    try {

        const response =
            await fetch(
                `${getServerUrl()}/reset`,
                {
                    method: "POST"
                }
            );

        const result =
            await response.json();

        if (!response.ok) {

            throw new Error(
                result.error ||
                `HTTP ${response.status}`
            );
        }

        sessionIdElement.textContent =
            "—";

        fileNameElement.textContent =
            "—";

        frameCountElement.textContent =
            "0 / 0";

        duplicateCountElement.textContent =
            "0";

        progressElement.style.width =
            "0%";

        progressText.textContent =
            "0%";

        resultCard.classList.add(
            "hidden"
        );

        lastPayloadKey =
            null;

        lastPayloadTime =
            0;

        setTransferStatus(
            "Waiting for transmission",
            "waiting"
        );

        cameraMessage.textContent =
            scanning
                ? "Scanning for QR codes..."
                : "Camera not started";

    } catch (error) {

        showError(
            `Reset failed: ${error.message}`
        );
    }
}


/* ---------------------------------------------------------
   Events
   --------------------------------------------------------- */

startCameraButton.addEventListener(
    "click",
    startCamera
);

stopCameraButton.addEventListener(
    "click",
    stopCamera
);

resetButton.addEventListener(
    "click",
    resetReceiver
);


/* ---------------------------------------------------------
   Initial state
   --------------------------------------------------------- */

setTransferStatus(
    "Waiting for transmission",
    "waiting"
);

setConnectionStatus(
    "Receiver ready",
    true
);

cameraMessage.textContent =
    "Camera not started";