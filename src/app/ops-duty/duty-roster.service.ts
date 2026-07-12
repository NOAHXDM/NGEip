import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

const SPREADSHEET_ID = '13Bx1ZfMPMglviQSpoVu9N44tGZuqHwtz3AyAaSpl2gM';
const TAIPEI_TIME_ZONE = 'Asia/Taipei';

export const DUTY_ROSTER_SOURCE_URL =
  `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`;

interface GoogleVisualizationCell {
  v?: boolean | number | string | null;
  f?: string;
}

interface GoogleVisualizationResponse {
  status: string;
  errors?: Array<{ message?: string }>;
  table?: {
    rows: Array<{ c: Array<GoogleVisualizationCell | null> }>;
  };
}

export interface DutyRoster {
  dateLabel: string;
  earlyShift: string[];
  middleShift: string[];
  onCall: string[];
  sheetName: string;
  sourceUrl: string;
}

@Injectable({ providedIn: 'root' })
export class DutyRosterService {
  private readonly document = inject(DOCUMENT);
  private callbackSequence = 0;

  loadToday(now = new Date()): Promise<DutyRoster> {
    const date = this.taipeiDateParts(now);
    const sheetName = `${date.year}/${date.month}_班表`;

    return this.loadSheet(sheetName).then((response) =>
      this.parseRoster(response, date, sheetName)
    );
  }

  parseRoster(
    response: GoogleVisualizationResponse,
    date: { year: number; month: number; day: number },
    sheetName: string
  ): DutyRoster {
    if (response.status !== 'ok' || !response.table) {
      throw new Error(response.errors?.[0]?.message || '無法讀取班表');
    }

    const rows = response.table.rows;
    const header = rows.find((row) => this.cellText(row.c[2]) === 'oncall');
    const dateToken = `Date(${date.year},${date.month - 1},${date.day})`;
    const today = rows.find((row) => this.cellText(row.c[0]) === dateToken);

    if (!header || !today) {
      throw new Error(`在「${sheetName}」找不到今日班表`);
    }

    const names = header.c.slice(6).map((cell) => this.cellText(cell));
    const shifts = today.c.slice(6);
    const peopleForShift = (shift: string) =>
      names.filter((name, index) => name && this.cellText(shifts[index]) === shift);

    return {
      dateLabel:
        today.c[0]?.f || `${date.year}/${date.month}/${date.day}`,
      earlyShift: peopleForShift('早'),
      middleShift: peopleForShift('中'),
      onCall: [this.cellText(today.c[2]), this.cellText(today.c[3])].filter(Boolean),
      sheetName,
      sourceUrl: DUTY_ROSTER_SOURCE_URL,
    };
  }

  private loadSheet(sheetName: string): Promise<GoogleVisualizationResponse> {
    const callbackName = `__dutyRosterCallback${Date.now()}_${this.callbackSequence++}`;
    const script = this.document.createElement('script');
    const callbackTarget = this.document.defaultView as unknown as Record<
      string,
      ((response: GoogleVisualizationResponse) => void) | undefined
    >;

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        script.remove();
        delete callbackTarget[callbackName];
      };
      const fail = () => {
        cleanup();
        reject(new Error('班表載入失敗，請稍後再試'));
      };
      const timeout = setTimeout(fail, 12_000);

      callbackTarget[callbackName] = (response) => {
        cleanup();
        resolve(response);
      };
      script.onerror = fail;
      script.src =
        `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq` +
        `?headers=0&sheet=${encodeURIComponent(sheetName)}` +
        `&tqx=out:json;responseHandler:${callbackName}`;
      this.document.head.appendChild(script);
    });
  }

  private taipeiDateParts(date: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TAIPEI_TIME_ZONE,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);

    return { year: value('year'), month: value('month'), day: value('day') };
  }

  private cellText(cell: GoogleVisualizationCell | null | undefined): string {
    return cell?.v == null ? '' : String(cell.v).trim();
  }
}
