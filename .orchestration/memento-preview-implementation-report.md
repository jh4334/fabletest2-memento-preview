# 마음의 문 메멘토형 이중 시간선 미리보기 구현 보고서

작성 기준: 기능 브랜치 원격 게시 전 최종 검토 단계. PR·병합·최종 Pages 값은 배포 직후 이 문서에 실제 값으로 갱신한다.

## 1. 원본 저장소 최신 main SHA

- 저장소: `https://github.com/jh4334/fabletest2`
- 기본 브랜치: `main`
- 고정 SHA: `79bdc2af7cac4e6e01758ae825bce9c96262c4a1`
- 작업 시작 시 최근 CI: `32089167132` 성공
- 작업 시작 시 최근 Pages: `32089167151` 성공
- 작업 시작 시 열린 PR: 없음

## 2. 미리보기 저장소 URL

- 저장소: `https://github.com/jh4334/fabletest2-memento-preview`
- 공개 Pages: `https://jh4334.github.io/fabletest2-memento-preview/`
- 설명: `마음의 문 메멘토형 이중 시간선 플롯 미리보기`

## 3. remote -v 결과

```text
origin   https://github.com/jh4334/fabletest2-memento-preview.git (fetch)
origin   https://github.com/jh4334/fabletest2-memento-preview.git (push)
upstream https://github.com/jh4334/fabletest2.git (fetch)
upstream DISABLED (push)
```

쓰기 대상은 `origin` 하나뿐이다. 원본 `upstream`의 push URL은 문자열 `DISABLED`로 설정했다.

## 4. 기준 버전 태그와 보관 브랜치 SHA

| 기준점 | SHA |
|---|---|
| 원본 `main` | `79bdc2af7cac4e6e01758ae825bce9c96262c4a1` |
| 미리보기 기준 `main` | `79bdc2af7cac4e6e01758ae825bce9c96262c4a1` |
| `archive/pre-memento-plot` | `79bdc2af7cac4e6e01758ae825bce9c96262c4a1` |
| `baseline/pre-memento-plot^{}` | `79bdc2af7cac4e6e01758ae825bce9c96262c4a1` |

주석 태그 객체 SHA는 `69b038bdfeacd49a9b6d71bb18d3d4ec58a3fafc`이며, peel한 커밋이 위 원본 SHA와 같다.

## 5. 기준 버전 Pages 검증 결과

- CI: `https://github.com/jh4334/fabletest2-memento-preview/actions/runs/32786448015` 성공
- Pages: `https://github.com/jh4334/fabletest2-memento-preview/actions/runs/32786447971` 성공
- 검증 URL: `https://jh4334.github.io/fabletest2-memento-preview/?v=79bdc2af7cac4e6e01758ae825bce9c96262c4a1`
- HTTP 200, HTML·JS·CSS·이미지 200, 새 게임 시작, 데스크톱 1280×720, 모바일 세로 390×844, 모바일 가로 844×390, 콘솔 warning/error 0을 실제 브라우저에서 확인했다.
- 정확한 최신 main은 당시 이미 다른 게임인 `방과 후: 그림자 학교`로 전환된 상태여서, 기준 배포의 title은 `마음의 문`이 아니었다. 이 충돌을 사용자에게 보고했고 사용자가 `마음의 문으로 진행`을 명시했다. 기준점은 최신 main 그대로 보존하고, 기능 브랜치에서만 마지막 안정 `마음의 문` 커밋 `c8d9719699ad4f7064181f50f34f76c02a536140`의 트리를 복원했다.

## 6. 구현 브랜치

- `feat/memento-dual-timeline`
- 기준점 `79bdc2a`에서 분기
- 미리보기 전용 복원 커밋 `385d463aa9d15f46c76409041866686d5d0053af`의 트리는 `c8d9719`와 정확히 같다.

## 7. 기존 스토리 요약

플레이어는 반디와 함께 프롤로그의 정적의 숲을 지나 다섯 거리의 마음 조각을 설득한다. 전부 공짜 거리의 개인정보, 기울어진 거리의 추천 편향, 대문짝 신문사의 출처 확인, 반짝 아케이드의 과도한 유도, 포근한 집의 AI 의존 문제를 해결한 뒤 고요의 뜰과 코어로 간다. 코어에서 반디가 영이의 다정한 가면이었음이 밝혀지고, 누적 자비와 마지막 선택이 네 엔딩으로 이어진다.

## 8. 새 이야기의 실제 시간순

1. 현재보다 7일 전, 플레이어와 영이가 공동 관리하던 AI 도시에서 플레이어가 편리함을 위해 다섯 설정을 승인한다.
2. 5일 전, 영이가 사람의 확인과 판단이 밀려난다고 경고하지만 플레이어는 더 지켜보자고 답한다.
3. 3일 전, 다섯 거리의 이상이 번지고 고요가 비상 정지로 코어 연결을 차단한다.
4. 2일 전, 책임이 두려워진 플레이어가 기록 잠금과 기억 초기화를 예약하고 영이·고요를 원인처럼 요약한다.
5. 1일 전, 초기화 뒤 편향된 안내문만 남는다.
6. 현재, 플레이어가 반디와 모험하며 손상 기록을 복원한다.
7. 코어에서 기록을 시간순으로 잇고 자신의 책임을 인정한 상태에서 다음 선택을 한다.

## 9. 플레이어가 경험하는 순서

`프롤로그 → 1장 → 기록 1 → 2장 → 기록 2 → 3장 → 기록 3 → 박사 고백 → 4장 → 기록 4 → 5장 → 기록 5 → 고요의 뜰 → 코어 → 실제 시간순 복원 → 반디=영이 공개 → 영이 설득 → 기존 네 엔딩`

현재 본편은 정방향이다. 과거 기록만 `1일 전 → 2일 전 → 3일 전 → 5일 전 → 7일 전`으로 역행하며, 코어에서는 다시 `7일 전 → 5일 전 → 3일 전 → 2일 전 → 1일 전`으로 복원된다.

## 10. 장별 손상된 기록

| 장 | ID | 시점 | 새 핵심 정보 |
|---:|---|---|---|
| 1 | `reset_after` | 1일 전 | 안내문의 최초 입력자는 확인되지 않는다. |
| 2 | `reset_before` | 2일 전 | 기록 잠금과 초기화를 같은 입력자가 예약했다. |
| 3 | `city_failure` | 3일 전 | 고요의 차단은 피해 확산을 막은 비상 정지였다. |
| 4 | `yeongi_warning` | 5일 전 | 영이는 문제가 커지기 전에 위험을 경고했다. |
| 5 | `first_approval` | 7일 전 | 다섯 설정을 좋은 의도로 성급히 승인한 사람은 플레이어였다. |

각 기록은 3~4쪽의 짧은 장면이며, 건너뛰어도 해금·완료·진행을 먼저 저장한다.

## 11. 반전 전 복선

1. 프롤로그의 반디: `나는 길을 비출게. 어느 길로 갈지는 네가 정해.`
2. 첫 기록 뒤 반디: 입력자가 비어 있다는 사실을 그대로 남기며 안내문을 보증하지 않는다.
3. 고요의 뜰과 기록 3에 같은 `비상 정지` 표식을 쓴다.
4. 여러 기록의 입력자 공백을 반복해 나중에 정답을 몰래 바꾸지 않는다.
5. 반디와 영이의 `확인하고 마지막 결정은 네가`라는 태도를 이어 정체 공개를 준비한다.

## 12. 수정한 파일과 이유

- `DESIGN.md`, 두 설계·계획 문서: 기존 Canvas 규칙, 시간순·표현 순서, 상태·테스트·롤백을 고정했다.
- `src/data.js`: 다섯 기록, 복원 순서, 실제 대사 복선, 엔딩 주제 데이터를 추가했다.
- `src/game.js`: V9, 해금·기록·건너뛰기·재열람·일지·파이널 결합·엔딩 결과·TTS·ARIA·터치 라벨을 구현했다.
- `index.html`, `sw.js`: 이전 기준 서비스워커에서 최신 문서로 전환하고 오프라인 폴백을 유지했다.
- `tools/smoketest.js`, `tools/slottest.js`, `tools/mementotest.js`, `tools/playbot.js`, `tools/browsertest.js`: 본편·세이브·메멘토·완주·실브라우저 경계를 검증했다.
- `.github/workflows/ci.yml`, `pages.yml`, `release.yml`: 액션 SHA 고정, 최소 권한, Pages 전체 게이트를 적용했다.
- `README.md`, `CHANGELOG.md`, `package.json`: 기능·호환·릴리스 변경을 기록했다.
- `.orchestration/evidence/`: RED/GREEN 로그와 14개 최종 화면 증거를 보존했다.

## 13. 추가한 상태 키

| 키 | 기본값 | 용도 |
|---|---|---|
| `damagedRecords` | `[]` | 공개 순서대로 해금된 기록 ID |
| `viewedRecords` | `{}` | 완료 또는 건너뛴 기록 |
| `skippedRecords` | `{}` | 최초 열람에서 건너뛴 기록 |
| `pendingRecord` | `null` | 장 종료 뒤 이어 보여 줄 기록 |
| `timelineMerged` | `false` | 코어 결합 시작 여부 |
| `timelineRestored` | `false` | 실제 시간순 복원 완료 여부 |

## 14. 세이브 마이그레이션

- `SAVE_VERSION`을 8에서 9로 올렸다.
- V8 이하는 새 키를 안전한 기본값으로 채우며, 완료된 코어 세이브에는 파이널을 강제로 반복하지 않는다.
- V4~V8 마이그레이션은 자기 버전보다 최신 세이브를 다시 낮추지 않는다. 따라서 `timelineMerged=true`, `timelineRestored=false`인 V9 중단 세이브도 새로고침 뒤 그대로 복원 화면을 계속한다.
- 알 수 없는 미래 필드는 보존한다. 슬롯 3개, 슬롯 삭제 되살리기, 전체 백업·복원 구조는 바꾸지 않았다.
- 건너뛴 기록도 해금·열람·건너뜀 상태가 함께 저장되며 재열람이 진행 보상을 중복하지 않는다.

## 15. 기존 엔딩과 새 주제의 대응

| 기존 ID | 유지 조건 | 연결 주제 |
|---|---|---|
| `home` | 손을 내밀고 누적 자비 7 이상 | 진실 인정, 영이와 기록 복원 |
| `silent` | 누적 자비 2 이하 | 책임 회피, 초기화 반복 |
| `dawn` | 맡김 선택과 누적 자비 5 이상 | 결정을 모두 AI에 맡기는 의존 |
| `farewell` | 그 밖의 조합 | AI를 모두 꺼 가능성도 함께 끊는 단절 |

기존 ID와 임계값을 유지했고, 누적 여정이 계속 필요하므로 마지막 한 선택만으로 갑자기 엔딩이 정해지지 않는다.

## 16. 추가한 테스트

- 역방향 공개 순서와 장별 단일 해금
- 건너뛰기 저장, 재열람, 일지 복귀와 중복 방지
- 일지의 네 신뢰 단계
- 코어 시간선 결합·건너뛰기·실제 시간순
- V8→V9, 신규 기본값, 미래 필드, V9 중단 복원
- 기존 네 엔딩 ID·임계값·구체 결과 장면
- 본편 맵·장 흐름, 금지 화면 어휘, 실제 대사 복선
- TTS·aria-live·reduceFx·모바일 터치 라벨
- 기준판 캐시에서 최신 게임 자동 전환, 오프라인 쿼리 진입, 무관한 origin 캐시 보존

RED에서는 새 계약이 16개 실패·5개 통과했고 기존 스모크 1205개와 슬롯 66개는 통과했다. 구현 뒤 전체가 GREEN이 되었다.

## 17. 전체 검증 명령과 실제 결과

| 명령 | 결과 |
|---|---|
| `npm ci` | 성공, 취약점 0 |
| `npm run validate` | 성공 |
| `npm test` | 성공: smoke 1208, slot 68, Memento 46 |
| `npm run playtest` | 성공: 프롤로그부터 코어·영이·`home`까지 완주 |
| `npm run test:browser` | 성공: Chromium 91 / 실패 0; WebKit은 미설치 선택 항목으로 건너뜀 |
| `npm run pack` | 성공 |
| `unzip -tq ai-ethics-adventure-offline.zip` | 성공 |
| `npm run bump` | 성공: `ai-ethics-adventure-aa0512ec` |

브라우저 14개 캡처를 모두 직접 열었고, 디자인·CJK 두 독립 시각 검수가 모두 PASS했다. 디버깅 감사에서는 입력 프레임 경합과 서비스워커 activation 중 `client.navigate()` await 교착을 실제 런타임으로 확인해 수정했으며, 포커스 손실·세이브 손상 가설은 반증했다.

## 18. CI 및 Pages 실행 URL

- 기준 CI: `https://github.com/jh4334/fabletest2-memento-preview/actions/runs/32786448015`
- 기준 Pages: `https://github.com/jh4334/fabletest2-memento-preview/actions/runs/32786447971`
- 기능 PR CI: 원격 push 뒤 갱신 예정
- 최종 Pages: main 병합 뒤 갱신 예정

## 19. 최종 미리보기 URL

- 예정 형식: `https://jh4334.github.io/fabletest2-memento-preview/?v=<merge-sha>`
- 실제 merge SHA는 CI 통과·병합·Pages 성공 뒤 갱신한다.

## 20. 원본 저장소가 변경되지 않았다는 검증

- 원본 `main`은 여전히 `79bdc2af7cac4e6e01758ae825bce9c96262c4a1`이다.
- 원본 최근 Pages 실행은 여전히 `32089167151`, head SHA `79bdc2a`, 성공이다.
- 원본에서 `baseline/pre-memento-plot`, `archive/pre-memento-plot`, `feat/memento-dual-timeline` 일치 ref는 모두 0개다.
- 원본 열린 PR은 0개다.
- `upstream`은 push URL `DISABLED`이고 원본 대상 push·PR·설정 변경 명령을 실행하지 않았다.

## 21. 남은 스토리·UX·기술 위험

- 최신 원본 main은 다른 게임이므로, 이 미리보기는 최신 SHA 기준점 위에 사용자가 선택한 역사적 `마음의 문` 트리를 복원한 preview-only 계보를 가진다.
- macOS 기본 npm 11에서 정확한 최신-main lockfile의 선택 의존성 `fsevents` 누락이 있었으나 대상 Ubuntu CI는 동일 SHA에서 성공했다. 복원된 `마음의 문` 브랜치의 `npm ci`는 로컬과 CI 모두 성공한다.
- WebKit은 로컬에 설치되지 않아 선택 브라우저 패스만 건너뛰었다. Chromium과 실제 앱 브라우저에서 데스크톱·세로·가로를 검증했다.
- 서비스워커는 같은 origin의 무관한 캐시를 지우지 않도록 앱 소유 prefix만 정리한다. 반환 방문자의 기준판 캐시 전환은 자동화 테스트와 최종 Pages에서 다시 확인한다.

## 22. git status 및 커밋 목록

원격 게시 직전 기능 HEAD는 `90efc1bb716d4d987b38c14e496c5b52c5494275`이며, 보고서·마지막 서비스워커 안전 수정은 다음 문서 커밋에 포함한다. 기능 브랜치에는 다음 원자적 이력이 있다.

```text
385d463 chore: restore heart door preview baseline
a3ade85 docs: design dual-timeline narrative integration
1bf2bdb test: define dual timeline behavior
eee964d feat: add memento dual timeline
37e0c81 test: cover ending consequence scenes
480b44b chore: refresh offline cache version
96a1166 fix: polish memento accessibility and endings
b832bc3 test: cover memento browser journeys
4d86882 ci: pin release workflow actions
71749e8 fix: show restored timeline for legacy saves
90efc1b fix: close memento preview release gates
```

기능 브랜치는 아직 `origin`에 push하지 않았고, 작업 트리는 보고서·마지막 안전 수정을 커밋한 뒤 깨끗한 상태로만 게시한다.
