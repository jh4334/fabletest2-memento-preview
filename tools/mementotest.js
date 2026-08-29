const { createGameSandbox } = require('./lib/game-sandbox');
const fs = require('fs');
const path = require('path');

const env = createGameSandbox();
const g = env.boot();
env.step(5);
const T = env.windowObj.__test || {};

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) {
    console.log('  ✔ ' + name);
    passed += 1;
  } else {
    console.error('  ✘ ' + name);
    failed += 1;
  }
}

function data(expr, fallback) {
  try {
    const raw = env.run(`JSON.stringify(${expr})`);
    return raw === undefined ? fallback : JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function has(name) { return typeof T[name] === 'function'; }

const REVEAL_IDS = ['reset_after', 'reset_before', 'city_failure', 'yeongi_warning', 'first_approval'];
const CHRONOLOGICAL_IDS = REVEAL_IDS.slice().reverse();

console.log('[CORE-RED] Tasks 4-9 gameplay contracts');
check('routechoice is the first title surface before slots',
  g.mode === 'title' && g.titleScreen === 'routechoice' && Array.isArray(T.titleRoutes && T.titleRoutes()));
check('route choice and timeline ordering reuse semantic Canvas tokens', (() => {
  const tokens = T.mementoUiTokens();
  return tokens.canvas.surfacePrimary === '#000000' && tokens.canvas.textPrimary === '#ffffff' &&
    tokens.canvas.borderDefault === '#ffffff' && tokens.route.page === tokens.canvas.surfacePrimary &&
    tokens.route.border === tokens.canvas.borderDefault && tokens.route.selected === '#ffd644' &&
    tokens.route.unselected === '#dddddd' && tokens.route.borderIdle === '#444444' &&
    tokens.order.page === tokens.canvas.surfacePrimary && tokens.order.border === tokens.canvas.borderDefault &&
    tokens.order.title === '#72d2c7' && tokens.order.success === '#8de08d' && tokens.order.empty === '#777777';
})());
check('world labels clamp their centers inside both Canvas edges',
  typeof T.clampedCanvasLabelX === 'function' &&
  T.clampedCanvasLabelX(90, -12, 4) === 49 &&
  T.clampedCanvasLabelX(90, 740, 4) === 671 &&
  T.clampedCanvasLabelX(90, 360, 4) === 360);
check('fast Memento start has a deterministic route-aware test seam', has('startNewGameForRoute'));
check('record completion grants evidence only through the completion seam', has('recordEvidenceStatus'));
check('present administrator terminal exposes locked, retry, and solved states', has('openAdministratorTerminal'));
check('visible HUD uses the reverse-time axis and never a count',
  has('recordHudText') && /현재/.test(T.recordHudText(T.newFlags(), false)) && !/\d\/5/.test(T.recordHudText(T.newFlags(), false)));
check('timelineorder supports start, place, undo, and submit',
  has('startTimelineOrdering') && has('placeTimelineCard') && has('undoTimelineCard') && has('submitTimelineOrder'));
check('actual shrine completion enters ordering before restoration', has('interactAltar') && has('finishShrine'));
check('finale resume matrix has a deterministic test seam', has('resumeMementoFinale'));

console.log('[M-0] 메멘토 순수 모듈은 클래식 스크립트 순서와 독립 계약을 지킨다');
const indexPath = path.resolve(process.env.MEMENTO_INDEX_PATH || path.join(__dirname, '..', 'index.html'));
const indexSource = fs.readFileSync(indexPath, 'utf8');
const scriptSources = Array.from(indexSource.matchAll(/<script\s+src="([^"]+)"><\/script>/g), (match) => match[1]);
const dataIndex = scriptSources.indexOf('src/data.js');
const mementoIndex = scriptSources.indexOf('src/memento.js');
const gameIndex = scriptSources.indexOf('src/game.js');
check('Memento script missing or ordered incorrectly',
  dataIndex >= 0 && mementoIndex === dataIndex + 1 && gameIndex === mementoIndex + 1);

const pureModule = data(`({
  routes: typeof MEMENTO_ROUTES === 'undefined' ? null : MEMENTO_ROUTES,
  terminal: typeof MEMENTO_TERMINAL === 'undefined' ? null : MEMENTO_TERMINAL,
  chronologicalIds: typeof MEMENTO_CHRONOLOGICAL_IDS === 'undefined' ? null : MEMENTO_CHRONOLOGICAL_IDS,
  recordForChapter: typeof mementoRecordForChapter,
  axisProjection: typeof mementoAxisProjection,
  orderingCards: typeof mementoOrderingCards,
  chronologicalOrder: typeof isMementoChronologicalOrder
})`, {}) || {};
check('순수 메멘토 상수와 투영 API가 존재',
  pureModule.recordForChapter === 'function' && pureModule.axisProjection === 'function' &&
  pureModule.orderingCards === 'function' && pureModule.chronologicalOrder === 'function');
check('세 시작 경로는 ID와 표시 이름을 고정한다',
  JSON.stringify(pureModule.routes) === JSON.stringify([
    { id: 'original', label: '원래 모험 시작' },
    { id: 'memento', label: '메멘토 시간선 체험' },
    { id: 'consequence-pairs', label: '과거·현재 캠페인 시작' },
  ]));
check('현재 관리자 단말 계약은 하나의 정답과 재시도 문구를 가진다',
  pureModule.terminal && pureModule.terminal.id === 'admin-terminal' &&
  pureModule.terminal.title === '현재 · 관리자 단말' &&
  pureModule.terminal.choices && pureModule.terminal.choices.filter((choice) => choice.correct).length === 1 &&
  pureModule.terminal.choices.find((choice) => choice.correct).id === 'author-unknown' &&
  /빈칸/.test(pureModule.terminal.locked) && /출구 잠금/.test(pureModule.terminal.correctText) &&
  /다시 보자/.test(pureModule.terminal.wrongText));
check('시간순 ID는 가장 오래된 기록부터 정확히 다섯 개다',
  JSON.stringify(pureModule.chronologicalIds) === JSON.stringify(CHRONOLOGICAL_IDS));

if (pureModule.recordForChapter === 'function') {
  check('장→기록 순수 매핑은 유효 장만 공개 순서로 반환한다',
    JSON.stringify(data('[0, 1, 2, 3, 4, 5, 6, null].map(mementoRecordForChapter)', [])) ===
      JSON.stringify([null].concat(REVEAL_IDS, [null, null])));
}
if (pureModule.axisProjection === 'function') {
  const axis = data("mementoAxisProjection(['reset_after', 'reset_after', 'unknown', 'city_failure'])", null);
  check('축 투영은 중복·알 수 없는 ID를 무시하고 다섯 노드를 안정적으로 남긴다',
    axis && axis.direction === 'present-to-past' && axis.label === '현재 ◀ ●D-1 · ○D-2 · ●D-3 · ○D-5 · ○D-7 ◀ 과거' &&
    JSON.stringify(axis.nodes.map((node) => [node.id, node.daysAgo, node.unlocked])) === JSON.stringify([
      ['reset_after', 1, true], ['reset_before', 2, false], ['city_failure', 3, true],
      ['yeongi_warning', 5, false], ['first_approval', 7, false],
    ]));
  check('축 투영은 입력을 바꾸지 않고 매 호출에 새 구조를 만든다',
    data(`(() => {
      const ids = ['reset_after']; const before = JSON.stringify(ids);
      const first = mementoAxisProjection(ids); const second = mementoAxisProjection(ids);
      first.nodes[0].unlocked = false;
      return before === JSON.stringify(ids) && first !== second && first.nodes !== second.nodes && second.nodes[0].unlocked;
    })()`, false) === true);
}
if (pureModule.orderingCards === 'function' && pureModule.chronologicalOrder === 'function') {
  check('정렬 카드는 시간순 날짜·제목을 새 배열과 객체로 반환한다',
    data(`(() => {
      const first = mementoOrderingCards(); const second = mementoOrderingCards();
      first[0].title = 'changed';
      return JSON.stringify(second.map((card) => [card.id, card.daysAgo, card.title])) === JSON.stringify([
        ['first_approval', 7, '편리함 승인'], ['yeongi_warning', 5, '한 번만 더'],
        ['city_failure', 3, '닫힌 문이 막은 것'], ['reset_before', 2, '잠근 사람'],
        ['reset_after', 1, '남겨 둔 한 문장'],
      ]);
    })()`, false) === true);
  check('정렬 판정은 정확한 다섯 장만 받고 인접 교환·중복·미지·부분을 거절한다',
    data(`[
      isMementoChronologicalOrder(${JSON.stringify(CHRONOLOGICAL_IDS)}),
      isMementoChronologicalOrder(['first_approval', 'city_failure', 'yeongi_warning', 'reset_before', 'reset_after']),
      isMementoChronologicalOrder(['first_approval', 'first_approval', 'city_failure', 'reset_before', 'reset_after']),
      isMementoChronologicalOrder(['first_approval', 'yeongi_warning', 'city_failure', 'reset_before', 'unknown']),
      isMementoChronologicalOrder(['first_approval', 'yeongi_warning'])
    ]`, []) .join(',') === 'true,false,false,false,false');
}

console.log('[M-1] 장 종료 기록은 과거 시간상 역순으로 공개된다');
const records = data('typeof MEMENTO_RECORDS === "undefined" ? null : MEMENTO_RECORDS', []) || [];
const restored = data('typeof RESTORED_TIMELINE === "undefined" ? null : RESTORED_TIMELINE', []) || [];
check('손상된 기록 5개 데이터가 존재', records.length === 5);
check('공개 순서: 초기화 직후→직전→도시 이상→영이 경고→최초 승인',
  records.map((r) => r.id).join(',') === REVEAL_IDS.join(','));
check('시간 표시는 현재에서 더 먼 과거로 1·2·3·5·7일',
  records.map((r) => r.daysAgo).join(',') === '1,2,3,5,7');
check('파이널 복원은 실제 시간순으로 정확히 뒤집힘',
  restored.map((r) => r.recordId).join(',') === CHRONOLOGICAL_IDS.join(','));
check('기록마다 20~40초 분량의 짧은 페이지 3~4개',
  records.length === 5 && records.every((r) => Array.isArray(r.pages) && r.pages.length >= 3 && r.pages.length <= 4));

console.log('[M-2] 장별 기록 해금은 한 번만 저장된다');
check('장 번호→기록 ID 매핑 API 존재', has('recordForChapter'));
if (has('recordForChapter')) {
  check('1~5장 매핑이 공개 순서와 일치',
    [1, 2, 3, 4, 5].map((n) => T.recordForChapter(n)).join(',') === REVEAL_IDS.join(','));
}
check('기록 해금 API 존재', has('unlockDamagedRecord'));
if (has('unlockDamagedRecord')) {
  g.currentSlot = 0;
  g.flags = T.newFlags();
  T.unlockDamagedRecord(1);
  T.unlockDamagedRecord(1);
  const saved = JSON.parse(env.storage.get('fabletest2-memento-preview-slot-0') || 'null');
  check('1장 기록은 중복 없이 한 번 해금',
    g.flags.damagedRecords.length === 1 && g.flags.damagedRecords[0] === 'reset_after');
  check('해금 직후 pendingRecord와 슬롯 저장이 함께 남음',
    g.flags.pendingRecord === 'reset_after' && saved && saved.flags.pendingRecord === 'reset_after');
}

console.log('[M-3] 건너뛰기와 일지 재열람이 진행을 보존한다');
check('손상 기록 장면 시작 API 존재', has('startDamagedRecord'));
if (has('startDamagedRecord') && has('unlockDamagedRecord')) {
  g.currentSlot = 0;
  g.flags = T.newFlags();
  T.unlockDamagedRecord(1);
  T.startDamagedRecord('reset_after', { ret: 'world' });
  check('최초 기록 장면은 record 모드로 진입', g.mode === 'record');
  check('최초 공개는 본문 전에 복원 여부를 고르는 발견 단계로 진입',
    g.record && g.record.discovery === true);
  env.tap('x');
  const skippedSave = JSON.parse(env.storage.get('fabletest2-memento-preview-slot-0') || 'null');
  check('X 건너뛰기 뒤 월드로 복귀하고 완료·건너뜀 상태 저장',
    g.mode === 'world' && g.flags.viewedRecords.reset_after === true &&
    g.flags.skippedRecords.reset_after === true && g.flags.pendingRecord === null &&
    skippedSave && skippedSave.flags.skippedRecords.reset_after === true);
  check('발견·건너뜀은 기록 증거를 주지 않음',
    g.flags.recordEvidence.length === 0 && skippedSave.flags.recordEvidence.length === 0);

  g.flags.skippedRecords.reset_after = false;
  const before = g.flags.damagedRecords.slice();
  T.startDamagedRecord('reset_after', { ret: 'journal', replay: true });
  env.tap('x');
  check('일지 재열람을 닫으면 일지로 돌아감', g.mode === 'journal');
  check('재열람 건너뛰기는 최초 건너뜀 표식을 새로 만들지 않음', g.flags.skippedRecords.reset_after === false);
  check('재열람은 기록을 중복 해금하지 않음',
    g.flags.damagedRecords.join(',') === before.join(','));

  g.flags = T.newFlags();
  T.unlockDamagedRecord(1);
  T.startDamagedRecord('reset_after', { ret: 'world' });
  env.tap('z');
  check('복원하기를 고르면 같은 기록의 첫 페이지가 시작됨',
    g.mode === 'record' && g.record && g.record.discovery === false && g.record.page === 0);
  for (let i = 0; i < 4; i++) env.tap('z');
  check('첫 기록을 읽으면 입력자 공백을 짚는 반디 복선이 실제 대화로 이어짐',
    g.mode === 'dialog' && g.dialog && /누가 쓴 문장인지는 아직 몰라/.test(g.dialog.lines[0]));
  const readSave = JSON.parse(env.storage.get('fabletest2-memento-preview-slot-0') || 'null');
  check('기록을 끝까지 읽으면 증거 ID를 한 번만 저장',
    g.flags.recordEvidence.join(',') === 'reset_after' && readSave.flags.recordEvidence.join(',') === 'reset_after');
}

console.log('[M-3b] 빠른 경로와 관리자 단말은 기록 증거를 실제로 사용한다');
if (has('startNewGameForRoute') && has('openAdministratorTerminal')) {
  const routeConfirmedAt = g.time;
  T.startNewGameForRoute(2, '시간아이', 'memento');
  const routeSave = JSON.parse(env.storage.get('fabletest2-memento-preview-slot-2') || 'null');
  check('메멘토 새 게임은 같은 실험실에서 3600프레임 안에 첫 기록으로 진입',
    g.mode === 'record' && g.record.ids[0] === 'reset_after' && g.time - routeConfirmedAt <= 3600 &&
    g.map === 'introlab' && g.player.x === 14 && g.player.y === 16);
  check('빠른 경로는 반디만 합류하고 장·증거를 자동 지급하지 않음',
    routeSave.flags.storyRoute === 'memento' && routeSave.flags.bandiJoined === true &&
    routeSave.flags.chapter1Clear === false && routeSave.flags.recordEvidence.length === 0);
  env.tap('x');
  T.openAdministratorTerminal();
  check('건너뛴 기록의 단말은 잠겨 있고 다시보기 선택을 제공',
    g.mode === 'choice' && /잠김/.test(g.choice.prompt) && g.choice.options[0] === '기록 다시 보기' &&
    g.flags.introDoorOpen === false);
  g.mode = 'world'; g.choice = null;
  g.flags.recordEvidence = ['reset_after'];
  T.openAdministratorTerminal();
  check('증거가 있으면 단말이 고정 질문과 세 선택지를 표시',
    g.mode === 'choice' && /손상된 기록과 비교/.test(g.choice.prompt) && g.choice.options.length === 3);
  env.tap('z');
  check('오답은 단말과 문을 잠근 채 다시 시도할 수 있음',
    g.mode === 'dialog' && /오답/.test(g.dialog.lines[0]) && !g.flags.administratorTerminalSolved && !g.flags.introDoorOpen);
  g.mode = 'world'; g.dialog = null;
  T.openAdministratorTerminal();
  g.choice.cursor = 1;
  env.tap('z');
  const terminalSave = JSON.parse(env.storage.get('fabletest2-memento-preview-slot-2') || 'null');
  check('정답만 단말 해결과 출구 개방을 함께 저장',
    g.flags.administratorTerminalSolved && g.flags.introDoorOpen &&
    terminalSave.flags.administratorTerminalSolved && terminalSave.flags.introDoorOpen);
}

console.log('[M-4] 마음 일지는 사실의 신뢰도가 단계적으로 변한다');
check('일지 기록 단계 계산 API 존재', has('journalRecordStage'));
if (has('journalRecordStage')) {
  const make = (ids, done) => Object.assign(T.newFlags(), { damagedRecords: ids, timelineRestored: !!done });
  const early = T.journalRecordStage(make(REVEAL_IDS.slice(0, 1), false));
  const middle = T.journalRecordStage(make(REVEAL_IDS.slice(0, 3), false));
  const late = T.journalRecordStage(make(REVEAL_IDS, false));
  const final = T.journalRecordStage(make(REVEAL_IDS, true));
  check('초반은 [확인된 사실]', early.label === '[확인된 사실]' && /영이가 코어를 망가뜨렸다/.test(early.text));
  check('중반은 [확인된 사실?] + 최초 입력자 공백', middle.label === '[확인된 사실?]' && /최초 입력자/.test(middle.text));
  check('후반은 [내가 믿고 싶었던 이야기]', late.label === '[내가 믿고 싶었던 이야기]' && /영이가 모든 문제/.test(late.text));
  check('복원 뒤는 [복원된 사실] + 나의 참여와 영이의 경고',
    final.label === '[복원된 사실]' && /나도 이 결정에 참여/.test(final.text) && /영이는 나를 멈추려/.test(final.text));
}

console.log('[M-5] 다섯 카드 수동 정렬만 두 시간선을 결합한다');
check('시간순 정렬 시작 API 존재', has('startTimelineOrdering'));
if (has('startTimelineOrdering')) {
  g.currentSlot = 0;
  g.flags = Object.assign(T.newFlags(), { damagedRecords: REVEAL_IDS.slice(), shrineDone: true });
  T.startTimelineOrdering();
  for (let i = 0; i < 5; i++) T.placeTimelineCard();
  const wrongDraft = g.flags.timelineOrderDraft.slice();
  T.submitTimelineOrder();
  const wrongSave = JSON.parse(env.storage.get('fabletest2-memento-preview-slot-0') || 'null');
  check('공개 역순 제출은 오답 횟수만 늘리고 배치를 보존',
    wrongDraft.join(',') === REVEAL_IDS.join(',') && g.flags.timelineOrderWrong === 1 &&
    !g.flags.timelineMerged && wrongSave.flags.timelineOrderDraft.join(',') === REVEAL_IDS.join(','));
  check('오답은 아동 친화 문장으로 표시하고 해제 전 재제출을 막음',
    /순서가 이어지지 않는다/.test(g.timelineOrder.feedback) && T.submitTimelineOrder() === false);
  T.undoTimelineCard();
  check('되돌리기는 오답을 해제하고 마지막 배치를 즉시 저장',
    !g.timelineOrder.feedback && g.flags.timelineOrderDraft.length === 4 &&
    JSON.parse(env.storage.get('fabletest2-memento-preview-slot-0')).flags.timelineOrderDraft.length === 4);

  g.flags.timelineOrderDraft = [];
  T.startTimelineOrdering();
  [4, 3, 2, 1, 0].forEach((cursor) => { g.timelineOrder.cursor = cursor; T.placeTimelineCard(); });
  check('오래된 7→5→3→2→1일 순서가 카드 놓기마다 초안에 저장',
    g.flags.timelineOrderDraft.join(',') === CHRONOLOGICAL_IDS.join(',') &&
    JSON.parse(env.storage.get('fabletest2-memento-preview-slot-0')).flags.timelineOrderDraft.join(',') === CHRONOLOGICAL_IDS.join(','));
  T.submitTimelineOrder();
  check('정답 제출만 결합하고 초안을 지운 뒤 색 복원 요약을 시작',
    g.flags.timelineMerged === true && g.flags.timelineRestored === false && g.flags.timelineOrderDraft.length === 0 &&
    g.mode === 'record' && g.record.restored === true && g.record.ids.join(',') === CHRONOLOGICAL_IDS.join(','));
  env.tap('x');
  const finalSave = JSON.parse(env.storage.get('fabletest2-memento-preview-slot-0') || 'null');
  check('복원 건너뛰기도 완료 상태 저장 후 반디 공개 흐름으로 복귀',
    g.flags.timelineRestored === true && g.flags.bandiRevealed === true && g.mode === 'dialog' &&
    finalSave && finalSave.flags.timelineRestored === true && finalSave.flags.bandiRevealed === true);
}

console.log('[M-5b] 실제 제단과 저장 재개 행렬은 각 표면을 한 번만 연다');
if (has('interactAltar') && has('resumeMementoFinale')) {
  const whisperAnswers = data('SHRINE_WHISPERS.map((whisper) => whisper.answer)', []);
  g.currentSlot = 1;
  g.flags = Object.assign(T.newFlags(), { evCards: Array.from(new Set(whisperAnswers)), shrineIdx: 0 });
  g.mode = 'world';
  T.interactAltar();
  const openWhispers = g.dialog && g.dialog.onEnd;
  g.dialog = null; g.mode = 'world';
  openWhispers();
  whisperAnswers.forEach((answer) => {
    g.choice.cursor = g.flags.evCards.indexOf(answer);
    env.tap('z');
  });
  check('여덟 속삭임을 실제 선택하면 제단 완료 뒤 정렬 모드로 진입',
    g.flags.shrineIdx === 8 && g.flags.shrineDone === true && g.mode === 'timelineorder' &&
    !g.flags.timelineMerged && !g.flags.timelineRestored);

  g.flags = Object.assign(T.newFlags(), { shrineDone: true, timelineOrderDraft: ['reset_after'] });
  g.mode = 'world';
  T.resumeMementoFinale();
  check('shrineDone&&!timelineMerged 재개는 저장 초안을 유지한 정렬 표면',
    g.mode === 'timelineorder' && g.flags.timelineOrderDraft.join(',') === 'reset_after');
  T.resumeMementoFinale();
  check('정렬 상태 반복 재개는 초안을 복제하지 않음', g.flags.timelineOrderDraft.join(',') === 'reset_after');

  g.flags = Object.assign(T.newFlags(), { shrineDone: true, timelineMerged: true, timelineRestored: false });
  g.mode = 'world';
  T.resumeMementoFinale();
  check('merged&&!restored 재개는 기존 복원된 색 요약', g.mode === 'record' && g.record.restored === true);

  g.flags = Object.assign(T.newFlags(), { shrineDone: true, timelineMerged: true, timelineRestored: true, bandiRevealed: false });
  g.mode = 'world'; g.record = null;
  T.resumeMementoFinale();
  check('restored&&!bandiRevealed 재개만 반디 공개를 시작',
    g.flags.bandiRevealed === true && g.mode === 'dialog' && g.dialog && /가장 오래된 날/.test(g.dialog.lines[0]));
  const revealedDialog = g.dialog;
  T.resumeMementoFinale();
  check('공개 뒤 반복 재개는 대화 콜백을 중복 생성하지 않음', g.dialog === revealedDialog);
}

console.log('[M-6] 기존 세이브는 V9로 안전하게 옮겨진다');
check('V9 마이그레이션 API 존재', has('migrateSlotV9'));
if (has('migrateSlotV9')) {
  const migrated = T.migrateSlotV9({ v: 8, name: '구세이브', flags: { shrineDone: false, defeated: {} } });
  check('V8→V9와 새 필드 기본값', migrated.v === 9 && Array.isArray(migrated.flags.damagedRecords) &&
    Object.keys(migrated.flags.viewedRecords).length === 0 && Object.keys(migrated.flags.skippedRecords).length === 0 &&
    migrated.flags.pendingRecord === null && migrated.flags.timelineMerged === false && migrated.flags.timelineRestored === false);
  const completed = T.migrateSlotV9({ v: 8, flags: { shrineDone: true, defeated: { yeongi: true } } });
  check('이미 코어를 끝낸 구세이브는 새 파이널을 강제로 반복하지 않음',
    completed.flags.timelineMerged === true && completed.flags.timelineRestored === true);
  check('완료된 구세이브는 기록이 비어 있어도 복원된 시간순 다시보기가 보임',
    has('journalRecordItems') && T.journalRecordItems(completed.flags).map((item) => item.id).join(',') === 'restored');
  const chapterSave = T.migrateSlotV9({ v: 8, flags: {
    chapter1Clear: true, chapter2Clear: true, shrineDone: false, defeated: {},
  } });
  check('완료한 장이 있는 구세이브는 해당 손상 기록을 새 기록으로 보충',
    chapterSave.flags.damagedRecords.join(',') === 'reset_after,reset_before' &&
    Object.keys(chapterSave.flags.viewedRecords).length === 0 && chapterSave.flags.pendingRecord === null);
  const defeatedOnly = T.migrateSlotV9({ v: 8, flags: {
    shrineDone: false,
    defeated: { sujipmon: true, pyeonhyangmon: true, hwangakmon: true, yuhokmon: true, hollimmon: true },
  } });
  check('일반 전투 완료 표식만으로 장 기록을 잘못 보충하지 않음',
    defeatedOnly.flags.damagedRecords.length === 0 && defeatedOnly.flags.pendingRecord === null);
}
const fresh = has('newFlags') ? T.newFlags() : {};
check('신규 세이브의 기록 상태 기본값', Array.isArray(fresh.damagedRecords) && fresh.damagedRecords.length === 0 &&
  fresh.viewedRecords && fresh.skippedRecords && fresh.pendingRecord === null &&
  fresh.timelineMerged === false && fresh.timelineRestored === false && fresh.storyRoute === 'original' &&
  Array.isArray(fresh.recordEvidence) && fresh.recordEvidence.length === 0 &&
  fresh.administratorTerminalSolved === false && Array.isArray(fresh.timelineOrderDraft) &&
  fresh.timelineOrderDraft.length === 0 && fresh.timelineOrderWrong === 0);

console.log('[M-6b] 손상 기록 진행은 첫 장부터 HUD와 다시보기 동선에 드러난다');
check('손상 기록 HUD 문구 API 존재', has('recordHudText'));
if (has('recordHudText')) {
  const emptyAxis = T.recordHudText(T.newFlags(), false);
  check('해금 전 HUD는 다섯 날짜와 현재→과거 방향을 빈 원으로 표시',
    emptyAxis === '현재 ◀ ○D-1 · ○D-2 · ○D-3 · ○D-5 · ○D-7 ◀ 과거 · J 다시보기');
  const oneRecord = Object.assign(T.newFlags(), { damagedRecords: ['reset_after'] });
  check('해금 뒤 키보드 HUD가 채운 모양·D-날짜·J 다시보기를 안내',
    /●D-1/.test(T.recordHudText(oneRecord, false)) && /○D-7/.test(T.recordHudText(oneRecord, false)) && /J/.test(T.recordHudText(oneRecord, false)));
  check('해금 뒤 터치 HUD가 같은 축과 메뉴 다시보기를 안내',
    /현재 ◀ ●D-1/.test(T.recordHudText(oneRecord, true)) && /메뉴/.test(T.recordHudText(oneRecord, true)));
  const skippedRecord = Object.assign(T.newFlags(), {
    damagedRecords: ['reset_after'], skippedRecords: { reset_after: true },
  });
  const evidenceRecord = Object.assign(T.newFlags(), {
    damagedRecords: ['reset_after'], recordEvidence: ['reset_after'],
  });
  check('축은 건너뜀 △과 증거 ◆을 날짜 텍스트와 함께 구별',
    /△D-1/.test(T.recordHudText(skippedRecord, false)) && /◆D-1/.test(T.recordHudText(evidenceRecord, false)));
  check('보이는 손상 기록 N/5 카운터는 소스에 남지 않음',
    !/손상 기록\s+\$?\{?[^\n]*\/5/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'game.js'), 'utf8')));
}

console.log('[M-7] 네 엔딩은 기존 ID와 누적 여정을 보존해 새 주제에 연결된다');
const endingThemes = data('typeof MEMENTO_ENDING_THEMES === "undefined" ? null : MEMENTO_ENDING_THEMES', {}) || {};
const computeEnding = env.run('computeEnding');
check('기존 엔딩 ID 4개 보존', Object.keys(endingThemes).sort().join(',') === 'dawn,farewell,home,silent');
check('집으로=복원, 침묵=반복, 새벽=의존, 먼 길=단절 주제',
  endingThemes.home === 'restore' && endingThemes.silent === 'repeat' &&
  endingThemes.dawn === 'depend' && endingThemes.farewell === 'disconnect');
check('마지막 선택 하나가 아니라 앞선 자비 누적이 집으로를 가름',
  computeEnding('mercy', 7) === 'home' && computeEnding('mercy', 6) === 'farewell');
check('의존 엔딩도 앞선 자비 누적이 필요',
  computeEnding('neutral', 5) === 'dawn' && computeEnding('neutral', 4) === 'farewell');
check('낮은 자비 누적은 마지막 선택과 무관하게 반복 엔딩',
  computeEnding('mercy', 2) === 'silent' && computeEnding('neutral', 2) === 'silent');
if (has('endingScene')) {
  const endingText = (id) => T.endingScene(id).lines.join('\n');
  check('집으로는 기록실과 사람의 확인을 되살림', /기록실/.test(endingText('home')) && /확인한 사람/.test(endingText('home')));
  check('침묵은 초기화와 같은 안내문의 반복을 보여 줌', /초기화/.test(endingText('silent')) && /같은 안내문/.test(endingText('silent')));
  check('새벽은 판단을 맡긴 뒤 선택 칸이 비는 결과를 보여 줌', /결정을 영이에게 맡겼다/.test(endingText('dawn')) && /이유」 칸은 계속 비었다/.test(endingText('dawn')));
  check('작별은 모든 AI와 도움 가능성이 함께 꺼지는 결과를 보여 줌', /모든 AI를 껐다/.test(endingText('farewell')) && /돕던 창도 꺼졌다/.test(endingText('farewell')));
}

console.log('[M-8] 공정한 복선·금지 문구·기존 본편 순서를 지킨다');
const clues = data('typeof MEMENTO_CLUES === "undefined" ? null : MEMENTO_CLUES', []) || [];
check('반전 전에 재해석 가능한 복선 최소 3개', clues.length >= 3 && clues.every((c) => c.beforeFinal === true));
const liveClues = data(`({
  prologue: BANDI_BOSS_LINES.prologue,
  afterFirstRecord: MEMENTO_POST_RECORD_LINES.reset_after,
  quietYard: COMPANION_LINES.quietyard,
  warningRecord: MEMENTO_RECORDS.find((record) => record.id === 'city_failure').pages.join('\\n')
})`, {}) || {};
check('프롤로그 결정권·첫 기록 입력자·고요 비상 정지 복선이 실제 대사에 배치됨',
  /어느 길로 갈지는 네가 정해/.test(liveClues.prologue.mercy) &&
  /누가 쓴 문장인지는 아직 몰라/.test(liveClues.afterFirstRecord) &&
  /비상 정지/.test(liveClues.quietYard) && /비상 정지/.test(liveClues.warningRecord));
const endingScenes = has('endingScene')
  ? ['home', 'silent', 'dawn', 'farewell'].map((id) => T.endingScene(id)) : [];
const screenText = JSON.stringify({ records, restored, endingThemes, endingScenes, clues, liveClues });
check('새 화면 문구에 금지 어휘·-몬식 이름 없음', !/(몬스터|도감|증표|[가-힣]+몬)/.test(screenText));
const maps = data('Object.keys(MAPS)', []);
check('프롤로그→다섯 거리→고요의 뜰→코어 맵이 모두 보존',
  ['introlab', 'forest', 'freestreet', 'tiltstreet', 'rumorstreet', 'arcade', 'cozyhome', 'quietyard', 'coreroom']
    .every((id) => maps.includes(id)));
const laterPairMaps = data(`[
  'synthesis_broadcast_room', 'recommendation_alley', 'newsroom_repair', 'cozy_control_room'
].map((id) => ({
  id, pairId: MAPS[id] && MAPS[id].consequencePairId,
  shared: MAPS[id] && MAPS[id].sharedTimelineGeometry,
  geometry: MAPS[id] && MAPS[id].tiles.join('\\n')
}))`, []);
check('후속 네 장소는 쌍 내부 과거·현재 지오메트리를 공유',
  laterPairMaps.length === 4 && laterPairMaps.every((map) => map.shared && map.pairId));
check('후속 네 장소는 서로 다른 공간 실루엣을 사용',
  new Set(laterPairMaps.map((map) => map.geometry)).size === laterPairMaps.length);
check('장 번호 1~5만 기록에 연결되어 본편 순서를 바꾸지 않음',
  has('recordForChapter') && T.recordForChapter(0) === null && T.recordForChapter(6) === null);

console.log('[M-9] 새 기록·엔딩 문구는 화면낭독기와 TTS가 읽을 수 있다');
if (has('journalAnnouncement')) {
  g.currentSlot = 0;
  g.flags = Object.assign(T.newFlags(), {
    damagedRecords: ['reset_after'],
    viewedRecords: { reset_after: true },
  });
  T.writeSlot(0, { v: 9, name: '테스트', map: 'freestreet', x: 1, y: 1, flags: g.flags });
  g.journal.slot = 0;
  g.journal.tab = 'records';
  g.journal.recordCursor = 0;
  const journalSpeech = T.journalAnnouncement();
  check('일지 낭독문에 현재 탭·기록 수·선택 항목·상태가 포함됨',
    /손상된 기록 탭/.test(journalSpeech) && /1개 중 1번째/.test(journalSpeech) &&
    /현재보다 1일 전/.test(journalSpeech) && /읽음/.test(journalSpeech));
} else {
  check('일지 낭독문 API 존재', false);
}
if (has('endingAnnouncement')) {
  check('네 엔딩 낭독문에 제목과 화면의 모든 문장이 포함됨',
    ['home', 'silent', 'dawn', 'farewell'].every((id) => {
      const scene = T.endingScene(id);
      const speech = T.endingAnnouncement(id);
      return speech.includes(scene.title) && scene.lines.filter(Boolean).every((line) => speech.includes(line));
    }));
} else {
  check('엔딩 낭독문 API 존재', false);
}

console.log('[M-10] 순행 컬러·역행 회색 시각 문법이 시간선과 함께 움직인다');
check('시간선 시각 모드 API 존재', has('timelineVisualMode'));
check('기록 비네트 명세 API 존재', has('recordDioramaSpec'));
check('월드 인물 팔레트 API 존재', has('worldFigureProfile'));
if (has('timelineVisualMode')) {
  const reverseMode = T.timelineVisualMode({ restored: false });
  const restoredMode = T.timelineVisualMode({ restored: true });
  const presentMode = T.timelineVisualMode(null);
  check('손상 기록은 회색빛 역행 모드', reverseMode.id === 'reverse' && reverseMode.grayscale === true && reverseMode.direction === 'backward');
  check('손상 기록 비네트는 네 단계 회색 명도만 사용',
    new Set(['surface', 'floor', 'floorAlt', 'wall', 'mortar', 'light', 'accent', 'warm']
      .map((key) => reverseMode[key])).size === 4);
  check('실제 시간순 복원은 컬러 순행 모드', restoredMode.id === 'restored' && restoredMode.grayscale === false && restoredMode.direction === 'forward');
  check('현재 월드는 컬러 순행 모드', presentMode.id === 'present' && presentMode.grayscale === false && presentMode.direction === 'forward');
}
if (has('recordDioramaSpec')) {
  const ids = REVEAL_IDS.slice();
  const reverseSpecs = ids.map((id) => T.recordDioramaSpec(id, false));
  const restoredSpecs = ids.map((id) => T.recordDioramaSpec(id, true));
  check('다섯 기록 모두 서로 구별되는 핵심 소품을 가짐',
    reverseSpecs.every(Boolean) && new Set(reverseSpecs.map((spec) => spec.focus)).size === ids.length);
  check('역행과 복원은 사건별 방 배치를 바꾸지 않고 팔레트만 바꿈',
    reverseSpecs.every((spec, i) => spec.layout === restoredSpecs[i].layout && spec.focus === restoredSpecs[i].focus &&
      spec.palette === 'reverse' && restoredSpecs[i].palette === 'restored'));
}
if (has('worldFigureProfile')) {
  const figure = T.worldFigureProfile();
  check('플레이어는 청록 상의·어두운 외곽·바닥 그림자로 배경과 분리',
    /^#[0-9a-f]{6}$/i.test(figure.player.r) && figure.outline === '#0a0d12' && figure.shadow === true && figure.outlinePx >= 2);
}

console.log('[CP-1] 과거·현재 다섯 쌍의 순수 계약은 불변 레지스트리로 고정된다');
const consequenceEngine = data(`({
  order: typeof CONSEQUENCE_PAIR_ORDER === 'undefined' ? null : CONSEQUENCE_PAIR_ORDER,
  configs: typeof CONSEQUENCE_PAIR_CONFIGS === 'undefined' ? null : CONSEQUENCE_PAIR_CONFIGS,
  lookup: typeof consequencePairConfig,
  createPair: typeof createConsequencePairState,
  createCampaign: typeof createConsequenceCampaignState,
  derive: typeof deriveAddedRepairIds,
  required: typeof requiredRepairIds,
  facts: typeof projectPairFacts,
  ready: typeof isPairFinaleReady,
  classify: typeof classifyPairJourney,
  ending: typeof computeConsequenceEnding
})`, {}) || {};
const CONSEQUENCE_ORDER = ['d1_copyright', 'd3_consent', 'd5_recommendation', 'd7_misinformation', 'd10_judgment'];
const CONSEQUENCE_CHRONOLOGICAL = CONSEQUENCE_ORDER.slice().reverse();
const CONSEQUENCE_ENDINGS = ['home', 'silent', 'dawn', 'farewell'];
const CONSEQUENCE_FINALS = ['restore_together', 'reset_again', 'delegate_all', 'disconnect_all'];
check('다섯 쌍의 고정 순서와 모든 순수 API가 존재',
  JSON.stringify(consequenceEngine.order) === JSON.stringify(CONSEQUENCE_ORDER) &&
  ['lookup', 'createPair', 'createCampaign', 'derive', 'required', 'facts', 'ready', 'classify', 'ending']
    .every((key) => consequenceEngine[key] === 'function'));
check('쌍 레지스트리는 중첩 배열·객체까지 deep freeze하고 D-1부터 D-10까지 정확히 보존',
  data(`(() => {
    const frozen = (value) => {
      if (!value || typeof value !== 'object') return true;
      return Object.isFrozen(value) && Object.getOwnPropertyNames(value).every((key) => frozen(value[key]));
    };
    return frozen(CONSEQUENCE_PAIR_ORDER) && frozen(CONSEQUENCE_PAIR_CONFIGS) &&
      CONSEQUENCE_PAIR_CONFIGS.map((config) => config.id).join(',') === ${JSON.stringify(CONSEQUENCE_ORDER.join(','))};
  })()`, false) === true);
check('D-1 설정은 설계의 선택·기본 수리·파생 수리·피날레 ID를 그대로 사용',
  data(`(() => {
    const config = consequencePairConfig('d1_copyright');
    return config && config.stateKey === 'copyrightSlice' && config.finaleId === 'overlapped_stage' &&
      config.rooms.map((room) => room.choiceKey).join(',') === 'visual,audio,text' &&
      config.baseRepairIds.join(',') === 'visual_panel,music_cue,text_panel' &&
      config.disclosureKey === 'ledger' &&
      config.disclosureChoiceIds.join(',') === 'complete,partial,missing' &&
      config.instantRepairByChoice.visual_instant === 'visual_rights_review' &&
      config.instantRepairByChoice.audio_instant === 'music_license_review' &&
      config.instantRepairByChoice.text_instant === 'text_replacement' &&
      config.disclosureRepairByChoice.partial === 'ledger_blank' &&
      config.disclosureRepairByChoice.missing === 'ledger_fragments';
  })()`, false) === true);
check('D-3·D-5·D-7·D-10은 고유 맵과 범용 UI·수리 라벨 계약을 공개한다',
  data(`(() => {
    const expectedMapIds = {
      d3_consent: 'synthesis_broadcast_room',
      d5_recommendation: 'recommendation_alley',
      d7_misinformation: 'newsroom_repair',
      d10_judgment: 'cozy_control_room',
    };
    const present = (value) => typeof value === 'string' && value.trim().length > 0;
    return Object.entries(expectedMapIds).every(([pairId, mapId]) => {
      const config = consequencePairConfig(pairId);
      const ui = config && (config.pairUi || config.ui);
      const repairIds = config && config.baseRepairIds.concat(
        Object.values(config.instantRepairByChoice), Object.values(config.disclosureRepairByChoice));
      return config && config.mapId === mapId && ui &&
        present(ui.displayLabel) && present(ui.objectiveLabel) && present(ui.finaleLabel) &&
        config.rooms.every((room) => present(ui.roomLabels && ui.roomLabels[room.choiceKey])) &&
        repairIds.every((repairId) => present(config.repairLabels && config.repairLabels[repairId]));
    });
  })()`, false) === true);
check('unknown pair lookup은 null이고 pair/campaign state는 안전한 새 기본값을 반환',
  data(`(() => {
    const first = createConsequencePairState('d1_copyright');
    const second = createConsequencePairState('d1_copyright');
    const campaign = createConsequenceCampaignState();
    first.baseRepairs.visual_panel = true;
    return consequencePairConfig('unknown') === null && first !== second &&
      second.phase === 'past' && second.checkpoint === 'past_start' &&
      Object.values(second.pastChoices).every((value) => value === null) &&
      second.baseRepairs.visual_panel === false && second.finale.segment === 0 &&
      campaign.activePairId === 'd1_copyright' && campaign.completedPairIds.length === 0 &&
      campaign.hubCheckpoint === 'pair_select' && campaign.finalTimelineWrong === 0 &&
      campaign.timelineRestored === false && campaign.finalChoiceId === null &&
      campaign.canonicalEndingId === null && campaign.canonicalEndingBasis === null &&
      campaign.timelineLabUnlocked === false;
  })()`, false) === true);

console.log('[CP-2] 405개 선택 조합은 현재 수리와 사실 투영을 결정적으로 만든다');
const consequenceMatrix = data(`(() => {
  if (typeof deriveAddedRepairIds !== 'function' || typeof requiredRepairIds !== 'function' ||
      typeof projectPairFacts !== 'function' || typeof isPairFinaleReady !== 'function') return null;
  let cases = 0;
  let valid = true;
  for (const config of CONSEQUENCE_PAIR_CONFIGS) {
    const [a, b, c] = config.rooms;
    for (const av of a.choiceIds) for (const bv of b.choiceIds) for (const cv of c.choiceIds) {
      for (const disclosure of config.disclosureChoiceIds) {
        const choices = {
          [a.choiceKey]: av, [b.choiceKey]: bv, [c.choiceKey]: cv,
          [config.disclosureKey]: disclosure,
        };
        const before = JSON.stringify(choices);
        const first = deriveAddedRepairIds(config, choices);
        const second = deriveAddedRepairIds(config, choices);
        const required = requiredRepairIds(config, choices);
        const facts = projectPairFacts(config, choices);
        const state = createConsequencePairState(config.id);
        state.pastChoices = Object.assign({}, choices);
        for (const id of required) {
          if (state.baseRepairs[id] !== undefined) state.baseRepairs[id] = true;
          else state.addedRepairs[id] = true;
        }
        valid = valid && before === JSON.stringify(choices) &&
          JSON.stringify(first) === JSON.stringify(second) && new Set(first).size === first.length &&
          first.length >= 0 && first.length <= 4 && required.length === 3 + first.length &&
          facts && facts.pairId === config.id && facts.instantCount >= 0 && facts.instantCount <= 3 &&
          Array.isArray(facts.addedRepairIds) && JSON.stringify(facts.addedRepairIds) === JSON.stringify(first) &&
          isPairFinaleReady(config, state) === true;
        cases += 1;
      }
    }
  }
  return { cases, valid };
})()`, null);
check('5 × 3×3×3×3 = 405 조합은 중복 없는 0~4개 파생 수리와 피날레 준비를 보장',
  consequenceMatrix && consequenceMatrix.cases === 405 && consequenceMatrix.valid === true);
check('D-1 최소·최대·혼합 fixture의 파생 수리와 입력 불변성이 정확하다',
  data(`(() => {
    const config = consequencePairConfig('d1_copyright');
    const min = { visual: 'visual_manual', audio: 'audio_reply', text: 'text_new', ledger: 'complete' };
    const max = { visual: 'visual_instant', audio: 'audio_instant', text: 'text_instant', ledger: 'missing' };
    const mixed = { visual: 'visual_assisted', audio: 'audio_instant', text: 'text_excerpt', ledger: 'partial' };
    const before = JSON.stringify({ min, max, mixed });
    const results = [min, max, mixed].map((choices) => deriveAddedRepairIds(config, choices));
    projectPairFacts(config, max); classifyPairJourney(config, mixed);
    return before === JSON.stringify({ min, max, mixed }) &&
      JSON.stringify(results[0]) === '[]' &&
      JSON.stringify(results[1]) === JSON.stringify(['visual_rights_review', 'music_license_review', 'text_replacement', 'ledger_fragments']) &&
      JSON.stringify(results[2]) === JSON.stringify(['music_license_review', 'ledger_blank']);
  })()`, false) === true);
check('D-3·D-5·D-7·D-10 최소·혼합·최대 수리 투영은 정확하고 입력을 바꾸지 않는다',
  data(`(() => {
    const fixtures = [
      {
        pairId: 'd3_consent',
        cases: [
          { choices: { likeness: 'likeness_manual', voice: 'voice_recorded', scene: 'scene_reenact', consent: 'consent_complete' }, added: [] },
          { choices: { likeness: 'likeness_assisted', voice: 'voice_instant', scene: 'scene_reenact', consent: 'consent_partial' }, added: ['voice_consent_review', 'consent_gap'] },
          { choices: { likeness: 'likeness_instant', voice: 'voice_instant', scene: 'scene_instant', consent: 'consent_missing' }, added: ['likeness_consent_review', 'voice_consent_review', 'context_replacement', 'consent_fragments'] },
        ],
      },
      {
        pairId: 'd5_recommendation',
        cases: [
          { choices: { echo: 'echo_manual', sample: 'sample_manual', route: 'route_manual', recommendationNote: 'recommendation_note_complete' }, added: [] },
          { choices: { echo: 'echo_assisted', sample: 'sample_instant', route: 'route_manual', recommendationNote: 'recommendation_note_partial' }, added: ['sample_counterexample_review', 'recommendation_log_gap'] },
          { choices: { echo: 'echo_instant', sample: 'sample_instant', route: 'route_instant', recommendationNote: 'recommendation_note_missing' }, added: ['echo_filter_reset', 'sample_counterexample_review', 'dim_autoplay_exit', 'recommendation_log_fragments'] },
        ],
      },
      {
        pairId: 'd7_misinformation',
        cases: [
          { choices: { tip: 'tip_manual', context: 'context_manual', bulletin: 'bulletin_manual', audit: 'audit_complete' }, added: [] },
          { choices: { tip: 'tip_assisted', context: 'context_instant', bulletin: 'bulletin_manual', audit: 'audit_partial' }, added: ['composite_origin_review', 'audit_gap'] },
          { choices: { tip: 'tip_instant', context: 'context_instant', bulletin: 'bulletin_instant', audit: 'audit_missing' }, added: ['tip_duplicate_trace', 'composite_origin_review', 'broadcast_retraction', 'audit_fragments'] },
        ],
      },
      {
        pairId: 'd10_judgment',
        cases: [
          { choices: { call: 'call_manual', safety: 'safety_manual', comfort: 'comfort_manual', authority: 'authority_complete' }, added: [] },
          { choices: { call: 'call_assisted', safety: 'safety_instant', comfort: 'comfort_manual', authority: 'authority_partial' }, added: ['false_lock_appeal', 'authority_gap'] },
          { choices: { call: 'call_instant', safety: 'safety_instant', comfort: 'comfort_instant', authority: 'authority_missing' }, added: ['autoreply_correction', 'false_lock_appeal', 'comfort_pause', 'authority_restore'] },
        ],
      },
    ];
    return fixtures.every(({ pairId, cases }) => {
      const config = consequencePairConfig(pairId);
      return config && cases.every(({ choices, added }) => {
        const before = JSON.stringify(choices);
        const projected = deriveAddedRepairIds(config, choices);
        const required = requiredRepairIds(config, choices);
        const facts = projectPairFacts(config, choices);
        return before === JSON.stringify(choices) &&
          JSON.stringify(projected) === JSON.stringify(added) &&
          JSON.stringify(required) === JSON.stringify(config.baseRepairIds.concat(added)) &&
          facts && JSON.stringify(facts.addedRepairIds) === JSON.stringify(added);
      });
    });
  })()`, false) === true);
check('미완료 과거 선택 또는 수리가 빠진 상태는 피날레 준비가 될 수 없다',
  data(`(() => {
    const config = consequencePairConfig('d1_copyright');
    const fresh = createConsequencePairState(config.id);
    const completeChoices = { visual: 'visual_manual', audio: 'audio_reply', text: 'text_new', ledger: 'complete' };
    const state = createConsequencePairState(config.id);
    state.pastChoices = completeChoices;
    state.baseRepairs.visual_panel = true;
    state.baseRepairs.music_cue = true;
    return !isPairFinaleReady(config, fresh) && !isPairFinaleReady(config, state);
  })()`, false) === true);

console.log('[CP-3] 누적 여정과 마지막 선택은 기존 네 결말 ID로만 결정된다');
check('쌍 여정 분류는 repeat → depend → restore → mixed 우선순위를 적용',
  data(`(() => {
    const config = consequencePairConfig('d1_copyright');
    const profile = (choices) => classifyPairJourney(config, choices).profile;
    return profile({ visual: 'visual_instant', audio: 'audio_reply', text: 'text_new', ledger: 'missing' }) === 'repeat' &&
      profile({ visual: 'visual_instant', audio: 'audio_instant', text: 'text_new', ledger: 'partial' }) === 'depend' &&
      profile({ visual: 'visual_manual', audio: 'audio_reply', text: 'text_new', ledger: 'complete' }) === 'restore' &&
      profile({ visual: 'visual_assisted', audio: 'audio_reply', text: 'text_new', ledger: 'partial' }) === 'mixed';
  })()`, false) === true);
const endingMatrix = data(`(() => {
  if (typeof computeConsequenceEnding !== 'function') return null;
  const profiles = ['restore', 'repeat', 'depend', 'mixed'];
  const finals = ['restore_together', 'reset_again', 'delegate_all', 'disconnect_all'];
  const values = [];
  const walk = (draft) => {
    if (draft.length === 5) {
      for (const finalChoiceId of finals) {
        const journeys = draft.map((profile, index) => ({ pairId: CONSEQUENCE_PAIR_ORDER[index], profile, instantCount: 0, disclosure: 'complete' }));
        const before = JSON.stringify(journeys);
        const first = computeConsequenceEnding(journeys, finalChoiceId);
        const second = computeConsequenceEnding(journeys, finalChoiceId);
        values.push({ endingId: first && first.endingId, stable: JSON.stringify(first) === JSON.stringify(second), untouched: before === JSON.stringify(journeys) });
      }
      return;
    }
    profiles.forEach((profile) => walk(draft.concat(profile)));
  };
  walk([]);
  return values;
})()`, null);
check('4^5 × 4 = 4096 누적 여정 조합은 결정적이고 기존 네 엔딩으로만 귀결',
  Array.isArray(endingMatrix) && endingMatrix.length === 4096 &&
  endingMatrix.every((item) => CONSEQUENCE_ENDINGS.includes(item.endingId) && item.stable && item.untouched));
check('동률은 여정 우선·마지막 선택·실제 시간순 순으로 해결해 단일 선택이 합의를 뒤집지 않는다',
  data(`(() => {
    const make = (profiles) => profiles.map((profile, index) => ({ pairId: CONSEQUENCE_PAIR_ORDER[index], profile, instantCount: 0, disclosure: 'complete' }));
    const exampleA = computeConsequenceEnding(make(['restore', 'restore', 'mixed', 'mixed', 'mixed']), 'reset_again');
    const allMixed = computeConsequenceEnding(make(['mixed', 'mixed', 'mixed', 'mixed', 'mixed']), 'delegate_all');
    const exampleC = computeConsequenceEnding(make(['restore', 'depend', 'mixed', 'mixed', 'mixed']), 'disconnect_all');
    const repeated = {
      restore: computeConsequenceEnding(make(['restore', 'restore', 'mixed', 'mixed', 'mixed']), 'reset_again').endingId,
      repeat: computeConsequenceEnding(make(['repeat', 'repeat', 'mixed', 'mixed', 'mixed']), 'restore_together').endingId,
      depend: computeConsequenceEnding(make(['depend', 'depend', 'mixed', 'mixed', 'mixed']), 'disconnect_all').endingId,
    };
    return exampleA.endingId === 'home' && allMixed.endingId === 'dawn' && exampleC.endingId === 'farewell' &&
      repeated.restore === 'home' && repeated.repeat === 'silent' && repeated.depend === 'dawn' &&
      exampleA.basis && exampleA.basis.ruleVersion === 'ending-rule-v1' &&
      Array.isArray(exampleA.basis.profiles) && exampleA.basis.profiles.map((item) => item.pairId).join(',') === ${JSON.stringify(CONSEQUENCE_ORDER.join(','))} &&
      exampleA.basis.tieBreakReason === 'journey-majority';
  })()`, false) === true);

if (failed > 0) {
  console.error(`\n✘ 메멘토 테스트 실패 (${failed}개 실패, ${passed}개 통과)`);
  process.exit(1);
}
console.log(`\n✔ 메멘토 테스트 통과 (${passed}개 검사)`);
