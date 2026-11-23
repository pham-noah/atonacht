import { describe, expect, it } from "vitest";
import { describeWhen, parseWhen } from "../lib/natural";

// 2026-11-23 is a Monday.
const MON = "2026-11-23";

describe("reading the day out of what someone typed", () => {
  it("takes today, tonight, tomorrow and the day after", () => {
    expect(parseWhen("buy milk tomorrow", MON)).toMatchObject({ title: "buy milk", due: "2026-11-24" });
    expect(parseWhen("buy milk today", MON)).toMatchObject({ title: "buy milk", due: "2026-11-23" });
    expect(parseWhen("buy milk tmrw", MON)).toMatchObject({ title: "buy milk", due: "2026-11-24" });
    expect(parseWhen("buy milk day after tomorrow", MON)).toMatchObject({ title: "buy milk", due: "2026-11-25" });
    expect(parseWhen("call mum tonight", MON)).toMatchObject({ due: "2026-11-23", at: "20:00" });
  });

  it("takes weekdays as the next one, not the one gone by", () => {
    expect(parseWhen("gym fri", MON)).toMatchObject({ title: "gym", due: "2026-11-27" });
    expect(parseWhen("gym friday", MON)).toMatchObject({ title: "gym", due: "2026-11-27" });
    expect(parseWhen("gym next friday", MON)).toMatchObject({ title: "gym", due: "2026-11-27" });
    // a weekday typed on that same day means a week away
    expect(parseWhen("gym monday", MON)).toMatchObject({ title: "gym", due: "2026-11-30" });
    expect(parseWhen("gym sunday", MON)).toMatchObject({ title: "gym", due: "2026-11-29" });
  });

  it("takes spans and explicit dates", () => {
    expect(parseWhen("water plants in 3 days", MON)).toMatchObject({ due: "2026-11-26" });
    expect(parseWhen("water plants in 2 weeks", MON)).toMatchObject({ due: "2026-12-07" });
    expect(parseWhen("review next week", MON)).toMatchObject({ due: "2026-11-30" });
    expect(parseWhen("renew on 31 dec", MON)).toMatchObject({ title: "renew", due: "2026-12-31" });
    expect(parseWhen("renew dec 31", MON)).toMatchObject({ title: "renew", due: "2026-12-31" });
    expect(parseWhen("renew 2026-12-31", MON)).toMatchObject({ title: "renew", due: "2026-12-31" });
    expect(parseWhen("renew 5/12", MON)).toMatchObject({ title: "renew", due: "2026-12-05" });
    // a date that has gone by this year means next year
    expect(parseWhen("birthday 3 jan", MON)).toMatchObject({ title: "birthday", due: "2027-01-03" });
    // an impossible date is left alone, not guessed at
    expect(parseWhen("ship 2026-02-30", MON)).toMatchObject({ title: "ship 2026-02-30", due: undefined });
  });

  it("takes the time, and a time on its own means today", () => {
    expect(parseWhen("standup 9:30", MON)).toMatchObject({ due: "2026-11-23", at: "09:30" });
    expect(parseWhen("standup at 9:30", MON)).toMatchObject({ title: "standup", at: "09:30" });
    expect(parseWhen("call 5pm", MON)).toMatchObject({ title: "call", due: "2026-11-23", at: "17:00" });
    expect(parseWhen("call 5 pm", MON)).toMatchObject({ title: "call", at: "17:00" });
    expect(parseWhen("lunch 12pm", MON)).toMatchObject({ title: "lunch", at: "12:00" });
    expect(parseWhen("call 12am", MON)).toMatchObject({ title: "call", at: "00:00" });
    expect(parseWhen("call 5 o'clock", MON)).toMatchObject({ title: "call", at: "05:00" });
    expect(parseWhen("breakfast noon", MON)).toMatchObject({ title: "breakfast", at: "12:00" });
    expect(parseWhen("pay rent tomorrow 5pm", MON)).toMatchObject({ title: "pay rent", due: "2026-11-24", at: "17:00" });
  });

  it("leaves ordinary words alone", () => {
    expect(parseWhen("buy 2 apples", MON)).toMatchObject({ title: "buy 2 apples", due: undefined, at: undefined });
    expect(parseWhen("read chapter 1", MON)).toMatchObject({ title: "read chapter 1" });
    expect(parseWhen("email about the 24/7 rota", MON)).toMatchObject({ title: "email about the 24/7 rota", due: undefined });
    expect(parseWhen("pay the gas bill", MON)).toMatchObject({ title: "pay the gas bill" });
    expect(parseWhen("", MON)).toMatchObject({ title: "", due: undefined });
  });

  it("does not fight a hand-typed tag", () => {
    expect(parseWhen("pay rent @due(2026-12-31) tomorrow", MON)).toMatchObject({ title: "pay rent @due(2026-12-31) tomorrow", due: undefined });
    expect(parseWhen("call mum @at(18:00) 5pm", MON)).toMatchObject({ at: undefined });
  });

  it("says, in words, what it understood", () => {
    // "today" is the day the words were typed, so the test says which day that is
    const mon = new Date(2026, 10, 23);
    expect(describeWhen(parseWhen("pay rent tomorrow 5pm", MON), mon)).toBe("tomorrow at 5:00 pm");
    expect(describeWhen(parseWhen("call 9am", MON), mon)).toBe("today at 9:00 am");
    expect(describeWhen(parseWhen("renew dec 31", MON), mon)).toBe("Thu 31 Dec");
    expect(describeWhen(parseWhen("nothing here", MON), mon)).toBe("");
  });
});
