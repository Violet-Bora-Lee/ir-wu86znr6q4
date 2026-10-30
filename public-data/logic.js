(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PublicDataLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const KST_OFFSET = 9 * 60 * 60 * 1000;
  function getStatus(item, now = Date.now()) {
    const clock = new Date(now).getTime();
    if (item.statusAtVerification === 'closed') {
      return { code: 'closed', label: '종료', reason: '공식 원문에서 종료로 확인한 공고입니다.', stale: false };
    }
    const today = new Date(clock + KST_OFFSET).toISOString().slice(0, 10);
    const cutoff = item.deadline && item.deadlineTime
      ? Date.parse(`${item.deadline}T${item.deadlineTime}:00+09:00`) : null;
    if ((item.deadline && item.deadline < today) || (cutoff !== null && clock >= cutoff)) {
      return { code: 'closed', label: '종료', reason: '접수 마감일 또는 마감 시각이 지났습니다.', stale: false };
    }
    const verified = Date.parse(item.verifiedAt);
    const stale = Number.isFinite(verified) && clock - verified > 7 * 24 * 60 * 60 * 1000;
    if (stale) {
      return { code: 'unknown', label: '확인필요 · 오래된 확인', reason: '공식 원문 확인 후 7일이 지났습니다. 접수 상태를 다시 확인해 주세요.', stale: true };
    }
    if (!Number.isFinite(verified) || verified > clock) {
      return { code: 'unknown', label: '확인필요', reason: '유효한 검증 시각을 확인할 수 없습니다.', stale: false };
    }
    if (item.deadline === today && !item.deadlineTime) {
      return { code: 'unknown', label: '마감일 당일 · 시간 확인', reason: '마감 시각이 확인되지 않았습니다. 공식 원문을 확인해 주세요.', stale: false };
    }
    if (item.statusAtVerification !== 'open' || !item.deadline) {
      return { code: 'unknown', label: '확인필요', reason: '접수 상태 또는 마감일이 확인되지 않았습니다.', stale: false };
    }
    if (item.applicationStart && item.applicationStart > today) {
      return { code: 'unknown', label: '접수 전 · 일정 확인', reason: '접수 시작일 전입니다. 공식 원문에서 일정을 확인해 주세요.', stale: false };
    }
    return { code: 'open', label: '접수중', reason: '공식 원문 검증 시점과 마감 정보를 기준으로 표시합니다. 신청 전 원문을 확인해 주세요.', stale: false };
  }
  function explore(items, options = {}, now = Date.now()) {
    const all = items.map(item => ({ item, status: getStatus(item, now) }));
    const words = String(options.query || '').normalize('NFKC').toLocaleLowerCase('ko-KR').trim().split(/\s+/).filter(Boolean);
    const matching = all.filter(row => {
      if (options.type && options.type !== 'all' && row.item.type !== options.type) return false;
      const haystack = [row.item.title, row.item.organizer, row.item.summary, row.item.publicDataRelevance]
        .join(' ').normalize('NFKC').toLocaleLowerCase('ko-KR');
      return words.every(word => haystack.includes(word));
    });
    const hiddenClosed = matching.filter(row => row.status.code === 'closed').length;
    const visible = matching.filter(row => {
      if (options.status === 'closed') return row.status.code === 'closed';
      if (options.status === 'open' || options.status === 'unknown') return row.status.code === options.status;
      return options.includeClosed || row.status.code !== 'closed';
    });
    visible.sort((a, b) => {
      if (options.sort === 'verified') return Date.parse(b.item.verifiedAt) - Date.parse(a.item.verifiedAt);
      if (options.sort === 'title') return a.item.title.localeCompare(b.item.title, 'ko');
      const aKey = a.item.deadline ? `${a.item.deadline}T${a.item.deadlineTime || '99:99'}` : '9999';
      const bKey = b.item.deadline ? `${b.item.deadline}T${b.item.deadlineTime || '99:99'}` : '9999';
      return aKey.localeCompare(bKey);
    });
    return { total: all.length, resultCount: visible.length, hiddenClosed, items: visible };
  }
  function isDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      && Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  }
  function isTimestamp(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      && isDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
  }
  function safeUrl(value) {
    if (typeof value !== 'string' || !/^https?:\/\//i.test(value) || /[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && url.hostname ? value : null;
    } catch (_) { return null; }
  }
  function validateDataset(data) {
    const fail = () => { throw new Error('데이터 형식이 올바르지 않습니다. schemaVersion 1 계약을 확인해 주세요.'); };
    if (!data || data.schemaVersion !== 1 || !isTimestamp(data.updatedAt)
      || typeof data.scopeNote !== 'string' || !Array.isArray(data.items)) fail();
    const ids = new Set();
    const strings = ['id', 'title', 'organizer', 'summary', 'publicDataRelevance', 'region', 'sourceUrl', 'sourceTitle'];
    const textOrList = value => typeof value === 'string' || (Array.isArray(value) && value.every(entry => typeof entry === 'string'));
    for (const entry of data.items) {
      if (!entry || strings.some(key => typeof entry[key] !== 'string') || !entry.id.trim() || !entry.title.trim()
        || ids.has(entry.id) || !['hackathon', 'competition', 'startup'].includes(entry.type)
        || entry.sourceType !== 'official' || !safeUrl(entry.sourceUrl) || !['open', 'closed', 'unknown'].includes(entry.statusAtVerification)
        || !(entry.eventDate === null || typeof entry.eventDate === 'string')
        || !isTimestamp(entry.verifiedAt) || !textOrList(entry.eligibility) || !textOrList(entry.benefits) || !textOrList(entry.notes)
        || ![entry.applicationStart, entry.deadline].every(value => value === null || isDate(value))
        || !(entry.deadlineTime === null || (typeof entry.deadlineTime === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(entry.deadlineTime)))
        || (entry.deadlineTime !== null && entry.deadline === null)) fail();
      ids.add(entry.id);
    }
    return data;
  }
  return { getStatus, explore, validateDataset, safeUrl };
});
