/* ZIP32 source archives and playable downloads. Writes stored entries; reads stored and DEFLATE. */
(function (root) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const LIMIT = 500 * 1024 * 1024;
  const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
    for (let j = 0; j < 8; j++) i = (i >>> 1) ^ (i & 1 ? 0xedb88320 : 0);
    return i;
  });
  function crc32(bytes) {
    let crc = -1;
    for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    return (crc ^ -1) >>> 0;
  }
  function header(size, signature) {
    const view = new DataView(new ArrayBuffer(size));
    view.setUint32(0, signature, true);
    return view;
  }
  async function write(entries) {
    const files = [], directory = [];
    let offset = 0, centralSize = 0;
    if (entries.size > 65534) throw new Error('Too many ZIP entries');
    for (const [path, value] of entries) {
      const data = typeof value === 'string' ? encoder.encode(value) : value;
      const size = data instanceof Blob ? data.size : data.byteLength;
      const name = encoder.encode(path);
      if (name.length > 65535 || offset + size + name.length + 30 > LIMIT) throw new Error('ZIP exceeds the 500 MB export limit');
      let crc = -1;
      if (data instanceof Blob) {
        for await (const chunk of data.stream()) {
          for (const byte of chunk) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
        }
        crc = (crc ^ -1) >>> 0;
      } else crc = crc32(data);
      const local = header(30, 0x04034b50), central = header(46, 0x02014b50);
      const u16 = (view, at, n) => view.setUint16(at, n, true);
      const u32 = (view, at, n) => view.setUint32(at, n, true);
      u16(local, 4, 20); u16(central, 4, 20); u16(central, 6, 20);
      u16(local, 6, 0x800); u16(central, 8, 0x800);
      u16(local, 12, 33); u16(central, 14, 33);
      u32(local, 14, crc); u32(central, 16, crc);
      u32(local, 18, size); u32(local, 22, size);
      u32(central, 20, size); u32(central, 24, size);
      u16(local, 26, name.length); u16(central, 28, name.length);
      u32(central, 42, offset);
      files.push(local.buffer, name, data);
      directory.push(central.buffer, name);
      offset += 30 + name.length + size;
      centralSize += 46 + name.length;
    }
    const end = header(22, 0x06054b50);
    if (offset + centralSize + 22 > LIMIT) throw new Error('ZIP exceeds the 500 MB export limit');
    end.setUint16(8, entries.size, true); end.setUint16(10, entries.size, true);
    end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
    return new Blob([...files, ...directory, end.buffer], { type: 'application/zip' });
  }

  async function read(file, accept) {
    if (file.size > LIMIT) throw new Error('Source archive exceeds the 500 MB import limit');
    const tail = new DataView(await file.slice(Math.max(0, file.size - 65557)).arrayBuffer());
    const invalid = () => new Error('Invalid or unsupported ZIP archive');
    let end = tail.byteLength - 22;
    while (end >= 0 && (tail.getUint32(end, true) !== 0x06054b50 || end + 22 + tail.getUint16(end + 20, true) !== tail.byteLength)) end--;
    if (end < 0 || tail.getUint32(end + 4, true) !== 0) throw invalid();
    const count = tail.getUint16(end + 10, true);
    const offset = tail.getUint32(end + 16, true);
    const size = tail.getUint32(end + 12, true);
    if (count !== tail.getUint16(end + 8, true) ||
        offset + size !== file.size - tail.byteLength + end || size > 16 * 1024 * 1024) throw invalid();
    const central = new DataView(await file.slice(offset, offset + size).arrayBuffer());
    const entries = new Map();
    let at = 0, expanded = 0;
    for (let i = 0; i < count; i++) {
      if (at + 46 > size || central.getUint32(at, true) !== 0x02014b50) throw invalid();
      const u16 = n => central.getUint16(at + n, true);
      const u32 = n => central.getUint32(at + n, true);
      const nameLength = u16(28), next = at + 46 + nameLength + u16(30) + u16(32);
      if (next > size) throw invalid();
      const name = decoder.decode(new Uint8Array(central.buffer, at + 46, nameLength));
      const method = u16(10), packed = u32(20), unpacked = u32(24), crc = u32(16), localAt = u32(42);
      const encrypted = u16(8) & 1;
      at = next;
      if (!accept(name)) continue;
      expanded += unpacked;
      if (expanded > LIMIT) throw new Error('Source archive expands beyond the 500 MB import limit');
      if (entries.has(name) || encrypted || ![0, 8].includes(method) || localAt + 30 > offset) throw invalid();
      const local = new DataView(await file.slice(localAt, localAt + 30).arrayBuffer());
      if (local.getUint32(0, true) !== 0x04034b50) throw invalid();
      const start = localAt + 30 + local.getUint16(26, true) + local.getUint16(28, true);
      if (start + packed > offset || (method === 0 && packed !== unpacked)) throw invalid();
      const payload = file.slice(start, start + packed);
      let bytes;
      if (method === 0) bytes = new Uint8Array(await payload.arrayBuffer());
      else {
        bytes = new Uint8Array(unpacked);
        const reader = payload.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
        let position = 0;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (position + value.length > unpacked) throw invalid();
            bytes.set(value, position);
            position += value.length;
          }
          if (position !== unpacked) throw invalid();
        } catch (error) {
          await reader.cancel().catch(() => {});
          throw error;
        } finally {
          reader.releaseLock();
        }
      }
      if (crc32(bytes) !== crc) throw invalid();
      entries.set(name, new Blob([bytes]));
    }
    if (at !== size) throw invalid();
    return entries;
  }
  const api = { write, read };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VNFairyZip = api;
})(globalThis);
