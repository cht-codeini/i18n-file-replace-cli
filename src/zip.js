'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * Minimal zero-dependency ZIP extractor for the files produced by the i18n
 * resource-export endpoint (deflate / stored entries only, which is what
 * System.IO.Compression.ZipArchive produces).
 */

const SIG_EOCD = 0x06054b50;   // End of Central Directory
const SIG_CENTRAL = 0x02014b50; // Central directory file header
const SIG_LOCAL = 0x04034b50;   // Local file header

/**
 * Locates the End of Central Directory record by scanning backwards.
 * @param {Buffer} buf
 * @returns {number} offset of the EOCD record, or -1
 */
function findEndOfCentralDirectory(buf) {
    const min = Math.max(0, buf.length - 66000);
    for (let i = buf.length - 22; i >= min; i--) {
        if (buf.readUInt32LE(i) === SIG_EOCD) return i;
    }
    return -1;
}

/**
 * Guards against path traversal (zip slip).
 * @param {string} name entry name
 * @param {string} outDir target directory
 * @returns {string|null} safe absolute path or null when the entry must be skipped
 */
function safePath(name, outDir) {
    const normalized = name.replace(/\\/g, '/');
    if (path.isAbsolute(normalized) || normalized.split('/').some(seg => seg === '..')) {
        return null;
    }
    const target = path.resolve(outDir, normalized);
    if (!target.startsWith(path.resolve(outDir) + path.sep) && target !== path.resolve(outDir)) {
        return null;
    }
    return target;
}

/**
 * Extracts all file entries from a ZIP buffer into a directory.
 * @param {Buffer} buffer ZIP contents
 * @param {string} outDir destination directory (created if missing)
 * @returns {string[]} names of the extracted files
 */
function extractZip(buffer, outDir) {
    const eocd = findEndOfCentralDirectory(buffer);
    if (eocd < 0) {
        throw new Error('无效的 ZIP 文件：未找到中央目录结束记录');
    }

    const entryCount = buffer.readUInt16LE(eocd + 10);
    let offset = buffer.readUInt32LE(eocd + 16);

    fs.mkdirSync(outDir, { recursive: true });
    const extracted = [];

    for (let n = 0; n < entryCount; n++) {
        if (buffer.readUInt32LE(offset) !== SIG_CENTRAL) break;

        const compressionMethod = buffer.readUInt16LE(offset + 10);
        const compressedSize = buffer.readUInt32LE(offset + 20);
        const nameLen = buffer.readUInt16LE(offset + 28);
        const extraLen = buffer.readUInt16LE(offset + 30);
        const commentLen = buffer.readUInt16LE(offset + 32);
        const localHeaderOffset = buffer.readUInt32LE(offset + 42);
        const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLen);

        // Advance to the next central directory entry
        offset += 46 + nameLen + extraLen + commentLen;

        if (name.endsWith('/')) continue; // directory entry

        // Read the local header to locate the actual data start (its name/extra
        // lengths may differ from the central directory ones).
        if (buffer.readUInt32LE(localHeaderOffset) !== SIG_LOCAL) continue;
        const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
        const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
        const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
        const dataBuf = buffer.subarray(dataStart, dataStart + compressedSize);

        let content;
        if (compressionMethod === 0) {
            content = Buffer.from(dataBuf); // stored
        } else if (compressionMethod === 8) {
            content = zlib.inflateRawSync(dataBuf); // deflate
        } else {
            throw new Error(`不支持的 ZIP 压缩方式 (${compressionMethod})：${name}`);
        }

        const target = safePath(name, outDir);
        if (!target) continue; // skip unsafe entries
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
        extracted.push(name);
    }

    return extracted;
}

module.exports = { extractZip };
