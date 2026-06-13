// Pure-Node PNG icon generator (no deps) for the "System" PWA.
const fs = require('fs');
const zlib = require('zlib');

// --- CRC32 ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function clamp(v){ return v < 0 ? 0 : v > 255 ? 255 : v|0; }
function mix(a, b, t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }

function drawPixel(S, x, y) {
  const cx = S/2, cy = S/2;
  // background vertical gradient
  let col = mix([6,8,20], [10,20,52], y/S);
  // subtle vignette
  const dx = (x-cx)/S, dy=(y-cy)/S;
  const vr = Math.sqrt(dx*dx+dy*dy);
  col = mix(col, [3,4,12], Math.min(1, vr*0.9));

  const cyan = [70, 210, 255];
  const purple = [140, 110, 255];

  // diamond distance metric
  const d = Math.abs(x-cx) + Math.abs(y-cy);
  const R1 = S*0.36;   // outer gate
  const R2 = S*0.22;   // inner gate
  const w1 = S*0.012, w2 = S*0.010;
  const g1 = Math.exp(-((d-R1)*(d-R1))/(2*(w1*S*0.9)*(w1*S*0.9)/ (S*0.02) )); // ring glow
  // simpler ring glow using gaussian on distance to edge
  const ring = (edge, sigma, color, strength) => {
    const g = Math.exp(-((d-edge)*(d-edge))/(2*sigma*sigma));
    col = [
      col[0] + color[0]*g*strength,
      col[1] + color[1]*g*strength,
      col[2] + color[2]*g*strength,
    ];
  };
  ring(R1, S*0.018, cyan, 1.15);
  ring(R2, S*0.016, purple, 1.0);

  // center radial core glow
  const rr = Math.sqrt((x-cx)*(x-cx)+(y-cy)*(y-cy));
  const core = Math.exp(-(rr*rr)/(2*(S*0.05)*(S*0.05)));
  col = [col[0]+cyan[0]*core*1.3, col[1]+cyan[1]*core*1.3, col[2]+255*core*1.3];

  return [clamp(col[0]), clamp(col[1]), clamp(col[2]), 255];
}

function makePNG(S) {
  const raw = Buffer.alloc((S*4 + 1) * S);
  let p = 0;
  for (let y = 0; y < S; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < S; x++) {
      const [r,g,b,a] = drawPixel(S, x, y);
      raw[p++]=r; raw[p++]=g; raw[p++]=b; raw[p++]=a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  const idat = zlib.deflateSync(raw, {level: 9});
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

fs.writeFileSync(__dirname + '/icon-512.png', makePNG(512));
fs.writeFileSync(__dirname + '/icon-192.png', makePNG(192));
fs.writeFileSync(__dirname + '/apple-touch-icon.png', makePNG(180));
console.log('icons written');
