import { describe, it, expect } from 'vitest';
import { getCompany, deleteMember, updateMember, addMember } from './company';
import { CAST_MEMBERS } from './types';
import { scheduleDB } from './db';

describe('Company roster seeding', () => {
  it('seeds exactly the 12 defaults on first call', async () => {
    const { currentCompany } = await getCompany();
    expect(currentCompany.length).toBeGreaterThanOrEqual(CAST_MEMBERS.length);

    const seeded = currentCompany.filter(m => m.id.startsWith('member_seed_'));
    expect(seeded.length).toBe(CAST_MEMBERS.length);
    expect(new Set(seeded.map(m => m.name))).toEqual(new Set(CAST_MEMBERS.map(m => m.name)));
  });

  it('allows archive and delete while other active members remain', async () => {
    // A throwaway member so the roster is byte-identical after the test.
    const { member } = await addMember({ name: 'TEMP GUARDRAIL', eligibleRoles: ['Sarge'] });

    // Archiving with 12 other actives is fine…
    const updated = await updateMember({ id: member.id, status: 'archived' });
    expect(updated.member.status).toBe('archived');

    // …and deleting an archived member is always allowed.
    await deleteMember({ id: member.id });
    const after = await getCompany();
    expect(after.currentCompany.some(m => m.id === member.id)).toBe(false);
    expect(after.archive.some(m => m.id === member.id)).toBe(false);
  });

  it('guards the last active member and does not resurrect the roster after emptying (regression for COUNT(*)-based reseed)', async () => {
    // Ensure seeded, then remove members through the API until only one
    // active member remains (archived ones can always be deleted).
    const before = await getCompany();
    for (const member of before.archive) {
      await deleteMember({ id: member.id });
    }
    const active = before.currentCompany;
    for (const member of active.slice(0, -1)) {
      await deleteMember({ id: member.id });
    }
    const last = active[active.length - 1];

    // The shared roster must never be emptied via the API: deleting or
    // archiving the final active member is refused.
    await expect(deleteMember({ id: last.id })).rejects.toMatchObject({
      code: 'failed_precondition',
    });
    await expect(updateMember({ id: last.id, status: 'archived' })).rejects.toMatchObject({
      code: 'failed_precondition',
    });
    const guarded = await getCompany();
    expect(guarded.currentCompany.map(m => m.id)).toEqual([last.id]);

    // Empty the table directly (bypassing the API) to exercise the
    // seed-marker behavior on a truly empty roster.
    await scheduleDB.exec`DELETE FROM company_members`;

    const emptied = await getCompany();
    expect(emptied.currentCompany).toEqual([]);
    expect(emptied.archive).toEqual([]);

    // The old COUNT(*)==0 check would have reseeded the 12 defaults here.
    // The marker-gated check must not.
    const afterAnotherCall = await getCompany();
    expect(afterAnotherCall.currentCompany).toEqual([]);
    expect(afterAnotherCall.archive).toEqual([]);

    // Restore the FULL default roster so later test files (which share this
    // database) see the real 12-member company, not an empty one: wipe the
    // seed marker and let ensureSeeded() run again on the next getCompany().
    await scheduleDB.exec`DELETE FROM company_seed_marker`;
    const restored = await getCompany();
    const reseeded = restored.currentCompany.filter(m => m.id.startsWith('member_seed_'));
    expect(reseeded.length).toBe(CAST_MEMBERS.length);
    expect(new Set(reseeded.map(m => m.name))).toEqual(new Set(CAST_MEMBERS.map(m => m.name)));
  });
});
