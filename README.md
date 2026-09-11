# Blink-QR File Transfer

A deliberately over-engineered file transfer system that sends files through a sequence of QR codes.

This project is being developed for **TinkerHub Useless Project 3.0**.

The idea is simple:

> Turn a file into data → split it into chunks → add error correction → display as multiple QR codes → scan the QR codes → reconstruct the original file.

The unnecessary part:

> The final transfer in "Private" mode will use an encryption key derived from an **eye-blinking pattern**.

## 🏗️ Project Concept & Architecture

The transmission pipeline is being built in strict, modular phases to ensure high performance and cross-language compatibility (JavaScript Sender, Python Receiver).

### Sender Pipeline (Current Focus)

1. **Phase 1 (Input):** Extract raw binary `Uint8Array` from the selected file.
2. **Phase 2 (Understand):** Generate SHA-256 hash for integrity and apply smart GZIP compression only if beneficial.
3. **Phase 3 (Coding):** Apply a custom-built Reed-Solomon GF(2^8) engine for error correction (surviving dropped QR frames).
4. **Phase 4 (Chunking):** Slice data into < 255-byte symbols (200 bytes data + 30 bytes RS parity).
5. **Phase 5 (Protocol):** _[Pending]_ Wrap symbols in Protocol V1 headers.
6. **Phase 6 (QR Generation):** _[Pending]_ Render bytes into visual QR canvases.
7. **Phase 7 (Transmission):** _[Pending]_ Playback QR codes at a controlled FPS.

### Future Receiver Pipeline

- Fast QR detection and decoding via OpenCV (Python).
- Protocol parsing and Session validation.
- Reed-Solomon decoding and missing frame recovery.
- Decompression (if applicable).
- SHA-256 verification against the reconstructed file.

## 📂 Project Structure

```text
useless_project_3.0/
├── index.html              # Main UI shell
├── style.css               # Styling and theme
├── src/
│   ├── app.js              # UI state and pipeline orchestration
│   ├── FileProcessor.js    # Binary extraction, Hashing, Compression
│   ├── CodingEngine.js     # Reed-Solomon GF(2^8) Implementation
│   └── SymbolCreator.js    # Async chunking and parity generation
└── README.md
```
