import { describe, expect, it } from "vitest";
import type { LinearView } from "../../linear/types";
import { arrangeViews } from "./viewList";

function view(id: string, overrides: Partial<LinearView> = {}): LinearView {
  return {
    id,
    name: `View ${id}`,
    description: null,
    shared: true,
    teamKey: null,
    favorite: false,
    favoriteOrder: null,
    ...overrides,
  };
}

function names(views: LinearView[]): string[] {
  return views.map((item) => item.name);
}

const SAMPLE: LinearView[] = [
  view("a", { name: "Sprint backlog", description: "Everything queued", shared: true, teamKey: "CLFP" }),
  view("b", { name: "bugs to triage", description: null, shared: true, teamKey: "CLFP" }),
  view("c", { name: "My drafts", description: "Work in progress", shared: false, teamKey: null }),
  view("d", { name: "Tech debt", description: "Cleanup pile", shared: false, teamKey: "PLAT" }),
  view("e", { name: "Customer requests", description: "From support", shared: true, teamKey: null }),
];

describe("arrangeViews with an empty query", () => {
  it("hides shared views and shows only personal views", () => {
    const result = arrangeViews(SAMPLE, "");

    expect(result.shared).toEqual([]);
    expect(names(result.personal)).toEqual(["My drafts", "Tech debt"]);
    expect(result.favorites).toEqual([]);
  });

  it("treats a whitespace-only query like an empty one", () => {
    expect(arrangeViews(SAMPLE, "   ")).toEqual(arrangeViews(SAMPLE, ""));
  });

  it("shows a favourite even when it is a shared view", () => {
    const result = arrangeViews(
      [
        view("s", { name: "Shared fav", shared: true, favorite: true, favoriteOrder: 1 }),
        view("x", { name: "Shared plain", shared: true }),
      ],
      "",
    );

    expect(names(result.favorites)).toEqual(["Shared fav"]);
    expect(result.shared).toEqual([]);
    expect(result.personal).toEqual([]);
  });

  it("shows only favourites and personal views when both exist", () => {
    const result = arrangeViews(
      [
        view("f", { name: "Fav personal", shared: false, favorite: true, favoriteOrder: 1 }),
        view("p", { name: "Plain personal", shared: false }),
        view("s", { name: "Shared plain", shared: true }),
      ],
      "",
    );

    expect(names(result.favorites)).toEqual(["Fav personal"]);
    expect(names(result.personal)).toEqual(["Plain personal"]);
    expect(result.shared).toEqual([]);
  });

  it("returns no personal views when only shared views exist", () => {
    const result = arrangeViews([view("s", { name: "Only shared", shared: true })], "");

    expect(result).toEqual({ favorites: [], shared: [], personal: [] });
  });

  it("does not mutate the input array", () => {
    const input = [...SAMPLE];
    arrangeViews(input, "");
    expect(input).toEqual(SAMPLE);
  });
});

describe("arrangeViews while searching", () => {
  it("searches shared views too and lists them in the shared section", () => {
    const result = arrangeViews(SAMPLE, "sprint");

    expect(names(result.shared)).toEqual(["Sprint backlog"]);
    expect(result.personal).toEqual([]);
  });

  it("matches the name case-insensitively", () => {
    const result = arrangeViews(SAMPLE, "SPRINT");
    expect(names(result.shared)).toEqual(["Sprint backlog"]);
  });

  it("matches the description", () => {
    const result = arrangeViews(SAMPLE, "cleanup");
    expect(names(result.personal)).toEqual(["Tech debt"]);
  });

  it("matches the team key case-insensitively", () => {
    const result = arrangeViews(SAMPLE, "plat");
    expect(names(result.personal)).toEqual(["Tech debt"]);
    expect(result.shared).toEqual([]);
  });

  it("matches across fields and returns every hit", () => {
    const result = arrangeViews(SAMPLE, "clfp");
    expect(names(result.shared)).toEqual(["bugs to triage", "Sprint backlog"]);
  });

  it("returns empty sections when nothing matches", () => {
    expect(arrangeViews(SAMPLE, "zzz-no-such-view")).toEqual({ favorites: [], shared: [], personal: [] });
  });

  it("trims the query before matching", () => {
    const result = arrangeViews(SAMPLE, "  requests  ");
    expect(names(result.shared)).toEqual(["Customer requests"]);
  });

  it("does not treat a null description as a match or crash", () => {
    const result = arrangeViews([view("x", { name: "Plain", description: null })], "something");
    expect(result).toEqual({ favorites: [], shared: [], personal: [] });
  });

  it("finds a favourited shared view in favourites and keeps personal hits in personal", () => {
    const result = arrangeViews(
      [
        view("s", { name: "Shared fav", shared: true, favorite: true, favoriteOrder: 1 }),
        view("p", { name: "Personal hit", shared: false }),
        view("x", { name: "Unrelated", shared: true }),
      ],
      "hit",
    );

    expect(result.favorites).toEqual([]);
    expect(names(result.personal)).toEqual(["Personal hit"]);
    expect(arrangeViews(
      [
        view("s", { name: "Shared fav", shared: true, favorite: true, favoriteOrder: 1 }),
        view("x", { name: "Unrelated", shared: true }),
      ],
      "shared",
    ).favorites.map((item) => item.id)).toEqual(["s"]);
  });
});

describe("arrangeViews sections", () => {
  it("splits non-favourite views by the shared flag and sorts each by name case-insensitively", () => {
    const result = arrangeViews(
      [
        view("1", { name: "cherry", shared: true, description: "x" }),
        view("2", { name: "Banana", shared: false, description: "x" }),
        view("3", { name: "apple", shared: true, description: "x" }),
        view("4", { name: "Apricot", shared: false, description: "x" }),
      ],
      "x",
    );

    expect(names(result.shared)).toEqual(["apple", "cherry"]);
    expect(names(result.personal)).toEqual(["Apricot", "Banana"]);
    expect(result.favorites).toEqual([]);
  });

  it("sorts personal views by name case-insensitively with an empty query", () => {
    const result = arrangeViews(
      [
        view("1", { name: "cherry", shared: false }),
        view("2", { name: "Banana", shared: false }),
        view("3", { name: "apple", shared: false }),
      ],
      "",
    );

    expect(names(result.personal)).toEqual(["apple", "Banana", "cherry"]);
  });

  it("puts favourites first sorted by favoriteOrder ascending", () => {
    const result = arrangeViews(
      [
        view("late", { name: "Alpha", favorite: true, favoriteOrder: 9 }),
        view("early", { name: "Zulu", favorite: true, favoriteOrder: 1 }),
        view("middle", { name: "Mike", favorite: true, favoriteOrder: 4.5 }),
      ],
      "",
    );

    expect(names(result.favorites)).toEqual(["Zulu", "Mike", "Alpha"]);
  });

  it("puts favourites without an order after ordered ones, then by name", () => {
    const result = arrangeViews(
      [
        view("n2", { name: "November", favorite: true, favoriteOrder: null }),
        view("n1", { name: "Bravo", favorite: true, favoriteOrder: null }),
        view("o", { name: "Zeta", favorite: true, favoriteOrder: 3 }),
      ],
      "",
    );

    expect(names(result.favorites)).toEqual(["Zeta", "Bravo", "November"]);
  });

  it("keeps a favourite only in favourites, whatever its shared flag", () => {
    const result = arrangeViews(
      [
        view("s", { name: "Shared fav", shared: true, favorite: true, favoriteOrder: 1, description: "k" }),
        view("p", { name: "Personal fav", shared: false, favorite: true, favoriteOrder: 2, description: "k" }),
        view("x", { name: "Shared plain", shared: true, description: "k" }),
      ],
      "k",
    );

    expect(names(result.favorites)).toEqual(["Shared fav", "Personal fav"]);
    expect(names(result.shared)).toEqual(["Shared plain"]);
    expect(result.personal).toEqual([]);
    const everywhere = [...result.favorites, ...result.shared, ...result.personal].map((item) => item.id);
    expect(everywhere.filter((id) => id === "s")).toHaveLength(1);
    expect(everywhere.filter((id) => id === "p")).toHaveLength(1);
  });

  it("ignores favoriteOrder for views that are not favourites", () => {
    const result = arrangeViews([view("q", { name: "Quiet", shared: false, favorite: false, favoriteOrder: 1 })], "");

    expect(result.favorites).toEqual([]);
    expect(names(result.personal)).toEqual(["Quiet"]);
  });

  it("applies the filter before grouping favourites", () => {
    const result = arrangeViews(
      [
        view("a", { name: "Alpha", favorite: true, favoriteOrder: 1 }),
        view("b", { name: "Beta", favorite: true, favoriteOrder: 2 }),
        view("c", { name: "Gamma", shared: false }),
      ],
      "beta",
    );

    expect(names(result.favorites)).toEqual(["Beta"]);
    expect(result.shared).toEqual([]);
    expect(result.personal).toEqual([]);
  });

  it("returns empty sections for an empty list", () => {
    expect(arrangeViews([], "")).toEqual({ favorites: [], shared: [], personal: [] });
    expect(arrangeViews([], "x")).toEqual({ favorites: [], shared: [], personal: [] });
  });
});

describe("arrangeViews pinned view", () => {
  it("keeps the pinned view even when the query hides it", () => {
    const result = arrangeViews(SAMPLE, "sprint", "c");

    expect(names(result.personal)).toEqual(["My drafts"]);
    expect(names(result.shared)).toEqual(["Sprint backlog"]);
  });

  it("keeps a pinned shared view visible with an empty query so the selection stays highlighted", () => {
    const result = arrangeViews(SAMPLE, "", "e");

    expect(names(result.shared)).toEqual(["Customer requests"]);
    expect(names(result.personal)).toEqual(["My drafts", "Tech debt"]);
    expect(names(arrangeViews(SAMPLE, "", null).shared)).toEqual([]);
  });

  it("keeps a pinned favourite in the favourites section", () => {
    const views = [
      view("f", { name: "Pinned fav", favorite: true, favoriteOrder: 2 }),
      view("g", { name: "Other fav", favorite: true, favoriteOrder: 1 }),
    ];
    const result = arrangeViews(views, "other", "f");

    expect(names(result.favorites)).toEqual(["Other fav", "Pinned fav"]);
  });

  it("does not add a pinned id that is not in the list", () => {
    expect(arrangeViews(SAMPLE, "zzz", "missing")).toEqual({ favorites: [], shared: [], personal: [] });
  });

  it("behaves like no pin when the pinned view already matches", () => {
    expect(arrangeViews(SAMPLE, "sprint", "a")).toEqual(arrangeViews(SAMPLE, "sprint"));
  });
});
