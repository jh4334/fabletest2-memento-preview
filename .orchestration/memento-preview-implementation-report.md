# 마음의 문 메멘토형 이중 시간선 미리보기 구현 보고서

작성 기준: 기능 브랜치 최종 검토 SHA `30653bba2a7c3a6dfaafdb867c78305bc03d3540`,
기능 PR #7의 merge SHA `bca918ec0eb2ca156dc6aefd151decaa8f22dd95`,
main CI·Pages 배포 및 공개 URL 실제 브라우저 검증 결과.

## 1. 원본 저장소 최신 main SHA

- 원본: `https://github.com/jh4334/fabletest2`
- 기본 브랜치: `main`
- 읽기 전용 `git ls-remote` 확인 SHA: `79bdc2af7cac4e6e01758ae825bce9c96262c4a1`
- 원본에는 push·PR·설정 변경을 하지 않았다.

## 2. 미리보기 저장소 URL

- 저장소: `https://github.com/jh4334/fabletest2-memento-preview`
- Pages URL: `https://jh4334.github.io/fabletest2-memento-preview/`
- 설명: 마음의 문 메멘토형 이중 시간선 플롯 미리보기

기능 구현은 미리보기 `origin`에만 push했고, 기능 PR #7을 일반 merge한 시점의
미리보기 `main`은 `bca918ec0eb2ca156dc6aefd151decaa8f22dd95`다.

## 3. remote -v 결과

```text
origin   https://github.com/jh4334/fabletest2-memento-preview.git (fetch)
origin   https://github.com/jh4334/fabletest2-memento-preview.git (push)
upstream https://github.com/jh4334/fabletest2.git (fetch)
upstream DISABLED (push)
```

upstream은 fetch 전용이며, 쓰기 대상은 미리보기 저장소의 `origin`만 허용한다.

## 4. 기준 버전 태그와 보관 브랜치 SHA

읽기 전용 ref 확인 결과는 다음과 같다.

| 기준점 | SHA |
|---|---|
| 원본 `main` | `79bdc2af7cac4e6e01758ae825bce9c96262c4a1` |
| 미리보기 `archive/pre-memento-plot` | `79bdc2af7cac4e6e01758ae825bce9c96262c4a1` |
| 미리보기 `baseline/pre-memento-plot` peel | `79bdc2af7cac4e6e01758ae825bce9c96262c4a1` |

주석 태그 객체 SHA는 `69b038bdfeacd49a9b6d71bb18d3d4ec58a3fafc`이다. 기준점은 원본
최신 main과 일치하며, 원본에는 해당 태그·브랜치가 없다.

## 5. 기준 버전 Pages 검증 결과

- 기준 URL 형식: `https://jh4334.github.io/fabletest2-memento-preview/?v=79bdc2af7cac4e6e01758ae825bce9c96262c4a1`
- 기준 CI: `https://github.com/jh4334/fabletest2-memento-preview/actions/runs/32786448015` 성공
- 기준 Pages: `https://github.com/jh4334/fabletest2-memento-preview/actions/runs/32786447971` 성공
- 기준 URL은 HTTP 200이었고 HTML·JS·CSS·이미지·서비스워커·새 게임·데스크톱·모바일·콘솔 오류 0을 확인했다.
- 원본 최신 `79bdc2a`의 당시 제목은 `방과 후: 그림자 학교`여서 요청한 `마음의 문` 제목 조건과 충돌했다. 기준 ref는 손대지 않고 그대로 보존했으며, 사용자가 이후 명시한 “마음의 문으로 진행”에 따라 미리보기 기능 브랜치에서만 기존 안정 `마음의 문` 계보를 합쳐 구현했다.
- 기능 merge SHA의 최종 Pages도 같은 항목을 다시 검증했으며 모두 통과했다.

## 6. 구현 브랜치

- `feat/memento-gameplay-loop`
- 최종 독립 검토 SHA: `30653bba2a7c3a6dfaafdb867c78305bc03d3540`
- 기능 merge SHA: `bca918ec0eb2ca156dc6aefd151decaa8f22dd95`
- 설계 및 순수 시간축 모듈, V10 저장 격리, 실제 플레이 루프가 이 브랜치에 있다.
- Draft PR #7에서 정확한 SHA 대상 목표·코드·QA·보안·맥락·시각·CJK·런타임
  검토를 통과한 뒤 ready 전환하고 일반 merge했다.

## 7. 기존 스토리 요약

반디와 함께 프롤로그의 정적의 숲을 지나 다섯 거리를 탐험하고, 각 거리의 마음
조각을 방탈출 퍼즐과 설득 배틀로 되돌린다. 이후 고요의 뜰과 코어에서 반디가
영이의 가면 또는 페르소나임을 확인한다. 다섯 거리의 문제는 개인정보 동의,
추천 편향, 출처 확인, 과도한 유도, 감정·관계에 대한 AI 개입을 다룬다.

## 8. 새 이야기의 실제 시간순

1. 7일 전: 플레이어와 영이가 공동 관리하던 도시에서 플레이어가 편리함을 위해 다섯 설정을 승인한다.
2. 5일 전: 영이가 사람의 확인과 판단이 밀려난다고 경고한다.
3. 3일 전: 이상이 번지고 고요가 비상 정지로 코어 연결을 잠시 끊는다.
4. 2일 전: 플레이어가 관리자 기록 잠금과 기억 초기화를 예약하고 영이·고요를 원인처럼 적는다.
5. 1일 전: 초기화 뒤 편향된 안내문만 남는다.
6. 현재: 플레이어가 반디와 다섯 거리를 지나 손상 기록을 역순으로 복원한다.
7. 코어: 플레이어가 다섯 카드를 실제 시간순으로 배열하고 자신의 참여를 확인한다.

## 9. 플레이어가 경험하는 순서

메멘토 체험은 `타이틀 경로 선택 → 메멘토 시간선 체험 → 첫 손상 기록 발견 →
관리자 단말 비교 → 출구 개방 → 다섯 거리 → 장 종료 기록 → 고요의 뜰 →
코어 카드 수동 배치 → 실제 시간순 복원 → 반디=영이 공개 → 영이 설득 → 기존
네 엔딩` 순서다. 원래 모험 경로는 기존 프롤로그와 본편 순서를 유지한다.

첫 기록은 메멘토 경로 시작 직후에 뜬다. 처음부터 끝까지 보지 않고 건너뛴 경우
일지에서 다시 열어 끝까지 확인해야 관리자 단말의 증거 비교가 가능하다.

## 10. 장별 손상된 기록

| 장 종료 | ID | 플레이어에게 공개되는 시점 | 핵심 정보 |
|---:|---|---|---|
| 1장 | `reset_after` | 현재보다 1일 전 | 초기화 뒤 남은 안내문의 최초 입력자는 확인할 수 없다. |
| 2장 | `reset_before` | 현재보다 2일 전 | 기록 잠금과 초기화를 같은 관리자가 예약했다. |
| 3장 | `city_failure` | 현재보다 3일 전 | 고요의 차단은 피해 확산을 막은 비상 정지였다. |
| 4장 | `yeongi_warning` | 현재보다 5일 전 | 영이는 판단을 대신하지 말자고 경고했다. |
| 5장 | `first_approval` | 현재보다 7일 전 | 플레이어가 좋은 의도로 다섯 설정을 승인했다. |

공개 방향은 `현재 → 과거`, 즉 1일 전에서 7일 전으로 멀어진다. 코어의 정답
배열은 `7일 전 → 5일 전 → 3일 전 → 2일 전 → 1일 전`이다.

## 11. 반전 전 복선

- 반디가 “길은 비추지만 어느 길로 갈지는 네가 정한다”고 말한다.
- 첫 손상 기록은 영이를 범인으로 확정하지 않고 최초 입력자 공백을 남긴다.
- 고요의 뜰과 3일 전 기록이 같은 비상 정지 표식을 공유한다.
- 반디와 영이가 확인과 인간의 마지막 결정을 같은 뜻으로 말한다.

## 12. 수정한 파일과 이유

- `src/memento.js`: 기록·역행 축·복원 카드·현재 관리자 단말 계약을 순수 데이터/함수로 분리했다.
- `src/data.js`: 메멘토 기록과 본편 인물·장면 복선을 연결했다.
- `src/game.js`: 타이틀 경로, 기록 해금·건너뛰기·재열람, 관리자 단말, HUD 축, 수동 카드 정렬, 저장 재개, 접근성을 구현했다.
- `index.html`, `sw.js`: 새 모듈 로드 순서와 preview 캐시를 반영했다.
- `tools/*.js`: 스모크·슬롯·메멘토·서비스워커·완주 검증을 V10과 새 경로에 맞췄다.
- `README.md`, `CHANGELOG.md`, `docs/출시-준비-체크리스트.md`: 현재 기능과 릴리스 상태를 기록한다.

## 13. 추가한 상태 키

| 키 | 기본값 | 용도 |
|---|---|---|
| `storyRoute` | `original` | 원래 모험/메멘토 체험 경로 |
| `recordEvidence` | `[]` | 끝까지 확인한 기록 ID |
| `administratorTerminalSolved` | `false` | 현재 관리자 단말 비교 완료 |
| `timelineOrderDraft` | `[]` | 코어 카드의 현재 배치 초안 |
| `timelineOrderWrong` | `0` | 오답 제출 횟수, 비처벌 표시 |
| `damagedRecords` | `[]` | 장별 해금 기록 ID |
| `viewedRecords` / `skippedRecords` | `{}` | 기록 확인·건너뛰기 상태 |
| `timelineMerged` | `false` | 카드 정렬 성공 여부 |
| `timelineRestored` | `false` | 복원 장면 완료 여부 |

## 14. 세이브 마이그레이션

`SAVE_VERSION`은 V10이다. `migrateSlotV3`부터 `migrateSlotV10`까지 기존 체인을
유지하며, 신규 필드는 안전한 기본값으로 채운다. 기존 V9 기록은 확인·건너뛰기
상태에서 증거를 안전하게 계산하고, 장 완료 플래그로 보충하되 일반 전투 완료
표식만으로 기록을 열지 않는다. 카드 배치·오답 횟수·단말 해결 상태는 저장 후
새로고침해도 유지된다. 슬롯 3개, 삭제 되살리기, 백업·복원은 그대로다.

모든 미리보기 저장·백업·캐시는 `fabletest2-memento-preview-*` 접두사와
`ai-ethics-adventure-memento-preview` 앱 ID만 사용한다. 운영용 `ai-ethics-adventure-*`
키는 읽거나 복사하거나 삭제하거나 fallback으로 사용하지 않는다.

## 15. 기존 엔딩과 새 주제의 대응

| 기존 ID | 유지되는 의미 | 메멘토 연결 |
|---|---|---|
| `home` | 높은 자비와 손 내밀기 | 진실을 인정하고 기록과 사람의 확인을 복원 |
| `silent` | 낮은 자비 | 책임을 피하고 초기화 안내문을 반복 |
| `dawn` | 충분한 자비와 맡김 | 앞으로의 결정을 AI에 의존 |
| `farewell` | 그 밖의 따뜻한 조합 | AI를 모두 꺼 가능성과 문제를 함께 단절 |

기존 엔딩 ID와 누적 자비 조건을 보존하며, 마지막 한 선택만으로 결정하지 않는다.

## 16. 추가한 테스트

- 타이틀 두 경로와 메멘토 첫 기록 발견
- 기록 건너뛰기·일지 재열람·증거 회복·관리자 단말 오답/정답
- 역행 HUD 축과 날짜별 상태 모양
- 다섯 카드 직접 배치·오답 초안 보존·정답 결합
- V10 신규 기본값·V9 이하 마이그레이션·중단 상태 재개
- 기존 본편 흐름·네 엔딩·금지 어휘·반디/고요 복선
- 서비스워커 preview 캐시 격리
- 저장된 슬롯의 실제 시간선 표시와 TTS 안내
- 최초 저장소 probe 실패의 화면·`aria-live` 동시 경고
- 시간선 선택·수동 복원 화면의 Canvas 의미 토큰 재사용
- 화면 가장자리 월드 라벨의 Canvas 내부 정렬과 모바일 `한 칸` 되돌리기 표기
- 첫 저장소 확인 실패의 최초 시간선 선택 Canvas 경고

## 17. 전체 검증 명령과 실제 결과

현재 기능 브랜치에서 확인한 결과:

| 명령 | 결과 |
|---|---|
| `npm run validate` | 성공 |
| `npm test` | 성공: smoke 1223, slot 95, memento 104, service worker 6 |
| `npm run playtest` | 성공: 원래 경로 프롤로그→5장→고요→코어→`home` 완주 |
| `npm run test:browser` | 성공: Chromium 183, 실패 0; WebKit 미설치로 선택 경로 생략 |
| `npm run pack` | 성공: 오프라인 ZIP 생성, `unzip -tq` 무결성 성공 후 작업 트리에서 산출물 제거 |

## 18. CI 및 Pages 실행 URL

- 기능 브랜치 push CI: `https://github.com/jh4334/fabletest2-memento-preview/actions/runs/32915452366` — 성공
- Draft PR: `https://github.com/jh4334/fabletest2-memento-preview/pull/7` — 검토 뒤 일반 merge
- PR CI: `https://github.com/jh4334/fabletest2-memento-preview/actions/runs/32915468716` — 성공
- PR Pages 사전 검증: `https://github.com/jh4334/fabletest2-memento-preview/actions/runs/32915468654` — 성공
- main merge CI: `https://github.com/jh4334/fabletest2-memento-preview/actions/runs/32915555646` — 성공
- 최종 Pages 배포: `https://github.com/jh4334/fabletest2-memento-preview/actions/runs/32915555630` — verify·deploy 성공

## 19. 최종 미리보기 URL

`https://jh4334.github.io/fabletest2-memento-preview/?v=bca918ec0eb2ca156dc6aefd151decaa8f22dd95`

실제 Chromium에서 HTTP 200, `마음의 문` 제목, 두 시간선 선택, 메멘토 새 게임,
60초 이내 D-1 기록, 미리보기 전용 저장 키, 역행 `aria-live`, 빈 다섯 칸 수동
복원, 키보드로 다섯 카드 시간순 배치, 컬러 순행 복원, 모바일 세로 계속하기,
콘솔·페이지·요청 오류 0을 확인했다. 서비스워커의 소스와 활성 캐시가 모두
`fabletest2-memento-preview-3742020e`였고 네트워크를 끈 뒤에도 재진입했다.
실행 로그와 직접 확인한 캡처는 `.omo/evidence/memento-gameplay-live/`에 있다.

## 20. 원본 저장소가 변경되지 않았다는 검증

- 읽기 전용 조회에서 원본 `main`은 `79bdc2af7cac4e6e01758ae825bce9c96262c4a1`이다.
- 원본 remote에는 기능 브랜치·기준 태그·보관 브랜치를 쓰지 않았다.
- 로컬 upstream push URL은 `DISABLED`다.
- 원본 Pages·PR·설정은 이 기능 브랜치에서 변경하지 않았다.
- 최종 배포 뒤 다시 확인한 원본 기본 브랜치는 `main`, 열린 PR은 0개, 기능
  브랜치·기준 태그·보관 브랜치는 원본에 없었다.
- 원본의 최근 성공 CI와 Pages는 모두 원본 SHA `79bdc2a`에 묶여 있으며,
  원본 Pages source는 기존 `main`/GitHub Actions 그대로다.

## 21. 남은 스토리·UX·기술 위험

- 실제 Chromium에서 1280×800·390×844·844×390, 큰 글씨, 효과 줄이기, 저사양, TTS·ARIA를 확인했으나 WebKit은 설치되지 않아 선택 경로를 생략했다.
- 저가 태블릿 실기기 터치·TalkBack·VoiceOver는 별도 확인이 필요하다.
- 카드 오답 피드백과 기록 건너뛰기 안내가 초등 고학년에게 충분히 명확한지 실사용자 테스트가 필요하다.
- GitHub Actions는 고정된 checkout/setup-node/upload-artifact 액션이 Node 20 호환
  런타임으로 실행된다는 폐기 예정 경고를 냈다. 현재 검사는 성공했지만 향후 액션
  버전 갱신이 필요하다.
- 레거시 태그 release 워크플로는 Pages 워크플로보다 좁아 Memento·SW·브라우저·
  playtest 전체를 실행하지 않는다. 다음 stable 태그 발행 전 정렬해야 한다.
- `tools/mementotest.js`는 476줄의 혼합 책임 테스트 파일이므로 다음 기능 확장 전
  저장·진행·렌더 계약별 분할을 권장한다.

## 22. git status 및 커밋 목록

구현 브랜치: `feat/memento-gameplay-loop`
보고서 확정 브랜치: `docs/memento-gameplay-final-report`

기능 merge 뒤 구현 브랜치와 보고서 작성 직전 작업 트리는 깨끗했다. 브라우저가
생성한 추적 PNG는 원래 내용으로 복원했고 ZIP은 작업 트리 밖으로 옮겼다.

```text
bca918e Merge pull request #7 from jh4334/feat/memento-gameplay-loop
30653bb fix(ui): bind memento panels to semantic tokens
be4d1c3 docs: record final visual hardening
8f49338 fix(ui): keep memento labels readable
ce27987 docs: update memento release evidence
cc67be0 fix(memento): close release review gaps
402b7b9 merge: sync preview main
6a6ae2d docs: record interactive memento verification
2571c86 test(memento): cover interactive timeline journey
6bbe964 fix(a11y): announce preview storage failures
e959d7f feat(memento): make timeline restoration playable
16bcd63 feat(storage): isolate memento preview state
a3d371d refactor(memento): extract pure timeline module
ef615b5 docs(memento): define interactive timeline loop
```

본 보고서는 기능 코드를 바꾸지 않는 별도 문서 PR로 게시한다. 게시 전
`git diff --check`와 문서 계약을 다시 검사한다.
