// D3 emits absolute M/L/Z paths with five decimal places. Store those exact
// coordinates as delta integers, then reconstruct the original SVG strings.
const layers = ['china', 'fujian', 'fuzhou', 'quanzhou', 'campuses', 'localDetails', 'context'];
const commands = ['M', 'L', 'Z'];
const precision = 100000;
const encoder = new TextEncoder();

function visitPaths(atlas, visit) {
  for (const layer of layers) for (const item of atlas[layer]) item.d = visit(item.d);
  atlas.graticule = visit(atlas.graticule);
}

export function encodeAtlas(atlas) {
  const metadata = structuredClone(atlas);
  const bytes = [];
  function writeInteger(value) {
    let unsigned = value < 0 ? -value * 2 - 1 : value * 2;
    while (unsigned >= 128) {
      bytes.push((unsigned % 128) + 128);
      unsigned = Math.floor(unsigned / 128);
    }
    bytes.push(unsigned);
  }
  visitPaths(metadata, path => {
    const start = bytes.length;
    let x = 0, y = 0, restored = '';
    for (const match of path.matchAll(/([ML])(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)|(Z)/g)) {
      const command = match[1] || match[4];
      bytes.push(commands.indexOf(command));
      if (command === 'Z') { restored += command; continue; }
      const nextX = Math.round(Number(match[2]) * precision);
      const nextY = Math.round(Number(match[3]) * precision);
      writeInteger(nextX - x);
      writeInteger(nextY - y);
      x = nextX;
      y = nextY;
      restored += command + x / precision + ',' + y / precision;
    }
    if (restored !== path) throw Error('Atlas path cannot be encoded losslessly');
    return bytes.length - start;
  });
  const header = encoder.encode(JSON.stringify(metadata));
  const packed = new Uint8Array(8 + header.length + bytes.length);
  packed.set(encoder.encode('ATP1'));
  new DataView(packed.buffer).setUint32(4, header.length, true);
  packed.set(header, 8);
  packed.set(bytes, 8 + header.length);
  return packed;
}

export function decodeAtlas(buffer) {
  const data = new Uint8Array(buffer);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  if (decoder.decode(data.subarray(0, 4)) !== 'ATP1') throw Error('Invalid atlas format');
  const headerEnd = 8 + new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(4, true);
  if (headerEnd > data.length) throw Error('Incomplete atlas header');
  const atlas = JSON.parse(decoder.decode(data.subarray(8, headerEnd)));
  let offset = headerEnd;
  function readInteger(end) {
    let value = 0, factor = 1, byte;
    do {
      if (offset >= end || factor > 2 ** 35) throw Error('Invalid atlas coordinate');
      byte = data[offset++];
      value += (byte & 127) * factor;
      factor *= 128;
    } while (byte & 128);
    return value % 2 ? -(value + 1) / 2 : value / 2;
  }
  visitPaths(atlas, length => {
    const end = offset + length;
    if (!Number.isSafeInteger(length) || length < 0 || end > data.length) throw Error('Incomplete atlas path');
    let x = 0, y = 0, path = '';
    while (offset < end) {
      const command = commands[data[offset++]];
      if (!command) throw Error('Invalid atlas command');
      if (command === 'Z') { path += command; continue; }
      x += readInteger(end);
      y += readInteger(end);
      path += command + x / precision + ',' + y / precision;
    }
    return path;
  });
  if (offset !== data.length) throw Error('Unexpected atlas data');
  return atlas;
}
