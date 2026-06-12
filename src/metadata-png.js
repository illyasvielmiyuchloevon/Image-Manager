async function parsePngTextChunks(bytes) {
  const textChunks = {};
  const binaryChunks = [];
  let width = "";
  let height = "";
  let offset = 8;

  while (offset + 8 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
    const length = view.getUint32(0);
    const type = decodeBytes(bytes.slice(offset + 4, offset + 8), "ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > bytes.length) {
      break;
    }
    const chunkData = bytes.slice(dataStart, dataEnd);

    if (type === "IHDR" && chunkData.length >= 8) {
      const ihdr = new DataView(chunkData.buffer, chunkData.byteOffset, chunkData.byteLength);
      width = String(ihdr.getUint32(0));
      height = String(ihdr.getUint32(4));
    }

    if (type === "tEXt") {
      const nullIndex = chunkData.indexOf(0);
      if (nullIndex !== -1) {
        const key = decodeBytes(chunkData.slice(0, nullIndex), "latin1");
        const value = decodeBytes(chunkData.slice(nullIndex + 1));
        textChunks[key] = value;
      }
    }

    if (type === "iTXt") {
      const keyEnd = chunkData.indexOf(0);
      if (keyEnd !== -1) {
        const key = decodeBytes(chunkData.slice(0, keyEnd), "latin1");
        let cursor = keyEnd + 1;
        const compressionFlag = chunkData[cursor];
        cursor += 2;
        while (cursor < chunkData.length && chunkData[cursor] !== 0) {
          cursor += 1;
        }
        cursor += 1;
        while (cursor < chunkData.length && chunkData[cursor] !== 0) {
          cursor += 1;
        }
        cursor += 1;
        const payload = chunkData.slice(cursor);
        const content = compressionFlag === 1 ? await decompressDeflate(payload) : payload;
        textChunks[key] = content ? decodeBytes(content) : "";
      }
    }

    if (type === "zTXt") {
      const keyEnd = chunkData.indexOf(0);
      if (keyEnd !== -1) {
        const key = decodeBytes(chunkData.slice(0, keyEnd), "latin1");
        const compressed = chunkData.slice(keyEnd + 2);
        const content = await decompressDeflate(compressed);
        textChunks[key] = content ? decodeBytes(content) : "";
      }
    }

    if (type !== "IHDR" && type !== "IDAT" && type !== "IEND" && type !== "tEXt" && type !== "iTXt" && type !== "zTXt") {
      binaryChunks.push({
        type,
        offset,
        length,
        data: chunkData,
      });
    }

    if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  return { width, height, textChunks, binaryChunks };
}
