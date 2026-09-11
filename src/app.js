import { FileProcessor } from './FileProcessor.js';
import { ReedSolomonCoding } from './CodingEngine.js';
import { SymbolCreator } from './SymbolCreator.js';

const homePage = document.getElementById("homePage");
const sendPage = document.getElementById("sendPage");
const receivePage = document.getElementById("receivePage");

const sendButton = document.getElementById("sendButton");
const receiveButton = document.getElementById("receiveButton");
const sendBack = document.getElementById("sendBack");
const receiveBack = document.getElementById("receiveBack");

function showPage(page) {
    homePage.classList.remove("active");
    sendPage.classList.remove("active");
    receivePage.classList.remove("active");
    page.classList.add("active");
    window.scrollTo(0, 0);
}

sendButton.addEventListener("click", () => showPage(sendPage));
receiveButton.addEventListener("click", () => showPage(receivePage));
sendBack.addEventListener("click", () => showPage(homePage));
receiveBack.addEventListener("click", () => showPage(homePage));

/* ================= FILE INPUT ================= */
const fileInput = document.getElementById("fileInput");
const uploadBox = document.getElementById("uploadBox");
const fileInfo = document.getElementById("fileInfo");
const fileName = document.getElementById("fileName");
const fileSize = document.getElementById("fileSize");
const removeFile = document.getElementById("removeFile");
const prepareButton = document.getElementById("prepareButton");
const transmissionSettings = document.getElementById("transmissionSettings");
const statusText = document.getElementById("statusText");

let currentFile = null;

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;

    currentFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);

    fileInfo.classList.remove("hidden");
    transmissionSettings.classList.remove("hidden");
    prepareButton.disabled = false;
    prepareButton.classList.remove("disabled");
    uploadBox.classList.add("has-file");
    
    statusText.style.color = "var(--muted)";
    statusText.textContent = "Ready to prepare transmission.";
});

removeFile.addEventListener("click", () => {
    fileInput.value = "";
    currentFile = null;
    
    fileInfo.classList.add("hidden");
    transmissionSettings.classList.add("hidden");
    prepareButton.disabled = true;
    prepareButton.classList.add("disabled");
    uploadBox.classList.remove("has-file");
    statusText.style.color = "var(--muted)";
    statusText.textContent = "Select a file to process.";
});

/* ================= PIPELINE EXECUTION ================= */
prepareButton.addEventListener("click", async () => {
    if (!currentFile) return;

    const selectedMode = document.querySelector('input[name="transferMode"]:checked').value;
    
    prepareButton.disabled = true;
    prepareButton.textContent = "Processing Pipeline...";
    statusText.style.color = "var(--accent-light)";
    statusText.textContent = `Running Phase 1 & 2...`;

    try {
        // --- PHASE 1 & 2 Execution ---
        const preparedFile = await FileProcessor.prepareForTransmission(currentFile);
        
        // --- PHASE 3 Setup ---
        const codingEngine = new ReedSolomonCoding(30); 
        
        // --- PHASE 4 Execution (Async with UI Updates) ---
        statusText.textContent = `Encoding Reed-Solomon blocks: 0%`;
        
        const symbolStream = await SymbolCreator.createSymbols(
            preparedFile.preparedBytes, 
            codingEngine, 
            200, 
            (progress) => {
                // Live UI update callback
                const percentage = Math.floor(progress * 100);
                statusText.textContent = `Encoding Reed-Solomon blocks: ${percentage}%`;
            }
        );

        console.log(`\n=== PHASE 4 COMPLETE ===`);
        console.log(`Original File Size: ${preparedFile.originalSize} bytes`);
        console.log(`Prepared File Size: ${preparedFile.preparedSize} bytes`);
        console.log(`Total Symbols Generated: ${symbolStream.totalSymbols}`);
        
        statusText.style.color = "var(--success)";
        statusText.innerHTML = `
            <strong>Phase 4 Complete!</strong><br>
            File split into ${symbolStream.totalSymbols} transmission symbols.<br>
            Each symbol is ${symbolStream.totalSymbolSize} bytes (Data + RS Parity).
        `;
        prepareButton.textContent = "Phase 4 Done ✓";
        
    } catch (error) {
        console.error("Transmission preparation failed:", error);
        statusText.style.color = "#ef4444";
        statusText.textContent = "Error during pipeline. Check console.";
        prepareButton.disabled = false;
        prepareButton.textContent = "Prepare Transmission →";
    }
});