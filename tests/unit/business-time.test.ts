import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  businessClockParts,
  businessDateRange,
  businessMonthRanges,
  businessToday,
  formatBusinessDateTime,
} from "../../src/utils/business-time.js";

describe("Business time utilities", () => {
  const zone = "America/Managua";

  it("uses the Managua business date near the UTC day boundary", () => {
    const instant = new Date("2026-10-26T03:30:00.000Z");
    assert.equal(businessToday(zone, instant), "2026-10-25");
    assert.deepEqual(businessClockParts(instant, zone), {
      date: "2026-10-25",
      time: "21:30",
      dayOfWeek: 0,
    });
  });

  it("formats operational timestamps in Managua instead of the runtime timezone", () => {
    const formatted = formatBusinessDateTime("2026-10-26T03:30:00.000Z", zone);
    assert.match(formatted, /25\/10\/2026/);
    assert.match(formatted, /21:30/);
  });

  it("builds UTC-exclusive ranges for local business dates", () => {
    assert.deepEqual(businessDateRange("2026-10-25", "2026-10-25", zone), {
      startUtc: "2026-10-25T06:00:00.000Z",
      endUtc: "2026-10-26T06:00:00.000Z",
    });
  });

  it("creates twelve complete monthly ranges", () => {
    const ranges = businessMonthRanges(2026, zone);
    assert.equal(ranges.length, 12);
    assert.deepEqual(ranges[0], {
      month: 1,
      startUtc: "2026-01-01T06:00:00.000Z",
      endUtc: "2026-02-01T06:00:00.000Z",
    });
    assert.equal(ranges[11].endUtc, "2027-01-01T06:00:00.000Z");
  });
});
