import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDraft, matchesFilter, scheduleInput, scheduleInstant } from './workflow.mjs';

test('workspace counts and filtered lists include drafts of live events', () => {
  const cases = [
    [{ publicationStatus: 'draft' }, true],
    [{ publicationStatus: 'published', hasDraftChanges: true }, true],
    [{ publicationStatus: 'published' }, false],
    [{ publicationStatus: 'archived' }, false],
  ];
  for (const [row, expected] of cases)
    assert.equal(matchesFilter('events', row, 'unpublished'), expected);
  assert.equal(matchesFilter('registrations', { status: 'approved' }, 'pending'), false);
  assert.equal(matchesFilter('projects', { status: 'pending' }, 'pending'), true);
});

test('typing trailing line breaks in rules or choices does not invalidate a save', () => {
  const input = {
    rules: [' 签到 ', '', '带电脑', ' '],
    formFields: [
      { id: 'city', type: 'select', options: [' 上海', '', ' 深圳 ', ''] },
      { id: 'skills', type: 'multiselect', options: ['A', 'B', ''] },
      { id: 'note', type: 'text', label: '备注' },
    ],
  };
  const value = cleanDraft(input);
  assert.deepEqual(value.rules, ['签到', '带电脑']);
  assert.deepEqual(value.formFields[0].options, ['上海', '深圳']);
  assert.deepEqual(value.formFields[1].options, ['A', 'B']);
  assert.equal(input.formFields[1].options.length, 3);
  assert.deepEqual(value.formFields[2], input.formFields[2]);
});

test('schedule editing keeps the advertised Shanghai time across machine time zones and year boundaries', () => {
  assert.equal(scheduleInstant('2027-01-01T00:05'), '2026-12-31T16:05:00.000Z');
  assert.equal(scheduleInput('2026-12-31T16:05:00.000Z'), '2027-01-01T00:05');
  assert.equal(scheduleInstant(''), null);
  assert.equal(scheduleInput(null), '');
});
