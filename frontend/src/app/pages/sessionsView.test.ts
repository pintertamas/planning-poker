import { describe, expect, it } from "vitest";
import {
  formatRelativeTime,
  groomedLabel,
  isFatalSessionsError,
  phaseChip,
  playersLabel,
  sessionsErrorMessage,
  startedLabel,
} from "./sessionsView";

const NOW = 10_000_000_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatRelativeTime", () => {
  it("says just now under a minute, including clock skew into the future", () => {
    expect(formatRelativeTime(NOW, NOW)).toBe("just now");
    expect(formatRelativeTime(NOW, NOW - 59_999)).toBe("just now");
    expect(formatRelativeTime(NOW, NOW + 5 * MINUTE)).toBe("just now");
  });

  it("counts whole minutes under an hour", () => {
    expect(formatRelativeTime(NOW, NOW - MINUTE)).toBe("1 min ago");
    expect(formatRelativeTime(NOW, NOW - 12 * MINUTE - 30_000)).toBe("12 min ago");
    expect(formatRelativeTime(NOW, NOW - HOUR + 1)).toBe("59 min ago");
  });

  it("counts whole hours under a day", () => {
    expect(formatRelativeTime(NOW, NOW - HOUR)).toBe("1 h ago");
    expect(formatRelativeTime(NOW, NOW - 23 * HOUR - MINUTE)).toBe("23 h ago");
  });

  it("counts whole days from a day on", () => {
    expect(formatRelativeTime(NOW, NOW - DAY)).toBe("1 d ago");
    expect(formatRelativeTime(NOW, NOW - 3 * DAY - HOUR)).toBe("3 d ago");
  });
});

describe("startedLabel", () => {
  it("reads as a sentence for recent and older sessions", () => {
    expect(startedLabel(NOW, NOW - 10_000)).toBe("started just now");
    expect(startedLabel(NOW, NOW - 12 * MINUTE)).toBe("started 12 min ago");
    expect(startedLabel(NOW, NOW - 2 * HOUR)).toBe("started 2 h ago");
  });
});

describe("phaseChip", () => {
  it("maps idle to an outline WAITING chip", () => {
    expect(phaseChip("idle")).toEqual({ label: "WAITING", tone: "outline" });
  });

  it("maps voting to a pink VOTING chip", () => {
    expect(phaseChip("voting")).toEqual({ label: "VOTING", tone: "pink" });
  });

  it("maps revealed to a green REVEALED chip", () => {
    expect(phaseChip("revealed")).toEqual({ label: "REVEALED", tone: "green" });
  });
});

describe("labels", () => {
  it("pluralises the player count", () => {
    expect(playersLabel(0)).toBe("0 players");
    expect(playersLabel(1)).toBe("1 player");
    expect(playersLabel(3)).toBe("3 players");
  });

  it("shows groomed progress", () => {
    expect(groomedLabel(2, 8)).toBe("2 / 8 groomed");
  });
});

describe("sessionsErrorMessage", () => {
  it("gives the copy for each error kind", () => {
    expect(sessionsErrorMessage("unauthorized")).toBe(
      "Your Linear sign-in is no longer valid. Go back to the start and sign in again.",
    );
    expect(sessionsErrorMessage("wrong_workspace")).toBe(
      "Live sessions are only available to people in the company's Linear workspace.",
    );
    expect(sessionsErrorMessage("forbidden")).toBe("You do not have access to live sessions right now.");
    expect(sessionsErrorMessage("unavailable")).toBe("Could not load sessions. Try again.");
  });

  it("treats only unavailable as recoverable by retrying", () => {
    expect(isFatalSessionsError("unavailable")).toBe(false);
    expect(isFatalSessionsError("unauthorized")).toBe(true);
    expect(isFatalSessionsError("wrong_workspace")).toBe(true);
    expect(isFatalSessionsError("forbidden")).toBe(true);
  });
});
