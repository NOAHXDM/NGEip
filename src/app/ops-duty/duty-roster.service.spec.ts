import { TestBed } from '@angular/core/testing';

import { DutyRosterService } from './duty-roster.service';

describe('DutyRosterService', () => {
  let service: DutyRosterService;

  beforeEach(() => {
    service = TestBed.inject(DutyRosterService);
  });

  it('從今日列解析早班、中班與兩位 on-call', () => {
    const response = {
      status: 'ok',
      table: {
        rows: [
          {
            c: [null, null, { v: 'oncall' }, { v: 'oncall' }, null, null,
              { v: '小明' }, { v: '小華' }, { v: '小美' }],
          },
          {
            c: [{ v: 'Date(2026,6,13)', f: '2026年7月13日 星期一' },
              { v: false }, { v: '小美' }, { v: '小明' }, { v: 2 }, { v: 1 },
              { v: '早' }, { v: '中' }, { v: '早' }],
          },
        ],
      },
    };

    const roster = service.parseRoster(
      response,
      { year: 2026, month: 7, day: 13 },
      '2026/7_班表'
    );

    expect(roster.dateLabel).toBe('2026年7月13日 星期一');
    expect(roster.earlyShift).toEqual(['小明', '小美']);
    expect(roster.middleShift).toEqual(['小華']);
    expect(roster.onCall).toEqual(['小美', '小明']);
  });

  it('找不到今日列時提供可理解的錯誤', () => {
    expect(() =>
      service.parseRoster(
        { status: 'ok', table: { rows: [] } },
        { year: 2026, month: 7, day: 13 },
        '2026/7_班表'
      )
    ).toThrowError('在「2026/7_班表」找不到今日班表');
  });
});
