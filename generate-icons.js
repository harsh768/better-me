// Pure-Node PNG icon generator (no deps) — minimalist "ascent" mark for THE SYSTEM.
const fs = require('fs');
const zlib = require('zlib');

const crcTable = (() => { const t = new Uint32Array(256);
  for (let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;} return t; })();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=crcTable[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length,0);const t=Buffer.from(type,'ascii');
  const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([t,data])),0);return Buffer.concat([len,t,data,crc]);}
const clamp=v=>v<0?0:v>255?255:v|0;
const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const sstep=(e0,e1,x)=>{let t=Math.min(1,Math.max(0,(x-e0)/(e1-e0)));return t*t*(3-2*t);};
function distSeg(px,py,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy;let t=l2?((px-ax)*dx+(py-ay)*dy)/l2:0;
  t=Math.max(0,Math.min(1,t));return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));}

const PERIW=[142,162,255], VIOL=[183,157,255];

function drawPixel(S,x,y){
  let col=mix([11,13,23],[19,24,48], y/S);                 // bg gradient (matches app ink)
  const dxc=(x-S/2)/S, dyc=(y-S/2)/S, vr=Math.hypot(dxc,dyc);
  col=mix(col,[7,8,16], sstep(0.18,0.78,vr)*0.85);          // vignette
  const rr=Math.hypot(x-S/2,y-S/2);
  const cg=Math.exp(-(rr*rr)/(2*(S*0.24)*(S*0.24)));
  col=mix(col, mix(col,[64,84,168],0.55), cg*0.45);         // soft center glow

  // two stacked upward chevrons + a north-star dot  => "rise / level up"
  const aa=S*0.0065;
  const tcol=mix(PERIW,VIOL, Math.min(1,Math.max(0,(x/S-0.3)/0.4)));
  const chev=(apexY,leftY,hw)=>{
    const apex=[0.5*S,apexY*S], L=[0.30*S,leftY*S], R=[0.70*S,leftY*S];
    const d=Math.min(distSeg(x,y,L[0],L[1],apex[0],apex[1]), distSeg(x,y,apex[0],apex[1],R[0],R[1]));
    return {cov:1-sstep(hw-aa,hw+aa,d), glow:Math.exp(-((d-hw)*(d-hw))/(2*(S*0.018)*(S*0.018)))};
  };
  const c1=chev(0.46,0.62,0.045);   // lower, bold
  const c2=chev(0.33,0.49,0.038);   // upper, slimmer
  const dot=[0.5*S,0.235*S], dr=0.032*S, dd=Math.hypot(x-dot[0],y-dot[1]);
  const dotCov=1-sstep(dr-aa,dr+aa,dd);
  const dotGlow=Math.exp(-((dd-dr)*(dd-dr))/(2*(S*0.02)*(S*0.02)));

  const glow=c1.glow+c2.glow*0.85+dotGlow;
  col=[col[0]+tcol[0]*glow*0.42, col[1]+tcol[1]*glow*0.42, col[2]+tcol[2]*glow*0.42];
  const cov=Math.max(c1.cov,c2.cov,dotCov);
  const coreTarget=mix(tcol,[255,255,255],0.4);
  col=mix(col, coreTarget, cov);

  return [clamp(col[0]),clamp(col[1]),clamp(col[2]),255];
}

function makePNG(S){
  const raw=Buffer.alloc((S*4+1)*S); let p=0;
  for(let y=0;y<S;y++){raw[p++]=0;for(let x=0;x<S;x++){const c=drawPixel(S,x,y);raw[p++]=c[0];raw[p++]=c[1];raw[p++]=c[2];raw[p++]=c[3];}}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(S,0);ihdr.writeUInt32BE(S,4);ihdr[8]=8;ihdr[9]=6;
  const idat=zlib.deflateSync(raw,{level:9});
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))]);
}
fs.writeFileSync(__dirname+'/icon-512.png',makePNG(512));
fs.writeFileSync(__dirname+'/icon-192.png',makePNG(192));
fs.writeFileSync(__dirname+'/apple-touch-icon.png',makePNG(180));
console.log('icons written');
