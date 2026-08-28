const { createGameSandbox } = require('./lib/game-sandbox');

const env = createGameSandbox();
const g = env.boot();
env.step(4);
const T = env.windowObj.__test || {};

let passed = 0;
function check(name, cond) {
  if (!cond) { console.error('  ✘ ' + name); process.exit(1); }
  console.log('  ✔ ' + name); passed += 1;
}
function snapshotCore() {
  return JSON.stringify({
    defeated: g.flags.defeated,
    mercyChoice: g.flags.mercyChoice,
    mercy: g.flags.mercy,
    chapter: [g.flags.chapter1Clear, g.flags.chapter2Clear, g.flags.chapter3Clear,
      g.flags.chapter4Clear, g.flags.chapter5Clear],
    correctCount: g.flags.correctCount,
    battleCount: g.flags.battleCount,
    pStats: g.flags.pStats || null,
    learning: Array.from(env.storage.entries())
      .filter(([key]) => /(?:stats|mistakes|meta|dex)/.test(key))
      .sort(([a], [b]) => a.localeCompare(b)),
  });
}

console.log('[C-1] D-1 캠페인 런타임 API');
for (const name of [
  'consequenceRuntime', 'recordConsequencePastChoice', 'beginConsequencePresent',
  'completeConsequenceRepair', 'beginConsequenceFinale', 'completeStagePersuasion',
  'creationJournalRows', 'resumeConsequenceCampaign', 'interactConsequenceProp',
  'consequenceEffortProjection',
]) check(name + ' 훅이 존재', typeof T[name] === 'function');
const manualEffort = T.consequenceEffortProjection('visual_manual');
const assistedEffort = T.consequenceEffortProjection('audio_licensed');
const instantEffort = T.consequenceEffortProjection('text_instant');
check('과거 선택 노력은 수동 3/도움 2/즉시 1단계', manualEffort.steps === 3 &&
  assistedEffort.steps === 2 && instantEffort.steps === 1);
check('노력 단계는 정답 판정이 아닌 확인 행동', manualEffort.labels.every((label) => !/[OX]|정답|오답/.test(label)) &&
  assistedEffort.labels.every((label) => !/[OX]|정답|오답/.test(label)));

console.log('[C-2] 새 슬롯에서 과거 선택은 방 순서와 무관하고 한 번만 저장');
T.startNewGameForRoute(0, '기록이', 'consequence-pairs');
env.advanceDialog();
check('creationhall 과거 시작', g.map === 'creationhall' && T.consequenceRuntime().phase === 'past' &&
  T.consequenceRuntime().checkpoint === 'past_start');
env.step();
check('과거 목표가 aria-live에 안내', /과거, 현재보다 1일 전/.test(T.srLiveText()));
check('장부는 세 방 전까지 잠김', T.recordConsequencePastChoice('ledger', 'partial') === false);
check('오디오 먼저 선택', T.recordConsequencePastChoice('audio', 'audio_instant') === true);
check('같은 방 재선택 거부', T.recordConsequencePastChoice('audio', 'audio_reply') === false &&
  T.consequenceRuntime().pastChoices.audio === 'audio_instant');
check('텍스트·그림 선택', T.recordConsequencePastChoice('text', 'text_excerpt') === true &&
  T.recordConsequencePastChoice('visual', 'visual_manual') === true);
check('3/3 뒤 past_rooms', T.consequenceRuntime().checkpoint === 'past_rooms');
check('장부 선택은 past_done을 원자 저장', T.recordConsequencePastChoice('ledger', 'partial') === true &&
  T.consequenceRuntime().checkpoint === 'past_done' && T.consequenceRuntime().pastChoices.ledger === 'partial');

console.log('[C-3] 같은 좌표 현재 전환과 파생 수리');
env.setPlayer(20, 11, 'left');
check('현재 전환', T.beginConsequencePresent() === true && T.consequenceRuntime().phase === 'present' &&
  T.consequenceRuntime().checkpoint === 'present_start' && g.player.x === 20 && g.player.y === 11);
g.notice.t = 0; env.step();
check('현재 목표가 aria-live에 안내', /현재, 공동 창작관/.test(T.srLiveText()));
check('혼합 경로는 정확히 두 파생 수리', JSON.stringify(T.consequenceRuntime().requiredRepairIds) ===
  JSON.stringify(['visual_panel', 'music_cue', 'text_panel', 'music_license_review', 'ledger_blank']));
const rows = T.creationJournalRows();
check('일지는 선택 사실과 현재 수리를 분리', rows.some((r) => r.kind === 'past-choice' && r.id === 'audio_instant') &&
  rows.some((r) => r.kind === 'repair' && r.id === 'ledger_blank'));
for (const id of T.consequenceRuntime().requiredRepairIds) check(id + ' 수리', T.completeConsequenceRepair(id) === true);
check('마지막 수리는 repairs_done일 뿐 배틀을 자동 시작하지 않음',
  T.consequenceRuntime().checkpoint === 'repairs_done' && g.mode === 'world');

console.log('[C-4] 무대 시작·장소형 완료는 본편 통계를 오염시키지 않음');
const coreBefore = snapshotCore();
check('무대 시작은 finale_start/segment0 원자 기록', T.beginConsequenceFinale({ skipIntro: true }) === true &&
  T.consequenceRuntime().phase === 'finale' && T.consequenceRuntime().checkpoint === 'finale_start' &&
  T.consequenceRuntime().finale.segment === 0 && g.mode === 'battle' &&
  g.battle.p.subjectKind === 'place' && g.battle.p.completionMode === 'stage');
for (let i = 1; i <= 3; i++) {
  T.retreatPersuasion();
  env.advanceDialog();
  check(`부드러운 물러남 ${i}/3 저장`, T.consequenceRuntime().finale.assistLevel === i && g.mode === 'world');
  T.restartConsequenceStage();
}
check('세 번 물러나면 선택 가능한 25% 느린 파도 보정', T.consequenceRuntime().finale.slowWaveEnabled === true);
g.battle.pState = 'shaken';
T.enterBattleWave();
check('첫 실제 패턴 파도는 무피해 연습이고 느린 속도 적용',
  g.battle.wave.practice === true && Math.abs(g.battle.arena.sf - 0.54) < 0.001);
g.battle.wave = null;
g.battle.phase = 'menu';
g.battle.gauge = g.battle.gaugeMax;
g.battle.spareReady = true;
g.battle.menuIdx = 3;
env.tap('z');
check('실제 안아 주기 입력은 자비·랭크 없이 결과 대사와 허브로 직행',
  g.mode === 'dialog' && g.map === 'timelinehub' && g.battle === null &&
  T.consequenceRuntime().phase === 'result' && T.consequenceRuntime().checkpoint === 'complete' &&
  T.consequenceRuntime().complete === true);
check('완료 ID는 유일', JSON.stringify(g.flags.consequenceCampaign.completedPairIds) === JSON.stringify(['d1_copyright']));
check('장소형 완료가 본편 통계를 바꾸지 않음', snapshotCore() === coreBefore);

console.log('[C-5] 허브 잠금·재현 및 체크포인트 복원');
const hub = T.consequenceHubProjection();
check('D-1 완료/재현, D-3+ 잠김', hub[0].complete && hub[0].replay && hub.slice(1).every((p) => p.locked));
for (const checkpoint of ['past_start', 'past_rooms', 'past_done', 'present_start', 'repairs_done', 'finale_start', 'complete']) {
  const result = T.resumeConsequenceCampaign('d1_copyright', checkpoint);
  check(checkpoint + ' 결정적 복원', result && result.checkpoint === checkpoint &&
    (checkpoint === 'complete' ? g.map === 'timelinehub' : g.map === 'creationhall') &&
    (checkpoint === 'repairs_done' ? g.mode === 'world' : true));
  if (checkpoint === 'past_done') {
    T.interactConsequenceProp(env.run("MAP_PROPS.creationhall.find((prop) => prop.kind === 'd1_ledger')"));
    env.advanceDialog();
    check('past_done 복원 뒤 장부에서 현재로 계속', T.consequenceRuntime().checkpoint === 'present_start');
  }
  if (checkpoint === 'finale_start') {
    T.restartConsequenceStage();
    check('저장된 무대 segment에서 재개', g.battle.claimIdx === 3 &&
      g.battle.gauge === g.battle.gaugeMax && g.battle.spareReady === true);
  }
}
const resumedSlice = g.flags.copyrightSlice;
resumedSlice.complete = false;
resumedSlice.stageRestored = false;
resumedSlice.phase = 'finale';
resumedSlice.checkpoint = 'finale_start';
resumedSlice.finale.segment = 2;
g.flags.consequenceCampaign.activePairId = 'd1_copyright';
const repairsBeforeResume = JSON.stringify({
  base: resumedSlice.baseRepairs,
  added: resumedSlice.addedRepairs,
});
const normalResume = T.resumeConsequenceCampaign();
check('override 없는 finale_start 재개는 저장 segment의 실제 무대로 진입', normalResume &&
  g.mode === 'battle' && g.battle.consequenceStage === true && g.battle.claimIdx === 2 &&
  g.battle.gauge > 0 && g.battle.gauge < g.battle.gaugeMax);
check('무대 재개가 이미 마친 수리를 초기화하지 않음', repairsBeforeResume === JSON.stringify({
  base: resumedSlice.baseRepairs,
  added: resumedSlice.addedRepairs,
}));

console.log('[C-6] 최소·혼합·최대 파생 수리 조합');
const combos = [
  [['visual_manual', 'audio_reply', 'text_new', 'complete'], 3],
  [['visual_manual', 'audio_instant', 'text_excerpt', 'partial'], 5],
  [['visual_instant', 'audio_instant', 'text_instant', 'missing'], 7],
];
for (const [choices, count] of combos) {
  const ids = T.consequenceRepairIds({ visual: choices[0], audio: choices[1], text: choices[2], ledger: choices[3] });
  check(choices.join('/') + ' 수리 수 ' + count, ids.length === count && new Set(ids).size === ids.length);
}

console.log('[C-7] 실제 월드 조사 입력과 저장 왕복');
T.startNewGameForRoute(1, '걷는이', 'consequence-pairs');
env.advanceDialog();
env.setPlayer(4, 4, 'up');
env.tap('z');
check('그림 작업대 앞 Z가 실제 3지 선택창을 연다', g.mode === 'choice' && g.choice.options.length === 3);
env.tap('z');
check('수동 선택은 바로 저장하지 않고 1/3 확인 행동을 연다', g.mode === 'choice' &&
  /작업 1\/3/.test(g.choice.prompt) && T.consequenceRuntime().pastChoices.visual === null);
env.tap('z');
check('두 번째 확인 단계 전에도 아직 선택을 저장하지 않음', g.mode === 'choice' &&
  /작업 2\/3/.test(g.choice.prompt) && T.consequenceRuntime().pastChoices.visual === null);
env.tap('x');
check('마지막 단계 전 취소는 월드로 돌아가고 선택을 바꾸지 않음', g.mode === 'world' &&
  T.consequenceRuntime().pastChoices.visual === null);
const cancelledSave = JSON.parse(env.storage.get('fabletest2-memento-preview-slot-1'));
check('취소 뒤 슬롯에도 과거 선택이 기록되지 않음', cancelledSave.flags.copyrightSlice.checkpoint === 'past_start' &&
  cancelledSave.flags.copyrightSlice.pastChoices.visual === null);
env.tap('z');
env.tap('z');
env.tap('z');
env.tap('z');
env.tap('z');
env.advanceDialog();
check('선택창 결정이 visual 선택을 한 번 기록', T.consequenceRuntime().pastChoices.visual === 'visual_manual');
const saved = JSON.parse(env.storage.get('fabletest2-memento-preview-slot-1'));
check('past_rooms 체크포인트가 V11 슬롯에 즉시 저장', saved.v === 11 &&
  saved.flags.copyrightSlice.checkpoint === 'past_rooms' &&
  saved.flags.copyrightSlice.pastChoices.visual === 'visual_manual');

console.log(`\n✔ consequence runtime ${passed} assertions passed`);
