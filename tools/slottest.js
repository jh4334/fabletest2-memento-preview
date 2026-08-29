// 세이브 슬롯 시스템 테스트 (Node.js)
// - 기존 단일 세이브의 슬롯 0 이전(마이그레이션)
// - 슬롯 선택/이름 입력/이어하기/삭제 흐름
// 사용법: node tools/slottest.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeCtx() {
  return new Proxy({}, {
    get(t, p) {
      if (p === 'measureText') return () => ({ width: 50 });
      if (p in t) return t[p];
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
function makeCanvas(w, h) {
  return { width: w || 0, height: h || 0, getContext: () => makeCtx(), addEventListener() {} };
}

// 미리 옛 단일 세이브를 심어 둔다 (스테이지 6 진행 중인 저장본)
const storage = new Map();
const productionSlotKey = 'ai-ethics-adventure-slot-2';
const productionSlotBytes = JSON.stringify({ v: 9, name: 'production-only', flags: { defeated: {} } });
storage.set(productionSlotKey, productionSlotBytes);
const oldSave = {
  map: 'serverroom', x: 7, y: 9,
  flags: {
    talkedProf: true,
    badges: { forest: true, lake: true, cave: true },
    defeated: { hondonmon: true, meotdaeromon: true, tteonemgimon: true, hollimmon: true, finalboss: true },
    mercy: 11, visited: {}, trueEnding: false, correctCount: 40, battleCount: 18,
  },
};
storage.set('fabletest2-memento-preview-v1', JSON.stringify(oldSave));

const listeners = {};
const storageAccesses = [];
let rafCb = null;
const windowObj = {
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
  removeEventListener: (ev, fn) => {
    const a = listeners[ev]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  },
  requestAnimationFrame: (cb) => { rafCb = cb; },
};
const sandbox = {
  window: windowObj,
  document: {
    getElementById: (id) => (id === 'game' ? makeCanvas(720, 528) : makeCanvas()),
    createElement: () => makeCanvas(),
    body: { classList: { add() {}, remove() {}, toggle() {} } },
  },
  localStorage: {
    getItem: (k) => { storageAccesses.push(['get', k]); return storage.has(k) ? storage.get(k) : null; },
    setItem: (k, v) => { storageAccesses.push(['set', k]); storage.set(k, String(v)); },
    removeItem: (k) => { storageAccesses.push(['remove', k]); storage.delete(k); },
  },
  requestAnimationFrame: windowObj.requestAnimationFrame,
  console, Math, Set, Map, JSON, Object, setTimeout, clearTimeout,
};
vm.createContext(sandbox);
for (const f of ['src/sprites.js', 'src/audio.js', 'src/data.js', 'src/memento.js', 'src/game.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), sandbox, { filename: f });
}
const g = windowObj.__game;

function step(n = 1) { for (let i = 0; i < n; i++) { const cb = rafCb; rafCb = null; cb(); } }
function dispatch(ev, obj) { for (const fn of (listeners[ev] || []).slice()) fn(Object.assign({ preventDefault() {} }, obj)); }
function tap(key) { dispatch('keydown', { key }); step(2); dispatch('keyup', { key }); }
function slot(i) { const r = storage.get('fabletest2-memento-preview-slot-' + i); return r ? JSON.parse(r) : null; }

let passed = 0;
function check(name, cond) {
  if (cond) { console.log('  ✔ ' + name); passed++; }
  else { console.error('  ✘ ' + name); process.exit(1); }
}

console.log('[1] 기존 단일 세이브 → 슬롯 0 이전(마이그레이션)');
step(5);
const storageTest = windowObj.__test;
check('preview storage ignores a production-prefixed slot', storageTest.loadSlot(2) === null);
check('preview storage leaves production bytes unchanged', storage.get(productionSlotKey) === productionSlotBytes);
check('preview runtime never accesses a production-prefixed key',
  storageAccesses.every((entry) => !entry[1].startsWith('ai-ethics-adventure-')));
check('V10 migration API exists', typeof storageTest.migrateSlotV10 === 'function');
check('옛 세이브 키는 제거됨', !storage.get('fabletest2-memento-preview-v1'));
check('슬롯 0으로 이전됨', !!slot(0));
check('이전된 진행도 보존 (스테이지 6)', slot(0).flags.defeated.finalboss === true);
check('이전된 이름 기본값', slot(0).name === '수호자');
check('첫 타이틀 표면은 슬롯보다 앞선 시간선 선택', g.mode === 'title' && g.titleScreen === 'routechoice');
check('시간선 선택지는 정확한 세 ID와 표시 이름', JSON.stringify(storageTest.titleRoutes()) === JSON.stringify([
  { id: 'original', label: '원래 모험 시작' },
  { id: 'memento', label: '메멘토 시간선 체험' },
  { id: 'consequence-pairs', label: '과거·현재 캠페인 시작' },
]));
tap('ArrowUp');
check('시간선 선택은 위 방향으로 끝에서 감김', g.routeCursor === 2);
tap('ArrowDown');
check('시간선 선택은 아래 방향으로 처음에 감김', g.routeCursor === 0);
tap('z');
check('원래 모험 선택 뒤 기존 세 슬롯 표면으로 이동', g.titleScreen === 'slots' && g.newGameRoute === 'original');
const previewSlotZeroBytes = storage.get('fabletest2-memento-preview-slot-0');
storage.delete('fabletest2-memento-preview-slot-0');
const productionSlots = [0, 1, 2].map((i) => [
  'ai-ethics-adventure-slot-' + i,
  JSON.stringify({ v: 9, name: 'production-' + i, flags: { defeated: {} } }),
]);
for (const [key, value] of productionSlots) storage.set(key, value);
check('production slots do not populate any of the three preview slots',
  [0, 1, 2].every((i) => storageTest.loadSlot(i) === null));
check('all three production slots remain byte-for-byte unchanged',
  productionSlots.every(([key, value]) => storage.get(key) === value));
storage.set('fabletest2-memento-preview-slot-0', previewSlotZeroBytes);
storage.delete('ai-ethics-adventure-slot-0');
storage.delete('ai-ethics-adventure-slot-1');

console.log('[2] 슬롯 0 이어하기');
tap('z'); // 슬롯 0(채워짐) → 이어하기
check('이어하기로 월드 진입', g.mode === 'world');
check('사라진 v1 맵(serverroom) 세이브는 마을로 안전 이동(v3 마이그레이션)', g.map === 'village');
check('현재 슬롯 0', g.currentSlot === 0);
check('이어하기 시 진행도 유지', g.flags.defeated.finalboss === true && g.flags.mercy === 11);
check('채운 슬롯 이어하기는 선택 경로로 리셋하지 않고 저장 경로를 유지', g.flags.storyRoute === 'original');
check('채운 슬롯 요약은 실제 저장 시간선을 안내', storageTest.slotSummary(0).storyRoute === 'original');

console.log('[3] 진행 시 슬롯 0에만 저장, 다른 슬롯은 비어 있음');
check('슬롯 1 비어 있음', !slot(1));
check('슬롯 2 비어 있음', !slot(2));

console.log('[4] 빈 슬롯에 새 모험 만들기 (슬롯 1)');
// 강제로 타이틀로 되돌려 슬롯 흐름 재현
g.mode = 'title'; g.titleScreen = 'slots'; g.slotCursor = 0;
tap('ArrowDown'); // 슬롯 1로 이동
check('커서 슬롯 1', g.slotCursor === 1);
tap('x');
check('빈 슬롯에서 취소하면 시간선 선택으로 돌아감', g.titleScreen === 'routechoice' && g.newGameRoute === null);
tap('z');
check('시간선 재선택 뒤 슬롯 위치와 세 슬롯은 유지', g.titleScreen === 'slots' && g.slotCursor === 1 && !!slot(0) && !slot(1));
tap('z'); // 빈 슬롯 → 이름 입력
check('이름 입력 화면', g.titleScreen === 'name');
g.nameConfirm = true; step(2); // 기본 이름으로 시작 → 인트로 대화
check('새 모험 시작 (슬롯 1)', (g.mode === 'dialog' || g.mode === 'world') && g.currentSlot === 1);
check('슬롯 1 새로 저장됨', !!slot(1) && slot(1).flags.defeated.finalboss !== true);
check('슬롯 0은 그대로 보존', slot(0).flags.defeated.finalboss === true);

console.log('[5] 슬롯 삭제 흐름');
g.mode = 'title'; g.titleScreen = 'slots'; g.slotCursor = 1;
tap('x'); // 삭제 확인
check('삭제 확인 화면', g.titleScreen === 'delete');
tap('x'); // 취소
check('취소하면 슬롯 유지', g.titleScreen === 'slots' && !!slot(1));
tap('x'); // 다시 삭제 확인
tap('z'); // 삭제 실행
check('슬롯 1 삭제됨', !slot(1));
check('슬롯 0은 영향 없음', !!slot(0));

console.log('[6] 막힌 위치에 저장된 세이브 → 안전 칸 보정 (갇힘 방지)');
const { MAPS, WALKABLE } = vm.runInContext('({ MAPS, WALKABLE })', sandbox);
// village (0,0)은 'T'(나무, 이동 불가). 손상/구버전 세이브를 흉내 낸다.
storage.set('fabletest2-memento-preview-slot-2', JSON.stringify({
  name: '테스트', map: 'village', x: 0, y: 0,
  flags: { talkedProf: true, badges: {}, defeated: {}, mercy: 0, visited: {} }, updatedAt: Date.now(),
}));
g.mode = 'title'; g.titleScreen = 'slots'; g.slotCursor = 2;
tap('z'); // 슬롯 2 이어하기
check('막힌 위치에서도 월드 진입', g.mode === 'world');
const landed = MAPS[g.map].tiles[g.player.y][g.player.x];
check('이동 가능한 칸으로 보정됨', WALKABLE.has(landed));
check('원래 막힌 칸(0,0)이 아님', !(g.map === 'village' && g.player.x === 0 && g.player.y === 0));
check('px/py가 NaN이 아님', Number.isFinite(g.player.px) && Number.isFinite(g.player.py));

console.log('[7] 플래그 없는 손상 세이브 → 예외 없이 처리 (로드 불능 방지)');
// 마이그레이터는 flags 없는 행을 그대로 통과시킨다(if (!data || !data.flags) return data).
// 타이틀은 slotSummary가 null이라 빈 슬롯 취급하지만, 「선생님 방 > 학급 모드」는
// loadSlot 결과를 직접 읽어 s.flags.defeated 접근에서 TypeError가 날 수 있었다.
storage.set('fabletest2-memento-preview-slot-2', JSON.stringify({ v: 1, name: '깨진세이브', map: 'village', x: 13, y: 16 }));
g.mode = 'title'; g.titleScreen = 'slots'; g.slotCursor = 2;
tap('z'); // 빈 슬롯 취급 → 이름 입력(크래시 아님)
check('손상 세이브는 새 모험 안내로 진입', g.titleScreen === 'name');
tap('Escape'); step(2);
check('타이틀로 복귀', g.mode === 'title');
g.flags = null; g.titleScreen = 'slots'; g.slotCursor = 2; // 세션 미로드 상태 재현
tap('t'); // 선생님 방
check('선생님 방 진입', g.mode === 'teacher');
// dashboard → leaderboard → report → classmode (Y-20으로 leaderboard가 dashboard 뒤에 추가됨)
tap('ArrowDown'); tap('ArrowDown'); tap('ArrowDown');
tap('z'); // 학급 모드 — 플래그 없는 슬롯을 미리 로드해도 예외가 없어야 한다
check('학급 모드 예외 없이 진입', g.mode !== 'teacher');
check('flags가 새로 채워짐', !!g.flags && typeof g.flags.defeated === 'object');

// ── W-1 세이브 마이그레이션 골든 픽스처 테스트 ──
// v3·v5·v8 세대의 "골든 세이브"를 심고, loadSlot의 V11 마이그레이션 사슬이 (a) 필수 플래그를
// 모두 채우고 (b) talkedProf 파생 추론이 정확하며 (c) defeated 승계가 유지되고
// (d) 미래 필드가 roundtrip에서 사라지지 않는지 검사한다.
console.log('[W-1] 세이브 마이그레이션 골든 픽스처 (v3·v5·v8·v9→v11·미래필드)');
{
  const T = windowObj.__test;
  const put = (i, obj) => storage.set('fabletest2-memento-preview-slot-' + i, JSON.stringify(obj));

  // (v3 골든) — 옛 세대. V4~V8 사슬을 전부 거친다.
  put(0, { v: 3, name: '골든3', map: 'village', x: 13, y: 16,
    flags: { talkedProf: true, defeated: { bekkyeomon: true, sujipmon: true }, mercy: 5, visited: {} } });
  const s3 = T.loadSlot(0);
  check('W-1 v3→최신 버전 상승(v=11)', s3.v === 11);
  check('W-1 v3 필수 플래그 채워짐(introClue1·prologueClosed·privacyLeak 정의)',
    s3.flags.introClue1 !== undefined && s3.flags.prologueClosed !== undefined && s3.flags.privacyLeak === 0);
  check('W-1 v3 talkedProf 파생 추론 — introClue1 = !!talkedProf = true', s3.flags.introClue1 === true);
  check('W-1 v3 defeated 승계 유지', s3.flags.defeated.bekkyeomon === true && s3.flags.defeated.sujipmon === true);
  check('W-1 v3 defeated 파생 — prologueClosed = !!defeated.bekkyeomon = true', s3.flags.prologueClosed === true);

  // (v5 골든) — introClue*는 이미 있으나 ttaraFirstEncounter·privacy·prologueClosed 미정
  put(1, { v: 5, name: '골든5', map: 'freestreet', x: 18, y: 21,
    flags: { talkedProf: true, defeated: { bekkyeomon: true, sujipmon: true, pyeonhyangmon: true }, mercy: 8, visited: {},
      introClue1: true, introClue2: true, introClue3: true, introDoorOpen: true, introForestTrace: true } });
  const s5 = T.loadSlot(1);
  check('W-1 v5→최신 버전 상승(v=11)', s5.v === 11);
  check('W-1 v5 ttaraFirstEncounter 파생 = !!defeated.bekkyeomon = true', s5.flags.ttaraFirstEncounter === true);
  check('W-1 v5 defeated 3인 승계 유지', s5.flags.defeated.pyeonhyangmon === true);
  check('W-1 v5 privacy 필드 기본값 채워짐', s5.flags.privacyLeak === 0 && s5.flags.privacyRecoveryActive === false);

  // (v8 골든) — 클리어 세이브. 기존 필드를 유지하며 V9 기본값을 보탠다.
  put(2, { v: 8, name: '골든8', map: 'village', x: 13, y: 16,
    flags: { talkedProf: true, defeated: { bekkyeomon: true, sujipmon: true, pyeonhyangmon: true, hwangakmon: true, yuhokmon: true, hollimmon: true, finalboss: true, yeongi: true },
      mercy: 8, visited: {}, introClue1: true, introForestTrace: true, ttaraFirstEncounter: true,
      privacyLeak: 0, privacyRecovery: 0, privacyRecoveryActive: false, prologueClosed: true, forestClearingRead: true,
      chapter1Clear: true, chapter2Clear: true, chapter3Clear: true, chapter4Clear: true, chapter5Clear: true,
      endingId: 'home' } });
  const s8 = T.loadSlot(2);
  check('W-1 v8→v11 + endingId 보존', s8.v === 11 && s8.flags.endingId === 'home');
  check('W-1 v8→v11 완료 장 기록 보충', Array.isArray(s8.flags.damagedRecords) &&
    s8.flags.damagedRecords.length === 5 && s8.flags.pendingRecord === null &&
    s8.flags.timelineMerged === false && s8.flags.timelineRestored === false);
  check('W-1 v8 클리어 슬롯 요약 — done/endingId 노출', (() => { const sm = T.slotSummary(2); return sm && sm.done === true && sm.endingId === 'home'; })());

  // (v9→v11) — 증거는 열람했고 건너뛰지 않은 기록에서만 파생한다.
  put(0, { v: 9, name: '미래', map: 'village', x: 13, y: 16, futureTop: 'KEEP_ME',
    flags: { talkedProf: true, defeated: {}, mercy: 0, visited: {},
      introClue1: true, introForestTrace: true, ttaraFirstEncounter: true, privacyLeak: 0, prologueClosed: true,
      viewedRecords: { reset_after: true, reset_before: true, unknown: true },
      skippedRecords: { reset_before: true }, storyRoute: 'invalid',
      administratorTerminalSolved: 1,
      timelineOrderDraft: ['reset_before', 'unknown', 'reset_before', 'reset_after'],
      timelineOrderWrong: -4.5, futureFlag: 42 } });
  const s9 = T.loadSlot(0);
  check('W-1 v9→v11 증거·경로·단말·정렬 필드 정규화', s9.v === 11 &&
    s9.flags.storyRoute === 'original' && s9.flags.recordEvidence.join(',') === 'reset_after' &&
    s9.flags.administratorTerminalSolved === true &&
    s9.flags.timelineOrderDraft.join(',') === 'reset_before,reset_after' && s9.flags.timelineOrderWrong === 0);
  check('W-1 v9 미래 상위 필드 보존(load)', s9.futureTop === 'KEEP_ME');
  check('W-1 v9 미래 flags 필드 보존(load)', s9.flags.futureFlag === 42);
  T.writeSlot(0, s9); // roundtrip — 다시 저장 후 재로드
  const s9b = T.loadSlot(0);
  check('W-1 v9 roundtrip — 미래 필드가 사라지지 않음', s9b.futureTop === 'KEEP_ME' && s9b.flags.futureFlag === 42);

  put(0, { v: 10, futureTop: 'V10_KEEP', flags: {
    storyRoute: 'memento', recordEvidence: ['city_failure', 'unknown', 'city_failure', 'reset_after'],
    administratorTerminalSolved: 0,
    timelineOrderDraft: ['first_approval', 'first_approval', 'unknown', 'yeongi_warning'],
    timelineOrderWrong: 3.9, futureFlag: 'V10_FLAG',
  } });
  const s10 = T.loadSlot(0);
  check('W-1 v10 필드 정규화와 순서 보존', s10.flags.storyRoute === 'memento' &&
    s10.flags.recordEvidence.join(',') === 'city_failure,reset_after' &&
    s10.flags.administratorTerminalSolved === false &&
    s10.flags.timelineOrderDraft.join(',') === 'first_approval,yeongi_warning' && s10.flags.timelineOrderWrong === 3);
  T.writeSlot(0, s10);
  const s10b = T.loadSlot(0);
  check('W-1 v10 draft·미래필드 roundtrip', s10b.futureTop === 'V10_KEEP' &&
    s10b.flags.futureFlag === 'V10_FLAG' && s10b.flags.timelineOrderDraft.join(',') === 'first_approval,yeongi_warning');

  put(1, { v: 9, name: '복원중', map: 'coreroom', x: 14, y: 12,
    flags: { talkedProf: true, defeated: {}, mercy: 7, visited: {}, shrineDone: true,
      introClue1: true, introForestTrace: true, ttaraFirstEncounter: true,
      privacyLeak: 0, prologueClosed: true, damagedRecords: ['reset_after'],
      viewedRecords: { reset_after: true }, skippedRecords: {}, pendingRecord: null,
      timelineMerged: true, timelineRestored: false } });
  const interrupted = T.loadSlot(1);
  check('W-1 V9 복원 중 새로고침 — V11에서도 timelineRestored=false 보존',
    interrupted.v === 11 && interrupted.flags.timelineMerged === true && interrupted.flags.timelineRestored === false);
  const completedV9 = T.migrateSlotV11(T.migrateSlotV10(T.migrateSlotV9({
    v: 9, flags: { shrineDone: true, defeated: { yeongi: true }, timelineMerged: true, timelineRestored: true },
  })));
  check('W-1 완료된 V9 shrine는 V11에서도 완료되어 final replay를 요구하지 않음',
    completedV9.v === 11 && completedV9.flags.shrineDone === true &&
    completedV9.flags.timelineMerged === true && completedV9.flags.timelineRestored === true);

  // 정리 — 다음 블록(U-5)이 슬롯을 재사용하므로 비운다
  storage.delete('fabletest2-memento-preview-slot-0');
  storage.delete('fabletest2-memento-preview-slot-1');
  storage.delete('fabletest2-memento-preview-slot-2');
}

// ── V11 경험 종류 격리 — 기존 모험/기록 시간선은 새 캠페인 상태를 절대 얻지 않는다. ──
console.log('[V11] 경험 종류 고정·과거 세이브 격리·미래 필드 보존');
{
  const T = windowObj.__test;
  const put = (i, obj) => storage.set('fabletest2-memento-preview-slot-' + i, JSON.stringify(obj));
  check('V11 migration API exists', typeof T.migrateSlotV11 === 'function');

  put(0, { v: 10, futureTop: 'KEEP_V10_ORIGINAL', flags: { storyRoute: 'original', futureFlag: 'KEEP_FLAG' } });
  const original = T.loadSlot(0);
  check('V10 원래 모험은 V11 original로 고정되고 새 캠페인 상태를 얻지 않음',
    original.v === 11 && original.experienceKind === 'original' &&
    original.flags.consequenceCampaign === undefined && original.futureTop === 'KEEP_V10_ORIGINAL' &&
    original.flags.futureFlag === 'KEEP_FLAG');

  put(1, { v: 10, flags: { storyRoute: 'memento' } });
  const legacy = T.loadSlot(1);
  check('V10 메멘토 기록 시간선은 V11 legacy-records로 고정되고 새 캠페인 상태를 얻지 않음',
    legacy.v === 11 && legacy.experienceKind === 'legacy-records' &&
    legacy.flags.consequenceCampaign === undefined);

  put(2, { v: 11, experienceKind: 'future-experience', futureTop: { keep: true },
    flags: { storyRoute: 'memento', futureFlag: { keep: true } } });
  const future = T.loadSlot(2);
  check('미래 experienceKind와 알 수 없는 필드는 손대지 않고 보존',
    future.v === 11 && future.experienceKind === 'future-experience' && future.futureTop.keep === true &&
    future.flags.futureFlag.keep === true);
  T.writeSlot(2, future);
  const futureRoundtrip = T.loadSlot(2);
  check('미래 experienceKind 백업/저장 왕복 보존', futureRoundtrip.experienceKind === 'future-experience' &&
    futureRoundtrip.futureTop.keep === true && futureRoundtrip.flags.futureFlag.keep === true);
  const futureBackup = T.buildBackupText();
  storage.delete('fabletest2-memento-preview-slot-2');
  const backupResult = T.applyBackup(futureBackup);
  const futureRestored = T.loadSlot(2);
  check('미래 experienceKind 전체 백업·복원 왕복 보존', backupResult.ok === true &&
    futureRestored.experienceKind === 'future-experience' && futureRestored.futureTop.keep === true &&
    futureRestored.flags.futureFlag.keep === true);

  check('세 타이틀 경로는 각 경험 종류를 정확히 예상한다',
    typeof T.expectedExperienceKindForRoute === 'function' &&
    T.expectedExperienceKindForRoute('original') === 'original' &&
    T.expectedExperienceKindForRoute('memento') === 'legacy-records' &&
    T.expectedExperienceKindForRoute('consequence-pairs') === 'consequence-pairs' &&
    T.expectedExperienceKindForRoute('unknown') === null);
  check('다른 경험과 알 수 없는 경험 슬롯은 안전하게 진입을 막는다',
    typeof T.slotRouteStatus === 'function' &&
    T.slotRouteStatus('consequence-pairs', T.slotSummary(0)).kind === 'mismatch' &&
    T.slotRouteStatus('original', T.slotSummary(1)).kind === 'mismatch' &&
    T.slotRouteStatus('consequence-pairs', T.slotSummary(2)).kind === 'mismatch');
  check('슬롯 종류 불일치 확인은 원본 저장 바이트를 바꾸지 않는다', (() => {
    const before = storage.get('fabletest2-memento-preview-slot-2');
    const result = T.slotRouteStatus('consequence-pairs', T.slotSummary(2));
    return result.kind === 'mismatch' && storage.get('fabletest2-memento-preview-slot-2') === before;
  })());
  g.mode = 'title'; g.titleScreen = 'slots'; g.newGameRoute = 'consequence-pairs'; g.slotCursor = 0;
  const originalBytesBeforeMismatch = storage.get('fabletest2-memento-preview-slot-0');
  tap('z');
  check('다른 경험 슬롯을 실제로 누르면 원본 바이트를 보존한 채 안내만 표시',
    g.mode === 'title' && g.titleScreen === 'slots' &&
    g.notice && g.notice.text === '이 슬롯의 진행은 그대로 남아 있어요. 빈 슬롯을 골라 주세요.' &&
    storage.get('fabletest2-memento-preview-slot-0') === originalBytesBeforeMismatch &&
    T.srLiveText() === '이 슬롯의 진행은 그대로 남아 있어요. 빈 슬롯을 골라 주세요.' &&
    T.titleSlotNotice() === '이 슬롯의 진행은 그대로 남아 있어요. 빈 슬롯을 골라 주세요.' &&
    (() => { const box = T.titleSlotNoticeLayout(); return box.x === 48 && box.y === 426 && box.w === 624 && box.h === 56 && box.y + box.h < 498; })());
  tap('ArrowDown');
  check('슬롯을 옮기면 이전 종류 불일치 안내가 사라짐', g.slotCursor === 1 && T.titleSlotNotice() === null &&
    T.srLiveText() !== '이 슬롯의 진행은 그대로 남아 있어요. 빈 슬롯을 골라 주세요.');

  g.mode = 'title';
  T.startNewGameForRoute(2, '과거아이', 'consequence-pairs');
  const campaignSlot = T.loadSlot(2);
  check('새 과거·현재 캠페인은 V11 consequence-pairs와 독립 기본 상태로 저장',
    campaignSlot.v === 11 && campaignSlot.experienceKind === 'consequence-pairs' &&
    campaignSlot.map === 'creationhall' && campaignSlot.x === 12 && campaignSlot.y === 15 &&
    campaignSlot.flags.consequenceCampaign && campaignSlot.flags.consequenceCampaign.activePairId === 'd1_copyright' &&
    Array.isArray(campaignSlot.flags.consequenceCampaign.completedPairIds) &&
    campaignSlot.flags.consequenceCampaign.completedPairIds.length === 0 &&
    ['copyrightSlice', 'consentSlice', 'recommendationSlice', 'misinformationSlice', 'judgmentSlice']
      .every((sliceKey) => campaignSlot.flags[sliceKey] && campaignSlot.flags[sliceKey].phase === 'past'));
  storage.delete('fabletest2-memento-preview-slot-0');
  storage.delete('fabletest2-memento-preview-slot-1');
  storage.delete('fabletest2-memento-preview-slot-2');
}

console.log('[V11-pairs] 후속 과거·현재 쌍 체크포인트 왕복·이전 상태 격리');
{
  const T = windowObj.__test;
  const put = (i, obj) => storage.set('fabletest2-memento-preview-slot-' + i, JSON.stringify(obj));
  const laterPairs = [
    {
      pairId: 'd3_consent', stateKey: 'consentSlice', mapId: 'synthesis_broadcast_room',
      choices: [['likeness', 'likeness_manual'], ['voice', 'voice_assisted'], ['scene', 'scene_instant'], ['consent', 'consent_partial']],
    },
    {
      pairId: 'd5_recommendation', stateKey: 'recommendationSlice', mapId: 'recommendation_alley',
      choices: [['echo', 'echo_manual'], ['sample', 'sample_assisted'], ['route', 'route_instant'], ['recommendationNote', 'recommendation_note_partial']],
    },
    {
      pairId: 'd7_misinformation', stateKey: 'misinformationSlice', mapId: 'newsroom_repair',
      choices: [['tip', 'tip_manual'], ['context', 'context_assisted'], ['bulletin', 'bulletin_instant'], ['audit', 'audit_partial']],
    },
    {
      pairId: 'd10_judgment', stateKey: 'judgmentSlice', mapId: 'cozy_control_room',
      choices: [['call', 'call_manual'], ['safety', 'safety_assisted'], ['comfort', 'comfort_instant'], ['authority', 'authority_partial']],
    },
  ];
  const originalSlot = { v: 11, name: '원래아이', experienceKind: 'original', map: 'village', x: 13, y: 16,
    flags: { storyRoute: 'original', originalOnly: 'leave-me' } };
  const legacySlot = { v: 11, name: '기록아이', experienceKind: 'legacy-records', map: 'village', x: 13, y: 16,
    flags: { storyRoute: 'memento', legacyOnly: 'leave-me' } };
  put(0, originalSlot);
  put(1, legacySlot);
  const originalBytes = storage.get('fabletest2-memento-preview-slot-0');
  const legacyBytes = storage.get('fabletest2-memento-preview-slot-1');

  check('V11 후속 쌍 시작 훅이 존재', typeof T.startConsequencePair === 'function');

  T.startNewGameForRoute(2, '쌍검사', 'consequence-pairs');
  g.mode = 'world'; g.dialog = null;
  const seededD1 = g.flags.copyrightSlice;
  seededD1.phase = 'result';
  seededD1.checkpoint = 'complete';
  seededD1.complete = true;
  g.flags.consequenceCampaign.activePairId = null;
  g.flags.consequenceCampaign.completedPairIds = ['d1_copyright'];
  T.writeSlot(2, {
    v: 11, name: g.playerName, experienceKind: 'consequence-pairs', map: g.map,
    x: g.player.x, y: g.player.y, flags: g.flags,
  });

  function assertEarlierPairsAndForeignSlotsUntouched(pair, priorStates) {
    check(pair.pairId + '는 이전 쌍 슬라이스를 바꾸지 않음', priorStates.every(([stateKey, before]) =>
      JSON.stringify(g.flags[stateKey]) === before));
    check(pair.pairId + '는 original/legacy 슬롯 바이트를 바꾸지 않음',
      storage.get('fabletest2-memento-preview-slot-0') === originalBytes &&
      storage.get('fabletest2-memento-preview-slot-1') === legacyBytes);
  }

  function assertCheckpointRoundTrip(pair, checkpoint, priorStates) {
    const expectedMapId = checkpoint === 'complete' ? 'timelinehub' : pair.mapId;
    const saved = T.loadSlot(2);
    const savedSlice = saved && saved.flags && saved.flags[pair.stateKey];
    check(pair.pairId + ' ' + checkpoint + ' 저장은 V11·고유 지도·슬라이스를 함께 남김',
      saved && saved.v === 11 && saved.experienceKind === 'consequence-pairs' && saved.map === expectedMapId &&
      savedSlice && savedSlice.checkpoint === checkpoint);
    const beforeRoundTrip = JSON.stringify(savedSlice);
    T.writeSlot(2, saved);
    const restored = T.loadSlot(2);
    const restoredSlice = restored && restored.flags && restored.flags[pair.stateKey];
    check(pair.pairId + ' ' + checkpoint + ' 디스크 왕복은 고유 지도와 전체 슬라이스를 보존',
      restored && restored.map === expectedMapId && restoredSlice && JSON.stringify(restoredSlice) === beforeRoundTrip);
    T.continueGame(2);
    const runtime = T.consequenceRuntime();
    check(pair.pairId + ' ' + checkpoint + ' 이어하기는 고유 지도·검사점으로 재개',
      checkpoint === 'complete'
        ? g.map === 'timelinehub' && g.flags[pair.stateKey].checkpoint === 'complete'
        : runtime && runtime.pairId === pair.pairId && runtime.checkpoint === checkpoint && g.map === pair.mapId);
    assertEarlierPairsAndForeignSlotsUntouched(pair, priorStates);
  }

  for (let index = 0; index < laterPairs.length; index++) {
    const pair = laterPairs[index];
    const earlierStates = [['copyrightSlice', JSON.stringify(g.flags.copyrightSlice)]].concat(
      laterPairs.slice(0, index).map((earlier) => [earlier.stateKey, JSON.stringify(g.flags[earlier.stateKey])]),
    );
    check(pair.pairId + '는 순서상 열린 뒤 고유 지도에서 시작',
      T.startConsequencePair(pair.pairId) === true && g.map === pair.mapId &&
      T.consequenceRuntime().pairId === pair.pairId && T.consequenceRuntime().checkpoint === 'past_start');
    for (const [station, choice] of pair.choices.slice(0, 3)) {
      check(pair.pairId + ' ' + station + ' 과거 선택을 기록',
        T.recordConsequencePastChoice(station, choice) === true);
    }
    assertCheckpointRoundTrip(pair, 'past_rooms', earlierStates);
    const [disclosureStation, disclosureChoice] = pair.choices[3];
    check(pair.pairId + ' 공개 선택은 past_done 검사점으로 기록',
      T.recordConsequencePastChoice(disclosureStation, disclosureChoice) === true);
    assertCheckpointRoundTrip(pair, 'past_done', earlierStates);
    check(pair.pairId + ' 현재 전환은 고유 지도에서 시작', T.beginConsequencePresent() === true && g.map === pair.mapId);
    assertCheckpointRoundTrip(pair, 'present_start', earlierStates);
    for (const repairId of T.consequenceRuntime().requiredRepairIds.slice()) {
      check(pair.pairId + ' ' + repairId + ' 수리를 기록', T.completeConsequenceRepair(repairId) === true);
    }
    assertCheckpointRoundTrip(pair, 'repairs_done', earlierStates);
    if (pair.pairId === 'd7_misinformation') {
      check('D-7은 관리자 서명 확인 전 무대 진입을 거부',
        T.beginConsequenceFinale({ skipIntro: true }) === false &&
        T.consequenceRuntime().checkpoint === 'repairs_done');
      check('D-7 관리자 서명은 identity_revealed를 원자 저장',
        T.revealConsequenceIdentity() === true &&
        T.consequenceRuntime().checkpoint === 'identity_revealed');
      assertCheckpointRoundTrip(pair, 'identity_revealed', earlierStates);
    } else {
      check(pair.pairId + '에는 identity_revealed 검사점이 없음',
        T.revealConsequenceIdentity() === false &&
        T.consequenceRuntime().checkpoint === 'repairs_done');
    }
    check(pair.pairId + ' 장소형 무대를 시작', T.beginConsequenceFinale({ skipIntro: true }) === true && g.mode === 'battle');
    assertCheckpointRoundTrip(pair, 'finale_start', earlierStates);
    check(pair.pairId + ' 완료를 기록', T.completeStagePersuasion() === true);
    assertCheckpointRoundTrip(pair, 'complete', earlierStates);
  }

  storage.delete('fabletest2-memento-preview-slot-0');
  storage.delete('fabletest2-memento-preview-slot-1');
  storage.delete('fabletest2-memento-preview-slot-2');
}

// ── U-5 NG+ 타이틀 흐름 — 클리어 슬롯에서 두 번째 모험 선택 ──
console.log('[U-5] NG+ 타이틀 흐름 — 클리어 슬롯 선택 → 이어보기 / 처음부터(2회차)');
{
  const T = windowObj.__test;
  // 클리어 세이브를 슬롯 0에, 진행 중(미클리어) 세이브를 슬롯 1에 둔다
  storage.set('fabletest2-memento-preview-slot-0', JSON.stringify({ v: 8, name: '클리어아이', map: 'village', x: 13, y: 16,
    flags: { talkedProf: true, defeated: { bekkyeomon: true, sujipmon: true, pyeonhyangmon: true, hwangakmon: true, yuhokmon: true, hollimmon: true, finalboss: true, yeongi: true },
      mercy: 8, visited: {}, introClue1: true, introForestTrace: true, ttaraFirstEncounter: true,
      privacyLeak: 0, prologueClosed: true, forestClearingRead: true, endingId: 'home' }, updatedAt: Date.now() }));
  storage.set('fabletest2-memento-preview-slot-1', JSON.stringify({ v: 8, name: '진행중아이', map: 'village', x: 13, y: 16,
    flags: { talkedProf: true, defeated: { bekkyeomon: true }, mercy: 1, visited: {}, introClue1: true,
      introForestTrace: true, ttaraFirstEncounter: true, privacyLeak: 0, prologueClosed: true }, updatedAt: Date.now() }));

  // 클리어 슬롯에서 Z → 두 번째 모험 선택 화면
  g.mode = 'title'; g.titleScreen = 'slots'; g.slotCursor = 0;
  tap('z');
  check('U-5 클리어 슬롯 Z → 선택 화면(ngchoice) 표시', g.titleScreen === 'ngchoice');

  // "★ 두 번째 모험" (커서 1) 선택 → NG+ 새 게임 시작
  tap('ArrowDown');
  check('U-5 커서 이동 — 두 번째 모험(1)', g.ngCursor === 1);
  tap('z');
  check('U-5 처음부터(2회차) → flags.ng = true', g.flags.ng === true);
  check('U-5 이름은 클리어 세이브에서 이어받음', g.playerName === '클리어아이');
  check('U-5 새 모험 진행 초기화 — 프롤로그(defeated 없음)', g.currentSlot === 0 &&
    !(g.flags.defeated && g.flags.defeated.yeongi));

  // 취소 흐름 — ngchoice에서 X면 슬롯 화면으로 복귀
  // (앞서 startNewGame이 슬롯 0을 새 NG 세이브로 덮어썼으므로 클리어 세이브를 다시 심는다)
  storage.set('fabletest2-memento-preview-slot-0', JSON.stringify({ v: 8, name: '클리어아이', map: 'village', x: 13, y: 16,
    flags: { talkedProf: true, defeated: { bekkyeomon: true, sujipmon: true, pyeonhyangmon: true, hwangakmon: true, yuhokmon: true, hollimmon: true, finalboss: true, yeongi: true },
      mercy: 8, visited: {}, introClue1: true, introForestTrace: true, ttaraFirstEncounter: true,
      privacyLeak: 0, prologueClosed: true, forestClearingRead: true, endingId: 'home' }, updatedAt: Date.now() }));
  g.mode = 'title'; g.titleScreen = 'slots'; g.slotCursor = 0; g.flags = null;
  tap('z');
  check('U-5 다시 클리어 슬롯 Z → ngchoice', g.titleScreen === 'ngchoice');
  tap('x');
  check('U-5 ngchoice에서 X → 슬롯 화면 복귀', g.titleScreen === 'slots');

  // 정상(미클리어) 슬롯은 영향 없음 — Z가 곧장 이어하기(ngchoice 안 뜸)
  g.mode = 'title'; g.titleScreen = 'slots'; g.slotCursor = 1;
  tap('z');
  check('U-5 미클리어 슬롯은 ngchoice 없이 바로 이어하기', g.titleScreen !== 'ngchoice' &&
    (g.mode === 'world' || g.mode === 'dialog') && g.flags.ng !== true);

  storage.delete('fabletest2-memento-preview-slot-0');
  storage.delete('fabletest2-memento-preview-slot-1');
}

console.log('[X-round] 세이브 스키마 — 신규 플래그 기본값·수업 세션 무누출·반응 선택 보존');
{
  const T = windowObj.__test;
  const nf = T.newFlags();
  check('X 신규 플래그 기본값(playerVoice/{}·damaAsked·banjjakAsked·classSession/false 등)',
    nf.playerVoice && Object.keys(nf.playerVoice).length === 0 && nf.damaAsked === null &&
    nf.banjjakAsked === null && nf.classSession === false && nf.mercyGuideShown === false &&
    nf.epilogueAsked === false);
  check('X-8 classSession은 수업 진입에서만(setupClassBaseFlags=true, newFlags=false, 일반 세이브 무누출)',
    T.setupClassBaseFlags().classSession === true && T.newFlags().classSession === false);
  // 반응 선택·요청 플래그가 세이브에 실려 왕복 보존되는지(writeSlot→loadSlot roundtrip).
  const save = { v: 9, name: '수호자', map: 'village', x: 13, y: 16,
    flags: Object.assign(T.newFlags(), { playerVoice: { ttara: 1, yeongi: 0 }, damaAsked: 'think', banjjakAsked: 'watch' }) };
  T.writeSlot(2, save);
  const loaded = T.loadSlot(2);
  check('X 반응/요청 선택 플래그 세이브 왕복 보존', loaded.flags.playerVoice.ttara === 1 &&
    loaded.flags.playerVoice.yeongi === 0 && loaded.flags.damaAsked === 'think' && loaded.flags.banjjakAsked === 'watch');
  storage.delete('fabletest2-memento-preview-slot-2');

  // 이슈6: classSession=true로 저장된 슬롯을 '일반 이어하기'로 열면 세션 플래그가 꺼져야 한다
  //        (수업 배너·마무리 안내가 슬롯에 영구 잔존하지 않게). 미클리어 슬롯이라 ngchoice 없이 바로 진입.
  storage.set('fabletest2-memento-preview-slot-1', JSON.stringify({ v: 9, name: '수업아이', map: 'village', x: 13, y: 16,
    flags: Object.assign(T.newFlags(), { talkedProf: true, prologueClosed: true, classSession: true }), updatedAt: Date.now() }));
  g.mode = 'title'; g.titleScreen = 'slots'; g.slotCursor = 1; g.flags = null;
  tap('z'); // 슬롯 1 이어하기(미클리어) → continueGame
  check('이슈6 일반 이어하기 진입 시 classSession 해제(배너 영구 잔존 방지)',
    (g.mode === 'world' || g.mode === 'dialog') && g.flags && g.flags.classSession === false);
  storage.delete('fabletest2-memento-preview-slot-1');
}

// ── Y-17b 되돌리기 스냅샷 30일 자동 정리 (타임스탬프 필드) ──
console.log('[Y-17b] 오래된 되돌리기 스냅샷 자동 정리 (SLOT_UNDO·BACKUP_UNDO)');
{
  const T = windowObj.__test;
  const SLOT_UNDO = 'fabletest2-memento-preview-deleted-slot';
  const BACKUP_UNDO = 'fabletest2-memento-preview-restore-undo';
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();

  // (1) 신선한(오늘) 스냅샷은 유지된다
  storage.set(SLOT_UNDO, JSON.stringify({ slot: 1, ts: now - DAY, 'fabletest2-memento-preview-slot-1': '{}' }));
  T.cleanStaleUndoSnapshots(now);
  check('Y-17b 신선한(1일) SLOT_UNDO 스냅샷 유지', !!storage.get(SLOT_UNDO));

  // (2) 30일 넘은 스냅샷은 지워진다
  storage.set(SLOT_UNDO, JSON.stringify({ slot: 1, ts: now - 40 * DAY, 'fabletest2-memento-preview-slot-1': '{}' }));
  T.cleanStaleUndoSnapshots(now);
  check('Y-17b 40일 지난 SLOT_UNDO 스냅샷 자동 삭제', !storage.get(SLOT_UNDO));

  // (3) 타임스탬프 없는 구 스냅샷은 즉시 삭제하지 않고 지금 시각으로 도장만 찍는다(하위 호환)
  storage.set(SLOT_UNDO, JSON.stringify({ slot: 2, 'fabletest2-memento-preview-slot-2': '{}' }));
  T.cleanStaleUndoSnapshots(now);
  const stamped = JSON.parse(storage.get(SLOT_UNDO) || 'null');
  check('Y-17b ts 없는 구 스냅샷은 보존 + 지금 시각으로 도장', stamped && stamped.ts === now);
  // 도장 이후 다시 30일이 지나야 삭제된다
  T.cleanStaleUndoSnapshots(now + 40 * DAY);
  check('Y-17b 도장된 구 스냅샷도 30일 후엔 정리됨', !storage.get(SLOT_UNDO));

  // (4) BACKUP_UNDO는 백업 텍스트(savedAt 포함)로 나이를 잰다
  storage.set(BACKUP_UNDO, JSON.stringify({ app: 'ai-ethics-adventure-memento-preview', version: 1, savedAt: now - DAY, data: {} }));
  T.cleanStaleUndoSnapshots(now);
  check('Y-17b 신선한 BACKUP_UNDO 유지', !!storage.get(BACKUP_UNDO));
  storage.set(BACKUP_UNDO, JSON.stringify({ app: 'ai-ethics-adventure-memento-preview', version: 1, savedAt: now - 40 * DAY, data: {} }));
  T.cleanStaleUndoSnapshots(now);
  check('Y-17b 40일 지난 BACKUP_UNDO 자동 삭제', !storage.get(BACKUP_UNDO));

  // (5) deleteSlot이 새 스냅샷에 ts를 심는지 (스키마 변경 확인)
  storage.set('fabletest2-memento-preview-slot-1', JSON.stringify({ v: 8, name: '지울아이', flags: { defeated: {} } }));
  T.deleteSlot(1);
  const del = JSON.parse(storage.get(SLOT_UNDO) || 'null');
  check('Y-17b deleteSlot 스냅샷에 ts 타임스탬프 존재', del && typeof del.ts === 'number');
  storage.delete(SLOT_UNDO);
  storage.delete('fabletest2-memento-preview-slot-1');
}

console.log('[P-3] 삭제 안전망 저장 실패 시 원본 슬롯 보존');
{
  const T = windowObj.__test;
  const SLOT_UNDO = 'fabletest2-memento-preview-deleted-slot';
  const slotKey = 'fabletest2-memento-preview-slot-2';
  const statsKey = 'fabletest2-memento-preview-stats-2';
  storage.set(slotKey, JSON.stringify({ v: 9, name: '보존아이', flags: { defeated: {} } }));
  storage.set(statsKey, JSON.stringify({ privacy: { correct: 2, total: 3 } }));
  const realSet = sandbox.localStorage.setItem;
  sandbox.localStorage.setItem = (key, value) => {
    if (key === SLOT_UNDO) throw new Error('snapshot unavailable');
    return realSet(key, value);
  };
  const deleted = T.deleteSlot(2);
  sandbox.localStorage.setItem = realSet;
  check('P-3 스냅샷 저장 실패 시 슬롯 원본 유지', !!storage.get(slotKey));
  check('P-3 스냅샷 저장 실패 시 학습 기록 유지', !!storage.get(statsKey));
  check('P-3 삭제 함수가 실패를 호출자에게 반환', deleted === false);
  T.probeStorage();
  storage.delete(slotKey);
  storage.delete(statsKey);
}

console.log('[P-3b] 슬롯 데이터 삭제 중 실패하면 전체 원상 복구');
{
  const T = windowObj.__test;
  const SLOT_UNDO = 'fabletest2-memento-preview-deleted-slot';
  const slotKey = 'fabletest2-memento-preview-slot-2';
  const statsKey = 'fabletest2-memento-preview-stats-2';
  const oldUndo = JSON.stringify({ slot: 1, ts: Date.now(), 'fabletest2-memento-preview-slot-1': '{"name":"이전 삭제"}' });
  const oldSlot = JSON.stringify({ v: 9, name: '부분삭제방지', flags: { defeated: {} } });
  const oldStats = JSON.stringify({ privacy: { correct: 4, total: 5 } });
  storage.set(SLOT_UNDO, oldUndo);
  storage.set(slotKey, oldSlot);
  storage.set(statsKey, oldStats);
  const realRemove = sandbox.localStorage.removeItem;
  let failedOnce = false;
  sandbox.localStorage.removeItem = (key) => {
    if (key === statsKey && !failedOnce) {
      failedOnce = true;
      throw new Error('learning delete unavailable');
    }
    return realRemove(key);
  };
  const deleted = T.deleteSlot(2);
  sandbox.localStorage.removeItem = realRemove;
  check('P-3b 중간 삭제 실패를 호출자에게 반환', deleted === false);
  check('P-3b 중간 삭제 실패 뒤 슬롯·학습 기록 전체 보존',
    storage.get(slotKey) === oldSlot && storage.get(statsKey) === oldStats);
  check('P-3b 실패한 삭제가 이전 되살리기 기록을 덮어쓰지 않음', storage.get(SLOT_UNDO) === oldUndo);
  T.probeStorage();
  storage.delete(SLOT_UNDO);
  storage.delete(slotKey);
  storage.delete(statsKey);
}

// ── Y-17a 저장공간 쿼터 초과(QuotaExceededError) → noteStorageFail 경고 승격 ──
console.log('[Y-17a] 쿼터 초과 모의 스토리지 — noteStorageFail 경고 승격');
{
  const T = windowObj.__test;
  check('Y-17a 초기 상태 저장 가능(storageOk=true)', T.getStorageOk() === true);
  const initialSet = sandbox.localStorage.setItem;
  g.notice = null;
  sandbox.localStorage.setItem = () => { throw new Error('startup storage unavailable'); };
  T.probeStorage();
  check('Y-17a 시작 probe 실패도 저장 불가 안내 notice 표시',
    T.getStorageOk() === false && !!(g.notice && /저장되지 않/.test(g.notice.text)));
  sandbox.localStorage.setItem = initialSet;
  T.probeStorage();
  g.notice = null;
  // setItem이 QuotaExceededError를 던지는 국면을 흉내 낸다 (원래 구현 백업 후 교체)
  const realSet = sandbox.localStorage.setItem;
  sandbox.localStorage.setItem = () => {
    const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
  };
  // 저장 경로(writeSlot)는 실패를 삼키고 noteStorageFail로 승격해야 한다 — 크래시 없음
  let threw = false;
  try { T.writeSlot(0, { v: 8, name: '쿼터', flags: { defeated: {} } }); } catch (e) { threw = true; }
  check('Y-17a 쿼터 초과에도 저장 경로가 예외를 던지지 않음', threw === false);
  check('Y-17a noteStorageFail 승격 — storageOk=false', T.getStorageOk() === false);
  // 안내 문구가 게임 notice로 뜬다(교사·학생에게 백업 유도)
  check('Y-17a 저장 불가 안내 notice 표시', !!(g.notice && /저장되지 않/.test(g.notice.text)));
  sandbox.localStorage.setItem = realSet; // 스토리지 원복

  T.probeStorage();
  g.notice = null;
  sandbox.localStorage.setItem = () => { throw new Error('learning data unavailable'); };
  T.recordTopicResult(0, 'privacy', true);
  sandbox.localStorage.setItem = realSet;
  check('P-5 학습 진척도 저장 실패도 storageOk=false로 승격', T.getStorageOk() === false);
  check('P-5 학습 진척도 저장 실패도 사용자 안내 표시', !!(g.notice && /저장되지 않/.test(g.notice.text)));
}

console.log(`\n✔ 슬롯 테스트 통과 (${passed}개 검사)`);
