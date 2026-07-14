import { describe, it, expect, afterEach } from 'vitest';
import { scheduleDB } from './db';
import { listTemplates, createTemplate, updateTemplate, deleteTemplate } from './templates';
import { TemplateSlot } from './types';

// The endpoints run as 'system' here (no auth context in tests, so getAuthData
// returns undefined and userId falls back to 'system' — same as the other
// endpoint tests). Owner-scoping is exercised by inserting a row owned by a
// *different* user directly and asserting the 'system' caller can't reach it.
describe('Templates CRUD', () => {
  const createdIds: string[] = [];

  const slots: TemplateSlot[] = [
    { dayOffset: 0, time: 'Travel', callTime: 'Travel', status: 'travel' },
    { dayOffset: 1, time: '19:30', callTime: '18:30', status: 'show' },
    { dayOffset: 5, time: '15:00', callTime: '13:30', status: 'show' },
    { dayOffset: 5, time: '20:00', callTime: '18:00', status: 'show' },
    { dayOffset: 6, time: '00:00', callTime: '00:00', status: 'dayoff', isCompanyRedDay: true },
  ];

  afterEach(async () => {
    for (const id of createdIds) {
      try { await deleteTemplate({ id }); } catch { /* already gone */ }
    }
    await scheduleDB.exec`DELETE FROM templates WHERE user_id = 'other-user'`;
    createdIds.length = 0;
  });

  it('creates, lists, updates and deletes a template, preserving slots verbatim', async () => {
    const created = await createTemplate({ name: 'Standard', slots });
    createdIds.push(created.template.id);
    expect(created.template.name).toBe('Standard');
    expect(created.template.slots).toEqual(slots);
    expect(created.template.slots[4].isCompanyRedDay).toBe(true);

    const listed = await listTemplates();
    expect(listed.templates.some((t) => t.id === created.template.id)).toBe(true);

    const updated = await updateTemplate({
      id: created.template.id,
      name: 'Renamed',
      slots: slots.slice(0, 2),
    });
    expect(updated.template.name).toBe('Renamed');
    expect(updated.template.slots).toHaveLength(2);

    // A partial update leaves the omitted field untouched.
    const nameOnly = await updateTemplate({ id: created.template.id, name: 'Again' });
    expect(nameOnly.template.name).toBe('Again');
    expect(nameOnly.template.slots).toHaveLength(2);

    await deleteTemplate({ id: created.template.id });
    const after = await listTemplates();
    expect(after.templates.some((t) => t.id === created.template.id)).toBe(false);
  });

  it("does not expose or mutate another user's templates (owner scoping)", async () => {
    const foreignId = 'foreign-tmpl-owner-scoping';
    await scheduleDB.exec`
      INSERT INTO templates (id, user_id, name, slots, created_at, updated_at)
      VALUES (${foreignId}, 'other-user', 'Their template', ${JSON.stringify(slots)}, NOW(), NOW())
    `;

    const listed = await listTemplates();
    expect(listed.templates.some((t) => t.id === foreignId)).toBe(false);

    await expect(updateTemplate({ id: foreignId, name: 'hacked' })).rejects.toThrow();
    await expect(deleteTemplate({ id: foreignId })).rejects.toThrow();

    const row = await scheduleDB.queryRow`SELECT name FROM templates WHERE id = ${foreignId}`;
    expect(row?.name).toBe('Their template');
  });
});
