const MEMENTO_RECORDS = [
  {
    id: 'reset_after', daysAgo: 1, title: '남겨 둔 한 문장',
    pages: [
      '[손상된 기록]\n현재보다 1일 전',
      '기억 초기화가 끝났다.\n열린 안내문은 한 장뿐이다.',
      '"영이가 코어를 망가뜨렸다.\n반디를 믿고 마음 조각을 모아라."',
      '최초 입력자: 확인할 수 없음.\n한 문장만으로는 알 수 없다.',
    ],
  },
  {
    id: 'reset_before', daysAgo: 2, title: '잠근 사람',
    pages: [
      '[손상된 기록]\n현재보다 2일 전',
      '관리자 기록: 잠금 예약됨.\n기억 초기화: 실행 대기.',
      '사유: 영이와 고요의 오류를\n막기 위해.',
      '승인자 이름은 손상되어 있다.\n잠근 사람은 아직 보이지 않는다.',
    ],
  },
  {
    id: 'city_failure', daysAgo: 3, title: '닫힌 문이 막은 것',
    pages: [
      '[손상된 기록]\n현재보다 3일 전',
      '다섯 거리의 경고등이\n한꺼번에 켜진다.',
      '비상 정지 장치 고요:\n코어 연결을 잠시 끊는다.',
      '확산 범위가 멈춘다.\n원인 입력자는 확인할 수 없음.',
    ],
  },
  {
    id: 'yeongi_warning', daysAgo: 5, title: '한 번만 더',
    pages: [
      '[손상된 기록]\n현재보다 5일 전',
      '영이: "편리해졌지만,\n사람들이 확인할 틈이 없어."',
      '영이: "결정까지 내가\n대신하면 안 돼."',
      '관리자: "한 번만 더 지켜보자.\n모두 좋아하고 있잖아."',
    ],
  },
  {
    id: 'first_approval', daysAgo: 7, title: '편리함 승인',
    pages: [
      '[손상된 기록]\n현재보다 7일 전',
      '관리자 이름: [플레이어 이름]\n다섯 설정을 승인한다.',
      '동의는 짧게. 추천은 비슷한 것만.\n출처 확인은 빠르게.',
      '머물게 하는 장치와 관계 도움도 켠다.\n이유: 모두가 덜 힘들었으면 해서.',
    ],
  },
];

const RESTORED_TIMELINE = [
  {
    recordId: 'first_approval', daysAgo: 7, title: '처음의 승인',
    pages: ['7일 전 · 나는 편리함을 서두르며\n다섯 설정을 함께 승인했다.'],
    summary: '좋은 뜻이었지만, 확인할 시간을 빼앗았다.',
  },
  {
    recordId: 'yeongi_warning', daysAgo: 5, title: '영이의 경고',
    pages: ['5일 전 · 영이는 사람의 판단이\n밀려난다고 나를 멈춰 세웠다.'],
    summary: '경고는 이미 곁에 있었다.',
  },
  {
    recordId: 'city_failure', daysAgo: 3, title: '고요의 정지',
    pages: ['3일 전 · 고요는 더 번지지 않게\n문과 코어 연결을 잠시 닫았다.'],
    summary: '닫힌 문은 공격이 아니라 안전을 위한 멈춤이었다.',
  },
  {
    recordId: 'reset_before', daysAgo: 2, title: '숨긴 기록',
    pages: ['2일 전 · 나는 두려워 기록을 잠그고\n영이와 고요를 원인처럼 적었다.'],
    summary: '두려움은 이야기의 일부만 남겼다.',
  },
  {
    recordId: 'reset_after', daysAgo: 1, title: '한쪽짜리 안내',
    pages: ['1일 전 · 초기화 뒤에는\n내가 남긴 한 문장만 열렸다.'],
    summary: '이제 나는 기억을 벌이 아닌 약속으로 고른다.',
  },
];

const MEMENTO_CLUES = [
  {
    id: 'bandi_decision', beforeFinal: true,
    text: '반디는 프롤로그 끝에서 "나는 길을 비출게. 어느 길로 갈지는 네가 정해."라고 말한다.',
  },
  {
    id: 'unknown_author', beforeFinal: true,
    text: '손상된 기록마다 최초 입력자의 이름이 비어 있어, 한쪽짜리 안내문을 그대로 믿기 어렵다.',
  },
  {
    id: 'goyo_stop', beforeFinal: true,
    text: '고요의 뜰 입구와 기록 3에 같은 "비상 정지" 표식이 남아 있다.',
  },
  {
    id: 'same_voice', beforeFinal: true,
    text: '반디와 영이는 확인하고 스스로 결정하라는 같은 뜻의 말을 남긴다.',
  },
];

const MEMENTO_POST_RECORD_LINES = {
  reset_after: '반디: 길은 맞아. 그래도 누가 쓴 문장인지는 아직 몰라.\n…빈칸은 빈칸으로 두자.',
};

const MEMENTO_ENDING_THEMES = {
  home: 'restore',
  silent: 'repeat',
  dawn: 'depend',
  farewell: 'disconnect',
};

const MEMENTO_ROUTES = Object.freeze([
  Object.freeze({ id: 'original', label: '원래 모험 시작' }),
  Object.freeze({ id: 'memento', label: '메멘토 시간선 체험' }),
]);

const MEMENTO_TERMINAL = Object.freeze({
  id: 'admin-terminal',
  title: '현재 · 관리자 단말',
  prompt: '손상된 기록과 비교하면, 이 안내문에서 지금 확인된 것은?',
  locked: '기록에 빈칸이 있다. 먼저 「남겨 둔 한 문장」을 끝까지 확인하자.',
  choices: Object.freeze([
    Object.freeze({ id: 'blame-yeongi', label: '영이가 코어를 망가뜨렸다', correct: false }),
    Object.freeze({ id: 'author-unknown', label: '쓴 사람은 아직 확인할 수 없다', correct: true }),
    Object.freeze({ id: 'trust-bandi', label: '반디의 말은 모두 정답이다', correct: false }),
  ]),
  correctText: '확인 전 기록으로 표시했다. 출구 잠금이 풀린다.',
  wrongText: '그 결론은 아직 기록으로 확인되지 않았다. 빈칸을 다시 보자.',
});

const MEMENTO_CHRONOLOGICAL_IDS = RESTORED_TIMELINE.map((item) => item.recordId);

function mementoRecordForChapter(chapter) {
  const record = Number.isInteger(chapter) ? MEMENTO_RECORDS[chapter - 1] : null;
  return record ? record.id : null;
}

function mementoAxisProjection(unlockedIds) {
  const unlocked = new Set(Array.isArray(unlockedIds) ? unlockedIds : []);
  const nodes = MEMENTO_RECORDS.map((record) => ({
    id: record.id,
    daysAgo: record.daysAgo,
    unlocked: unlocked.has(record.id),
  }));
  return {
    direction: 'present-to-past',
    label: `현재 ◀ ${nodes.map((node) => `${node.unlocked ? '●' : '○'}D-${node.daysAgo}`).join(' · ')} ◀ 과거`,
    nodes,
  };
}

function mementoOrderingCards() {
  return MEMENTO_CHRONOLOGICAL_IDS.map((id) => {
    const record = MEMENTO_RECORDS.find((item) => item.id === id);
    return { id: record.id, daysAgo: record.daysAgo, title: record.title };
  });
}

function isMementoChronologicalOrder(ids) {
  return Array.isArray(ids) && ids.length === MEMENTO_CHRONOLOGICAL_IDS.length &&
    ids.every((id, index) => id === MEMENTO_CHRONOLOGICAL_IDS[index]);
}

function consequenceDeepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((key) => consequenceDeepFreeze(value[key]));
  return Object.freeze(value);
}

function consequenceRoom(choiceKey, choiceIds) {
  return {
    choiceKey,
    choiceIds,
    choiceModes: {
      [choiceIds[0]]: 'manual',
      [choiceIds[1]]: 'assisted',
      [choiceIds[2]]: 'instant',
    },
  };
}

const CONSEQUENCE_PAIR_ORDER = consequenceDeepFreeze([
  'd1_copyright',
  'd3_consent',
  'd5_recommendation',
  'd7_misinformation',
  'd10_judgment',
]);

const CONSEQUENCE_PAIR_CONFIGS = consequenceDeepFreeze([
  {
    id: 'd1_copyright', daysAgo: 1, stateKey: 'copyrightSlice', finaleId: 'overlapped_stage',
    rooms: [
      consequenceRoom('visual', ['visual_manual', 'visual_assisted', 'visual_instant']),
      consequenceRoom('audio', ['audio_reply', 'audio_licensed', 'audio_instant']),
      consequenceRoom('text', ['text_new', 'text_excerpt', 'text_instant']),
    ],
    disclosureKey: 'ledger',
    disclosureChoiceIds: ['complete', 'partial', 'missing'],
    disclosureModeByChoice: { complete: 'complete', partial: 'partial', missing: 'missing' },
    baseRepairIds: ['visual_panel', 'music_cue', 'text_panel'],
    instantRepairByChoice: {
      visual_instant: 'visual_rights_review',
      audio_instant: 'music_license_review',
      text_instant: 'text_replacement',
    },
    disclosureRepairByChoice: { partial: 'ledger_blank', missing: 'ledger_fragments' },
  },
  {
    id: 'd3_consent', daysAgo: 3, stateKey: 'consentSlice', finaleId: 'mixed_broadcast',
    rooms: [
      consequenceRoom('likeness', ['likeness_manual', 'likeness_assisted', 'likeness_instant']),
      consequenceRoom('voice', ['voice_recorded', 'voice_assisted', 'voice_instant']),
      consequenceRoom('scene', ['scene_reenact', 'scene_assisted', 'scene_instant']),
    ],
    disclosureKey: 'consent',
    disclosureChoiceIds: ['consent_complete', 'consent_partial', 'consent_missing'],
    disclosureModeByChoice: {
      consent_complete: 'complete', consent_partial: 'partial', consent_missing: 'missing',
    },
    baseRepairIds: ['likeness_label', 'voice_owner_cue', 'context_caption'],
    instantRepairByChoice: {
      likeness_instant: 'likeness_consent_review',
      voice_instant: 'voice_consent_review',
      scene_instant: 'context_replacement',
    },
    disclosureRepairByChoice: {
      consent_partial: 'consent_gap', consent_missing: 'consent_fragments',
    },
  },
  {
    id: 'd5_recommendation', daysAgo: 5, stateKey: 'recommendationSlice', finaleId: 'one_way_alley',
    rooms: [
      consequenceRoom('echo', ['echo_manual', 'echo_assisted', 'echo_instant']),
      consequenceRoom('sample', ['sample_manual', 'sample_assisted', 'sample_instant']),
      consequenceRoom('route', ['route_manual', 'route_assisted', 'route_instant']),
    ],
    disclosureKey: 'recommendationNote',
    disclosureChoiceIds: [
      'recommendation_note_complete', 'recommendation_note_partial', 'recommendation_note_missing',
    ],
    disclosureModeByChoice: {
      recommendation_note_complete: 'complete',
      recommendation_note_partial: 'partial',
      recommendation_note_missing: 'missing',
    },
    baseRepairIds: ['echo_countervoice', 'sample_context', 'dim_choice_lamps'],
    instantRepairByChoice: {
      echo_instant: 'echo_filter_reset',
      sample_instant: 'sample_counterexample_review',
      route_instant: 'dim_autoplay_exit',
    },
    disclosureRepairByChoice: {
      recommendation_note_partial: 'recommendation_log_gap',
      recommendation_note_missing: 'recommendation_log_fragments',
    },
  },
  {
    id: 'd7_misinformation', daysAgo: 7, stateKey: 'misinformationSlice', finaleId: 'one_sided_tower',
    rooms: [
      consequenceRoom('tip', ['tip_manual', 'tip_assisted', 'tip_instant']),
      consequenceRoom('context', ['context_manual', 'context_assisted', 'context_instant']),
      consequenceRoom('bulletin', ['bulletin_manual', 'bulletin_assisted', 'bulletin_instant']),
    ],
    disclosureKey: 'audit',
    disclosureChoiceIds: ['audit_complete', 'audit_partial', 'audit_missing'],
    disclosureModeByChoice: {
      audit_complete: 'complete', audit_partial: 'partial', audit_missing: 'missing',
    },
    baseRepairIds: ['tip_source_chain', 'edit_context_compare', 'tower_correction'],
    instantRepairByChoice: {
      tip_instant: 'tip_duplicate_trace',
      context_instant: 'composite_origin_review',
      bulletin_instant: 'broadcast_retraction',
    },
    disclosureRepairByChoice: { audit_partial: 'audit_gap', audit_missing: 'audit_fragments' },
  },
  {
    id: 'd10_judgment', daysAgo: 10, stateKey: 'judgmentSlice', finaleId: 'deciding_house',
    rooms: [
      consequenceRoom('call', ['call_manual', 'call_assisted', 'call_instant']),
      consequenceRoom('safety', ['safety_manual', 'safety_assisted', 'safety_instant']),
      consequenceRoom('comfort', ['comfort_manual', 'comfort_assisted', 'comfort_instant']),
    ],
    disclosureKey: 'authority',
    disclosureChoiceIds: ['authority_complete', 'authority_partial', 'authority_missing'],
    disclosureModeByChoice: {
      authority_complete: 'complete', authority_partial: 'partial', authority_missing: 'missing',
    },
    baseRepairIds: ['call_reply_choice', 'corridor_override', 'sofa_exit'],
    instantRepairByChoice: {
      call_instant: 'autoreply_correction',
      safety_instant: 'false_lock_appeal',
      comfort_instant: 'comfort_pause',
    },
    disclosureRepairByChoice: { authority_partial: 'authority_gap', authority_missing: 'authority_restore' },
  },
]);

const CONSEQUENCE_CHRONOLOGICAL_PAIR_ORDER = consequenceDeepFreeze(CONSEQUENCE_PAIR_ORDER.slice().reverse());
const CONSEQUENCE_PROFILE_ENDINGS = consequenceDeepFreeze({ restore: 'home', repeat: 'silent', depend: 'dawn' });
const CONSEQUENCE_FINAL_ENDINGS = consequenceDeepFreeze({
  restore_together: 'home', reset_again: 'silent', delegate_all: 'dawn', disconnect_all: 'farewell',
});
const CONSEQUENCE_ENDING_FALLBACK = consequenceDeepFreeze(['home', 'dawn', 'farewell', 'silent']);

function consequencePairConfig(pairId) {
  return CONSEQUENCE_PAIR_CONFIGS.find((config) => config.id === pairId) || null;
}

function createConsequencePairState(pairId) {
  const config = consequencePairConfig(pairId);
  if (!config) return null;
  const pastChoices = {};
  const baseRepairs = {};
  config.rooms.forEach((room) => { pastChoices[room.choiceKey] = null; });
  pastChoices[config.disclosureKey] = null;
  config.baseRepairIds.forEach((id) => { baseRepairs[id] = false; });
  return {
    phase: 'past',
    checkpoint: 'past_start',
    pastChoices,
    baseRepairs,
    addedRepairs: {},
    finale: { segment: 0, assistLevel: 0, slowWaveEnabled: false },
    stageRestored: false,
    complete: false,
  };
}

function createConsequenceCampaignState() {
  return {
    activePairId: CONSEQUENCE_PAIR_ORDER[0],
    completedPairIds: [],
    hubCheckpoint: 'pair_select',
    finalTimelineDraft: [],
    finalTimelineWrong: 0,
    timelineRestored: false,
    finalChoiceId: null,
    canonicalEndingId: null,
    canonicalEndingBasis: null,
    timelineLabUnlocked: false,
  };
}

function consequenceRoomChoice(config, room, pastChoices) {
  const choice = pastChoices && pastChoices[room.choiceKey];
  return room.choiceIds.includes(choice) ? choice : null;
}

function consequenceDisclosureChoice(config, pastChoices) {
  const choice = pastChoices && pastChoices[config.disclosureKey];
  return config.disclosureChoiceIds.includes(choice) ? choice : null;
}

function deriveAddedRepairIds(config, pastChoices) {
  if (!config) return [];
  const ids = [];
  config.rooms.forEach((room) => {
    const id = config.instantRepairByChoice[consequenceRoomChoice(config, room, pastChoices)];
    if (id) ids.push(id);
  });
  const disclosureId = config.disclosureRepairByChoice[consequenceDisclosureChoice(config, pastChoices)];
  if (disclosureId) ids.push(disclosureId);
  return [...new Set(ids)];
}

function requiredRepairIds(config, pastChoices) {
  if (!config) return [];
  return [...new Set(config.baseRepairIds.concat(deriveAddedRepairIds(config, pastChoices)))];
}

function projectPairFacts(config, pastChoices) {
  if (!config) return null;
  const choices = {};
  const roomModes = {};
  config.rooms.forEach((room) => {
    const choice = consequenceRoomChoice(config, room, pastChoices);
    choices[room.choiceKey] = choice;
    roomModes[room.choiceKey] = choice ? room.choiceModes[choice] : null;
  });
  const disclosureChoice = consequenceDisclosureChoice(config, pastChoices);
  const disclosure = disclosureChoice ? config.disclosureModeByChoice[disclosureChoice] : null;
  const instantCount = Object.values(roomModes).filter((mode) => mode === 'instant').length;
  return {
    pairId: config.id,
    choices,
    roomModes,
    disclosureChoice,
    disclosure,
    instantCount,
    addedRepairIds: deriveAddedRepairIds(config, pastChoices),
  };
}

function isPairFinaleReady(config, pairState) {
  if (!config || !pairState || !pairState.pastChoices) return false;
  const facts = projectPairFacts(config, pairState.pastChoices);
  if (!facts.disclosureChoice || Object.values(facts.choices).some((choice) => choice === null)) return false;
  const completed = Object.assign({}, pairState.baseRepairs, pairState.addedRepairs);
  return requiredRepairIds(config, pairState.pastChoices).every((id) => completed[id] === true);
}

function classifyPairJourney(config, pastChoices) {
  const facts = projectPairFacts(config, pastChoices);
  if (!facts) return null;
  let profile = 'mixed';
  if (facts.disclosure === 'missing' && facts.instantCount >= 1) profile = 'repeat';
  else if (facts.instantCount >= 2) profile = 'depend';
  else if (facts.disclosure === 'complete' && facts.instantCount === 0) profile = 'restore';
  return Object.assign({ profile }, facts);
}

function consequenceJourneyProjection(journeys) {
  const source = Array.isArray(journeys) ? journeys : [];
  return CONSEQUENCE_PAIR_ORDER.map((pairId, index) => {
    const found = source.find((journey) => journey && typeof journey === 'object' && journey.pairId === pairId);
    const raw = found === undefined ? source[index] : found;
    const profile = typeof raw === 'string' ? raw : raw && raw.profile;
    return {
      pairId,
      profile: Object.prototype.hasOwnProperty.call(CONSEQUENCE_PROFILE_ENDINGS, profile) ? profile : 'mixed',
      instantCount: raw && typeof raw === 'object' && Number.isInteger(raw.instantCount) ? raw.instantCount : 0,
      disclosure: raw && typeof raw === 'object' && typeof raw.disclosure === 'string' ? raw.disclosure : null,
    };
  });
}

function computeConsequenceEnding(journeys, finalChoiceId) {
  const projected = consequenceJourneyProjection(journeys);
  const totals = { home: 0, silent: 0, dawn: 0, farewell: 0 };
  const journeyTotals = { home: 0, silent: 0, dawn: 0, farewell: 0 };
  projected.forEach((journey) => {
    const endingId = CONSEQUENCE_PROFILE_ENDINGS[journey.profile];
    if (endingId) {
      totals[endingId] += 1;
      journeyTotals[endingId] += 1;
    }
  });
  const finalEndingId = CONSEQUENCE_FINAL_ENDINGS[finalChoiceId] || null;
  if (finalEndingId) totals[finalEndingId] += 2;

  const highestTotal = Math.max(...Object.values(totals));
  let candidates = Object.keys(totals).filter((id) => totals[id] === highestTotal);
  let tieBreakReason = 'highest-total';
  if (candidates.length > 1) {
    const highestJourney = Math.max(...candidates.map((id) => journeyTotals[id]));
    candidates = candidates.filter((id) => journeyTotals[id] === highestJourney);
    tieBreakReason = 'journey-majority';
  }
  if (candidates.length > 1 && finalEndingId && candidates.includes(finalEndingId)) {
    candidates = [finalEndingId];
    tieBreakReason = 'final-choice';
  }
  if (candidates.length > 1) {
    const chronological = CONSEQUENCE_CHRONOLOGICAL_PAIR_ORDER
      .map((pairId) => projected.find((journey) => journey.pairId === pairId))
      .map((journey) => CONSEQUENCE_PROFILE_ENDINGS[journey.profile])
      .find((endingId) => candidates.includes(endingId));
    if (chronological) {
      candidates = [chronological];
      tieBreakReason = 'chronological-pair';
    }
  }
  if (candidates.length > 1) {
    candidates = [CONSEQUENCE_ENDING_FALLBACK.find((id) => candidates.includes(id))];
    tieBreakReason = 'fallback';
  }

  return {
    endingId: candidates[0],
    basis: {
      ruleVersion: 'ending-rule-v1',
      profiles: projected.map((journey) => ({ pairId: journey.pairId, profile: journey.profile })),
      pairFacts: projected.map((journey) => ({
        pairId: journey.pairId,
        instantCount: journey.instantCount,
        disclosure: journey.disclosure,
      })),
      finalChoiceId: finalEndingId ? finalChoiceId : null,
      totals,
      journeyTotals,
      tieBreakReason,
    },
  };
}
