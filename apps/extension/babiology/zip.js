/* Minimal ZIP writer (STORE method, no compression) - no external deps.
   Usage: const z = new FdeZip(); z.add('a/b.txt', blobOrUint8Array|string); const blob = await z.build(); */
(() => {
  const CRC_TABLE = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
  function crc32(u8, crc = 0) { crc = crc ^ -1; for (let i = 0; i < u8.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ u8[i]) & 0xFF]; return (crc ^ -1) >>> 0; }
  function dosTime(d) { return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF; }
  function dosDate(d) { return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF; }
  const enc = new TextEncoder();

  class FdeZip {
    constructor() { this.entries = []; }
    add(name, data) { this.entries.push({ name: name.replace(/^\/+/, ''), data }); }
    async build() {
      const parts = []; const central = []; let offset = 0; const now = new Date();
      for (const e of this.entries) {
        let u8;
        if (e.data instanceof Blob) u8 = new Uint8Array(await e.data.arrayBuffer());
        else if (typeof e.data === 'string') u8 = enc.encode(e.data);
        else u8 = e.data instanceof Uint8Array ? e.data : new Uint8Array(e.data);
        const nameU8 = enc.encode(e.name);
        const crc = crc32(u8); const size = u8.length;
        const lh = new DataView(new ArrayBuffer(30));
        lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); // UTF-8 names
        lh.setUint16(8, 0, true); lh.setUint16(10, dosTime(now), true); lh.setUint16(12, dosDate(now), true);
        lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
        lh.setUint16(26, nameU8.length, true); lh.setUint16(28, 0, true);
        parts.push(lh.buffer, nameU8, u8);
        const ch = new DataView(new ArrayBuffer(46));
        ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
        ch.setUint16(10, 0, true); ch.setUint16(12, dosTime(now), true); ch.setUint16(14, dosDate(now), true);
        ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
        ch.setUint16(28, nameU8.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true);
        ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
        central.push(ch.buffer, nameU8);
        offset += 30 + nameU8.length + size;
      }
      const cdSize = central.reduce((s, p) => s + (p.byteLength ?? p.length), 0);
      const end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true);
      end.setUint16(8, this.entries.length, true); end.setUint16(10, this.entries.length, true);
      end.setUint32(12, cdSize, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true);
      return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
    }
  }
  window.FdeZip = FdeZip;
})();
