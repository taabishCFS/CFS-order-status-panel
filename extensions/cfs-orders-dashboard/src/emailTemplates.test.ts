import { describe, expect, it } from 'vitest';
import { canSaveTemplate, describeVersion, htmlToLines, templateError, unknownPlaceholders } from './emailTemplates';

const allowed = { order: ['customer_first_name', 'order_number'], line: ['line_name'], layout: ['content'] };

describe('unknownPlaceholders', () => {
  it('lists only the placeholders that are not allowed, once each, ignoring the lines block', () => {
    const text = 'Dear {{customer_first_name}} {{oops}} {{oops}} {{#lines}}{{line_name}}{{/lines}} {{ order_number }}';
    expect(unknownPlaceholders(text, allowed)).toEqual(['oops']);
  });

  it('is empty for plain text and for the layout slot', () => {
    expect(unknownPlaceholders('No placeholders here', allowed)).toEqual([]);
    expect(unknownPlaceholders('{{content}}', allowed)).toEqual([]);
  });
});

describe('canSaveTemplate', () => {
  const ok = { subject: 'S', body: 'B', reason: 'Why', saving: false, changed: true };

  it('allows a changed, complete, idle form', () => {
    expect(canSaveTemplate(ok)).toBe(true);
  });

  it('refuses when unchanged, empty, without a reason, or while saving', () => {
    for (const over of [{ changed: false }, { subject: ' ' }, { body: '' }, { reason: '  ' }, { saving: true }]) {
      expect(canSaveTemplate({ ...ok, ...over })).toBe(false);
    }
  });

  it('does not need a subject for the layout', () => {
    expect(canSaveTemplate({ ...ok, subject: '', isLayout: true })).toBe(true);
  });
});

describe('describeVersion', () => {
  it('shows version, who, when and the reason', () => {
    const text = describeVersion({ version: 3, actorName: 'Sam Patel', createdAt: '2026-11-21T10:00:00Z', reason: 'Softer wording' });
    expect(text).toContain('Version 3');
    expect(text).toContain('Sam Patel');
    expect(text).toContain('2026');
    expect(text).toContain('Softer wording');
  });

  it('copes with a missing actor or reason', () => {
    const text = describeVersion({ version: 1, actorName: null, createdAt: '2026-11-21T10:00:00Z', reason: null });
    expect(text).toContain('Version 1');
    expect(text).toContain('Imported');
  });
});

describe('templateError', () => {
  it('turns the backend answers into messages', () => {
    expect(templateError(422, { errors: ['Unknown placeholder {{x}} in the body.'] })).toContain('Unknown placeholder');
    expect(templateError(409, { code: 'stale' })).toMatch(/someone else/i);
    expect(templateError(409, { code: 'email_off' })).toMatch(/turned off/i);
    expect(templateError(409, { code: 'no_allowlist' })).toMatch(/test addresses/i);
    expect(templateError(403, { error: 'staff_not_verified' })).toMatch(/verified/i);
    expect(templateError(500, null)).toMatch(/500/);
  });
});

describe('htmlToLines', () => {
  it('turns an email into readable lines: tags gone, breaks kept, entities decoded', () => {
    const html = '<html><head><style>p{color:red}</style></head><body><p>Dear <strong>Jane</strong>,</p><p>Your order &amp; more&nbsp;here.<br>Warm regards,<br>Team &ndash; CFS</p><table><tr><td>Bed</td><td>1</td></tr></table></body></html>';
    expect(htmlToLines(html)).toEqual(['Dear Jane,', 'Your order & more here.', 'Warm regards,', 'Team – CFS', 'Bed 1']);
  });

  it('decodes numeric entities and drops empty lines', () => {
    expect(htmlToLines('<p>&#169; CFS</p><p> </p><p>&lt;b&gt;</p>')).toEqual(['© CFS', '<b>']);
  });
});
