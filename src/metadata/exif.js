function getAsciiString(view, offset, length) {
  return decodeBytes(new Uint8Array(view.buffer, view.byteOffset + offset, length), "ascii");
}

function decodeExifValue(bytes) {
  const prefix = getAsciiString(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), 0, Math.min(8, bytes.length));
  if (prefix.startsWith("ASCII")) {
    return decodeBytes(bytes.slice(8)).replace(/\0+$/g, "").trim();
  }
  return decodeBytes(bytes).replace(/\0+$/g, "").trim();
}

function parseExifBuffer(bytes) {
  let offsetBase = 0;
  if (bytes.length >= 6 && decodeBytes(bytes.slice(0, 6), "ascii") === "Exif\u0000\u0000") {
    offsetBase = 6;
  }
  if (bytes.byteLength - offsetBase < 8) {
    return {};
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset + offsetBase, bytes.byteLength - offsetBase);
  const canRead = (offset, length) => offset >= 0 && length >= 0 && offset + length <= view.byteLength;
  const littleEndian = getAsciiString(view, 0, 2) === "II";
  const getUint16 = (offset) => (canRead(offset, 2) ? view.getUint16(offset, littleEndian) : null);
  const getUint32 = (offset) => (canRead(offset, 4) ? view.getUint32(offset, littleEndian) : null);

  const getEntryRawBytes = (entryOffset, type, count) => {
    if (!canRead(entryOffset, 12)) {
      return null;
    }
    const valueOffset = entryOffset + 8;
    const typeSize = { 1: 1, 2: 1, 3: 2, 4: 4, 7: 1 }[type] || 1;
    const byteCount = count * typeSize;
    if (!Number.isFinite(byteCount) || byteCount < 0) {
      return null;
    }
    const dataOffset = byteCount <= 4 ? valueOffset : getUint32(entryOffset + 8);
    if (dataOffset === null || !canRead(dataOffset, byteCount)) {
      return null;
    }
    return new Uint8Array(view.buffer, view.byteOffset + dataOffset, byteCount);
  };

  const readIfd = (offset, store) => {
    if (offset <= 0 || !canRead(offset, 2)) {
      return 0;
    }
    const entries = getUint16(offset);
    if (entries === null) {
      return 0;
    }
    for (let index = 0; index < entries; index += 1) {
      const entryOffset = offset + 2 + index * 12;
      if (!canRead(entryOffset, 12)) {
        break;
      }
      const tag = getUint16(entryOffset);
      const type = getUint16(entryOffset + 2);
      const count = getUint32(entryOffset + 4);
      if (tag === null || type === null || count === null) {
        continue;
      }
      const bytesValue = getEntryRawBytes(entryOffset, type, count);
      if (!bytesValue) {
        continue;
      }

      if (tag === 0x8769 || tag === 0x8825) {
        const nestedOffset = getUint32(entryOffset + 8);
        if (nestedOffset !== null) {
          store[tag] = nestedOffset;
        }
        continue;
      }

      if (type === 4 && count === 1) {
        const value = getUint32(entryOffset + 8);
        if (value !== null) {
          store[tag] = String(value);
        }
        continue;
      }

      if (type === 3 && count === 1) {
        const value = getUint16(entryOffset + 8);
        if (value !== null) {
          store[tag] = String(value);
        }
        continue;
      }

      store[tag] = decodeExifValue(bytesValue);
    }

    const nextIfdOffset = offset + 2 + entries * 12;
    if (nextIfdOffset + 4 <= view.byteLength) {
      return getUint32(nextIfdOffset);
    }
    return 0;
  };

  if (getUint16(2) !== 42) {
    return {};
  }

  const tags = {};
  const firstIfd = getUint32(4);
  if (firstIfd === null) {
    return {};
  }
  const nextIfd = readIfd(firstIfd, tags);
  if (tags[0x8769]) {
    readIfd(tags[0x8769], tags);
  }
  if (nextIfd) {
    readIfd(nextIfd, tags);
  }
  return tags;
}

function parseJpegMetadata(bytes) {
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      break;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) {
      break;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) {
      break;
    }
    const data = bytes.slice(offset + 4, offset + 2 + length);
    if (marker === 0xe1) {
      const tags = parseExifBuffer(data);
      const parameterText = tags[0x9286] || tags[0x010e] || "";
      if (parameterText && /\bSteps:\s*/.test(parameterText)) {
        return parseSdParameters(parameterText);
      }
    }
    offset += 2 + length;
  }

  return emptyMetadata();
}

function parseWebpMetadata(bytes) {
  let offset = 12;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (offset + 8 <= bytes.length) {
    const chunkType = decodeBytes(bytes.slice(offset, offset + 4), "ascii");
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataStart = offset + 8;
    const chunkDataEnd = chunkDataStart + chunkSize;
    if (chunkSize < 0 || chunkDataEnd > bytes.length || chunkDataEnd <= offset) {
      break;
    }
    const chunkData = bytes.slice(chunkDataStart, chunkDataEnd);

    if (chunkType === "EXIF") {
      const tags = parseExifBuffer(chunkData);
      const parameterText = tags[0x9286] || tags[0x010e] || "";
      if (parameterText && /\bSteps:\s*/.test(parameterText)) {
        return parseSdParameters(parameterText);
      }
    }
    offset = chunkDataEnd + (chunkSize % 2);
  }

  return emptyMetadata();
}
