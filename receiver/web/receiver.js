/*
 * =========================================================
 * Useless Project 3.0
 * Receiver Web Interface
 * =========================================================
 *
 * Responsibilities:
 *
 *   Phone camera
 *       ↓
 *   QR decoder
 *       ↓
 *   raw QR bytes
 *       ↓
 *   Python Receiver /frame
 *
 * The Sender is NOT modified.
 * =========================================================
 */


/* ---------------------------------------------------------
   QR decoder library
   --------------------------------------------------------- */

/*
 * jsQR is loaded dynamically so this file does not require
 * npm or package.json.
 */

const JSQR_URL =
    "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";


/* ---------------------------------------------------------
   DOM
   --------------------------------------------------------- */

const serverUrlInput =
    document.getElementById("serverUrl");

const connectButton =
    document.getElementById("connectButton");

const connectionStatus =
    document.getElementById("connectionStatus");

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
 * Do not send the same QR repeatedly while the camera
 * remains on the same frame.
 */

const DUPLICATE_SCAN_INTERVAL = 350;


/* ---------------------------------------------------------
   Helpers
   --------------------------------------------------------- */

function normalizeServerUrl(value) {

    let url = value.trim();

    if (!url) {
        return "";
    }

    return url.replace(/\/+$/, "");
}


function getServerUrl() {

    return normalizeServerUrl(
        serverUrlInput.value
    );
}


function setConnectionStatus(
    message,
    connected
) {

    connectionStatus.textContent = message;

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

    transferStatus.textContent = message;

    transferStatus.className =
        `status ${type}`;
}


function showError(message) {

    errorMessage.textContent = message;

    errorMessage.classList.remove(
        "hidden"
    );
}


function clearError() {

    errorMessage.textContent = "";

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

    progressElement.style.width =
        `${percent}%`;

    progressText.textContent =
        `${percent.toFixed(1)}%`;

    frameCountElement.textContent =
        `${safeReceived} / ${safeTotal}`;
}


/* ---------------------------------------------------------
   Load jsQR
   --------------------------------------------------------- */

function loadJsQR() {

    return new Promise(
        (resolve, reject) => {

            if (
                typeof window.jsQR
                === "function"
            ) {

                jsQRLoaded = true;

                resolve();

                return;
            }

            const script =
                document.createElement(
                    "script"
                );

            script.src = JSQR_URL;

            script.async = true;

            script.onload = () => {

                if (
                    typeof window.jsQR
                    !== "function"
                ) {

                    reject(
                        new Error(
                            "jsQR loaded but was not available."
                        )
                    );

                    return;
                }

                jsQRLoaded = true;

                resolve();
            };

            script.onerror = () => {

                reject(
                    new Error(
                        "Unable to load the QR decoder library."
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
                .getUserMedia({
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
                });

        camera.srcObject = stream;

        await camera.play();

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

        scanning = true;

        startCameraButton.disabled = true;

        stopCameraButton.disabled = false;

        cameraMessage.textContent =
            "Scanning for QR codes...";

        setTransferStatus(
            "Scanning...",
            "receiving"
        );

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


function getCameraErrorMessage(error) {

    if (!error) {
        return "Unable to start the camera.";
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
            "No camera was found on this device."
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
            "The browser blocked camera access. "
            + "Use a secure HTTPS page."
        );
    }

    return (
        `Camera error: ${error.message || error.name}`
    );
}


function stopCamera() {

    scanning = false;

    if (scanAnimationFrame !== null) {

        cancelAnimationFrame(
            scanAnimationFrame
        );

        scanAnimationFrame = null;
    }

    if (stream) {

        for (
            const track
            of stream.getTracks()
        ) {

            track.stop();
        }

        stream = null;
    }

    camera.srcObject = null;

    startCameraButton.disabled = false;

    stopCameraButton.disabled = true;

    cameraMessage.textContent =
        "Camera stopped";
}


/* ---------------------------------------------------------
   QR scanning
   --------------------------------------------------------- */

function scanLoop() {

    if (!scanning) {
        return;
    }

    if (
        !camera.videoWidth
        || !camera.videoHeight
    ) {

        scanAnimationFrame =
            requestAnimationFrame(
                scanLoop
            );

        return;
    }

    if (!canvas) {

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

    const result =
        window.jsQR(
            imageData.data,
            imageData.width,
            imageData.height,
            {
                inversionAttempts:
                    "attemptBoth"
            }
        );

    if (result) {

        handleQRCode(result);
    }

    scanAnimationFrame =
        requestAnimationFrame(
            scanLoop
        );
}


/* ---------------------------------------------------------
   QR payload conversion
   --------------------------------------------------------- */

/*
 * jsQR returns a decoded binary string.
 *
 * QR payloads for this project are binary protocol frames,
 * not ordinary human-readable text.
 *
 * Therefore every JavaScript character is converted into
 * one byte rather than UTF-8 re-encoding it.
 */

function qrStringToBytes(data) {

    const bytes =
        new Uint8Array(
            data.length
        );

    for (
        let i = 0;
        i < data.length;
        i++
    ) {

        bytes[i] =
            data.charCodeAt(i) & 0xff;
    }

    return bytes;
}


function payloadFingerprint(bytes) {

    /*
     * Lightweight duplicate fingerprint.
     * This is only used to avoid sending the same camera
     * frame repeatedly while it is still visible.
     */

    let hash = 2166136261;

    for (
        let i = 0;
        i < bytes.length;
        i++
    ) {

        hash ^= bytes[i];

        hash +=
            (hash << 1)
            + (hash << 4)
            + (hash << 7)
            + (hash << 8)
            + (hash << 24);
    }

    return (
        hash >>> 0
    ).toString(16);
}


/* ---------------------------------------------------------
   Process decoded QR
   --------------------------------------------------------- */

async function handleQRCode(result) {

    if (!result || !result.data) {
        return;
    }

    const bytes =
        qrStringToBytes(
            result.data
        );

    if (!bytes.length) {
        return;
    }

    const fingerprint =
        payloadFingerprint(
            bytes
        );

    const now =
        performance.now();

    if (
        fingerprint === lastPayloadKey
        &&
        now - lastPayloadTime
            < DUPLICATE_SCAN_INTERVAL
    ) {

        return;
    }

    lastPayloadKey =
        fingerprint;

    lastPayloadTime =
        now;

    cameraMessage.textContent =
        "QR detected — sending frame...";

    await sendFrame(bytes);
}


/* ---------------------------------------------------------
   Python Receiver API
   --------------------------------------------------------- */

async function connectToReceiver() {

    clearError();

    const baseUrl =
        getServerUrl();

    if (!baseUrl) {

        showError(
            "Enter the Python Receiver URL first."
        );

        return false;
    }

    try {

        const response =
            await fetch(
                `${baseUrl}/status`,
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
            "Connected to Receiver",
            true
        );

        applyStatus(
            status
        );

        startStatusPolling();

        return true;

    } catch (error) {

        setConnectionStatus(
            "Connection failed",
            false
        );

        showError(
            `Could not connect to Receiver: ${error.message}`
        );

        return false;
    }
}


async function sendFrame(bytes) {

    const baseUrl =
        getServerUrl();

    if (!baseUrl) {

        showError(
            "Connect to the Python Receiver first."
        );

        return;
    }

    try {

        const response =
            await fetch(
                `${baseUrl}/frame`,
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
                result.error
                || `HTTP ${response.status}`
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
   Status handling
   --------------------------------------------------------- */

function applyFrameResult(result) {

    if (!result) {
        return;
    }

    if (result.type === "METADATA") {

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

    if (result.type === "DATA") {

        if (result.session_id !== undefined) {

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
        result.type === "END"
        && result.complete
    ) {

        showCompletion(
            result
        );
    }
}


function applyStatus(status) {

    if (!status) {
        return;
    }

    if (
        status.session_id !== undefined
        && status.session_id !== null
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

    if (status.completed) {

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


function showCompletion(result) {

    resultCard.classList.remove(
        "hidden"
    );

    resultFileName.textContent =
        result.filename
        || fileNameElement.textContent
        || "received_file";

    verificationStatus.textContent =
        result.verified
            ? "✓ VERIFIED"
            : "Verification pending";

    setTransferStatus(
        result.verified
            ? "Transfer complete — SHA-256 verified"
            : "Transfer complete",
        result.verified
            ? "complete"
            : "waiting"
    );

    /*
     * The local Python server's output path is not directly
     * downloadable by the phone browser. The actual download
     * endpoint will be added to the Receiver API later.
     */
    downloadButton.classList.add(
        "hidden"
    );
}


/* ---------------------------------------------------------
   Status polling
   --------------------------------------------------------- */

function startStatusPolling() {

    if (statusTimer !== null) {
        return;
    }

    statusTimer =
        window.setInterval(
            refreshStatus,
            1000
        );
}


async function refreshStatus() {

    const baseUrl =
        getServerUrl();

    if (!baseUrl) {
        return;
    }

    try {

        const response =
            await fetch(
                `${baseUrl}/status`,
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
            "Connected to Receiver",
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

    const baseUrl =
        getServerUrl();

    if (!baseUrl) {

        showError(
            "Connect to the Python Receiver first."
        );

        return;
    }

    try {

        const response =
            await fetch(
                `${baseUrl}/reset`,
                {
                    method: "POST"
                }
            );

        const result =
            await response.json();

        if (!response.ok) {

            throw new Error(
                result.error
                || `HTTP ${response.status}`
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

        lastPayloadKey = null;

        lastPayloadTime = 0;

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

connectButton.addEventListener(
    "click",
    connectToReceiver
);

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

serverUrlInput.addEventListener(
    "keydown",
    (event) => {

        if (event.key === "Enter") {

            connectToReceiver();
        }
    }
);


/* ---------------------------------------------------------
   Initial state
   --------------------------------------------------------- */

setTransferStatus(
    "Waiting for transmission",
    "waiting"
);

setConnectionStatus(
    "Not connected",
    false
);

cameraMessage.textContent =
    "Camera not started";