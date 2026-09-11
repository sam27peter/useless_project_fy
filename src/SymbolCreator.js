/**
 * PHASE 4: CREATE CHUNKS / SYMBOLS
 * Slices the prepared file into uniform blocks and passes them through the coding engine.
 * Optimized to yield to the main thread to prevent UI freezing on large files.
 */
export class SymbolCreator {
    /**
     * @param {Uint8Array} preparedBytes The compressed/hashed file bytes
     * @param {CodingEngine} codingEngine The ReedSolomon engine instance
     * @param {number} dataChunkSize The size of the source symbol (must be < 255 - eccSymbols)
     * @param {Function} progressCallback Optional callback to report progress (0.0 to 1.0)
     * @returns {Promise<Object>} A collection of all transmission symbols
     */
    static async createSymbols(preparedBytes, codingEngine, dataChunkSize = 200, progressCallback = null) {
        const symbols = [];
        const totalBytes = preparedBytes.length;
        const totalExpectedSymbols = Math.ceil(totalBytes / dataChunkSize);
        
        let offset = 0;
        let symbolId = 0;

        while (offset < totalBytes) {
            // Extract a slice of the file
            let slice = preparedBytes.slice(offset, offset + dataChunkSize);

            // Pad the last chunk with zeros if it's smaller than dataChunkSize
            if (slice.length < dataChunkSize) {
                const padded = new Uint8Array(dataChunkSize);
                padded.set(slice);
                slice = padded;
            }

            // Encode the chunk (Data + Parity)
            const encodedSymbol = codingEngine.encodeChunk(slice);

            symbols.push({
                symbolId: symbolId,
                data: encodedSymbol
            });

            offset += dataChunkSize;
            symbolId++;

            // Yield to the main thread every 100 chunks to prevent UI freezing
            if (symbolId % 100 === 0) {
                if (progressCallback) progressCallback(symbolId / totalExpectedSymbols);
                await new Promise(resolve => setTimeout(resolve, 0)); 
            }
        }

        if (progressCallback) progressCallback(1.0);

        return {
            sourceSymbolSize: dataChunkSize,
            eccSymbols: codingEngine.eccSymbols,
            totalSymbolSize: dataChunkSize + codingEngine.eccSymbols,
            totalSymbols: symbols.length,
            symbols: symbols
        };
    }
}