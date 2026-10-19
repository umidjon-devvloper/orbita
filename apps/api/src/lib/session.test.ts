import { describe, expect, it } from "vitest";
import { isSessionLive, newSession, SESSION, slideIdleExpiry } from "./session.js";

const T0 = new Date("2026-10-19T10:00:00Z");

describe("session", () => {
  it("newSession produces a 43-char token, its hash, a csrf and both expiries", () => {
    const s = newSession(T0);
    expect(s.token).toHaveLength(43);
    expect(s.tokenHash).toHaveLength(64);
    expect(s.csrfToken).toHaveLength(43);
    expect(s.idleExpires.getTime() - T0.getTime()).toBe(SESSION.IDLE_MS);
    expect(s.absExpires.getTime() - T0.getTime()).toBe(SESSION.ABSOLUTE_MS);
    expect(s.token).not.toBe(s.csrfToken);
  });

  it("isSessionLive is true inside both windows and false after either expires", () => {
    const s = newSession(T0);
    expect(isSessionLive(s, T0)).toBe(true);
    expect(isSessionLive(s, new Date(T0.getTime() + SESSION.IDLE_MS - 1))).toBe(true);
    expect(isSessionLive(s, s.idleExpires)).toBe(false);
    expect(isSessionLive({ idleExpires: s.absExpires, absExpires: s.absExpires }, s.absExpires)).toBe(false);
  });

  it("slideIdleExpiry moves idle forward by one window, capped at absExpires", () => {
    const s = newSession(T0);
    const t1 = new Date(T0.getTime() + 10 * 60_000);
    const next = slideIdleExpiry(s, t1);
    expect(next).not.toBeNull();
    expect(next!.getTime() - t1.getTime()).toBe(SESSION.IDLE_MS);

    // Near the absolute cap: the new idle expiry pins to absExpires.
    const late = new Date(s.absExpires.getTime() - 60_000);
    const capped = slideIdleExpiry(s, late);
    expect(capped!.getTime()).toBe(s.absExpires.getTime());
  });

  it("slideIdleExpiry returns null when the move would be sub-second (DB write skipped)", () => {
    const s = newSession(T0);
    // Clock has barely moved — idle expiry would advance by <1 s.
    expect(slideIdleExpiry(s, new Date(T0.getTime() + 500))).toBeNull();
  });
});
