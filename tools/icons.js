// PWA 아이콘 생성기 — node-canvas로 앱 아이콘 PNG를 만든다.
// 사용법: node tools/icons.js
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'icons');
fs.mkdirSync(OUT, { recursive: true });

// 게임 분위기를 담은 아이콘: 검은 밤하늘 + 별 + 붉은 하트(수호자의 마음)
function drawIcon(size, maskable) {
  const cv = createCanvas(size, size);
  const c = cv.getContext('2d');

  // 배경
  c.fillStyle = '#0b0b12';
  c.fillRect(0, 0, size, size);

  // 별
  const rnd = (s) => { const v = Math.sin(s * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  for (let i = 0; i < Math.floor(size / 6); i++) {
    const x = rnd(i + 1) * size, y = rnd(i + 41) * size * 0.7;
    const r = rnd(i + 7) > 0.7 ? 2 : 1;
    c.fillStyle = `rgba(255,255,255,${0.4 + rnd(i + 13) * 0.5})`;
    c.fillRect(Math.floor(x), Math.floor(y), r * (size / 192), r * (size / 192));
  }

  // 하트 (도트 느낌으로 블록 채움)
  // maskable이면 안전영역(80%) 안에 들어오도록 약간 작게
  const scale = size / 192;
  const hs = (maskable ? 0.62 : 0.74) * size; // 하트 폭
  const cx = size / 2, cy = size * 0.54;
  drawPixelHeart(c, cx, cy, hs);

  return cv;
}

// 픽셀 하트를 비트맵 패턴으로 그린다 (언더테일 소울 느낌)
function drawPixelHeart(c, cx, cy, w) {
  const pat = [
    '0110110',
    '1111111',
    '1111111',
    '1111111',
    '0111110',
    '0011100',
    '0001000',
  ];
  const cols = pat[0].length, rows = pat.length;
  const px = w / cols;
  const x0 = cx - w / 2, y0 = cy - (rows * px) / 2;
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      if (pat[r][q] === '1') {
        // 위쪽은 밝게, 아래는 어둡게 살짝 음영
        c.fillStyle = r < 2 ? '#f25c52' : r < 5 ? '#e0453a' : '#b8362d';
        c.fillRect(Math.round(x0 + q * px), Math.round(y0 + r * px), Math.ceil(px), Math.ceil(px));
      }
    }
  }
  // 하이라이트
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.fillRect(Math.round(x0 + px), Math.round(y0 + px), Math.ceil(px), Math.ceil(px));
}

const targets = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180, maskable: false },
];

console.log('아이콘 생성:');
for (const t of targets) {
  const cv = drawIcon(t.size, t.maskable);
  fs.writeFileSync(path.join(OUT, t.name), cv.toBuffer('image/png'));
  console.log('  saved icons/' + t.name);
}
console.log('완료.');
