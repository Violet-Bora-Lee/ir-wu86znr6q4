(function () {
  'use strict';
  const logic = window.PublicDataLogic;
  const $ = id => document.getElementById(id);
  const types = { hackathon: '해커톤', competition: '경진대회', startup: '창업 프로그램' };
  let data = null;
  let selectedType = 'all';
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function text(value, fallback = '공식 원문 확인') {
    const valueText = Array.isArray(value) ? value.filter(Boolean).join(' · ') : value;
    return valueText && valueText.trim() ? valueText : fallback;
  }
  function dateLabel(value) { return value ? value.replaceAll('-', '.') : '마감일 미확인'; }
  function timestamp(value) {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(new Date(value)) + ' KST';
  }
  function fact(label, value, className) {
    const row = element('div', `fact ${className || ''}`.trim());
    row.append(element('dt', '', label), element('dd', '', text(value)));
    return row;
  }
  function renderCard(row) {
    const item = row.item;
    const status = row.status;
    const card = element('article', 'opportunity');
    const deadline = element('div', 'deadline-column');
    deadline.append(element('span', `status-badge status-${status.code}`, status.label));
    deadline.append(element('p', 'deadline-label', '접수 마감'));
    const end = element(item.deadline ? 'time' : 'p', 'deadline-date', dateLabel(item.deadline));
    if (item.deadline) end.dateTime = item.deadline;
    deadline.append(end, element('p', 'deadline-time', item.deadlineTime ? `${item.deadlineTime} KST` : item.deadline ? '마감 시각 원문 확인' : '접수 여부 원문 확인'));
    const body = element('div', 'card-main');
    const kicker = element('p', 'card-kicker');
    kicker.append(element('span', 'type-label', types[item.type]), element('span', 'organizer', text(item.organizer)));
    body.append(kicker, element('h3', 'card-title', item.title), element('p', 'card-summary', item.summary));
    const facts = element('dl', 'card-facts');
    facts.append(fact('공공데이터 활용 요건', item.publicDataRelevance, 'data-fact'));
    facts.append(fact('지원 혜택', item.benefits), fact('참가 대상 · 지역', `${text(item.eligibility)} / ${text(item.region)}`, 'eligibility-fact'));
    body.append(facts);
    const details = element('details', 'card-details');
    const detailContent = element('div', 'detail-content');
    detailContent.append(element('p', '', `행사 일정: ${text(item.eventDate)}`));
    detailContent.append(element('p', '', `접수 시작: ${item.applicationStart ? dateLabel(item.applicationStart) : '원문 확인'}`));
    detailContent.append(element('p', '', `주의사항: ${text(item.notes, '별도 요약 없음 · 신청 전 원문을 확인해 주세요.')}`));
    detailContent.append(element('p', 'status-reason', status.reason));
    detailContent.append(element('p', '', `공식 원문: ${item.sourceTitle}`));
    details.append(element('summary', '', '행사 일정 · 주의사항 · 상태 기준'), detailContent);
    body.append(details);
    const footer = element('div', 'card-footer');
    const verified = element('p', 'verified-at', '원문 검증 ');
    const verifiedTime = element('time', '', timestamp(item.verifiedAt));
    verifiedTime.dateTime = item.verifiedAt;
    verified.append(verifiedTime);
    footer.append(verified);
    const url = logic.safeUrl(item.sourceUrl);
    if (url) {
      const link = element('a', 'source-link', '공식 원문 ↗');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', `${item.title} 공식 원문 (새 탭)`);
      footer.append(link);
    }
    body.append(footer);
    card.append(deadline, body);
    return card;
  }
  function render() {
    if (!data) return;
    const status = $('status-filter').value;
    $('include-closed').disabled = status !== 'all';
    const result = logic.explore(data.items, {
      type: selectedType,
      query: $('search').value,
      status,
      includeClosed: $('include-closed').checked,
      sort: $('sort').value
    });
    $('total-count').textContent = `전체 ${result.total}건`;
    $('result-count').textContent = `검색 결과 ${result.resultCount}건`;
    $('opportunity-list').replaceChildren(...result.items.map(renderCard));
    $('opportunity-list').setAttribute('aria-busy', 'false');
    $('feedback').hidden = result.resultCount > 0;
    $('retry').hidden = true;
    if (!result.resultCount) {
      $('feedback-title').textContent = result.total ? '조건에 맞는 공고가 없어요.' : '아직 등록된 공고가 없어요.';
      $('feedback-detail').textContent = result.total
        ? '검색어를 줄이거나 조건을 초기화해 보세요. 종료 공고를 포함하면 지난 공고도 볼 수 있어요.'
        : '공식 공고 확인 후 이곳에 요약이 추가됩니다. 현재 목록이 국내 모든 기회를 뜻하지는 않습니다.';
    }
    $('closed-hint').hidden = !result.hiddenClosed || $('include-closed').checked || status !== 'all';
    $('closed-hint').textContent = `종료 공고 ${result.hiddenClosed}건은 숨겼어요. ‘종료 공고 포함’을 켜면 함께 볼 수 있습니다.`;
  }
  async function load() {
    $('retry').hidden = true;
    $('feedback').hidden = false;
    $('feedback-title').textContent = '공식 공고를 불러오고 있어요.';
    $('feedback-detail').textContent = '검증된 요약과 원문 링크를 준비합니다.';
    $('opportunity-list').setAttribute('aria-busy', 'true');
    try {
      const response = await fetch('./data.json', { cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error('공고 데이터를 불러오지 못했습니다.');
      data = logic.validateDataset(await response.json());
      $('snapshot-time').textContent = `자료 갱신 ${timestamp(data.updatedAt)}`;
      $('scope-note').textContent = data.scopeNote;
      document.querySelectorAll('#filters button, #filters input, #filters select').forEach(control => { control.disabled = false; });
      render();
    } catch (_) {
      data = null;
      $('opportunity-list').replaceChildren();
      $('opportunity-list').setAttribute('aria-busy', 'false');
      $('total-count').textContent = '전체 공고 확인 불가';
      $('result-count').textContent = '공고를 불러오지 못했습니다.';
      $('snapshot-time').textContent = '자료 갱신 시각 확인 불가';
      $('feedback-title').textContent = '공고를 불러오지 못했어요.';
      $('feedback-detail').textContent = '연결 상태와 data.json의 배치·형식을 확인한 뒤 다시 시도해 주세요. 파일 직접 열기 대신 HTTP 서버로 열어 주세요.';
      $('retry').hidden = false;
    }
  }
  $('filters').addEventListener('submit', event => event.preventDefault());
  $('search').addEventListener('input', render);
  ['status-filter', 'sort', 'include-closed'].forEach(id => $(id).addEventListener('change', render));
  function selectType(type) {
    selectedType = type;
    document.querySelectorAll('[data-type]').forEach(button => {
      const active = button.dataset.type === type;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  document.querySelectorAll('[data-type]').forEach(button => button.addEventListener('click', () => {
    selectType(button.dataset.type);
    render();
  }));
  $('reset-filters').addEventListener('click', () => {
    $('filters').reset();
    selectType('all');
    render();
  });
  $('retry').addEventListener('click', load);
  load();
})();
