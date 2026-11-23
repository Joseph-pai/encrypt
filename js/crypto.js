// AES-256 加解密核心模組（純前端，使用瀏覽器 Web Crypto API）
// 密碼與明文永遠只在本機瀏覽器處理，不會上傳到伺服器。
(function (global) {
  "use strict";

  const MAGIC = "AES256";
  const VERSION = 1;
  const FLAG_FOLDER = 0x01;
  const CHUNK_SIZE = 16 * 1024 * 1024; // 16 MiB，超大檔案分段處理
  const ITERATIONS = 310000;            // PBKDF2 迭代次數（OWASP 建議）
  const HEADER_FIXED_LEN = 54;          // 6+1+1+16+12+4+4+8+2

  const te = new TextEncoder();
  const td = new TextDecoder();

  // 從密碼 + Salt 衍生出 AES-256 金鑰
  async function deriveKey(password, salt) {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      te.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: ITERATIONS, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  // 以 BaseIV + 分段序號產生唯一的 nonce（低 32 位元遞增計數）
  function buildNonce(baseIV, index) {
    const nonce = new Uint8Array(baseIV);
    const dv = new DataView(nonce.buffer);
    const low = dv.getUint32(8, false);
    dv.setUint32(8, (low + index) >>> 0, false);
    return nonce;
  }

  function buildHeader(opts) {
    const nameBytes = te.encode(opts.name);
    const buf = new Uint8Array(HEADER_FIXED_LEN + nameBytes.length);
    const dv = new DataView(buf.buffer);

    for (let i = 0; i < MAGIC.length; i++) buf[i] = MAGIC.charCodeAt(i);
    buf[6] = VERSION;
    buf[7] = opts.isFolder ? FLAG_FOLDER : 0;
    buf.set(opts.salt, 8);
    buf.set(opts.baseIV, 24);
    dv.setUint32(36, opts.chunkSize, true);
    dv.setUint32(40, opts.chunkCount, true);
    dv.setBigUint64(44, BigInt(opts.totalSize), true);
    dv.setUint16(52, nameBytes.length, true);
    buf.set(nameBytes, 54);
    return buf;
  }

  function parseHeader(buf) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (td.decode(buf.subarray(0, 6)) !== MAGIC) {
      throw new Error("不是有效的 .aes 加密檔");
    }
    if (buf[6] !== VERSION) {
      throw new Error("不支援的檔案版本");
    }
    return {
      isFolder: (buf[7] & FLAG_FOLDER) !== 0,
      salt: buf.slice(8, 24),
      baseIV: buf.slice(24, 36),
      chunkSize: dv.getUint32(36, true),
      chunkCount: dv.getUint32(40, true),
      totalSize: Number(dv.getBigUint64(44, true)),
      nameLen: dv.getUint16(52, true)
    };
  }

  // 分段加密核心：getChunk 回傳每個分段的明文
  async function encryptSource(getChunk, totalSize, password, opts) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const baseIV = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const chunkCount = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE));

    const header = buildHeader({
      salt: salt,
      baseIV: baseIV,
      chunkSize: CHUNK_SIZE,
      chunkCount: chunkCount,
      totalSize: totalSize,
      isFolder: !!opts.isFolder,
      name: opts.name || "encrypted"
    });

    const parts = [header];
    for (let i = 0; i < chunkCount; i++) {
      const plain = await getChunk(i);
      const nonce = buildNonce(baseIV, i);
      const cipher = new Uint8Array(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: nonce, tagLength: 128 },
          key,
          plain
        )
      );
      const lenBuf = new Uint8Array(4);
      new DataView(lenBuf.buffer).setUint32(0, cipher.length, true);
      parts.push(nonce, lenBuf, cipher);

      if (opts.onProgress) {
        opts.onProgress(Math.min(totalSize, (i + 1) * CHUNK_SIZE), totalSize);
      }
    }
    return new Blob(parts, { type: "application/octet-stream" });
  }

  // 加密單一檔案（直接以 File.slice 分段，避免整檔載入記憶體）
  async function encryptFile(file, password, opts) {
    const totalSize = file.size;
    const getChunk = async (i) => {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalSize);
      return new Uint8Array(await file.slice(start, end).arrayBuffer());
    };
    return encryptSource(getChunk, totalSize, password, {
      name: file.name,
      isFolder: false,
      onProgress: opts && opts.onProgress
    });
  }

  // 加密記憶體中的位元組（用於資料夾打包後的 ZIP）
  async function encryptBytes(bytes, password, opts) {
    const totalSize = bytes.byteLength;
    const getChunk = async (i) => {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalSize);
      return bytes.subarray(start, end);
    };
    return encryptSource(getChunk, totalSize, password, {
      name: opts.name,
      isFolder: opts.isFolder,
      onProgress: opts.onProgress
    });
  }

  // 解密：分段讀取密文、解密並組合成 Blob
  async function decryptBlob(blob, password, opts) {
    const fixed = new Uint8Array(
      await blob.slice(0, HEADER_FIXED_LEN).arrayBuffer()
    );
    const h = parseHeader(fixed);

    const nameBytes = new Uint8Array(
      await blob.slice(HEADER_FIXED_LEN, HEADER_FIXED_LEN + h.nameLen).arrayBuffer()
    );
    const originalName = td.decode(nameBytes);

    const key = await deriveKey(password, h.salt);
    const parts = [];
    let offset = HEADER_FIXED_LEN + h.nameLen;

    for (let i = 0; i < h.chunkCount; i++) {
      const head = new Uint8Array(await blob.slice(offset, offset + 16).arrayBuffer());
      const nonce = head.slice(0, 12);
      const cipherLen = new DataView(
        head.buffer, head.byteOffset + 12, 4
      ).getUint32(0, true);
      offset += 16;

      const cipher = new Uint8Array(
        await blob.slice(offset, offset + cipherLen).arrayBuffer()
      );
      offset += cipherLen;

      const plain = new Uint8Array(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: nonce, tagLength: 128 },
          key,
          cipher
        )
      );
      parts.push(plain);

      if (opts && opts.onProgress) {
        opts.onProgress(Math.min(h.totalSize, (i + 1) * h.chunkSize), h.totalSize);
      }
    }

    const resultBlob = new Blob(parts, { type: "application/octet-stream" });
    return {
      blob: resultBlob,
      isFolder: h.isFolder,
      originalName: originalName,
      totalSize: h.totalSize
    };
  }

  global.AESCrypto = {
    CHUNK_SIZE: CHUNK_SIZE,
    ITERATIONS: ITERATIONS,
    encryptFile: encryptFile,
    encryptBytes: encryptBytes,
    decryptBlob: decryptBlob
  };
})(window);
