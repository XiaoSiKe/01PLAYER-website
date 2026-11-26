export const queueFilters = {
  events: { all: '全部活动', unpublished: '待发布', published: '已发布', archived: '已下架' },
  registrations: { all: '全部报名', pending: '待审核', approved: '已通过', rejected: '未通过' },
  projects: { all: '全部作品', pending: '待审核', approved: '已通过', returned: '已退回' },
};

export function matchesFilter(tab, row, filter = 'all') {
  if (filter === 'all') return true;
  if (tab === 'events') {
    return filter === 'unpublished'
      ? row.publicationStatus === 'draft' || Boolean(row.hasDraftChanges)
      : row.publicationStatus === filter;
  }
  return row.status === filter;
}

export function cleanDraft(value) {
  const lines = (items) => items.map((line) => line.trim()).filter(Boolean);
  return {
    ...value,
    rules: lines(value.rules),
    formFields: value.formFields.map((field) =>
      ['select', 'multiselect'].includes(field.type)
        ? { ...field, options: lines(field.options || []) }
        : field,
    ),
  };
}

// The form promises UTC+8 even when the operator is in a different time zone.
export function scheduleInput(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time + 8 * 3600000).toISOString().slice(0, 16) : '';
}

export function scheduleInstant(input) {
  if (!input) return null;
  const date = new Date(input + '+08:00');
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
