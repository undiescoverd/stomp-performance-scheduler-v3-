import { describe, it, expect, afterEach } from 'vitest';
import { createTourBulk, getTours, deleteTour } from './tours';
import { CAST_MEMBERS, Show } from './types';

function addDays(iso: string, n: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

// A Monday-travel "Standard" week: Mon travel, Tue–Fri singles, Sat/Sun doubles.
// That is 8 real shows + 1 travel day — the regression the plan targets is that
// a Monday travel day must NOT drop a show (the old generator shipped 7).
function standardMonTravelWeek(mon: string): Show[] {
  return [
    { id: `t${mon}`, date: addDays(mon, 0), time: 'Travel', callTime: 'Travel', status: 'travel' },
    { id: `tu${mon}`, date: addDays(mon, 1), time: '19:30', callTime: '18:30', status: 'show' },
    { id: `w${mon}`, date: addDays(mon, 2), time: '19:30', callTime: '18:30', status: 'show' },
    { id: `th${mon}`, date: addDays(mon, 3), time: '19:30', callTime: '18:30', status: 'show' },
    { id: `f${mon}`, date: addDays(mon, 4), time: '19:30', callTime: '18:30', status: 'show' },
    { id: `sa${mon}`, date: addDays(mon, 5), time: '15:00', callTime: '13:30', status: 'show' },
    { id: `se${mon}`, date: addDays(mon, 5), time: '20:00', callTime: '18:00', status: 'show' },
    { id: `su${mon}`, date: addDays(mon, 6), time: '15:00', callTime: '13:30', status: 'show' },
    { id: `sv${mon}`, date: addDays(mon, 6), time: '18:00', callTime: '16:30', status: 'show' },
  ];
}

describe('Tour bulk-create from explicit shows', () => {
  const createdTourIds: string[] = [];

  afterEach(async () => {
    for (const id of createdTourIds) {
      try { await deleteTour({ id }); } catch { /* already gone */ }
    }
    createdTourIds.length = 0;
  });

  it('persists client-resolved shows verbatim (Mon-travel Standard = 8 shows) and sorts weeks by start date', async () => {
    const monEarly = '2026-08-03';
    const monLate = '2026-08-10';

    const res = await createTourBulk({
      tourName: 'Template Regression Tour',
      segmentName: 'Seg',
      castMemberIds: CAST_MEMBERS.map((m) => m.name),
      // Intentionally out of chronological order to exercise the startDate sort.
      weeks: [
        {
          startDate: monLate,
          endDate: addDays(monLate, 6),
          locationCity: 'Paris',
          shows: standardMonTravelWeek(monLate),
        },
        {
          startDate: monEarly,
          endDate: addDays(monEarly, 6),
          locationCity: 'London',
          shows: standardMonTravelWeek(monEarly),
        },
      ],
    });

    expect(res.success).toBe(true);
    expect(res.tour).toBeDefined();
    createdTourIds.push(res.tour!.id);

    // Both weeks report 8 real shows — the Monday travel day is preserved, not
    // subtracted from the show count.
    expect(res.tour!.weeks.map((w) => w.showCount)).toEqual([8, 8]);
    // No auto-numbered "Week N" label is written.
    expect(res.tour!.weeks.every((w) => w.week === '')).toBe(true);

    const tours = await getTours({});
    const tour = tours.tours.find((t) => t.id === res.tour!.id);
    expect(tour).toBeDefined();

    // Sorted chronologically by derived start date, regardless of input order.
    expect(tour!.weeks.map((w) => w.locationCity)).toEqual(['London', 'Paris']);
    expect(tour!.weeks[0].startDate).toBe(monEarly);
    expect(tour!.weeks[0].endDate).toBe(addDays(monEarly, 6));
    expect(tour!.weeks[0].showCount).toBe(8);
    expect(tour!.weeks[0].week).toBe('');
  });
});
