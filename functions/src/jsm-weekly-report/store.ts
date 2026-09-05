import { randomUUID } from "node:crypto";
import { Firestore } from "firebase-admin/firestore";
import { initialStart, lastWorkday, plannedDate, shiftDate, weekStart } from "./calendar";
import { ReportStore, Run, requireValue } from "./model";

interface Control { cursor?: string; initialStart?: string; active?: string | null }
export class FirestoreReportStore implements ReportStore {
  constructor(private readonly db: Firestore) {}
  private control() { return this.db.doc("jsmWeeklyReportState/control"); }
  private run(id: string) { return this.db.doc(`jsmWeeklyReportRuns/${id}`); }

  async plan(date: string): Promise<{ id: string; date: string | null }> {
    const id = weekStart(date);
    const planRef = this.db.doc(`jsmWeeklyReportWeeks/${id}`);
    return this.db.runTransaction(async tx => {
      const [stateDoc, weekDoc] = await Promise.all([tx.get(this.control()), tx.get(planRef)]);
      const state = (stateDoc.data() ?? {}) as Control;
      const years = [...new Set([id.slice(0, 4), shiftDate(id, 6).slice(0, 4)])];
      const calendars = await Promise.all(years.map(year => tx.get(this.db.doc(`jsmWeeklyReportCalendars/${year}`))));
      const days = Object.assign({}, ...calendars.map(c => c.data()?.days ?? {})) as Record<string, boolean>;
      const latest = lastWorkday(id, days);
      const previous = weekDoc.data()?.date as string | null | undefined;
      const scheduled = plannedDate(date, latest, previous ?? null);
      tx.set(planRef, { date: scheduled, calendarVersions: calendars.map(c => c.data()?.version ?? "unknown") });
      // 首週整週休假也保存初始界線，下一期才不漏掉假期期間資料。
      if (!state.initialStart) tx.set(this.control(), { ...state, initialStart: initialStart(date) });
      return { id, date: scheduled };
    });
  }

  async claim(id: string, cutoff: string | null, now: number): Promise<Run | null> {
    const attemptId = randomUUID();
    return this.db.runTransaction(async tx => {
      const [stateDoc, runDoc] = await Promise.all([tx.get(this.control()), tx.get(this.run(id))]);
      const state = (stateDoc.data() ?? {}) as Control;
      const old = runDoc.data() as Run | undefined;
      // 不確定結果或中斷執行時，全域阻擋後續期數，避免累計重送。
      requireValue(!state.active, "RUN_REQUIRES_REVIEW", 409);
      if (cutoff !== null && old) return null; // 同週失敗也不能自動重試。
      if (cutoff === null) requireValue(old?.status === "failed", "RUN_NOT_RETRYABLE", 409);
      const start = old?.start ?? state.cursor ?? state.initialStart ?? initialStart(id);
      const end = old?.end ?? cutoff!;
      requireValue(!state.cursor || state.cursor === start, "PERIOD_SUPERSEDED", 409);
      requireValue(Date.parse(start) < Date.parse(end) && Date.parse(end) <= now, "INVALID_PERIOD", 409);
      const run: Run = { id, start, end, status: "running", attemptId, startedAt: now };
      tx.set(this.run(id), run);
      tx.set(this.control(), { ...state, initialStart: state.initialStart ?? start, active: id });
      return run;
    });
  }

  private async update(run: Run, change: Partial<Run>, release: boolean, advance = false): Promise<void> {
    await this.db.runTransaction(async tx => {
      const [stateDoc, runDoc] = await Promise.all([tx.get(this.control()), tx.get(this.run(run.id))]);
      const state = stateDoc.data() as Control;
      const current = runDoc.data() as Run;
      requireValue(state?.active === run.id && current?.attemptId === run.attemptId, "RUN_OWNERSHIP_LOST", 409);
      tx.update(this.run(run.id), change);
      if (release) tx.set(this.control(), { ...state, active: null, ...(advance ? { cursor: current.end } : {}) });
    });
  }
  async sending(run: Run, count: number, hash: string): Promise<void> {
    await this.update(run, { status: "sending", count, fileHash: hash }, false);
  }
  async complete(run: Run, messageId: number): Promise<void> {
    await this.update(run, { status: "sent", messageId }, true, true);
  }
  async fail(run: Run, code: string, uncertain: boolean): Promise<void> {
    await this.update(run, { status: uncertain ? "needsReview" : "failed", error: code }, !uncertain);
  }
  async resolve(id: string, action: "confirmSent" | "confirmNotSent", now: number, messageId?: number): Promise<void> {
    await this.db.runTransaction(async tx => {
      const [stateDoc, runDoc] = await Promise.all([tx.get(this.control()), tx.get(this.run(id))]);
      const state = stateDoc.data() as Control | undefined;
      const run = runDoc.data() as Run | undefined;
      requireValue(state?.active === id && run && ["running", "sending", "needsReview"].includes(run.status), "RUN_NOT_REVIEWABLE", 409);
      // 540 秒 Function deadline 後再多留一分鐘，禁止人工解鎖仍在發送的工作。
      requireValue(now - run.startedAt > 600_000, "RUN_STILL_ACTIVE", 409);
      if (action === "confirmSent") {
        requireValue(run.status !== "running" && Number.isSafeInteger(messageId) && messageId! > 0, "INVALID_CONFIRMATION");
        tx.update(this.run(id), { status: "sent", messageId, reviewedAt: now });
        tx.set(this.control(), { ...state, active: null, cursor: run.end });
      } else {
        tx.update(this.run(id), { status: "failed", error: "MANUALLY_CONFIRMED_NOT_SENT", reviewedAt: now });
        tx.set(this.control(), { ...state, active: null });
      }
    });
  }
}
