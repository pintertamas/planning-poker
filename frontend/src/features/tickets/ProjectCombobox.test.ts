import { describe, expect, it } from "vitest";
import { placePanel } from "./ProjectCombobox";

describe("placePanel", () => {
  it("sits 8px below the input and takes its left edge and width", () => {
    expect(placePanel({ bottom: 300, left: 40, width: 500 }, 860)).toEqual({
      top: 308,
      left: 40,
      width: 500,
      maxHeight: 412,
    });
  });

  it("shrinks the panel so it stays inside a short viewport", () => {
    expect(placePanel({ bottom: 400, left: 40, width: 500 }, 700).maxHeight).toBe(276);
  });

  it("keeps a usable minimum height when the input is near the bottom", () => {
    expect(placePanel({ bottom: 650, left: 40, width: 500 }, 700).maxHeight).toBe(120);
  });

  it("never exceeds the 412px panel height", () => {
    expect(placePanel({ bottom: 100, left: 0, width: 300 }, 2000).maxHeight).toBe(412);
  });
});
