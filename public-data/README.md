# 공공데이터 기회 노트

독립적인 `public-data/` 정적 탐색 페이지. 외부 패키지·폰트·추적·로그인·빌드 단계 없이 HTML/CSS/JS만 사용합니다. 기존 사이트 파일은 변경하지 않습니다.

## 실행

저장소 루트에서 `python3 -m http.server 8877 --bind 127.0.0.1` 실행 후 `http://127.0.0.1:8877/public-data/`를 엽니다. 부모가 같은 포트의 서버를 실행 중이면 추가 서버는 필요 없습니다. `file://` 직접 열기는 fetch 제약으로 지원하지 않습니다.

## 데이터

`data.json`은 부모가 제공·검증하는 별도 파일이며 이 UI 작업에서 생성하거나 수정하지 않습니다. 테스트용 공고는 `tests/logic.test.cjs` 내부에만 있습니다.

계약: `{ schemaVersion: 1, updatedAt: ISO, scopeNote: string, items: [...] }`. 각 항목은 `id`, `title`, `type`(`hackathon`/`competition`/`startup`), `organizer`, `summary`, `publicDataRelevance`, `eligibility`, `region`, `benefits`, `applicationStart`, `deadline`, `deadlineTime`, `eventDate`, `sourceUrl`, `sourceType: 'official'`, `sourceTitle`, `verifiedAt`, `notes`, `statusAtVerification`(`open`/`closed`/`unknown`)를 가집니다. 날짜는 `YYYY-MM-DD` 또는 null, 마감 시각은 `HH:mm` 또는 null, ISO 시각은 시간대 필수입니다. `benefits`, `eligibility`, `notes`는 문자열 또는 문자열 배열입니다. 중복 id·잘못된 날짜·계약 위반·안전하지 않은 URL은 전체 데이터를 오류 상태로 처리하여 부분 누락을 숨기지 않습니다.

- 국내 공공데이터를 실제 활용하는 해커톤·경진대회·창업 프로그램만 수록합니다. 일반 AI 공모·입찰·단순교육은 제외합니다.
- 검증 스냅샷이며 자동 수집·실시간 갱신·전체 공고 망라·참가자격 보장을 하지 않습니다.
- 공식 기관 원천 섹션은 임의로 만들지 않습니다. 카드의 검증된 공식 원문만 연결합니다.
- 원문 URL은 자격증명 없는 절대 HTTP(S)만 허용합니다. 데이터는 `textContent`로 렌더링합니다.
- 개인정보·비공개 기록·이메일·즐겨찾기·CSV·크론은 포함하지 않습니다.

## 상태와 탐색

`logic.js`는 브라우저 `window.PublicDataLogic`와 Node CommonJS를 모두 지원합니다. `getStatus(item, now)`, `explore(items, options, now)`, `validateDataset(data)`, `safeUrl(url)`을 내보냅니다.

한국시간(KST) 기준으로 계산합니다. 원문에서 이미 종료로 확인한 공고는 미래 마감이어도 재개하지 않습니다. 정확한 마감 시각이 있으면 해당 시각부터 종료, 날짜만 있으면 마감일 당일은 **마감일 당일 · 시간 확인**, 다음 날부터 종료입니다. 마감 시각을 23:59로 추측하지 않습니다. 마감일 미확인·원문 상태 미상·접수 시작 전·검증시각 미상/미래는 확인필요 계열입니다. 검증 후 **7일 초과**인 미종료 공고는 **오래된 확인**으로 표시하며 접수중으로 확정하지 않습니다.

기본 목록은 접수중·확인필요를 포함하고 종료는 숨깁니다. 종료 포함 체크박스와 종료만 보기 옵션이 있습니다. 상태 필터를 선택하면 중복 조건 혼동을 막기 위해 종료 포함 체크박스가 비활성화됩니다. 유형 필터, 제목·기관·요약·공공데이터 요건 검색, 마감순/검증순/제목순을 지원합니다. 날짜 미상은 마감순에서 마지막이며 동률은 원래 순서를 유지합니다. 상태는 페이지 열기·탐색 조작 시 현재 시각으로 다시 계산하지만 서버 데이터를 자동 재조회하지 않습니다.

참가 대상·지역은 카드에서 바로 볼 수 있으며 논문형·학생 제한 등 원문 조건을 반드시 확인해야 합니다. 행사일·주의사항·판정 이유·원문 제목은 카드의 펼침 영역에 있습니다.

## 검증

```sh
node --test tests/logic.test.cjs
# ego-browser가 있는 로컬 환경에서만 선택 실행:
PUBLICDATA_BROWSER_TEST=1 node --test tests/logic.test.cjs
```

기본 테스트는 Node 내장 test/assert/vm만 사용합니다. 선택 브라우저 테스트는 일시적인 로컬 HTTP 서버에서 테스트 파일 내부 fixture를 제공하므로 배포 데이터에 가짜 공고를 쓰지 않습니다. 브라우저 테스트는 기존 `publicdata-ui-20261030` 작업공간을 재사용합니다. CLI 자식 프로세스의 stdin은 닫아야 실행이 대기하지 않습니다.

RED→GREEN 실행 기록: `/Users/agent/.hermes/cache/scratch/publicdata-ui-tests-20261030.log`.

## 인계

**WRITER FREEZE — UI 작성 종료.** 이후 실제 데이터 검수, 320px/WebKit/키보드 상세 검수 및 배포는 부모가 담당합니다. 이 작업은 git commit/push를 하지 않습니다.
