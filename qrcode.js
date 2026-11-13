/* QR Code encoder written for this site: byte mode (UTF-8), versions 1-40,
   error correction L/M/Q/H, automatic mask selection. No external library.
   Usage: EventStudioQR.encode('text', 'M') -> { version, size, mask, level, modules, get(x, y) } */
'use strict';
(() => {
  const LEVELS = { L: 0, M: 1, Q: 2, H: 3 };
  const FORMAT_BITS = [1, 0, 3, 2];
  const ECC_CODEWORDS_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  ];
  const NUM_ERROR_CORRECTION_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  ];
  const PENALTY_N1 = 3;
  const PENALTY_N2 = 3;
  const PENALTY_N3 = 40;
  const PENALTY_N4 = 10;

  function rawDataModules(version) {
    let result = (16 * version + 128) * version + 64;
    if (version >= 2) {
      const alignments = Math.floor(version / 7) + 2;
      result -= (25 * alignments - 10) * alignments - 55;
      if (version >= 7) result -= 36;
    }
    return result;
  }
  function dataCodewords(version, level) {
    return (rawDataModules(version) >>> 3) - ECC_CODEWORDS_PER_BLOCK[level][version] * NUM_ERROR_CORRECTION_BLOCKS[level][version];
  }

  /* ---------- Reed-Solomon over GF(2^8), polynomial 0x11D ---------- */
  function multiply(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function divisor(degree) {
    const result = new Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) {
        result[j] = multiply(result[j], root);
        if (j + 1 < degree) result[j] ^= result[j + 1];
      }
      root = multiply(root, 2);
    }
    return result;
  }
  function remainder(data, generator) {
    const result = new Array(generator.length).fill(0);
    for (const byte of data) {
      const factor = byte ^ result.shift();
      result.push(0);
      for (let i = 0; i < generator.length; i++) result[i] ^= multiply(generator[i], factor);
    }
    return result;
  }
  function addErrorCorrection(data, version, level) {
    const blocks = NUM_ERROR_CORRECTION_BLOCKS[level][version];
    const eccLength = ECC_CODEWORDS_PER_BLOCK[level][version];
    const rawCodewords = rawDataModules(version) >>> 3;
    const shortBlocks = blocks - rawCodewords % blocks;
    const shortLength = Math.floor(rawCodewords / blocks);
    const generator = divisor(eccLength);
    const parts = [];
    for (let i = 0, offset = 0; i < blocks; i++) {
      const length = shortLength - eccLength + (i < shortBlocks ? 0 : 1);
      const chunk = Array.from(data.subarray(offset, offset + length));
      offset += length;
      const ecc = remainder(chunk, generator);
      if (i < shortBlocks) chunk.push(0);
      parts.push(chunk.concat(ecc));
    }
    const result = [];
    for (let i = 0; i < parts[0].length; i++) {
      for (let j = 0; j < parts.length; j++) {
        /* Skip the padding cell of the short blocks. */
        if (i !== shortLength - eccLength || j >= shortBlocks) result.push(parts[j][i]);
      }
    }
    return result;
  }

  function alignmentPositions(version, size) {
    if (version === 1) return [];
    const count = Math.floor(version / 7) + 2;
    const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
    const result = [6];
    for (let position = size - 7; result.length < count; position -= step) result.splice(1, 0, position);
    return result;
  }

  function encode(text, levelName = 'M') {
    const level = LEVELS[levelName] ?? 1;
    const bytes = new TextEncoder().encode(String(text));
    let version = 0;
    for (let candidate = 1; candidate <= 40; candidate++) {
      if (4 + (candidate < 10 ? 8 : 16) + bytes.length * 8 <= dataCodewords(candidate, level) * 8) { version = candidate; break; }
    }
    if (!version) throw new RangeError('QR: data too long');

    /* ----- Data bits: mode, length, bytes, terminator, padding ----- */
    const capacity = dataCodewords(version, level) * 8;
    const bits = [];
    const append = (value, length) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
    append(4, 4);
    append(bytes.length, version < 10 ? 8 : 16);
    for (const byte of bytes) append(byte, 8);
    append(0, Math.min(4, capacity - bits.length));
    append(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < capacity; pad ^= 0xEC ^ 0x11) append(pad, 8);
    const data = new Uint8Array(bits.length >>> 3);
    for (let i = 0; i < bits.length; i++) data[i >>> 3] |= bits[i] << (7 - (i & 7));
    const codewords = addErrorCorrection(data, version, level);

    /* ----- Matrix ----- */
    const size = version * 4 + 17;
    const modules = new Uint8Array(size * size);
    const reserved = new Uint8Array(size * size);
    const setFunction = (x, y, dark) => { modules[y * size + x] = dark ? 1 : 0; reserved[y * size + x] = 1; };
    const bit = (value, index) => ((value >>> index) & 1) !== 0;

    function drawFormat(mask) {
      const value = (FORMAT_BITS[level] << 3) | mask;
      let rem = value;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const format = ((value << 10) | rem) ^ 0x5412;
      for (let i = 0; i <= 5; i++) setFunction(8, i, bit(format, i));
      setFunction(8, 7, bit(format, 6));
      setFunction(8, 8, bit(format, 7));
      setFunction(7, 8, bit(format, 8));
      for (let i = 9; i < 15; i++) setFunction(14 - i, 8, bit(format, i));
      for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, bit(format, i));
      for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, bit(format, i));
      setFunction(8, size - 8, true);
    }
    function drawVersion() {
      if (version < 7) return;
      let rem = version;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const info = (version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const a = size - 11 + i % 3;
        const b = Math.floor(i / 3);
        setFunction(a, b, bit(info, i));
        setFunction(b, a, bit(info, i));
      }
    }
    function drawFinder(cx, cy) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || x >= size || y < 0 || y >= size) continue;
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          setFunction(x, y, distance !== 2 && distance !== 4);
        }
      }
    }
    for (let i = 0; i < size; i++) {
      setFunction(6, i, i % 2 === 0);
      setFunction(i, 6, i % 2 === 0);
    }
    drawFinder(3, 3);
    drawFinder(size - 4, 3);
    drawFinder(3, size - 4);
    const align = alignmentPositions(version, size);
    for (let i = 0; i < align.length; i++) {
      for (let j = 0; j < align.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) setFunction(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
    drawFormat(0);
    drawVersion();

    /* ----- Place codewords in the zigzag ----- */
    let index = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vertical = 0; vertical < size; vertical++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vertical : vertical;
          if (!reserved[y * size + x] && index < codewords.length * 8) {
            modules[y * size + x] = (codewords[index >>> 3] >>> (7 - (index & 7))) & 1;
            index++;
          }
        }
      }
    }

    /* ----- Masking ----- */
    function applyMask(mask) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (reserved[y * size + x]) continue;
          let invert;
          switch (mask) {
            case 0: invert = (x + y) % 2 === 0; break;
            case 1: invert = y % 2 === 0; break;
            case 2: invert = x % 3 === 0; break;
            case 3: invert = (x + y) % 3 === 0; break;
            case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
            case 5: invert = x * y % 2 + x * y % 3 === 0; break;
            case 6: invert = (x * y % 2 + x * y % 3) % 2 === 0; break;
            default: invert = ((x + y) % 2 + x * y % 3) % 2 === 0;
          }
          if (invert) modules[y * size + x] ^= 1;
        }
      }
    }
    function addHistory(run, history) {
      if (history[0] === 0) run += size;
      history.pop();
      history.unshift(run);
    }
    function countPatterns(history) {
      const n = history[1];
      const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
      return (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) + (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0);
    }
    function terminate(color, run, history) {
      if (color) { addHistory(run, history); run = 0; }
      run += size;
      addHistory(run, history);
      return countPatterns(history);
    }
    function penalty() {
      let result = 0;
      for (let pass = 0; pass < 2; pass++) {
        for (let a = 0; a < size; a++) {
          let color = 0;
          let run = 0;
          const history = [0, 0, 0, 0, 0, 0, 0];
          for (let b = 0; b < size; b++) {
            const value = pass === 0 ? modules[a * size + b] : modules[b * size + a];
            if (value === color) {
              run++;
              if (run === 5) result += PENALTY_N1;
              else if (run > 5) result++;
            } else {
              addHistory(run, history);
              if (!color) result += countPatterns(history) * PENALTY_N3;
              color = value;
              run = 1;
            }
          }
          result += terminate(color, run, history) * PENALTY_N3;
        }
      }
      for (let y = 0; y < size - 1; y++) {
        for (let x = 0; x < size - 1; x++) {
          const color = modules[y * size + x];
          if (color === modules[y * size + x + 1] && color === modules[(y + 1) * size + x] && color === modules[(y + 1) * size + x + 1]) result += PENALTY_N2;
        }
      }
      let dark = 0;
      for (let i = 0; i < modules.length; i++) dark += modules[i];
      const total = size * size;
      result += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * PENALTY_N4;
      return result;
    }
    let best = 0;
    let lowest = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      applyMask(mask);
      drawFormat(mask);
      const score = penalty();
      if (score < lowest) { lowest = score; best = mask; }
      applyMask(mask);
    }
    applyMask(best);
    drawFormat(best);

    return Object.freeze({
      version,
      size,
      mask: best,
      level: levelName in LEVELS ? levelName : 'M',
      bytes: bytes.length,
      modules,
      get(x, y) { return x >= 0 && x < size && y >= 0 && y < size && modules[y * size + x] === 1; }
    });
  }

  /* Bytes that fit at the largest size, for messages. */
  const maxBytes = levelName => dataCodewords(40, LEVELS[levelName] ?? 1) - 3;

  const api = Object.freeze({ encode, maxBytes });
  if (typeof window !== 'undefined') window.EventStudioQR = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
