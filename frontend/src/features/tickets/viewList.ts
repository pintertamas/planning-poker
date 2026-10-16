import type { LinearView } from "../../linear/types";

export type ArrangedViews = {
  favorites: LinearView[];
  shared: LinearView[];
  personal: LinearView[];
};

function matches(view: LinearView, needle: string): boolean {
  return [view.name, view.description, view.teamKey].some(
    (field) => field !== null && field.toLowerCase().includes(needle),
  );
}

function compareNames(a: LinearView, b: LinearView): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id);
}

function compareFavorites(a: LinearView, b: LinearView): number {
  if (a.favoriteOrder !== b.favoriteOrder) {
    if (a.favoriteOrder === null) return 1;
    if (b.favoriteOrder === null) return -1;
    return a.favoriteOrder - b.favoriteOrder;
  }
  return compareNames(a, b);
}

export function arrangeViews(views: LinearView[], query: string, pinnedId: string | null = null): ArrangedViews {
  const needle = query.trim().toLowerCase();
  const searching = needle !== "";
  const visible = views.filter((view) => view.id === pinnedId || !searching || matches(view, needle));
  const favorites = visible.filter((view) => view.favorite).sort(compareFavorites);
  const rest = visible.filter((view) => !view.favorite);
  const shared = rest.filter((view) => view.shared && (searching || view.id === pinnedId));
  return {
    favorites,
    shared: shared.sort(compareNames),
    personal: rest.filter((view) => !view.shared).sort(compareNames),
  };
}
