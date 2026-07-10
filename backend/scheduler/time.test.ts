import { describe, it, expect } from 'vitest';
import { TBC, isKnownTime, normalizeTime, parseShowDateTime, showSortKey } from './time';

describe('isKnownTime', () => {
  it('accepts HH:MM', () => {
    expect(isKnownTime('00:00')).toBe(true);
    expect(isKnownTime('09:05')).toBe(true);
    expect(isKnownTime('20:00')).toBe(true);
  });

  it('rejects everything else', () => {
    for (const t of ['', 'TBC', 'Travel', '9:05', '20:00:00', 'load in']) {
      expect(isKnownTime(t)).toBe(false);
    }
  });
});

describe('normalizeTime', () => {
  it('passes a clock time through', () => {
    expect(normalizeTime('15:00')).toBe('15:00');
  });

  it('turns a cleared field into TBC rather than ""', () => {
    expect(normalizeTime('')).toBe(TBC);
  });

  it('is idempotent on TBC', () => {
    expect(normalizeTime(TBC)).toBe(TBC);
  });
});

describe('showSortKey', () => {
  it('orders known times chronologically within a day', () => {
    const keys = ['20:00', '15:00'].map((t) => showSortKey('2024-01-06', t)).sort();
    expect(keys).toEqual(['2024-01-06T15:00', '2024-01-06T20:00']);
  });

  it('orders across days before times', () => {
    expect(showSortKey('2024-01-05', '20:00') < showSortKey('2024-01-06', '15:00')).toBe(true);
  });

  it('parks an unknown time at the end of its own day', () => {
    for (const unknown of [TBC, '', 'Travel']) {
      const key = showSortKey('2024-01-06', unknown);
      expect(key).toBe('2024-01-06T99:99');
      // after every real time that day...
      expect(key > showSortKey('2024-01-06', '23:59')).toBe(true);
      // ...but before the next day's earliest.
      expect(key < showSortKey('2024-01-07', '00:00')).toBe(true);
    }
  });
});

describe('parseShowDateTime', () => {
  it('parses a known time', () => {
    const d = parseShowDateTime('2024-01-06', '15:00');
    expect(d).toBeInstanceOf(Date);
    expect(Number.isNaN(d!.getTime())).toBe(false);
  });

  it('returns null — never an Invalid Date — for an unknown time', () => {
    for (const unknown of [TBC, '', 'Travel']) {
      expect(parseShowDateTime('2024-01-06', unknown)).toBeNull();
    }
  });
});
