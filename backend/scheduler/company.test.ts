import { describe, it, expect } from 'vitest';
import { getCompany, deleteMember } from './company';
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

  it('does not resurrect the roster after every member is deleted (regression for COUNT(*)-based reseed)', async () => {
    // Ensure seeded, then delete every current member (seeds + anything
    // else already present) so company_members is empty.
    const before = await getCompany();
    for (const member of before.currentCompany) {
      await deleteMember({ id: member.id });
    }
    for (const member of before.archive) {
      await deleteMember({ id: member.id });
    }

    const emptied = await getCompany();
    expect(emptied.currentCompany).toEqual([]);
    expect(emptied.archive).toEqual([]);

    // The old COUNT(*)==0 check would have reseeded the 12 defaults here.
    // The marker-gated check must not.
    const afterAnotherCall = await getCompany();
    expect(afterAnotherCall.currentCompany).toEqual([]);
    expect(afterAnotherCall.archive).toEqual([]);

    // Restore the FULL default roster so later test files (which share this
    // database) see the real 12-member company, not a 1-member stub: wipe the
    // seed marker and let ensureSeeded() run again on the next getCompany().
    await scheduleDB.exec`DELETE FROM company_members`;
    await scheduleDB.exec`DELETE FROM company_seed_marker`;
    const restored = await getCompany();
    const reseeded = restored.currentCompany.filter(m => m.id.startsWith('member_seed_'));
    expect(reseeded.length).toBe(CAST_MEMBERS.length);
    expect(new Set(reseeded.map(m => m.name))).toEqual(new Set(CAST_MEMBERS.map(m => m.name)));
  });
});
