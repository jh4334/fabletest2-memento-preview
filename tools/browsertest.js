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
      await page.evaluate(() => {
        window.__game.reduceFx = true;
        window.__game.endingT = 600;
      });
      await page.waitForTimeout(100);
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
      const mk = (name, mercy, done) => ({ app: 'ai-ethics-adventure', version: 1, data: {
        'ai-ethics-adventure-slot-0': JSON.stringify({ v: 8, name, flags: { mercy, defeated: done ? { yeongi: true } : {} } }),
        'ai-ethics-adventure-stats-0': JSON.stringify({ privacy: { correct: 7, total: 10 } }),
        'ai-ethics-adventure-meta-0': JSON.stringify({ bossRank: { sujipmon: 'S' } }),
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

  // 멀티터치: 같은 버튼 두 손가락 → 하나만 떼도 유지, 스틱은 둘째 손가락이 탈취 못 함
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
      return out;
    });
    check('버튼: 두 손가락 중 하나만 떼면 유지', r.heldAfterOneUp === true);
    check('버튼: 모두 떼면 릴리즈', r.heldAfterAllUp === false);
    check('스틱: 방향 입력 인식', r.stickRight === true);
    check('스틱: 둘째 손가락 탈취에도 이동 유지', r.stickSurvivesSteal === true);
    check('스틱: 원래 손가락 떼면 정지', r.stickReleased === true);
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
    console.log('[service-worker-upgrade] 기준 버전 캐시에서 최신 게임으로 자동 전환');
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
      const oldCache = await caches.open('shadow-school-browser-fixture');
      await oldCache.put('./index.html', new Response('<title>방과 후: 그림자 학교</title>', {
        headers: { 'Content-Type': 'text/html' },
      }));
      const unrelatedCache = await caches.open('unrelated-preview-cache');
      await unrelatedCache.put('./untouched', new Response('keep'));
    });
    await page.close();
    page = await ctx.newPage();
    await page.goto(base + '?v=upgrade-fixture', { waitUntil: 'load' });
    await page.waitForFunction(() => Number(localStorage.getItem('__mementoUpgradeNavigations')) >= 3, { timeout: 8000 });
    const upgraded = await page.evaluate(async () => ({
      title: document.title,
      navigations: Number(localStorage.getItem('__mementoUpgradeNavigations')),
      caches: await caches.keys(),
      controlled: !!navigator.serviceWorker.controller,
    }));
    check('기준 버전 캐시를 발견하면 열린 탭을 한 번 다시 탐색', upgraded.navigations >= 3);
    check('업그레이드 뒤 마음의 문 문서와 새 서비스워커가 활성',
      /마음의 문/.test(upgraded.title) && upgraded.controlled && !upgraded.caches.some((key) => key.startsWith('shadow-school-')));
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
