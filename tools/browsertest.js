// 실제 브라우저(Chromium) 스모크 테스트 — Playwright
// node 스모크테스트가 못 잡는 실제 렌더링·터치 UI·콘솔 에러·PWA를
// desktop / mobile portrait / mobile landscape 세 뷰포트에서 검증한다.
//
// 사전 준비: Chromium 바이너리 필요. 로컬/CI에서 다음 중 하나로 확보:
//   - 이 환경처럼 PLAYWRIGHT_BROWSERS_PATH에 미리 설치돼 있거나
//   - `npx playwright install --with-deps chromium`
// 실행: node tools/browsertest.js  (또는 npm run test:browser)

const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium, webkit;
try {
  ({ chromium, webkit } = require('playwright'));
} catch (e) {
  console.error('playwright 패키지가 없습니다. `npm install -D playwright` 후 다시 실행하세요.');
  process.exit(2);
}

const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/png',
};
const serverFaults = new Map();

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      if (p === '/favicon.ico') p = '/icons/icon-192.png'; // 파비콘 404 잡음 방지
      const forcedStatus = serverFaults.get(p);
      if (forcedStatus) {
        res.statusCode = forcedStatus;
        res.end('forced failure');
        return;
      }
      const fp = path.join(ROOT, p);
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.statusCode = 404; res.end('not found'); return;
      }
      res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream');
      res.setHeader('Service-Worker-Allowed', '/');
      res.end(fs.readFileSync(fp));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// 미리 설치된 Chromium 실행 파일을 찾는다(버전 불일치 회피). 없으면 undefined →
// playwright 기본 경로 사용(CI에서 `npx playwright install chromium` 후).
function resolveChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM && fs.existsSync(process.env.PLAYWRIGHT_CHROMIUM)) {
    return process.env.PLAYWRIGHT_CHROMIUM;
  }
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dirs = fs.readdirSync(base).filter((d) => d.startsWith('chromium-'));
    for (const d of dirs) {
      const exe = path.join(base, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return exe;
    }
  } catch (e) { /* base 없음 → 기본 경로 */ }
  return undefined;
}

async function installSpeechRecorder(ctx) {
  await ctx.addInitScript(() => {
    window.__spoken = [];
    window.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) { this.text = text; };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [{ lang: 'ko-KR', name: '테스트 한국어', localService: true }],
        addEventListener() {},
        cancel() {},
        speak(utterance) { window.__spoken.push(utterance.text); },
      },
    });
  });
}

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800, mobile: false },
  { name: 'mobile-portrait', width: 390, height: 844, mobile: true },
  { name: 'mobile-landscape', width: 844, height: 390, mobile: true },
];

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { console.log('  ✔ ' + n); pass++; } else { console.log('  ✘ ' + n); fail++; } };

async function canvasColorProfile(page, rect) {
  return page.evaluate((area) => {
    const canvas = document.getElementById('game');
    const scale = canvas.width / 720;
    const data = canvas.getContext('2d').getImageData(
      Math.round(area.x * scale), Math.round(area.y * scale),
      Math.round(area.w * scale), Math.round(area.h * scale)).data;
    let visible = 0, chromatic = 0;
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const high = Math.max(r, g, b), low = Math.min(r, g, b);
      if (high < 24) continue;
      visible += 1;
      if (high - low >= 18) chromatic += 1;
    }
    return { visible, chromatic, ratio: visible ? chromatic / visible : 0 };
  }, rect);
}

async function screenshotStableCanvas(page, file, redrawWorld) {
  await page.evaluate(async (shouldRedrawWorld) => {
    const canvas = document.getElementById('game');
    const frozen = document.createElement('canvas');
    frozen.width = canvas.width;
    frozen.height = canvas.height;
    const frozenCtx = frozen.getContext('2d');
    let bestScore = -1;
    const frameCount = shouldRedrawWorld ? 1 : 8;
    for (let frame = 0; frame < frameCount; frame++) {
      if (shouldRedrawWorld) window.__test.drawWorld();
      else await new Promise((resolve) => requestAnimationFrame(resolve));
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      let score = 0;
      for (let i = 0; i < pixels.data.length; i += 64) {
        if (pixels.data[i] > 16 || pixels.data[i + 1] > 16 || pixels.data[i + 2] > 16) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        frozenCtx.putImageData(pixels, 0, 0);
      }
    }
    const rect = canvas.getBoundingClientRect();
    const still = document.createElement('img');
    still.id = 'browser-canvas-still';
    still.alt = '';
    still.src = frozen.toDataURL('image/png');
    await new Promise((resolve, reject) => {
      if (still.complete) { resolve(); return; }
      still.onload = resolve;
      still.onerror = reject;
    });
    Object.assign(still.style, {
      position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
      width: `${rect.width}px`, height: `${rect.height}px`,
      imageRendering: 'pixelated', zIndex: '20', pointerEvents: 'none',
    });
    document.body.appendChild(still);
    canvas.style.visibility = 'hidden';
  }, !!redrawWorld);
  try {
    await page.screenshot({ path: file });
  } finally {
    await page.evaluate(() => {
      const canvas = document.getElementById('game');
      const still = document.getElementById('browser-canvas-still');
      if (still) still.remove();
      if (canvas) canvas.style.visibility = '';
    });
  }
}

async function captureCanvasPng(page, file, redrawWorld) {
  if (redrawWorld) await page.evaluate(() => window.__test.drawWorld());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const session = await page.context().newCDPSession(page);
  try {
    const shot = await session.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: false, fromSurface: true,
    });
    const png = Buffer.from(shot.data, 'base64');
    const viewport = page.viewportSize();
    if (!viewport || png.readUInt32BE(16) !== viewport.width || png.readUInt32BE(20) !== viewport.height) {
      throw new Error(`Viewport screenshot size mismatch: expected ${viewport && viewport.width}x${viewport && viewport.height}`);
    }
    fs.writeFileSync(file, png);
  } finally {
    await session.detach();
  }
}

(async () => {
  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/index.html`;
  const shotsDir = path.join(ROOT, 'shots');
  if (!fs.existsSync(shotsDir)) fs.mkdirSync(shotsDir);
  const mementoShotsDir = path.join(ROOT, '.orchestration', 'evidence', 'final-browser', 'dual-timeline');
  if (!fs.existsSync(mementoShotsDir)) fs.mkdirSync(mementoShotsDir, { recursive: true });
  const endingShotsDir = path.join(ROOT, '.orchestration', 'evidence', 'final-browser', 'endings');
  if (!fs.existsSync(endingShotsDir)) fs.mkdirSync(endingShotsDir, { recursive: true });
  const gameplayLoopShotsDir = path.join(ROOT, '.omo', 'evidence', 'memento-gameplay-browser', 'screenshots');
  if (!fs.existsSync(gameplayLoopShotsDir)) fs.mkdirSync(gameplayLoopShotsDir, { recursive: true });

  const browser = await chromium.launch({ executablePath: resolveChromium() });
  for (const vp of VIEWPORTS) {
    console.log(`[${vp.name}] ${vp.width}x${vp.height}`);
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.mobile, isMobile: vp.mobile,
      deviceScaleFactor: vp.mobile ? 2 : 1,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      // 리소스 로드 404 등 네트워크 잡음은 별도(여기선 모두 서빙되므로 사실상 없음)
      if (/Failed to load resource/.test(t)) return;
      errors.push('console.error: ' + t);
    });

    await page.goto(base, { waitUntil: 'load' });
    let loaded = false;
    try { await page.waitForFunction(() => !!window.__test, { timeout: 8000 }); loaded = true; } catch (e) { /* below */ }
    await page.waitForTimeout(600); // 한두 프레임 렌더링 시간

    check('게임 모듈 로드(window.__test 노출)', loaded);
    check('캔버스(#game) 존재', !!(await page.$('#game')));

    const disp = (sel) => page.$eval(sel, (el) => getComputedStyle(el).display).catch(() => null);
    const isTouch = await page.evaluate(() => document.body.classList.contains('touch'));

    if (vp.name === 'desktop') {
      check('데스크톱: 터치 UI 비활성', isTouch === false);
      check('데스크톱: 회전 안내 숨김', (await disp('#rotate-hint')) === 'none');
    } else if (vp.name === 'mobile-portrait') {
      check('모바일 세로: 터치 모드 활성', isTouch === true);
      check('모바일 세로: 회전 안내 표시', (await disp('#rotate-hint')) !== 'none');
    } else if (vp.name === 'mobile-landscape') {
      check('모바일 가로: 터치 모드 활성', isTouch === true);
      check('모바일 가로: 회전 안내 숨김', (await disp('#rotate-hint')) === 'none');
      check('모바일 가로: 터치 UI 표시', (await disp('#touch-ui')) !== 'none');
    }

    check('콘솔/페이지 에러 없음', errors.length === 0);
    errors.slice(0, 6).forEach((e) => console.log('     · ' + e));

    await page.screenshot({ path: path.join(shotsDir, `browser-${vp.name}.png`) });
    await ctx.close();
  }

  // 메멘토는 장 끝 컷신이 아니라, 첫 화면에서 현재 단말을 풀고 시간을 직접 복원하는
  // 조작 루프다. 이 블록은 테스트 seam으로 결과만 찍지 않고 실제 키보드 입력을 보낸다.
  {
    console.log('[memento-gameplay-loop] 제목→첫 기록→단말→수동 복원→오프라인 재개');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await installSpeechRecorder(ctx);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text());
    });
    await page.goto(base + '?memento-loop=1', { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    const startedAt = Date.now();
    const title = await page.evaluate(() => ({
      mode: window.__game.mode, screen: window.__game.titleScreen,
      routes: window.__test.titleRoutes().map((route) => route.label), live: window.__test.srLiveText(),
    }));
    check('첫 타이틀은 세 갈래 시간선 선택 화면', title.mode === 'title' && title.screen === 'routechoice' &&
      title.routes.join(',') === '원래 모험 시작,메멘토 시간선 체험,과거·현재 캠페인 시작');
    check('시간선 선택이 aria-live에 연결됨', /시간선 선택/.test(title.live));
    await page.waitForTimeout(180);
    await screenshotStableCanvas(page, path.join(gameplayLoopShotsDir, 'routechoice-desktop.png'));

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('z');
    await page.waitForFunction(() => window.__game.titleScreen === 'slots', { timeout: 1500 });
    check('키보드 메멘토 선택이 빈 슬롯으로 이어짐', (await page.evaluate(() => window.__game.newGameRoute)) === 'memento');
    await page.keyboard.press('z');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('name-overlay')).display !== 'none', { timeout: 1500 });
    await page.locator('#name-input').fill('시간아이');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__game.mode === 'record' && window.__game.record && window.__game.record.discovery, { timeout: 2500 });
    const firstRecord = await page.evaluate((begin) => ({
      id: window.__game.record.ids[0], frames: window.__game.time, elapsedMs: Date.now() - begin,
      route: window.__game.flags.storyRoute, live: window.__test.srLiveText(),
    }), startedAt);
    check(`첫 손상 기록은 3,600 프레임 안(${firstRecord.frames})`, firstRecord.id === 'reset_after' && firstRecord.frames < 3600);
    check(`첫 손상 기록은 실제 60초 안(${firstRecord.elapsedMs}ms)`, firstRecord.elapsedMs < 60000 && firstRecord.route === 'memento');
    check('첫 기록은 현재에서 과거로 가는 방향을 안내', /현재에서 과거 방향/.test(firstRecord.live));
    await screenshotStableCanvas(page, path.join(gameplayLoopShotsDir, 'first-record-desktop.png'));

    // 스킵은 해금을 남기되 증거는 남기지 않아, 현재 단말을 우회할 수 없다.
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__game.mode === 'world', { timeout: 1500 });
    check('기록을 건너뛰면 증거가 없음', await page.evaluate(() =>
      window.__game.flags.skippedRecords.reset_after && window.__game.flags.recordEvidence.length === 0));
    await page.evaluate(() => {
      const g = window.__game;
      // 조사 대상은 발밑이 아니라 바라보는 칸이다. 단말 바로 아래에서 위를 본다.
      g.player.x = 18; g.player.y = 17; g.player.px = 18 * 48; g.player.py = 17 * 48; g.player.dir = 'up';
    });
    await page.keyboard.press('z');
    await page.waitForFunction(() => window.__game.mode === 'choice' && /잠김/.test(window.__game.choice.prompt), { timeout: 1500 });
    check('현재 관리자 단말은 증거 전 잠김', await page.evaluate(() =>
      window.__game.choice.options[0] === '기록 다시 보기' && window.__game.choice.options[1] === '돌아가기'));
    await screenshotStableCanvas(page, path.join(gameplayLoopShotsDir, 'terminal-locked-desktop.png'));
    await page.keyboard.press('z');
    await page.waitForFunction(() => window.__game.mode === 'record' && window.__game.record.replay, { timeout: 1500 });
    for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.mode === 'record')); i++) {
      await page.keyboard.press('z');
      await page.waitForTimeout(90);
    }
    await page.waitForFunction(() => window.__game.mode === 'choice' && window.__game.choice.options.length === 3, { timeout: 2500 });
    check('다시보기 완료 뒤에만 단말 질문이 열림', await page.evaluate(() =>
      window.__game.flags.recordEvidence.includes('reset_after') && window.__game.choice.options.length === 3));
    await page.keyboard.press('z');
    await page.waitForFunction(() => window.__game.mode === 'dialog' && /오답/.test(window.__game.dialog.lines[0]), { timeout: 1500 });
    for (let i = 0; i < 20 && (await page.evaluate(() => window.__game.mode === 'dialog')); i++) {
      await page.keyboard.press('z');
      await page.waitForTimeout(24);
    }
    await page.waitForFunction(() => window.__game.mode === 'choice' && window.__game.choice.options.length === 3, { timeout: 1500 });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('z');
    await page.waitForFunction(() => window.__game.flags.administratorTerminalSolved, { timeout: 1500 });
    check('오답 재시도 뒤 정확한 해석만 현재 문을 엶', await page.evaluate(() =>
      window.__game.flags.administratorTerminalSolved && window.__game.flags.introDoorOpen));
    await screenshotStableCanvas(page, path.join(gameplayLoopShotsDir, 'terminal-open-desktop.png'));

    for (const count of [0, 1, 3, 5]) {
      const axis = await page.evaluate((n) => {
        const g = window.__game, T = window.__test;
        window.dispatchEvent(new Event('blur'));
        g.mode = 'world'; g.map = 'introlab'; g.flags = T.newFlags(); g.flags.storyRoute = 'memento';
        g.player.x = 14; g.player.y = 16; g.player.px = 14 * 48; g.player.py = 16 * 48;
        g.player.dir = 'up'; g.player.moving = false; g.introDim = null; g.warpCooldownFrames = 30;
        g.flags.damagedRecords = ['reset_after', 'reset_before', 'city_failure', 'yeongi_warning', 'first_approval'].slice(0, n);
        g.flags.recordEvidence = g.flags.damagedRecords.slice();
        return T.recordHudText(g.flags, false);
      }, count);
      check(`역행 HUD ${count}개 상태는 현재·D-1·D-7을 보임`, /현재 ◀/.test(axis) && /D-1/.test(axis) && /D-7/.test(axis) && !/\d\/5/.test(axis));
      const hudCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const hudPage = await hudCtx.newPage();
      await hudPage.goto(base + `?hud=${count}`, { waitUntil: 'load' });
      await hudPage.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
      await hudPage.evaluate((n) => {
        const g = window.__game, T = window.__test;
        g.mode = 'world'; g.map = 'introlab'; g.flags = T.newFlags(); g.flags.storyRoute = 'memento';
        g.player.x = 14; g.player.y = 16; g.player.px = 14 * 48; g.player.py = 16 * 48;
        g.player.dir = 'up'; g.player.moving = false; g.introDim = null; g.warpCooldownFrames = 30;
        g.flags.damagedRecords = ['reset_after', 'reset_before', 'city_failure', 'yeongi_warning', 'first_approval'].slice(0, n);
        g.flags.recordEvidence = g.flags.damagedRecords.slice();
      }, count);
      await hudPage.waitForTimeout(180);
      await screenshotStableCanvas(hudPage, path.join(gameplayLoopShotsDir, `reverse-axis-${count}-desktop.png`), true);
      await hudCtx.close();
    }

    // 빈 칸→부분→오답→되돌림→정답: 자동 정렬/자동 결합을 잡는다.
    await page.evaluate(() => {
      const g = window.__game, T = window.__test;
      g.flags = T.newFlags(); g.flags.storyRoute = 'memento';
      g.flags.damagedRecords = ['reset_after', 'reset_before', 'city_failure', 'yeongi_warning', 'first_approval'];
      g.flags.shrineDone = true; T.startTimelineOrdering();
    });
    await page.waitForFunction(() => window.__game.mode === 'timelineorder', { timeout: 1500 });
    await page.waitForTimeout(180);
    check('파이널은 빈 다섯 칸으로 시작', await page.evaluate(() => window.__game.flags.timelineOrderDraft.length === 0));
    await screenshotStableCanvas(page, path.join(gameplayLoopShotsDir, 'timeline-empty-desktop.png'));
    await page.keyboard.press('z');
    await page.waitForTimeout(90);
    check('첫 카드 배치가 즉시 저장됨', await page.evaluate(() => window.__game.flags.timelineOrderDraft.length === 1));
    await screenshotStableCanvas(page, path.join(gameplayLoopShotsDir, 'timeline-partial-desktop.png'));
    for (let i = 0; i < 5; i++) { await page.keyboard.press('z'); await page.waitForTimeout(90); }
    await page.waitForFunction(() => window.__game.timelineOrder && !!window.__game.timelineOrder.feedback, { timeout: 1500 });
    await page.waitForTimeout(180);
    check('역행 공개 순서로 제출하면 오답 재시도', await page.evaluate(() =>
      /순서가 이어지지 않는다/.test(window.__game.timelineOrder.feedback) && window.__game.flags.timelineOrderWrong === 1));
    await screenshotStableCanvas(page, path.join(gameplayLoopShotsDir, 'timeline-wrong-desktop.png'));
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(90); }
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(90);
    for (let i = 0; i < 6; i++) { await page.keyboard.press('z'); await page.waitForTimeout(90); }
    await page.waitForFunction(() => window.__game.mode === 'record' && window.__game.flags.timelineMerged, { timeout: 2000 });
    check('오래된 카드부터 직접 놓으면 컬러 복원이 시작', await page.evaluate(() =>
      window.__game.flags.timelineMerged && window.__game.record.restored));
    await screenshotStableCanvas(page, path.join(gameplayLoopShotsDir, 'timeline-correct-desktop.png'));

    // 부분 배치 저장, 온라인 reload로 SW 제어권 획득, 오프라인 reload, 저장 슬롯 계속하기.
    await page.evaluate(() => {
      const g = window.__game, T = window.__test;
      g.flags = T.newFlags(); g.flags.storyRoute = 'memento';
      g.flags.damagedRecords = ['reset_after', 'reset_before', 'city_failure', 'yeongi_warning', 'first_approval'];
      g.flags.shrineDone = true; g.flags.bandiRevealed = false; g.currentSlot = 0;
      T.startTimelineOrdering();
    });
    await page.keyboard.press('z');
    await page.waitForTimeout(90);
    await page.keyboard.press('c');
    await page.waitForFunction(() => window.__game.mode === 'world', { timeout: 1500 });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller), { timeout: 8000 });
    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(90);
    await page.keyboard.press('z');
    await page.waitForFunction(() => window.__game.titleScreen === 'slots', { timeout: 1500 });
    await page.keyboard.press('z');
    await page.waitForFunction(() => window.__game.mode === 'timelineorder', { timeout: 2500 });
    check('오프라인 reload 뒤 부분 시간선으로 재개', await page.evaluate(() =>
      window.__game.flags.timelineOrderDraft.join(',') === 'reset_after' && !window.__game.flags.timelineMerged));
    await ctx.setOffline(false);
    check('메멘토 키보드 동선 콘솔/페이지 에러 없음', errors.length === 0);
    errors.slice(0, 6).forEach((e) => console.log('     · ' + e));
    await ctx.close();
  }

  for (const vp of VIEWPORTS.filter((item) => item.mobile)) {
    console.log(`[consequence-pairs-4-${vp.name}] 후속 네 시간선 반응형·터치·TTS`);
    const dir = path.join(ROOT, '.omo', 'evidence', 'consequence-pairs-4', 'screenshots');
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
    });
    await installSpeechRecorder(ctx);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text());
    });
    const pairs = [
      { id: 'd3_consent', shot: 'd3', choices: [['likeness', 'likeness_manual'], ['voice', 'voice_assisted'], ['scene', 'scene_instant'], ['consent', 'consent_partial']] },
      { id: 'd5_recommendation', shot: 'd5', choices: [['echo', 'echo_manual'], ['sample', 'sample_assisted'], ['route', 'route_instant'], ['recommendationNote', 'recommendation_note_partial']] },
      { id: 'd7_misinformation', shot: 'd7', choices: [['tip', 'tip_manual'], ['context', 'context_assisted'], ['bulletin', 'bulletin_instant'], ['audit', 'audit_partial']] },
      { id: 'd10_judgment', shot: 'd10', choices: [['call', 'call_manual'], ['safety', 'safety_assisted'], ['comfort', 'comfort_instant'], ['authority', 'authority_partial']] },
    ];
    await page.goto(base + `?consequence-pairs-4-${vp.name}=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    await page.locator('#loading').waitFor({ state: 'detached', timeout: 1500 });
    if (vp.name === 'mobile-portrait') await page.click('#rotate-dismiss');
    await page.evaluate(() => {
      const T = window.__test, g = window.__game;
      T.startNewGameForRoute(0, '모바일순차', 'consequence-pairs');
      g.tts = true;
      g.reduceFx = true;
      g.flags.copyrightSlice.complete = true;
      g.flags.copyrightSlice.phase = 'result';
      g.flags.copyrightSlice.checkpoint = 'complete';
      g.flags.consequenceCampaign.activePairId = null;
      g.flags.consequenceCampaign.completedPairIds = ['d1_copyright'];
      g.map = 'timelinehub'; g.mode = 'world'; g.dialog = null; g.choice = null;
    });
    for (let index = 0; index < pairs.length; index++) {
      const pair = pairs[index];
      const mobilePast = await page.evaluate((pairId) => {
        window.__spoken.length = 0;
        const started = window.__test.startConsequencePair(pairId);
        return { started, live: window.__test.srLiveText(), spoken: window.__spoken.slice() };
      }, pair.id);
      check(`${vp.name} ${pair.id}: 과거 방향이 목표보다 먼저 낭독`, mobilePast.started &&
        /\[과거 ←\]/.test(mobilePast.live) && mobilePast.spoken.length > 0 &&
        mobilePast.spoken[0].indexOf('[과거 ←]') <= mobilePast.spoken[0].indexOf('.'));
      const fit = await page.evaluate(() => {
        const canvas = document.getElementById('game').getBoundingClientRect();
        const touch = getComputedStyle(document.getElementById('touch-ui')).display !== 'none';
        return { left: canvas.left, right: canvas.right, top: canvas.top, bottom: canvas.bottom, touch };
      });
      check(`${vp.name} ${pair.id}: Canvas와 터치 조작이 화면 안에 유지`, fit.touch &&
        fit.left >= -1 && fit.right <= vp.width + 1 && fit.top >= -1 && fit.bottom <= vp.height + 1);
      if (vp.name === 'mobile-portrait') {
        const uiProfile = await page.evaluate(() => window.__test.consequenceUiProfile(true));
        check(`${pair.id}: 세로 화면은 큰 HUD·포커스 라벨과 정적 라벨 숨김을 사용`,
          uiProfile.hudFont >= 18 && uiProfile.focusFont >= 18 && uiProfile.focusFullWidth === true &&
          uiProfile.staticLabels === false);
      }
      await captureCanvasPng(page, path.join(dir, `${pair.shot}-past-${vp.name}.png`), true);

      if (index === 0) {
        await page.evaluate(() => {
          const p = window.__game.player;
          Object.assign(p, { x: 4, y: 4, px: 4 * 48, py: 4 * 48, dir: 'up', moving: false });
        });
        await page.tap('#t-a');
        await page.waitForFunction(() => window.__game.mode === 'choice');
        check(`${vp.name}: 터치 A로 후속 시간선의 실제 선택창을 연다`,
          await page.evaluate(() => window.__game.choice.options.length === 3));
        await page.evaluate(() => { window.__game.mode = 'world'; window.__game.choice = null; });
      }

      const mobilePresent = await page.evaluate((choices) => {
        const T = window.__test;
        for (const [station, choice] of choices) T.recordConsequencePastChoice(station, choice);
        const began = T.beginConsequencePresent();
        return { began, transition: window.__game.consequenceTransition, runtime: T.consequenceRuntime() };
      }, pair.choices);
      check(`${vp.name} ${pair.id}: reduceFx 현재 전환은 2프레임이며 수리 목록을 보존`,
        mobilePresent.began && mobilePresent.transition.duration === 2 &&
        mobilePresent.runtime.phase === 'present' && mobilePresent.runtime.requiredRepairIds.length === 5);
      await page.waitForFunction(() => !window.__game.consequenceTransition);
      await captureCanvasPng(page, path.join(dir, `${pair.shot}-present-${vp.name}.png`), true);
      const completed = await page.evaluate((pairId) => {
        const T = window.__test, g = window.__game;
        T.consequenceRuntime().requiredRepairIds.forEach((id) => T.completeConsequenceRepair(id));
        if (pairId === 'd7_misinformation') {
          T.revealConsequenceIdentity();
          g.mode = 'world'; g.dialog = null;
        }
        const began = T.beginConsequenceFinale({ skipIntro: true });
        const done = began && T.completeStagePersuasion();
        g.mode = 'world'; g.dialog = null;
        return done;
      }, pair.id);
      check(`${vp.name} ${pair.id}: 장소형 완료 뒤 다음 쌍으로 복귀`, completed === true);
    }
    check(`${vp.name}: 후속 네 시간선 콘솔/페이지 오류 없음`, errors.length === 0);
    await ctx.close();
  }

  for (const vp of VIEWPORTS.filter((item) => item.mobile)) {
    console.log(`[memento-gameplay-touch-${vp.name}] 터치·큰 글씨·효과 줄이기`);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await installSpeechRecorder(ctx);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text()); });
    await page.goto(base + `?memento-touch=${vp.name}`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    if (vp.name === 'mobile-portrait') await page.click('#rotate-dismiss');
    await page.evaluate(() => { window.__game.routeCursor = 1; });
    check(`${vp.name}: 시간선 선택 A의 접근성 이름`, (await page.locator('#t-a').getAttribute('aria-label')) === '선택한 시간선 결정');
    await page.tap('#t-a');
    await page.waitForFunction(() => window.__game.titleScreen === 'slots', { timeout: 1500 });
    await page.evaluate(() => {
      const g = window.__game, T = window.__test;
      g.flags = T.newFlags(); g.flags.storyRoute = 'memento';
      g.flags.damagedRecords = ['reset_after', 'reset_before', 'city_failure', 'yeongi_warning', 'first_approval'];
      g.tts = true; g.largeText = true; g.reduceFx = true; g.lowGraphics = true; T.startTimelineOrdering();
    });
    await page.waitForFunction(() => window.__game.mode === 'timelineorder', { timeout: 1500 });
    await page.waitForTimeout(180);
    const touch = await page.evaluate(() => ({
      live: window.__test.srLiveText(), spoken: window.__spoken[window.__spoken.length - 1] || '',
      action: document.getElementById('t-a').getAttribute('aria-label'), sub: document.querySelector('#t-a .sub').textContent,
      undo: document.getElementById('t-pause').getAttribute('aria-label'),
    }));
    check(`${vp.name}: 큰 글씨·저사양·효과 줄이기에서도 aria/TTS 시간선 안내`, /시간순 복원/.test(touch.live) && /시간순 복원/.test(touch.spoken));
    check(`${vp.name}: 시간선 터치는 놓기와 되돌리기를 구분`, touch.action === '선택한 시간 카드 놓기' && touch.sub === '카드 놓기' && touch.undo === '마지막 카드 되돌리기');
    await page.evaluate(() => {
      const el = document.getElementById('t-a');
      const rect = el.getBoundingClientRect();
      const touch = new Touch({ identifier: 91, target: el, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
      el.dispatchEvent(new TouchEvent('touchstart', { changedTouches: [touch], bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(90);
    await page.evaluate(() => {
      const el = document.getElementById('t-a');
      const rect = el.getBoundingClientRect();
      const touch = new Touch({ identifier: 91, target: el, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
      el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch], bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(90);
    check(`${vp.name}: 터치 A로 카드 한 장 배치`, await page.evaluate(() => window.__game.flags.timelineOrderDraft.length === 1));
    check(`${vp.name}: 카드 되돌리기 버튼은 한 줄짜리 짧은 한글`, await page.evaluate(() => {
      const button = document.getElementById('t-pause');
      return button && button.textContent === '한 칸' && button.scrollWidth <= button.clientWidth;
    }));
    await screenshotStableCanvas(page, path.join(gameplayLoopShotsDir, `timeline-touch-large-${vp.name}.png`));
    check(`${vp.name}: 시간선 터치 렌더 콘솔/페이지 에러 없음`, errors.length === 0);
    errors.slice(0, 6).forEach((e) => console.log('     · ' + e));
    await ctx.close();
  }

  {
    console.log('[consequence-pairs-d1] 제목→과거→현재→수리→무대→허브');
    const consequenceShotsDir = path.join(ROOT, '.omo', 'evidence', 'consequence-pairs-d1', 'screenshots');
    if (!fs.existsSync(consequenceShotsDir)) fs.mkdirSync(consequenceShotsDir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await installSpeechRecorder(ctx);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text());
    });
    await page.goto(base + '?consequence-d1=1', { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    const routes = await page.evaluate(() => window.__test.titleRoutes().map((route) => route.label));
    check('D-1: 제목에 과거·현재 세 번째 경로가 표시', routes.length === 3 && routes[2] === '과거·현재 캠페인 시작');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(90);
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => window.__game.routeCursor === 2, { timeout: 1500 });
    await page.keyboard.press('z');
    await page.waitForFunction(() => window.__game.titleScreen === 'slots', { timeout: 1500 });
    check('D-1: 세 번째 제목 카드가 캠페인 빈 슬롯으로 연결', await page.evaluate(() =>
      window.__game.newGameRoute === 'consequence-pairs'));
    await page.keyboard.press('z');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('name-overlay')).display !== 'none', { timeout: 1500 });
    await page.locator('#name-input').fill('시간그림');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__game.mode === 'dialog', { timeout: 1500 });
    for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.mode === 'dialog')); i++) {
      await page.keyboard.press('z');
      await page.waitForTimeout(70);
    }
    await page.waitForFunction(() => window.__game.mode === 'world' && window.__game.map === 'creationhall', { timeout: 2500 });
    const past = await page.evaluate(() => ({
      kind: window.__game.experienceKind,
      map: window.__game.map,
      phase: window.__test.consequenceRuntime().phase,
      checkpoint: window.__test.consequenceRuntime().checkpoint,
      live: window.__test.srLiveText(),
    }));
    check('D-1: 새 슬롯은 V11 과거 공동 창작관에서 시작', past.kind === 'consequence-pairs' &&
      past.map === 'creationhall' && past.phase === 'past' && past.checkpoint === 'past_start');
    check('D-1: 과거 방향과 D-1 안내가 aria-live에 표시', /과거, 현재보다 1일 전/.test(past.live));
    await page.waitForTimeout(160);
    await captureCanvasPng(page, path.join(consequenceShotsDir, 'd1-past-desktop.png'), true);
    const pastColor = await canvasColorProfile(page, { x: 0, y: 100, w: 720, h: 360 });

    await page.evaluate(() => {
      const g = window.__game;
      Object.assign(g.player, { x: 4, y: 4, px: 4 * 48, py: 4 * 48, dir: 'up', moving: false });
    });
    await page.waitForTimeout(90);
    await page.keyboard.press('z');
    await page.waitForFunction(() => window.__game.mode === 'choice' && window.__game.choice.options.length === 3, { timeout: 1500 });
    await page.keyboard.press('z');
    for (let i = 0; i < 3; i++) {
      await page.waitForFunction(() => window.__game.mode === 'choice' && /작업 \d\/3/.test(window.__game.choice.prompt),
        null, { timeout: 1500 });
      await page.keyboard.press('z');
      await page.waitForTimeout(90);
    }
    await page.waitForFunction(() => window.__game.mode === 'dialog', null, { timeout: 1500 });
    for (let i = 0; i < 4 && (await page.evaluate(() => window.__game.mode === 'dialog')); i++) {
      await page.keyboard.press('z');
      await page.waitForTimeout(90);
    }
    await page.waitForFunction(() => window.__test.consequenceRuntime().pastChoices.visual === 'visual_manual', { timeout: 1500 });
    await page.evaluate(() => { window.__game.mode = 'world'; window.__game.dialog = null; });
    check('D-1: 실제 작업대 입력은 수동 확인 뒤 한 번만 과거 선택을 저장', await page.evaluate(() => {
      const runtime = window.__test.consequenceRuntime();
      return runtime.pastChoices.visual === 'visual_manual' && runtime.checkpoint === 'past_rooms';
    }));

    const present = await page.evaluate(() => {
      const T = window.__test;
      T.recordConsequencePastChoice('audio', 'audio_instant');
      T.recordConsequencePastChoice('text', 'text_excerpt');
      T.recordConsequencePastChoice('ledger', 'partial');
      window.__game.tts = true;
      window.__spoken = [];
      T.beginConsequencePresent();
      return {
        phase: T.consequenceRuntime().phase,
        checkpoint: T.consequenceRuntime().checkpoint,
        map: window.__game.map,
        x: window.__game.player.x, y: window.__game.player.y,
        repairs: T.consequenceRuntime().requiredRepairIds,
        transition: Object.assign({}, window.__game.consequenceTransition),
      };
    });
    check('D-1: 같은 공동 창작관 좌표에서 현재로 돌아오며 혼합 수리가 드러남',
      present.phase === 'present' && present.checkpoint === 'present_start' && present.map === 'creationhall' &&
      present.x === 4 && present.y === 4 && present.repairs.join(',') ===
        'visual_panel,music_cue,text_panel,music_license_review,ledger_blank');
    check('D-1: 과거→현재는 같은 좌표를 유지하는 약 450ms 전환으로 시작', present.transition &&
      present.transition.duration === 27 && present.x === 4 && present.y === 4);
    await page.waitForFunction(() => /\[과거 종료\]/.test(window.__test.srLiveText()), { timeout: 1500 });
    await page.waitForFunction(() => window.__game.consequenceTransition &&
      window.__game.consequenceTransition.announcedCurrent, { timeout: 1500 });
    check('D-1: 낭독기는 과거 종료 뒤 현재 시작을 순서대로 안내', await page.evaluate(() =>
      /\[현재 시작\]/.test(window.__test.srLiveText())));
    check('D-1: TTS는 첫 문장을 취소하지 않고 두 안내를 한 번에 순서대로 읽음', await page.evaluate(() =>
      window.__spoken.length === 1 && /\[과거 종료\].*\[현재 시작\]/.test(window.__spoken[0])));
    await page.waitForFunction(() => !window.__game.consequenceTransition, { timeout: 1500 });
    await page.evaluate(() => { window.__game.tts = false; });
    await captureCanvasPng(page, path.join(consequenceShotsDir, 'd1-present-desktop.png'), true);
    const presentColor = await canvasColorProfile(page, { x: 0, y: 100, w: 720, h: 360 });
    check('D-1: 같은 공간의 과거는 회색이고 현재는 컬러로 복원', pastColor.ratio < 0.08 &&
      presentColor.ratio > pastColor.ratio + 0.2);
    check('D-1: 현재 방향과 공동 창작관 안내가 aria-live에 표시', await page.evaluate(() =>
      /현재, 공동 창작관/.test(window.__test.srLiveText())));

    const repairStops = [
      { x: 4, y: 4, times: 1 }, { x: 20, y: 4, times: 2 },
      { x: 4, y: 12, times: 1 }, { x: 20, y: 12, times: 1 },
    ];
    for (const stop of repairStops) {
      for (let n = 0; n < stop.times; n++) {
        await page.evaluate(({ x, y }) => {
          const g = window.__game;
          g.mode = 'world'; g.dialog = null; g.choice = null;
          Object.assign(g.player, { x, y, px: x * 48, py: y * 48, dir: 'up', moving: false });
        }, stop);
        await page.keyboard.press('z');
        await page.waitForFunction(() => window.__game.mode === 'choice', { timeout: 1500 });
        await page.keyboard.press('z');
        await page.waitForFunction(() => window.__game.mode === 'dialog', { timeout: 1500 });
        for (let i = 0; i < 3 && (await page.evaluate(() => window.__game.mode === 'dialog')); i++) {
          await page.keyboard.press('z');
          await page.waitForTimeout(60);
        }
        await page.waitForFunction(() => window.__game.mode === 'world', { timeout: 1500 });
      }
    }
    check('D-1: 다섯 현재 수리를 실제 작업대 입력으로 완료', await page.evaluate(() =>
      window.__test.consequenceRuntime().checkpoint === 'repairs_done'));
    await page.evaluate(() => {
      const g = window.__game;
      Object.assign(g.player, { x: 12, y: 10, px: 12 * 48, py: 10 * 48, dir: 'up', moving: false });
    });
    await page.keyboard.press('z');
    await page.waitForFunction(() => window.__game.mode === 'dialog', { timeout: 1500 });
    for (let i = 0; i < 3 && (await page.evaluate(() => window.__game.mode === 'dialog')); i++) {
      await page.keyboard.press('z');
      await page.waitForTimeout(60);
    }
    await page.waitForFunction(() => window.__game.mode === 'battle' && window.__game.battle.consequenceStage, { timeout: 1500 });
    check('D-1: 모든 수리 뒤 겹친 무대 설득이 독립 배틀로 시작', await page.evaluate(() => {
      const b = window.__game.battle;
      return b && b.consequenceStage && b.p.subjectKind === 'place' && b.p.completionMode === 'stage';
    }));
    await page.evaluate(() => window.__test.retreatPersuasion());
    await page.evaluate(() => { window.__game.mode = 'world'; window.__game.dialog = null; window.__test.restartConsequenceStage(); });
    const secondRetreat = await page.evaluate(() => {
      window.__test.retreatPersuasion();
      return window.__game.dialog.lines.slice();
    });
    check('D-1: 두 번째 후퇴는 저장된 구간과 다음 단서를 화면에 안내', secondRetreat.some((line) =>
      /\[구간 도움\]/.test(line) && /이름표 0\/3/.test(line)));
    await page.evaluate(() => { window.__game.mode = 'world'; window.__game.dialog = null; window.__test.restartConsequenceStage(); });
    const thirdRetreat = await page.evaluate(() => {
      window.__test.retreatPersuasion();
      return {
        lines: window.__game.dialog.lines.slice(),
        finale: Object.assign({}, window.__test.consequenceRuntime().finale),
      };
    });
    check('D-1: 세 번째 후퇴는 25% 느린 파도 도움을 켜고 알림', thirdRetreat.finale.assistLevel === 3 &&
      thirdRetreat.finale.slowWaveEnabled && thirdRetreat.lines.some((line) => /\[도움 켜짐\].*25%/s.test(line)));
    await page.evaluate(() => { window.__game.mode = 'world'; window.__game.dialog = null; window.__test.restartConsequenceStage(); });
    await captureCanvasPng(page, path.join(consequenceShotsDir, 'd1-finale-desktop.png'));

    await page.evaluate(() => {
      const b = window.__game.battle;
      b.wave = null; b.phase = 'menu'; b.gauge = b.gaugeMax; b.spareReady = true; b.menuIdx = 3;
    });
    await page.keyboard.press('z');
    await page.waitForFunction(() => window.__game.map === 'timelinehub' && window.__game.mode === 'dialog' && !window.__game.battle, { timeout: 1500 });
    check('D-1: 실제 안아 주기는 결과 대사와 시간선 허브로 직행', await page.evaluate(() => {
      const runtime = window.__test.consequenceRuntime();
      return runtime.phase === 'result' && runtime.checkpoint === 'complete' && runtime.complete &&
        window.__game.map === 'timelinehub';
    }));
    for (let i = 0; i < 4 && (await page.evaluate(() => window.__game.mode === 'dialog')); i++) {
      await page.keyboard.press('z');
      await page.waitForTimeout(60);
    }
    await page.waitForFunction(() => window.__game.mode === 'world' && window.__game.map === 'timelinehub', { timeout: 1500 });
    await captureCanvasPng(page, path.join(consequenceShotsDir, 'd1-hub-desktop.png'), true);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fabletest2-memento-preview-slot-0')));
    check('D-1: 완료 슬롯은 V11 캠페인 종류와 허브 체크포인트를 저장', stored && stored.v === 11 &&
      stored.experienceKind === 'consequence-pairs' && stored.flags.copyrightSlice.checkpoint === 'complete');
    check('D-1: 키보드 전 경로에서 콘솔/페이지 에러 없음', errors.length === 0);
    errors.slice(0, 6).forEach((e) => console.log('     · ' + e));
    await ctx.close();
  }

  {
    console.log('[consequence-pairs-4] D-1 완료→순차 과거·현재→수리→무대→허브');
    const consequencePairs4Dir = path.join(ROOT, '.omo', 'evidence', 'consequence-pairs-4');
    const consequencePairs4ShotsDir = path.join(consequencePairs4Dir, 'screenshots');
    if (!fs.existsSync(consequencePairs4ShotsDir)) fs.mkdirSync(consequencePairs4ShotsDir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text());
    });
    const journeys = [
      {
        pairId: 'd3_consent', mapId: 'synthesis_broadcast_room', shot: 'd3',
        choices: [['likeness', 'likeness_manual'], ['voice', 'voice_assisted'],
          ['scene', 'scene_instant'], ['consent', 'consent_partial']],
      },
      {
        pairId: 'd5_recommendation', mapId: 'recommendation_alley', shot: 'd5',
        choices: [['echo', 'echo_manual'], ['sample', 'sample_assisted'],
          ['route', 'route_instant'], ['recommendationNote', 'recommendation_note_partial']],
      },
      {
        pairId: 'd7_misinformation', mapId: 'newsroom_repair', shot: 'd7',
        choices: [['tip', 'tip_manual'], ['context', 'context_assisted'],
          ['bulletin', 'bulletin_instant'], ['audit', 'audit_partial']],
      },
      {
        pairId: 'd10_judgment', mapId: 'cozy_control_room', shot: 'd10',
        choices: [['call', 'call_manual'], ['safety', 'safety_assisted'],
          ['comfort', 'comfort_instant'], ['authority', 'authority_partial']],
      },
    ];
    try {
      await page.goto(base + '?consequence-pairs-4=1', { waitUntil: 'load' });
      await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
      await page.locator('#loading').waitFor({ state: 'detached', timeout: 1500 });

      await page.evaluate(() => {
        const T = window.__test, g = window.__game;
        T.startNewGameForRoute(0, '순차기록', 'consequence-pairs');
        g.flags.copyrightSlice.complete = true;
        g.flags.copyrightSlice.phase = 'result';
        g.flags.copyrightSlice.checkpoint = 'complete';
        g.flags.copyrightSlice.stageRestored = true;
        g.flags.consequenceCampaign.activePairId = null;
        g.flags.consequenceCampaign.completedPairIds = ['d1_copyright'];
        g.flags.consequenceCampaign.hubCheckpoint = 'pair_select';
        g.map = 'timelinehub'; g.mode = 'world'; g.dialog = null; g.choice = null;
      });

      for (let index = 0; index < journeys.length; index++) {
        const journey = journeys[index];
        const past = await page.evaluate((item) => {
          const T = window.__test, g = window.__game;
          const start = typeof T.startConsequencePair === 'function' && T.startConsequencePair(item.pairId);
          const runtime = T.consequenceRuntime();
          return {
            start, map: g.map, x: g.player.x, y: g.player.y,
            runtime, live: T.srLiveText(),
          };
        }, journey);
        check(`${journey.pairId}: 허브 시작 API가 고유 지도 과거를 연다`, past.start === true &&
          past.map === journey.mapId && past.runtime && past.runtime.pairId === journey.pairId &&
          past.runtime.phase === 'past' && past.runtime.checkpoint === 'past_start');
        if (!(past.start === true && past.map === journey.mapId && past.runtime &&
          past.runtime.pairId === journey.pairId && past.runtime.phase === 'past')) {
          throw new Error(`${journey.pairId}: later-pair hub start/map contract is unavailable`);
        }
        check(`${journey.pairId}: 고유 지도 과거가 회색 [과거 ←]로 안내`, /\[과거 ←\]/.test(past.live));
        await captureCanvasPng(page, path.join(consequencePairs4ShotsDir, `${journey.shot}-past-desktop.png`), true);
        const pastColor = await canvasColorProfile(page, { x: 0, y: 100, w: 720, h: 360 });
        check(`${journey.pairId}: 과거 지도는 회색 팔레트다`, pastColor.ratio < 0.08);

        await page.evaluate(() => {
          const p = window.__game.player;
          Object.assign(p, { x: 4, y: 4, px: 4 * 48, py: 4 * 48, dir: 'up', moving: false });
          window.__game.mode = 'world';
          window.__game.dialog = null;
          window.__game.choice = null;
        });
        await page.keyboard.press('z');
        await page.waitForFunction(() => window.__game.mode === 'choice' && window.__game.choice.options.length === 3);
        check(`${journey.pairId}: 실제 Z 조사로 첫 방의 3가지 선택을 연다`,
          await page.evaluate(() => window.__game.choice.options.length === 3));
        await page.keyboard.press('z');
        await page.waitForFunction(() => window.__game.mode === 'choice' && /작업 1\/3/.test(window.__game.choice.prompt));
        for (let step = 1; step <= 3; step++) {
          await page.keyboard.press('z');
          if (step < 3) {
            await page.waitForFunction((nextStep) => window.__game.mode === 'choice' &&
              new RegExp(`작업 ${nextStep}\\/3`).test(window.__game.choice.prompt), step + 1);
          }
        }
        await page.waitForFunction(() => window.__game.mode === 'dialog');
        const [firstStation, firstChoice] = journey.choices[0];
        check(`${journey.pairId}: 실제 확인 행동이 첫 과거 선택을 저장`,
          await page.evaluate(([stationId, choiceId]) =>
            window.__test.consequenceRuntime().pastChoices[stationId] === choiceId,
          [firstStation, firstChoice]));
        for (let i = 0; i < 3 && (await page.evaluate(() => window.__game.mode === 'dialog')); i++) {
          await page.keyboard.press('z');
          await page.waitForTimeout(60);
        }
        await page.waitForFunction(() => window.__game.mode === 'world');

        for (const [station, choice] of journey.choices.slice(1)) {
          const recorded = await page.evaluate(([stationId, choiceId]) =>
            window.__test.recordConsequencePastChoice(stationId, choiceId), [station, choice]);
          check(`${journey.pairId}: ${station} 과거 선택이 기록된다`, recorded === true);
        }
        const present = await page.evaluate(() => {
          const T = window.__test, g = window.__game;
          const before = { map: g.map, x: g.player.x, y: g.player.y };
          const began = T.beginConsequencePresent();
          return { began, before, map: g.map, x: g.player.x, y: g.player.y, runtime: T.consequenceRuntime() };
        });
        check(`${journey.pairId}: 같은 지도·좌표에서 현재로 전환`, present.began === true &&
          present.map === journey.mapId && present.x === present.before.x && present.y === present.before.y &&
          present.runtime.phase === 'present' && present.runtime.checkpoint === 'present_start');
        await page.waitForFunction(() => !window.__game.consequenceTransition, { timeout: 1500 });
        const presentLive = await page.evaluate(() => window.__test.srLiveText());
        await captureCanvasPng(page, path.join(consequencePairs4ShotsDir, `${journey.shot}-present-desktop.png`), true);
        const presentColor = await canvasColorProfile(page, { x: 0, y: 100, w: 720, h: 360 });
        check(`${journey.pairId}: 컬러 현재와 [현재 →]가 전환 뒤 남는다`,
          /\[현재 →\]/.test(presentLive) && presentColor.ratio > pastColor.ratio + 0.2);

        const repairs = await page.evaluate(() => window.__test.consequenceRuntime().requiredRepairIds.slice());
        for (const repairId of repairs) {
          const repaired = await page.evaluate((id) => window.__test.completeConsequenceRepair(id), repairId);
          check(`${journey.pairId}: ${repairId} 현재 수리가 완료된다`, repaired === true);
        }
        if (journey.pairId === 'd7_misinformation') {
          const identity = await page.evaluate(() => {
            const T = window.__test, g = window.__game;
            const blocked = T.beginConsequenceFinale({ skipIntro: true }) === false;
            const revealed = typeof T.revealConsequenceIdentity === 'function' && T.revealConsequenceIdentity();
            return {
              blocked, revealed, checkpoint: T.consequenceRuntime().checkpoint,
              lines: g.dialog && g.dialog.lines ? g.dialog.lines.slice() : [],
            };
          });
          check('d7_misinformation: 관리자 서명 전 무대는 잠기고 제한된 사실만 공개',
            identity.blocked && identity.revealed && identity.checkpoint === 'identity_revealed' &&
            identity.lines.some((line) => line === '[관리자 서명] 순차기록') &&
            identity.lines.some((line) => line === '확인된 사실: 과거 관리자는 나였다') &&
            identity.lines.every((line) => !/반디.*영이|기억.*지웠|고요.*비상/.test(line)));
          await page.keyboard.press('z');
          await page.waitForFunction(() => {
            const d = window.__game.dialog;
            return d && d.idx === 0 && d.chars >= d.lines[0].length;
          }, { timeout: 1500 });
          await captureCanvasPng(page, path.join(consequencePairs4ShotsDir, 'd7-identity-desktop.png'), true);
          await page.keyboard.press('z');
          await page.waitForFunction(() => window.__game.dialog && window.__game.dialog.idx === 1, { timeout: 1500 });
          await page.keyboard.press('z');
          await page.waitForFunction(() => {
            const d = window.__game.dialog;
            return d && d.idx === 1 && d.chars >= d.lines[1].length;
          }, { timeout: 1500 });
          await captureCanvasPng(page, path.join(consequencePairs4ShotsDir, 'd7-identity-fact-desktop.png'), true);
          for (let i = 0; i < 4 && (await page.evaluate(() => window.__game.mode === 'dialog')); i++) {
            await page.keyboard.press('z');
            await page.waitForTimeout(60);
          }
          await page.waitForFunction(() => window.__game.mode === 'world', { timeout: 1500 });
        } else {
          check(`${journey.pairId}: 관리자 서명 단계는 열리지 않는다`,
            await page.evaluate(() => window.__test.revealConsequenceIdentity() === false));
        }
        const finale = await page.evaluate(() => {
          const T = window.__test, g = window.__game;
          const began = T.beginConsequenceFinale({ skipIntro: true });
          return { began, checkpoint: T.consequenceRuntime().checkpoint, battle: g.battle };
        });
        check(`${journey.pairId}: 수리 뒤 장소형 무대에 들어간다`, finale.began === true &&
          finale.checkpoint === 'finale_start' && finale.battle && finale.battle.consequenceStage &&
          finale.battle.p && finale.battle.p.subjectKind === 'place' && finale.battle.p.completionMode === 'stage');
        const hub = await page.evaluate(() => {
          const T = window.__test;
          const complete = T.completeStagePersuasion();
          return { complete, map: window.__game.map, projection: T.consequenceHubProjection() };
        });
        const next = hub.projection[index + 2];
        const later = hub.projection.slice(index + 3);
        check(`${journey.pairId}: 완료는 허브에서 다음 쌍만 연다`, hub.complete === true &&
          hub.map === 'timelinehub' && (!next || !next.locked) && later.every((pair) => pair.locked));
      }
      check('D-3~D-10: 순차 여정의 콘솔/페이지 에러 없음', errors.length === 0);
    } finally {
      fs.writeFileSync(path.join(consequencePairs4Dir, 'console-page-errors.json'), JSON.stringify(errors, null, 2) + '\n');
      await ctx.close();
    }
  }

  for (const vp of VIEWPORTS.filter((item) => item.mobile)) {
    console.log(`[consequence-pairs-d1-${vp.name}] 과거·현재·무대·허브 반응형 표면`);
    const consequenceShotsDir = path.join(ROOT, '.omo', 'evidence', 'consequence-pairs-d1', 'screenshots');
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
    });
    await installSpeechRecorder(ctx);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text());
    });
    await page.goto(base + `?consequence-d1-${vp.name}=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    if (vp.name === 'mobile-portrait') await page.click('#rotate-dismiss');
    await page.evaluate(() => {
      const T = window.__test, g = window.__game;
      T.startNewGameForRoute(0, '모바일기록', 'consequence-pairs');
      g.mode = 'world'; g.dialog = null;
    });
    await page.waitForTimeout(160);
    const touchPast = await page.evaluate(() => ({
      title: window.__test.srLiveText(),
      touchVisible: getComputedStyle(document.getElementById('touch-ui')).display !== 'none',
      actionLabel: document.getElementById('t-a').getAttribute('aria-label'),
      actionText: document.getElementById('t-a').textContent.trim(),
    }));
    check(`${vp.name}: 과거 표면의 터치·aria·한국어 안내가 표시`, /과거, 현재보다 1일 전/.test(touchPast.title) &&
      touchPast.touchVisible && !!touchPast.actionLabel && touchPast.actionText.length > 0);
    await captureCanvasPng(page, path.join(consequenceShotsDir, `d1-past-${vp.name}.png`), true);
    const mobilePresent = await page.evaluate(() => {
      const T = window.__test;
      T.recordConsequencePastChoice('visual', 'visual_manual');
      T.recordConsequencePastChoice('audio', 'audio_instant');
      T.recordConsequencePastChoice('text', 'text_excerpt');
      T.recordConsequencePastChoice('ledger', 'partial');
      T.beginConsequencePresent();
      return T.consequenceRuntime();
    });
    check(`${vp.name}: 현재 전환은 같은 지도에서 수리 목록을 보존`, mobilePresent.phase === 'present' &&
      mobilePresent.checkpoint === 'present_start' && mobilePresent.requiredRepairIds.length === 5);
    await page.waitForFunction(() => !window.__game.consequenceTransition, { timeout: 1500 });
    await captureCanvasPng(page, path.join(consequenceShotsDir, `d1-present-${vp.name}.png`), true);
    await page.evaluate(() => {
      const T = window.__test;
      T.consequenceRuntime().requiredRepairIds.forEach((id) => T.completeConsequenceRepair(id));
      T.beginConsequenceFinale({ skipIntro: true });
    });
    await page.waitForFunction(() => window.__game.mode === 'battle', { timeout: 1500 });
    await captureCanvasPng(page, path.join(consequenceShotsDir, `d1-finale-${vp.name}.png`));
    await page.evaluate(() => {
      const b = window.__game.battle;
      b.wave = null; b.phase = 'menu'; b.gauge = b.gaugeMax; b.spareReady = true; b.menuIdx = 3;
      window.__test.completeStagePersuasion();
      window.__game.dialog = null; window.__game.mode = 'world';
    });
    await page.waitForFunction(() => window.__game.mode === 'world' && window.__game.map === 'timelinehub', { timeout: 1500 });
    const touchHub = await page.evaluate(() => ({
      title: window.__test.srLiveText(),
      buttons: ['t-a', 't-hint', 't-menu', 't-pause', 't-teacher'].map((id) => {
        const el = document.getElementById(id);
        return el && el.getAttribute('aria-label');
      }),
    }));
    check(`${vp.name}: 허브의 한국어 접근성 버튼 이름이 유지`, touchHub.buttons.every(Boolean));
    await captureCanvasPng(page, path.join(consequenceShotsDir, `d1-hub-${vp.name}.png`), true);
    check(`${vp.name}: D-1 반응형 경로 콘솔/페이지 에러 없음`, errors.length === 0);
    errors.slice(0, 6).forEach((e) => console.log('     · ' + e));
    await ctx.close();
  }

  {
    console.log('[consequence-pairs-d1-reload] V11 present_start 이어 하기');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text());
    });
    await page.goto(base + '?consequence-d1-reload=1', { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    await page.evaluate(() => {
      const T = window.__test, g = window.__game;
      T.startNewGameForRoute(0, '이어기록', 'consequence-pairs');
      g.mode = 'world'; g.dialog = null;
      T.recordConsequencePastChoice('visual', 'visual_manual');
      T.recordConsequencePastChoice('audio', 'audio_instant');
      T.recordConsequencePastChoice('text', 'text_excerpt');
      T.recordConsequencePastChoice('ledger', 'partial');
      T.beginConsequencePresent();
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(90);
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => window.__game.routeCursor === 2, { timeout: 1500 });
    await page.keyboard.press('z');
    await page.waitForFunction(() => window.__game.titleScreen === 'slots', { timeout: 1500 });
    await page.keyboard.press('z');
    await page.waitForFunction(() => window.__game.mode === 'world' && window.__game.map === 'creationhall', { timeout: 2500 });
    check('D-1: V11 present_start는 새 페이지의 세 번째 경로에서도 현재 단계로 복원', await page.evaluate(() => {
      const runtime = window.__test.consequenceRuntime();
      return window.__game.experienceKind === 'consequence-pairs' && runtime.phase === 'present' &&
        runtime.checkpoint === 'present_start' && runtime.requiredRepairIds.length === 5;
    }));
    check('D-1: V11 이어 하기 콘솔/페이지 에러 없음', errors.length === 0);
    errors.slice(0, 6).forEach((e) => console.log('     · ' + e));
    await ctx.close();
  }

  // 핵심 게임플레이 렌더: 타이틀 외에 '월드'까지 실제 브라우저에서 그려지는지
  // (캔버스 메인 렌더 경로의 회귀를 잡는다 — node 스모크는 목 캔버스라 못 잡음)
  {
    console.log('[gameplay] 월드 진입 렌더 (2장)');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text());
    });
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    const entered = await page.evaluate(() => {
      window.__test.applyTiltStreetClass();   // 2장 「기울어진 거리」 시작 상태로 진입
      window.__game.mode = 'world';
      return window.__game.mode === 'world';
    });
    await page.waitForTimeout(600); // 여러 프레임 렌더 (크래시면 프레임 오류 누적)
    check('월드 진입 성공', entered);
    check('렌더 후에도 월드 유지(프레임 크래시 없음)', (await page.evaluate(() => window.__game.mode)) === 'world');
    check('월드 렌더 콘솔/페이지 에러 없음', errors.length === 0);
    const worldColor = await canvasColorProfile(page, { x: 0, y: 0, w: 720, h: 528 });
    check(`현재 월드는 컬러 순행 팔레트(${Math.round(worldColor.ratio * 100)}%)`, worldColor.ratio > 0.08);
    errors.slice(0, 6).forEach((e) => console.log('     · ' + e));
    await page.screenshot({ path: path.join(shotsDir, 'browser-gameplay.png') });
    await ctx.close();
  }

  // 큰 글씨 모드(1.25×) 렌더: 전 화면 fs() 전환(P-1) 회귀 검증 — 타이틀·월드·메뉴가
  // 배율 적용 상태로 프레임 오류 없이 그려지는지 본다.
  {
    console.log('[largetext] 큰 글씨 모드 렌더');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    await page.evaluate(() => { window.__game.largeText = true; });
    await page.waitForTimeout(300); // 타이틀 렌더
    await page.evaluate(() => {
      window.__test.applyTiltStreetClass();
      window.__game.largeText = true;
      window.__game.mode = 'world';
    });
    await page.waitForTimeout(300); // 월드 렌더
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300); // 일시정지 메뉴 렌더
    check('큰 글씨: 렌더 유지(프레임 크래시 없음)', (await page.evaluate(() => window.__game.mode)) !== undefined && errors.length === 0);

    // Y-13 큰 글씨 오버플로 실렌더 검사 — 데이터의 최장 대사/주장/조사 플레이버를 실제
    // 폰트(1.25×)로 줄바꿈해, 어떤 줄도 대화 상자 폭을 넘지 않는지 measureText 실값으로 본다.
    const ov = await page.evaluate(() => { window.__game.largeText = true; return window.__test.checkTextOverflow(); });
    check(`Y-13 큰 글씨: 대사/주장 표본 충분히 수집(${ov.sampled}개)`, ov.sampled > 100);
    check(`Y-13 큰 글씨: 최장 줄폭이 상자 폭 안(${ov.worstW}/${ov.dialogMaxW}px)`, ov.worstW <= ov.dialogMaxW);
    check(`Y-13 큰 글씨: 상자 밖으로 넘치는 대사 0건(넘침 ${ov.overCount}건)`, ov.overCount === 0);
    if (ov.overCount) ov.over.forEach((o) => console.log(`     · 넘침(${o.w}px): ${o.line}`));

    await page.screenshot({ path: path.join(shotsDir, 'browser-largetext.png') });
    await ctx.close();
  }

  for (const vp of VIEWPORTS) {
    console.log(`[memento-${vp.name}] 기록·일지·복원 렌더`);
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.mobile, isMobile: vp.mobile,
      deviceScaleFactor: vp.mobile ? 2 : 1,
    });
    await installSpeechRecorder(ctx);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text());
    });
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    if (vp.name === 'mobile-portrait') await page.click('#rotate-dismiss');
    const started = await page.evaluate(() => {
      const g = window.__game, T = window.__test;
      g.currentSlot = 0;
      g.flags = T.newFlags();
      g.tts = true;
      T.unlockDamagedRecord(1);
      T.startDamagedRecord('reset_after', { ret: 'world' });
      return {
        mode: g.mode,
        id: g.record && g.record.ids[0],
        discovery: g.record && g.record.discovery,
        live: T.srLiveText(),
      };
    });
    await page.waitForTimeout(250);
    check(`${vp.name}: 손상 기록 화면 진입`, started.mode === 'record' && started.id === 'reset_after');
    check(`${vp.name}: 본문 전에 기록 발견 선택 화면 진입`, started.discovery === true);
    check(`${vp.name}: 기록 발견 선택이 aria-live에 연결됨`, /손상 기록/.test(await page.evaluate(() => window.__test.srLiveText() || '')));
    if (vp.mobile) {
      const recordControls = await page.evaluate(() => ({
        action: document.getElementById('t-a').getAttribute('aria-label'),
        actionSub: document.querySelector('#t-a .sub').textContent,
        cancel: document.getElementById('t-pause').getAttribute('aria-label'),
        cancelText: document.getElementById('t-pause').textContent,
      }));
      check(`${vp.name}: 발견 화면 터치 조작명이 복원·나중에로 바뀜`,
        recordControls.action === '기록 복원 시작' && recordControls.actionSub === '복원하기' &&
        recordControls.cancel === '나중에 보기' && recordControls.cancelText === '나중에');
    }
    await page.screenshot({ path: path.join(mementoShotsDir, `record-discovery-${vp.name}.png`) });
    if (vp.mobile) await page.tap('#t-a');
    else await page.keyboard.press('z');
    await page.waitForFunction(() => window.__game.record && window.__game.record.discovery === false, { timeout: 1000 });
    check(`${vp.name}: 복원하기 뒤 기록 첫 페이지 진입`,
      (await page.evaluate(() => window.__game.record && window.__game.record.page)) === 0);
    if (vp.mobile) {
      check(`${vp.name}: 기록 본문 A 버튼에 다음이 보임`,
        (await page.locator('#t-a .sub').textContent()) === '다음');
    }
    const reverseColor = await canvasColorProfile(page, { x: 36, y: 66, w: 648, h: 160 });
    check(`${vp.name}: 역행 비네트는 회색 명도만 사용`, reverseColor.visible > 100 && reverseColor.ratio < 0.01);
    await page.screenshot({ path: path.join(mementoShotsDir, `record-${vp.name}.png`) });
    if (vp.name === 'desktop') {
      await page.evaluate(() => { window.__game.largeText = true; });
      await page.waitForTimeout(100);
      check('desktop: 큰 글씨 기록 화면 유지', (await page.evaluate(() => window.__game.mode)) === 'record');
      await page.screenshot({ path: path.join(mementoShotsDir, 'record-large-text.png') });
      await page.evaluate(() => { window.__game.largeText = false; });
    }

    if (vp.mobile) await page.tap('#t-pause');
    else await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__game.mode === 'world', { timeout: 1000 });
    const skipped = await page.evaluate(() => ({
      mode: window.__game.mode,
      skipped: window.__game.flags.skippedRecords.reset_after,
      pending: window.__game.flags.pendingRecord,
    }));
    check(`${vp.name}: 기록 건너뛰기 저장`, skipped.mode === 'world' && skipped.skipped === true && skipped.pending === null);
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(mementoShotsDir, `hud-${vp.name}.png`) });
    if (vp.mobile) {
      await page.tap('#t-pause');
      await page.waitForFunction(() => window.__game.mode === 'pause', { timeout: 1000 });
      await page.tap('#t-a');
      await page.waitForFunction(() => window.__game.mode === 'memoryroom', { timeout: 1000 });
      await page.tap('#t-a');
    } else {
      await page.keyboard.press('j');
    }
    await page.waitForFunction(() => window.__game.mode === 'journal', { timeout: 1000 });
    await page.waitForFunction(() => window.__game.journal.tab === 'records', { timeout: 1000 });
    const journal = await page.evaluate(() => ({ mode: window.__game.mode, tab: window.__game.journal.tab }));
    check(`${vp.name}: 일지 기록 탭 진입`, journal.mode === 'journal' && journal.tab === 'records');
    await page.waitForTimeout(200);
    const journalA11y = await page.evaluate(() => ({
      live: window.__test.srLiveText() || '',
      spoken: window.__spoken[window.__spoken.length - 1] || '',
    }));
    check(`${vp.name}: 일지 선택이 aria-live에 연결됨`,
      /손상된 기록 탭/.test(journalA11y.live) && /1개 중 1번째/.test(journalA11y.live));
    check(`${vp.name}: 일지 선택이 TTS에 연결됨`,
      /손상된 기록 탭/.test(journalA11y.spoken) && /1개 중 1번째/.test(journalA11y.spoken));
    if (vp.mobile) {
      const journalControls = await page.evaluate(() => ({
        action: document.getElementById('t-a').getAttribute('aria-label'),
        actionSub: document.querySelector('#t-a .sub').textContent,
        cancel: document.getElementById('t-pause').getAttribute('aria-label'),
        cancelText: document.getElementById('t-pause').textContent,
      }));
      check(`${vp.name}: 일지 터치 조작명이 다시보기·닫기로 바뀜`,
        journalControls.action === '선택한 기록 다시보기' && journalControls.actionSub === '다시보기' &&
        journalControls.cancel === '모험 일지 닫기' && journalControls.cancelText === '닫기');
    }
    await page.screenshot({ path: path.join(mementoShotsDir, `journal-${vp.name}.png`) });

    if (vp.mobile) await page.tap('#t-a');
    else await page.keyboard.press('z');
    await page.waitForFunction(() => window.__game.mode === 'record', { timeout: 1000 });
    check(`${vp.name}: 일지에서 기록 다시보기`, (await page.evaluate(() => window.__game.mode)) === 'record');
    if (vp.mobile) await page.tap('#t-pause');
    else await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__game.mode === 'journal', { timeout: 1000 });
    check(`${vp.name}: 다시보기 뒤 일지 복귀`, (await page.evaluate(() => window.__game.mode)) === 'journal');

    const restoredMode = await page.evaluate(() => {
      const g = window.__game, T = window.__test;
      g.mode = 'world';
      g.flags.damagedRecords = ['reset_after', 'reset_before', 'city_failure', 'yeongi_warning', 'first_approval'];
      T.startTimelineRestoration({ ret: 'world' });
      return { mode: g.mode, ids: g.record.ids.slice(), restored: g.record.restored };
    });
    await page.waitForTimeout(250);
    check(`${vp.name}: 실제 시간순 복원 화면 진입`, restoredMode.mode === 'record' && restoredMode.restored === true &&
      restoredMode.ids.join(',') === 'first_approval,yeongi_warning,city_failure,reset_before,reset_after');
    const restoredColor = await canvasColorProfile(page, { x: 36, y: 66, w: 648, h: 160 });
    check(`${vp.name}: 순행 복원 비네트에 색이 돌아옴`, restoredColor.ratio > 0.08);
    await page.screenshot({ path: path.join(mementoShotsDir, `restoration-${vp.name}.png`) });
    check(`${vp.name}: 기록 화면 콘솔/페이지 에러 없음`, errors.length === 0);
    errors.slice(0, 6).forEach((e) => console.log('     · ' + e));
    await ctx.close();
  }

  {
    console.log('[memento-endings] 네 엔딩 결과 장면 렌더');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await installSpeechRecorder(ctx);
    const errors = [];
    for (const id of ['home', 'silent', 'dawn', 'farewell']) {
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text());
      });
      await page.goto(base, { waitUntil: 'load' });
      await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
      const state = await page.evaluate((endingId) => {
        const g = window.__game, T = window.__test;
        g.flags = T.newFlags();
        g.flags.endingId = endingId;
        g.mode = 'ending';
        g.endingType = 'true';
        g.endingT = 0;
        g.tts = true;
        const scene = T.endingScene(endingId);
        T.announceEnding(endingId);
        return { mode: g.mode, title: scene.title, lines: scene.lines.length };
      }, id);
      await page.waitForTimeout(100);
      if (id === 'home') {
        await page.evaluate(() => { window.__game.reduceFx = true; });
        await page.waitForTimeout(100);
        const stillA = await page.evaluate(() => document.getElementById('game').toDataURL());
        await page.waitForTimeout(100);
        const stillB = await page.evaluate(() => document.getElementById('game').toDataURL());
        check('home: 동작 줄이기에서 별빛·캐릭터가 정지함', stillA === stillB);
      }
      const endingA11y = await page.evaluate(() => ({
        live: window.__test.srLiveText() || '',
        spoken: window.__spoken[window.__spoken.length - 1] || '',
      }));
      check(`${id}: 엔딩 문구가 aria-live에 연결됨`, endingA11y.live.includes(state.title));
      check(`${id}: 엔딩 문구가 TTS에 연결됨`, endingA11y.spoken.includes(state.title));
      check(`${id}: 엔딩 대기 중 다음 행동 시점을 aria-live로 안내`, /잠시 후/.test(endingA11y.live));
      await page.evaluate(() => {
        window.__game.reduceFx = true;
        window.__game.endingT = 600;
      });
      await page.waitForTimeout(100);
      check(`${id}: 계속 가능할 때 마을 복귀 동작을 aria-live로 안내`,
        /마을로/.test(await page.evaluate(() => window.__test.srLiveText() || '')));
      const promptPixels = await page.evaluate(() => {
        const canvas = document.getElementById('game');
        const pixels = canvas.getContext('2d').getImageData(80, 494, 560, 28).data;
        let count = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] > 200 && pixels[i + 1] > 150 && pixels[i + 2] < 120 && pixels[i + 3] > 0) count++;
        }
        return count;
      });
      check(`${id}: 기존 엔딩 화면 ID 렌더`, state.mode === 'ending' && !!state.title);
      check(`${id}: 결과·통계 문구가 화면 높이에 들어감`, state.lines <= 11);
      check(`${id}: 최종 복귀 안내가 캔버스 하단에 렌더`, promptPixels > 20);
      await page.screenshot({ path: path.join(endingShotsDir, `${id}.png`) });
      await page.close();
    }
    check('네 엔딩 화면 콘솔/페이지 에러 없음', errors.length === 0);
    errors.slice(0, 6).forEach((e) => console.log('     · ' + e));
    await ctx.close();
  }

  {
    console.log('[ending-touch-affordance] 모바일 엔딩 A 버튼 상태 안내');
    const ctx = await browser.newContext({
      viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true,
    });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    await page.evaluate(() => {
      window.__game.flags = window.__test.newFlags();
      window.__game.flags.endingId = 'home';
      window.__game.mode = 'ending';
      window.__game.endingType = 'true';
      window.__game.endingT = 0;
    });
    await page.waitForTimeout(100);
    check('모바일 엔딩 대기 중 A 보조 문구가 잠시만',
      (await page.locator('#t-a .sub').textContent()) === '잠시만');
    await page.evaluate(() => { window.__game.endingT = 600; });
    await page.waitForTimeout(100);
    check('모바일 엔딩 계속 가능 시 A 보조 문구가 마을로',
      (await page.locator('#t-a .sub').textContent()) === '마을로');
    await ctx.close();
  }

  // Y-18·Y-20 새 교사 화면 렌더 — 반 순위표·사전/사후 점검이 실브라우저에서 크래시 없이 그려지는지
  {
    console.log('[teacher-screens] Y-18 사전/사후 점검 · Y-20 반 순위표 렌더');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text()); });
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    // 반 순위표 — 백업 두 개를 합산 상태로 넣고 화면을 연다
    const lbMode = await page.evaluate(() => {
      const g = window.__game, T = window.__test;
      const mk = (name, mercy, done) => ({ app: 'ai-ethics-adventure-memento-preview', version: 1, data: {
        'fabletest2-memento-preview-slot-0': JSON.stringify({ v: 8, name, flags: { mercy, defeated: done ? { yeongi: true } : {} } }),
        'fabletest2-memento-preview-stats-0': JSON.stringify({ privacy: { correct: 7, total: 10 } }),
        'fabletest2-memento-preview-meta-0': JSON.stringify({ bossRank: { sujipmon: 'S' } }),
      } });
      g.leaderboard.rows = T.backupSlotRows(mk('가온', 8, true)).concat(T.backupSlotRows(mk('나래', 3, false)));
      g.leaderboard.files = 2;
      T.openLeaderboard('title');
      return g.mode;
    });
    await page.waitForTimeout(300);
    check('Y-20 반 순위표 진입', lbMode === 'leaderboard');
    check('Y-20 반 순위표 렌더 크래시 없음', (await page.evaluate(() => window.__game.mode)) === 'leaderboard');
    await page.screenshot({ path: path.join(shotsDir, 'browser-leaderboard.png') });
    // 사전/사후 점검 — 사전 점검을 열어 인트로→문제→피드백까지 실제로 진행해 본다
    const ppMode = await page.evaluate(() => { window.__test.openPrepost('pre', 'trace', 'title'); return window.__game.mode; });
    await page.waitForTimeout(200);
    check('Y-18 사전 점검 진입(인트로)', ppMode === 'prepost' && (await page.evaluate(() => window.__game.prepost.phase)) === 'intro');
    await page.keyboard.press('z'); await page.waitForTimeout(150); // 인트로 → 문제
    const qPhase = await page.evaluate(() => window.__game.prepost && window.__game.prepost.phase);
    check('Y-18 사전 점검 문제 진행', qPhase === 'question');
    await page.keyboard.press('z'); await page.waitForTimeout(150); // 문제 → 피드백
    check('Y-18 사전 점검 렌더 크래시 없음', (await page.evaluate(() => window.__game.mode)) === 'prepost' && errors.length === 0);
    await page.screenshot({ path: path.join(shotsDir, 'browser-prepost.png') });
    errors.slice(0, 6).forEach((e) => console.log('     · ' + e));
    await ctx.close();
  }

  {
    console.log('[teacher-report-pages] 긴 학생 진단 리포트 전체 탐색');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    await page.evaluate(() => {
      const topics = [
        'privacy', 'copyright', 'consent', 'security', 'identity', 'fake', 'genai', 'deepfake', 'rumor',
        'bias', 'filterbubble', 'listen', 'balance', 'footprint', 'saving', 'environment', 'persuasion',
        'manners', 'emotion', 'responsibility', 'excuse', 'safety', 'transparency', 'core',
      ];
      const stats = {};
      for (const topic of topics) stats[topic] = { correct: 0, total: 3 };
      localStorage.setItem('fabletest2-memento-preview-slot-0', JSON.stringify({
        v: 9, name: '긴보고서', map: 'village', x: 13, y: 16,
        flags: { defeated: {}, mercy: 0, visited: {} },
      }));
      localStorage.setItem('fabletest2-memento-preview-stats-0', JSON.stringify(stats));
      window.__game.mode = 'report';
      window.__game.report.ret = 'title';
      window.__game.report.slot = 0;
      window.__game.report.page = 0;
    });
    await page.waitForTimeout(200);
    const first = await page.evaluate(() => ({
      page: window.__game.report.page,
      live: window.__test.srLiveText() || '',
      image: document.getElementById('game').toDataURL(),
    }));
    check('긴 리포트 첫 페이지와 전체 페이지 수 안내', first.page === 0 && /페이지 1 \/ [2-9]/.test(first.live));
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    const second = await page.evaluate(() => ({
      page: window.__game.report.page,
      live: window.__test.srLiveText() || '',
      image: document.getElementById('game').toDataURL(),
    }));
    check('아래 방향으로 다음 리포트 페이지 이동', second.page === 1);
    check('다음 페이지가 새 내용과 페이지 번호를 표시', second.image !== first.image && /페이지 2 \/ [2-9]/.test(second.live));
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(200);
    check('위 방향으로 이전 리포트 페이지 복귀',
      (await page.evaluate(() => window.__game.report.page)) === 0);
    await ctx.close();

    const mobileCtx = await browser.newContext({
      viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true,
    });
    const mobilePage = await mobileCtx.newPage();
    await mobilePage.goto(base, { waitUntil: 'load' });
    await mobilePage.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    await mobilePage.evaluate(() => {
      const topics = [
        'privacy', 'copyright', 'consent', 'security', 'identity', 'fake', 'genai', 'deepfake', 'rumor',
        'bias', 'filterbubble', 'listen', 'balance', 'footprint', 'saving', 'environment', 'persuasion',
        'manners', 'emotion', 'responsibility', 'excuse', 'safety', 'transparency', 'core',
      ];
      const stats = {};
      for (const topic of topics) stats[topic] = { correct: 0, total: 3 };
      localStorage.setItem('fabletest2-memento-preview-slot-0', JSON.stringify({
        v: 9, name: '모바일보고서', map: 'village', x: 13, y: 16,
        flags: { defeated: {}, mercy: 0, visited: {} },
      }));
      localStorage.setItem('fabletest2-memento-preview-stats-0', JSON.stringify(stats));
      window.__game.mode = 'report';
      window.__game.report.slot = 0;
      window.__game.report.page = 0;
    });
    await mobilePage.waitForTimeout(200);
    check('모바일 리포트 A·닫기 동작명이 화면에 맞게 변경',
      (await mobilePage.locator('#t-a .sub').textContent()) === '내보내기' &&
      (await mobilePage.locator('#t-pause').textContent()) === '닫기');
    await mobilePage.keyboard.press('ArrowDown');
    await mobilePage.waitForTimeout(200);
    check('모바일 가로에서도 다음 리포트 페이지 접근',
      (await mobilePage.evaluate(() => window.__game.report.page)) === 1);
    await mobileCtx.close();
  }

  // 멀티터치: 같은 버튼 두 손가락 → 하나만 떼도 유지, 스틱은 둘째 손가락이 탈취 못 함
  {
    console.log('[accessible-touch-buttons] 네이티브 의미와 키보드 활성화');
    const ctx = await browser.newContext({
      viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true,
    });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    await page.evaluate(() => { window.__game.titleScreen = 'slots'; });
    await page.waitForTimeout(80);
    const semantics = await page.evaluate(() => {
      const ids = ['t-a', 't-hint', 't-menu', 't-pause', 't-teacher'];
      return ids.every((id) => {
        const el = document.getElementById(id);
        return el && el.tagName === 'BUTTON' && el.type === 'button';
      });
    });
    check('터치 동작 5종이 기본 포커스를 가진 button 요소', semantics);
    await page.evaluate(() => {
      window.addEventListener('keydown', (event) => event.stopImmediatePropagation(), true);
      window.addEventListener('keyup', (event) => event.stopImmediatePropagation(), true);
    });
    await page.locator('#t-a').focus();
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
    check('A 터치 버튼에 키보드 포커스 진입', focused === 't-a');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    check('A 버튼 Enter로 새 모험 이름 화면 진입',
      (await page.evaluate(() => window.__game.titleScreen)) === 'name');
    await page.evaluate(() => {
      window.__game.mode = 'title';
      window.__game.titleScreen = 'slots';
    });
    await page.locator('#t-a').focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    check('A 버튼 Space로 새 모험 이름 화면 진입',
      (await page.evaluate(() => window.__game.titleScreen)) === 'name');
    await ctx.close();
  }

  {
    console.log('[multitouch] 태블릿 멀티터치 입력');
    const ctx = await browser.newContext({
      viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true,
    });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    const r = await page.evaluate(() => {
      // 합성 TouchEvent로 게임 요소 핸들러를 직접 구동 (e.changedTouches 기반 로직 검증)
      const mkTouch = (el, id, x, y) => new Touch({ identifier: id, target: el, clientX: x, clientY: y });
      const fire = (el, type, touches) => el.dispatchEvent(new TouchEvent(type, { changedTouches: touches, bubbles: true, cancelable: true }));
      const center = (el) => { const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; };
      const out = {};

      const btn = document.getElementById('t-a');
      const [bx, by] = center(btn);
      fire(btn, 'touchstart', [mkTouch(btn, 11, bx, by)]);
      fire(btn, 'touchstart', [mkTouch(btn, 12, bx + 4, by)]);
      fire(btn, 'touchend', [mkTouch(btn, 11, bx, by)]);          // 한 손가락만 뗌
      out.heldAfterOneUp = window.__test.heldKeys().includes('action');
      fire(btn, 'touchend', [mkTouch(btn, 12, bx + 4, by)]);      // 나머지도 뗌
      out.heldAfterAllUp = window.__test.heldKeys().includes('action');

      const stick = document.getElementById('t-stick');
      const [sx, sy] = center(stick);
      fire(stick, 'touchstart', [mkTouch(stick, 21, sx + 40, sy)]); // 오른쪽으로 밀기
      out.stickRight = window.__test.heldKeys().includes('right');
      fire(stick, 'touchstart', [mkTouch(stick, 22, sx, sy)]);      // 둘째 손가락 난입
      fire(stick, 'touchend', [mkTouch(stick, 22, sx, sy)]);        // 난입 손가락 뗌
      out.stickSurvivesSteal = window.__test.heldKeys().includes('right');
      fire(stick, 'touchend', [mkTouch(stick, 21, sx + 40, sy)]);   // 원래 손가락 뗌
      out.stickReleased = !window.__test.heldKeys().includes('right');

      fire(btn, 'touchstart', [mkTouch(btn, 31, bx, by)]);
      window.dispatchEvent(new TouchEvent('touchcancel', {
        changedTouches: [mkTouch(btn, 31, bx, by)], bubbles: true, cancelable: true,
      }));
      out.globalCancelReleased = !window.__test.heldKeys().includes('action');

      fire(stick, 'touchstart', [mkTouch(stick, 41, sx + 40, sy)]);
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      out.hiddenReleased = !window.__test.heldKeys().includes('right') &&
        document.getElementById('t-stick-knob').style.transform.includes('0px');
      return out;
    });
    check('버튼: 두 손가락 중 하나만 떼면 유지', r.heldAfterOneUp === true);
    check('버튼: 모두 떼면 릴리즈', r.heldAfterAllUp === false);
    check('스틱: 방향 입력 인식', r.stickRight === true);
    check('스틱: 둘째 손가락 탈취에도 이동 유지', r.stickSurvivesSteal === true);
    check('스틱: 원래 손가락 떼면 정지', r.stickReleased === true);
    check('전역 touchcancel에서 모든 터치 입력 해제', r.globalCancelReleased === true);
    check('앱이 숨겨질 때 방향 입력과 스틱 위치 초기화', r.hiddenReleased === true);
    await ctx.close();
  }

  {
    console.log('[service-worker-http-error] core 503 응답의 마지막 정상 캐시 폴백');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && navigator.serviceWorker.controller), { timeout: 8000 });
    serverFaults.set('/src/game.js', 503);
    const fallback = await page.evaluate(async () => {
      const response = await fetch('src/game.js?fault=503', { cache: 'no-store' });
      return { status: response.status, text: await response.text() };
    });
    serverFaults.delete('/src/game.js');
    check('core 503 대신 캐시된 game.js 200 응답', fallback.status === 200 && /window\.__game/.test(fallback.text));
    await ctx.close();
  }

  {
    console.log('[slot-delete-snapshot-failure] 삭제 안전망 실패 시 원본 보존');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    await page.evaluate(() => {
      localStorage.setItem('fabletest2-memento-preview-slot-2', JSON.stringify({ v: 9, name: '보존아이', flags: { defeated: {} } }));
      localStorage.setItem('fabletest2-memento-preview-stats-2', JSON.stringify({ privacy: { correct: 2, total: 3 } }));
      const original = Storage.prototype.setItem;
      window.__restoreStorageSetItem = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === 'fabletest2-memento-preview-deleted-slot') throw new Error('snapshot unavailable');
        return original.call(this, key, value);
      };
      window.__game.mode = 'title';
      window.__game.titleScreen = 'delete';
      window.__game.slotCursor = 2;
    });
    await page.keyboard.press('z');
    await page.waitForTimeout(200);
    const result = await page.evaluate(() => {
      window.__restoreStorageSetItem();
      return {
        slot: !!localStorage.getItem('fabletest2-memento-preview-slot-2'),
        stats: !!localStorage.getItem('fabletest2-memento-preview-stats-2'),
        screen: window.__game.titleScreen,
        notice: window.__game.notice && window.__game.notice.text,
      };
    });
    check('삭제 안전망 실패 뒤 슬롯·학습 기록 보존', result.slot && result.stats);
    check('삭제 실패 뒤 슬롯 화면과 저장 불가 안내 표시',
      result.screen === 'slots' && /저장되지 않/.test(result.notice || ''));
    await ctx.close();
  }

  {
    console.log('[slot-delete-mid-failure] 삭제 중간 실패 시 전체 롤백');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    await page.evaluate(() => { window.__game.titleScreen = 'slots'; });
    await page.waitForTimeout(80);
    const fixture = await page.evaluate(() => {
      const undoKey = 'fabletest2-memento-preview-deleted-slot';
      const slotKey = 'fabletest2-memento-preview-slot-2';
      const statsKey = 'fabletest2-memento-preview-stats-2';
      const oldUndo = JSON.stringify({ slot: 1, ts: Date.now(), 'fabletest2-memento-preview-slot-1': '{"name":"이전 삭제"}' });
      const oldSlot = JSON.stringify({ v: 9, name: '부분삭제방지', flags: { defeated: {} } });
      const oldStats = JSON.stringify({ privacy: { correct: 4, total: 5 } });
      localStorage.setItem(undoKey, oldUndo);
      localStorage.setItem(slotKey, oldSlot);
      localStorage.setItem(statsKey, oldStats);
      const original = Storage.prototype.removeItem;
      let failedOnce = false;
      window.__restoreStorageRemoveItem = () => { Storage.prototype.removeItem = original; };
      Storage.prototype.removeItem = function removeItem(key) {
        if (key === statsKey && !failedOnce) {
          failedOnce = true;
          throw new Error('learning delete unavailable');
        }
        return original.call(this, key);
      };
      window.__game.mode = 'title';
      window.__game.titleScreen = 'delete';
      window.__game.slotCursor = 2;
      return { undoKey, slotKey, statsKey, oldUndo, oldSlot, oldStats };
    });
    await page.keyboard.press('z');
    await page.waitForTimeout(200);
    const result = await page.evaluate((expected) => {
      window.__restoreStorageRemoveItem();
      return {
        intact: localStorage.getItem(expected.slotKey) === expected.oldSlot &&
          localStorage.getItem(expected.statsKey) === expected.oldStats,
        undoPreserved: localStorage.getItem(expected.undoKey) === expected.oldUndo,
        screen: window.__game.titleScreen,
        notice: window.__game.notice && window.__game.notice.text,
      };
    }, fixture);
    check('삭제 중간 실패 뒤 슬롯·학습·이전 되살리기 전체 보존', result.intact && result.undoPreserved);
    check('삭제 중간 실패를 성공으로 표시하지 않음',
      result.screen === 'slots' && /저장되지 않/.test(result.notice || ''));
    await ctx.close();
  }

  {
    console.log('[backup-restore-write-failure] 파일 복원 중간 실패 원자 롤백');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    await page.evaluate(() => { window.__game.titleScreen = 'slots'; });
    await page.waitForTimeout(80);
    const fixture = await page.evaluate(() => {
      const slotKey = 'fabletest2-memento-preview-slot-2';
      const statsKey = 'fabletest2-memento-preview-stats-2';
      const undoKey = 'fabletest2-memento-preview-restore-undo';
      const priorUndo = JSON.stringify({
        app: 'ai-ethics-adventure-memento-preview', version: 1, savedAt: Date.now() - 1000,
        data: { 'fabletest2-memento-preview-stats-0': '{"privacy":{"correct":3,"total":3}}' },
      });
      const oldSlot = JSON.stringify({ v: 9, name: '복원전', flags: { defeated: {} } });
      const oldStats = JSON.stringify({ privacy: { correct: 1, total: 2 } });
      localStorage.setItem(undoKey, priorUndo);
      localStorage.setItem(slotKey, oldSlot);
      localStorage.setItem(statsKey, oldStats);
      const original = Storage.prototype.setItem;
      let failedOnce = false;
      window.__restoreStorageSetItem = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === statsKey && !failedOnce) {
          failedOnce = true;
          throw new Error('mid-restore write failed');
        }
        return original.call(this, key, value);
      };
      return {
        slotKey, statsKey, undoKey, priorUndo, oldSlot, oldStats,
        backup: JSON.stringify({
          app: 'ai-ethics-adventure-memento-preview', version: 1, savedAt: Date.now(),
          data: {
            [slotKey]: JSON.stringify({ v: 9, name: '복원후', flags: { defeated: {} } }),
            [statsKey]: JSON.stringify({ privacy: { correct: 9, total: 9 } }),
          },
        }),
      };
    });
    await page.keyboard.press('u');
    await page.waitForTimeout(150);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(150);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(150);
    await page.keyboard.press('z');
    await page.waitForTimeout(150);
    const chooserPromise = page.waitForEvent('filechooser');
    await page.keyboard.press('z');
    const chooser = await chooserPromise;
    await chooser.setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(fixture.backup) });
    await page.waitForFunction(() => window.__game.backup.toast < 0, { timeout: 8000 });
    const result = await page.evaluate(({ slotKey, statsKey, undoKey, priorUndo, oldSlot, oldStats }) => {
      window.__restoreStorageSetItem();
      return {
        intact: localStorage.getItem(slotKey) === oldSlot && localStorage.getItem(statsKey) === oldStats,
        undoPreserved: localStorage.getItem(undoKey) === priorUndo,
        mode: window.__game.mode,
        toast: window.__game.backup.toast,
        notice: window.__game.notice && window.__game.notice.text,
      };
    }, fixture);
    check('파일 복원 중간 실패 뒤 기존 데이터와 이전 취소 모두 보존', result.intact && result.undoPreserved);
    check('복원 실패를 성공 전환 없이 화면과 경고로 표시',
      result.mode === 'backup' && result.toast < 0 && /저장되지 않/.test(result.notice || ''));
    await ctx.close();
  }

  {
    console.log('[backup-undo-absent-key] 복원 전 없던 키까지 정확히 취소');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__test, { timeout: 8000 });
    const result = await page.evaluate(() => {
      const key = 'fabletest2-memento-preview-cosmetic-2';
      localStorage.removeItem(key);
      const restored = window.__test.applyBackup(JSON.stringify({
        app: 'ai-ethics-adventure-memento-preview', version: 1, savedAt: Date.now(),
        data: { [key]: '{"theme":"night"}' },
      }));
      const presentAfterRestore = !!localStorage.getItem(key);
      const undone = window.__test.undoRestore();
      return {
        restored, presentAfterRestore, undone,
        absentAfterUndo: !localStorage.getItem(key),
        undoConsumed: !window.__test.hasRestoreUndo(),
      };
    });
    check('복원 전 없던 키도 취소 시 제거', result.restored.ok && result.presentAfterRestore &&
      result.undone.ok && result.absentAfterUndo && result.undoConsumed);
    await ctx.close();
  }

  {
    console.log('[learning-storage-warning] 학습 기록 저장 실패 사용자 안내');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      window.__restoreStorageSetItem = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === 'fabletest2-memento-preview-stats-0') throw new Error('learning data unavailable');
        return original.call(this, key, value);
      };
      window.__test.recordTopicResult(0, 'privacy', true);
      window.__restoreStorageSetItem();
    });
    await page.waitForTimeout(200);
    const result = await page.evaluate(() => ({
      storageOk: window.__test.getStorageOk(),
      notice: window.__game.notice && window.__game.notice.text,
      live: window.__test.srLiveText(),
    }));
    check('학습 기록 실패가 저장 불가 상태로 승격', result.storageOk === false);
    check('학습 기록 실패 안내가 화면 상태와 aria-live에 표시',
      /저장되지 않/.test(result.notice || '') && /저장되지 않/.test(result.live || ''));
    await ctx.close();
  }

  {
    console.log('[startup-storage-warning] 첫 저장소 확인 실패 접근성 안내');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => {
      Storage.prototype.setItem = () => { throw new Error('startup storage unavailable'); };
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      window.__drawnStorageWarnings = [];
      CanvasRenderingContext2D.prototype.fillText = function captureStorageWarning(text, ...args) {
        if (/진행이 저장되지 않는 환경/.test(String(text))) window.__drawnStorageWarnings.push(String(text));
        return fillText.call(this, text, ...args);
      };
    });
    const page = await ctx.newPage();
    await page.goto(base + '?storage-failure=1', { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    await page.waitForTimeout(200);
    const result = await page.evaluate(() => ({
      storageOk: window.__test.getStorageOk(),
      notice: window.__game.notice && window.__game.notice.text,
      live: window.__test.srLiveText(),
      screen: window.__game.titleScreen,
      drawnWarnings: window.__drawnStorageWarnings.slice(),
    }));
    check('첫 저장소 확인 실패가 화면 상태와 aria-live에 표시', result.storageOk === false &&
      /저장되지 않/.test(result.notice || '') && /저장되지 않/.test(result.live || ''));
    check('첫 저장소 확인 실패가 최초 시간선 선택 Canvas에도 표시', result.screen === 'routechoice' &&
      result.drawnWarnings.some((text) => /진행이 저장되지 않는 환경/.test(text)));
    await ctx.close();
  }

  {
    console.log('[service-worker-optional-asset] 선택 아이콘 404 중에도 core shell 설치');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    serverFaults.set('/icons/apple-touch-icon.png', 404);
    await page.goto(base, { waitUntil: 'load' });
    let shellReady = false;
    for (let i = 0; i < 60 && !shellReady; i++) {
      shellReady = await page.evaluate(async () => {
        if (!navigator.serviceWorker.controller) return false;
        const keys = await caches.keys();
        for (const key of keys) {
          const cache = await caches.open(key);
          if (await cache.match('./src/game.js')) return true;
        }
        return false;
      }).catch(() => false);
      if (!shellReady) await page.waitForTimeout(250);
    }
    serverFaults.delete('/icons/apple-touch-icon.png');
    check('선택 아이콘 404 중에도 core shell과 controller 준비', shellReady);
    let offlineReady = false;
    if (shellReady) {
      await ctx.setOffline(true);
      try {
        await page.goto(base + '?optional-icon=missing', { waitUntil: 'load' });
        await page.waitForFunction(() => !!window.__test, { timeout: 8000 });
        offlineReady = true;
      } catch (e) {}
      await ctx.setOffline(false);
    }
    check('선택 아이콘 없이 설치된 core shell로 오프라인 재진입', offlineReady);
    await ctx.close();
  }

  {
    console.log('[service-worker-update-confirmation] 플레이 중 유지 후 사용자 적용');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => {
      const key = '__confirmedUpdateNavigations';
      localStorage.setItem(key, String((Number(localStorage.getItem(key)) || 0) + 1));
    });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && navigator.serviceWorker.controller), { timeout: 8000 });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && navigator.serviceWorker.controller), { timeout: 8000 });
    const before = await page.evaluate(() => Number(localStorage.getItem('__confirmedUpdateNavigations')));
    await page.evaluate(() => {
      window.__game.mode = 'world';
      window.__game.map = 'village';
      navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
    });
    await page.waitForTimeout(500);
    const pending = await page.evaluate(() => {
      const button = document.getElementById('update-ready');
      return {
        navigations: Number(localStorage.getItem('__confirmedUpdateNavigations')),
        mode: window.__game && window.__game.mode,
        ready: window.__newVersionReady === true,
        button: !!button,
        visible: !!button && getComputedStyle(button).display !== 'none',
      };
    });
    check('controllerchange가 플레이 중 페이지를 자동 새로고침하지 않음',
      pending.navigations === before && pending.mode === 'world');
    check('플레이 중 업데이트는 준비 상태만 알리고 적용 버튼을 숨김',
      pending.ready && pending.button && pending.visible === false);
    const updateStyle = pending.button ? await page.locator('#update-ready').evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        background: style.backgroundColor,
        color: style.color,
        border: style.borderTopWidth,
        shadow: style.boxShadow,
      };
    }) : null;
    check('업데이트 버튼은 문서화된 경고색·테두리 중심 표면을 사용', !!updateStyle &&
      updateStyle.background === 'rgb(255, 214, 68)' && updateStyle.color === 'rgb(0, 0, 0)' &&
      updateStyle.border === '4px' && updateStyle.shadow === 'none');
    let visibleInPause = false;
    let focusToken = false;
    let applied = false;
    if (pending.button) {
      await page.evaluate(() => { window.__game.mode = 'pause'; });
      await page.waitForTimeout(200);
      visibleInPause = await page.locator('#update-ready').isVisible();
      await page.locator('#update-ready').focus();
      focusToken = await page.locator('#update-ready').evaluate((el) => {
        const style = getComputedStyle(el);
        return style.outlineColor === 'rgb(142, 168, 216)' && style.outlineWidth === '3px';
      });
      await page.locator('#update-ready').click();
      try {
        await page.waitForFunction((count) =>
          Number(localStorage.getItem('__confirmedUpdateNavigations')) > count, before, { timeout: 8000 });
        applied = true;
      } catch (e) {}
    }
    check('업데이트 적용 버튼은 일시정지 메뉴에서 표시', visibleInPause);
    check('업데이트 적용 버튼의 키보드 포커스가 기록 강조 토큰으로 표시', focusToken);
    check('사용자가 적용 버튼을 누른 뒤에만 새 문서로 이동', applied);
    await ctx.close();
  }

  {
    console.log('[service-worker-upgrade] 미리보기 소유 캐시만 안전하게 정리');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => {
      const key = '__mementoUpgradeNavigations';
      localStorage.setItem(key, String((Number(localStorage.getItem(key)) || 0) + 1));
    });
    let page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 8000 }).catch(() => {});
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) await registration.unregister();
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      const oldCache = await caches.open('fabletest2-memento-preview-stale-fixture');
      await oldCache.put('./index.html', new Response('<title>방과 후: 그림자 학교</title>', {
        headers: { 'Content-Type': 'text/html' },
      }));
      const unrelatedCache = await caches.open('unrelated-preview-cache');
      await unrelatedCache.put('./untouched', new Response('keep'));
    });
    await page.close();
    page = await ctx.newPage();
    await page.goto(base + '?v=upgrade-fixture', { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && navigator.serviceWorker.controller), { timeout: 8000 });
    const upgraded = await page.evaluate(async () => ({
      title: document.title,
      navigations: Number(localStorage.getItem('__mementoUpgradeNavigations')),
      caches: await caches.keys(),
      controlled: !!navigator.serviceWorker.controller,
    }));
    check('업그레이드 뒤 마음의 문 문서와 새 서비스워커가 활성',
      /마음의 문/.test(upgraded.title) && upgraded.controlled && !upgraded.caches.some((key) => key.startsWith('fabletest2-memento-preview-stale-')));
    check('서비스워커 업그레이드는 같은 origin의 무관한 캐시를 보존',
      upgraded.caches.includes('unrelated-preview-cache'));
    await ctx.close();
  }

  // 오프라인 폴백: 서비스워커 캐시 준비 후, ?utm= 붙은 URL로 오프라인 재진입해도 열려야 한다
  {
    console.log('[offline] 쿼리스트링 오프라인 진입 폴백');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
    // 주의: waitForFunction에 async 조건식을 주면 프로미스가 그대로 truthy로 평가돼
    // 거짓 통과한다 — page.evaluate(프로미스를 실제로 기다림)를 Node 쪽에서 폴링한다.
    let swReady = false;
    for (let i = 0; i < 60 && !swReady; i++) {
      swReady = await page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) return false;
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg || !reg.active) return false;
        const keys = await caches.keys();
        if (!keys.length) return false;
        const c = await caches.open(keys[0]);
        return (await c.keys()).length >= 5; // 프리캐시 완료(자산 여러 개) 대기
      }).catch(() => false);
      if (!swReady) await page.waitForTimeout(250);
    }
    check('서비스워커 프리캐시 완료', swReady);
    if (swReady) {
      await ctx.setOffline(true);
      let offlineOk = false;
      try {
        await page.goto(base + '?utm_source=share&fbclid=test', { waitUntil: 'load' });
        await page.waitForFunction(() => !!window.__test, { timeout: 8000 });
        offlineOk = true;
      } catch (e) { /* 실패 기록 */ }
      check('오프라인 + 쿼리스트링 진입 성공', offlineOk);
      await ctx.setOffline(false);
    }
    await ctx.close();
  }

  await browser.close();

  // Y-16 WebKit(Safari 엔진) 핵심 5검사 — 로컬 옵션. webkit 바이너리가 있으면 실행하고,
  // 없으면(대부분의 CI/이 환경) 명시적 스킵 로그만 남긴다(실패 아님). CI 잡은 추가하지 않는다.
  // 검사: 모듈 로드 · 캔버스 존재 · 월드 진입 · 렌더 후 월드 유지 · 콘솔/페이지 에러 0
  // (오프라인 폴백은 서비스워커 편차가 커 WebKit 검사에서 제외한다.)
  let wkBrowser = null;
  try {
    wkBrowser = await webkit.launch();
  } catch (e) {
    console.log('[webkit] ⏭ WebKit 미설치 — 스킵(실패 아님).');
    console.log('        설치하려면: npx playwright install webkit');
  }
  if (wkBrowser) {
    console.log('[webkit] Safari 엔진 핵심 5검사');
    try {
      const ctx = await wkBrowser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text());
      });
      await page.goto(base, { waitUntil: 'load' });
      let loaded = false;
      try { await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 }); loaded = true; } catch (e2) { /* below */ }
      await page.waitForTimeout(400);
      check('WebKit: 게임 모듈 로드', loaded);
      check('WebKit: 캔버스(#game) 존재', !!(await page.$('#game')));
      const entered = await page.evaluate(() => {
        window.__test.applyTiltStreetClass();
        window.__game.mode = 'world';
        return window.__game.mode === 'world';
      });
      await page.waitForTimeout(400);
      check('WebKit: 월드 진입', entered);
      check('WebKit: 렌더 후 월드 유지(프레임 크래시 없음)', (await page.evaluate(() => window.__game.mode)) === 'world');
      check('WebKit: 콘솔/페이지 에러 없음', errors.length === 0);
      errors.slice(0, 6).forEach((e) => console.log('     · ' + e));
      await ctx.close();
    } finally {
      await wkBrowser.close();
    }
  }

  server.close();

  console.log(`\n브라우저 스모크: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('브라우저 테스트 오류:', e); process.exit(1); });
