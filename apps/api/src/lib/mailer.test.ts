import { describe, expect, it } from "vitest";
import { createConsoleMailer } from "./mailer.js";

describe("ConsoleMailer", () => {
  it("stores sent messages, newest first", async () => {
    const m = createConsoleMailer();
    await m.send({ to: "a@example.uz", subject: "A", text: "body A" });
    await m.send({ to: "b@example.uz", subject: "B", text: "body B" });
    expect(m.outbox[0]?.to).toBe("b@example.uz");
    expect(m.outbox[1]?.to).toBe("a@example.uz");
  });

  it("looks up a message by recipient (case-insensitive)", async () => {
    const m = createConsoleMailer();
    await m.send({ to: "Someone@Example.UZ", subject: "x", text: "y" });
    expect(m.byRecipient("someone@example.uz")?.subject).toBe("x");
    expect(m.byRecipient("other@example.uz")).toBeUndefined();
  });

  it("clear empties the outbox", async () => {
    const m = createConsoleMailer();
    await m.send({ to: "x", subject: "s", text: "t" });
    m.clear();
    expect(m.outbox).toHaveLength(0);
  });
});
