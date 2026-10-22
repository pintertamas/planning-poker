import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MAX_TICKETS, type ClientAction, type Ticket, type TicketEntry } from "@shared/types";
import { useLinear } from "../../app/linearContext";
import { useRoomApi } from "../../net/api";
import { parseRefs } from "../../linear/parseRefs";
import type { LinearProject, LinearService, LinearView } from "../../linear/types";
import { Chip, Icon, Modal, PillButton, Toggle, useToast } from "../../ui";
import { cx } from "../../ui/cx";
import { appendUnique, errorMessage, trimDescription } from "./ticketHelpers";
import { ProjectCombobox } from "./ProjectCombobox";
import { arrangeViews } from "./viewList";
import { unresolvedIdentifiers } from "./issueLinks";

type Tab = "views" | "project" | "paste" | "search";
type Listing = { gen: number; tickets: Ticket[]; nextCursor: string | null };

function requestReferences(
  service: LinearService,
  prepared: Ticket[],
  entries: TicketEntry[],
  references: Record<string, Ticket>,
  send: (action: ClientAction) => void,
): void {
  const known = new Set<string>([
    ...entries.map((entry) => entry.ticket.identifier.toUpperCase()),
    ...prepared.map((ticket) => ticket.identifier.toUpperCase()),
    ...Object.keys(references),
  ]);
  const identifiers = unresolvedIdentifiers(
    prepared.map((ticket) => ticket.description),
    known,
  );
  if (identifiers.length === 0) return;
  service.issuesByRefs(identifiers).then(
    ({ tickets }) => {
      if (tickets.length > 0) send({ type: "addReferences", tickets });
    },
    () => undefined,
  );
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "views", label: "Views" },
  { id: "project", label: "Project" },
  { id: "paste", label: "Paste" },
  { id: "search", label: "Search" },
];

const SEARCH_DEBOUNCE_MS = 350;

let listingGeneration = 0;

function nextListing(tickets: Ticket[], nextCursor: string | null): Listing {
  listingGeneration += 1;
  return { gen: listingGeneration, tickets, nextCursor };
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function useRequests() {
  const latest = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(<T,>(task: () => Promise<T>, onResult: (value: T) => void) => {
    latest.current += 1;
    const id = latest.current;
    setBusy(true);
    setError(null);
    new Promise<T>((resolve) => resolve(task())).then(
      (value) => {
        if (id !== latest.current) return;
        setBusy(false);
        onResult(value);
      },
      (failure: unknown) => {
        if (id !== latest.current) return;
        setBusy(false);
        setError(errorMessage(failure));
      },
    );
  }, []);

  const cancel = useCallback(() => {
    latest.current += 1;
    setBusy(false);
  }, []);

  return { busy, error, run, cancel };
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="tk-loading" role="status">
      <span className="tk-spin" aria-hidden="true">
        <Icon name="refresh" size={16} />
      </span>
      {label}
    </div>
  );
}

function Alert({ tone, children }: { tone: "error" | "warn"; children: ReactNode }) {
  return (
    <div className={cx("tk-alert", `tk-alert--${tone}`)} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

type PickerProps = {
  listing: Listing;
  busy: boolean;
  roomIds: ReadonlySet<string>;
  roomCount: number;
  emptyText: string;
  onAdd: (tickets: Ticket[]) => void;
  onLoadMore: (() => void) | null;
};

function TicketPicker({ listing, busy, roomIds, roomCount, emptyText, onAdd, onLoadMore }: PickerProps) {
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());

  const enabled = listing.tickets.filter((ticket) => !roomIds.has(ticket.id));
  const selected = enabled.filter((ticket) => !excluded.has(ticket.id));
  const allSelected = enabled.length > 0 && selected.length === enabled.length;
  const remaining = MAX_TICKETS - roomCount;
  const full = remaining <= 0;
  const overflow = selected.length > 0 && selected.length > remaining;
  const canAdd = selected.length > 0 && !overflow && !full;
  const alreadyIn = listing.tickets.length - enabled.length;

  function toggle(id: string) {
    setExcluded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setExcluded(allSelected ? new Set(enabled.map((ticket) => ticket.id)) : new Set());
  }

  return (
    <div className="tk-picker">
      {listing.tickets.length === 0 && !busy ? (
        <p className="pp-muted">{emptyText}</p>
      ) : (
        <ul className="tk-pick-list">
          {listing.tickets.map((ticket) => {
            const added = roomIds.has(ticket.id);
            const checked = !added && !excluded.has(ticket.id);
            return (
              <li key={ticket.id}>
                <label className={cx("tk-pick", added && "is-added")}>
                  <input type="checkbox" checked={checked} disabled={added} onChange={() => toggle(ticket.id)} />
                  <span className="tk-pick-body">
                    <span className="tk-pick-id">{ticket.identifier}</span>
                    <span className="tk-pick-title">{ticket.title}</span>
                    <span className="tk-pick-meta">
                      {[ticket.stateName, ticket.assignee].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {added && <Chip tone="outline">Added</Chip>}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {busy && <Spinner label="Loading tickets" />}
      {onLoadMore && !busy && (
        <div>
          <PillButton variant="secondary" size="sm" onClick={onLoadMore}>
            Load more
          </PillButton>
        </div>
      )}
      {full && (
        <Alert tone="warn">{`This room already holds ${MAX_TICKETS} tickets. Remove some before adding more.`}</Alert>
      )}
      {!full && overflow && (
        <Alert tone="warn">{`Only ${plural(remaining, "more ticket")} fit in this room (limit ${MAX_TICKETS}). Deselect some to continue.`}</Alert>
      )}
      <div className="tk-picker-foot">
        <span className="tk-count">
          {selected.length} of {enabled.length} selected
          {alreadyIn > 0 ? ` · ${alreadyIn} already in room` : ""}
        </span>
        <div className="tk-picker-actions">
          <PillButton variant="ghost" size="sm" disabled={enabled.length === 0} onClick={toggleAll}>
            {allSelected ? "Select none" : "Select all"}
          </PillButton>
          <PillButton
            variant="primary"
            size="md"
            disabled={!canAdd}
            onClick={() => onAdd(selected)}
          >
            {`Add ${plural(selected.length, "ticket")}`}
          </PillButton>
        </div>
      </div>
    </div>
  );
}

type TabProps = {
  service: LinearService;
  roomIds: ReadonlySet<string>;
  roomCount: number;
  onAdd: (tickets: Ticket[]) => void;
};

function ViewGroup({
  title,
  views,
  selectedId,
  onPick,
}: {
  title: string;
  views: LinearView[];
  selectedId: string | null;
  onPick: (view: LinearView) => void;
}) {
  if (views.length === 0) return null;
  return (
    <section className="tk-group">
      <h3 className="tk-group-title">{title}</h3>
      <ul className="tk-views">
        {views.map((view) => (
          <li key={view.id}>
            <button
              type="button"
              className={cx("tk-view", selectedId === view.id && "is-on")}
              aria-pressed={selectedId === view.id}
              onClick={() => onPick(view)}
            >
              <span className="tk-view-head">
                <span className="tk-view-name">
                  {view.favorite && <span className="tk-view-star" aria-hidden="true">★</span>}
                  {view.name}
                </span>
                {view.teamKey && <Chip tone="outline">{view.teamKey}</Chip>}
              </span>
              {view.description && <span className="tk-view-desc">{view.description}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ViewsTab({ service, roomIds, roomCount, onAdd }: TabProps) {
  const viewsRequest = useRequests();
  const listing = useRequests();
  const [views, setViews] = useState<LinearView[] | null>(null);
  const [selected, setSelected] = useState<LinearView | null>(null);
  const [current, setCurrent] = useState<Listing | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const { run: loadViews } = viewsRequest;
  const { run: loadIssues } = listing;

  const hasViews = (views?.length ?? 0) > 0;
  const searching = query.trim() !== "";
  const total = views?.length ?? 0;

  useEffect(() => {
    loadViews(() => service.listViews(), setViews);
  }, [service, loadViews]);

  useEffect(() => {
    if (!hasViews) return;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [hasViews]);

  const arranged = useMemo(
    () => arrangeViews(views ?? [], query, selected?.id ?? null),
    [views, query, selected],
  );
  const visibleCount = arranged.favorites.length + arranged.shared.length + arranged.personal.length;

  function open(view: LinearView) {
    setSelected(view);
    setCurrent(null);
    loadIssues(
      () => service.issuesFromView(view.id),
      (page) => setCurrent(nextListing(page.tickets, page.nextCursor)),
    );
  }

  function loadMore() {
    if (!selected || !current?.nextCursor) return;
    const cursor = current.nextCursor;
    loadIssues(
      () => service.issuesFromView(selected.id, cursor),
      (page) =>
        setCurrent((previous) =>
          previous
            ? { gen: previous.gen, tickets: appendUnique(previous.tickets, page.tickets), nextCursor: page.nextCursor }
            : previous,
        ),
    );
  }

  return (
    <div className="tk-tab">
      {viewsRequest.busy && <Spinner label="Loading views" />}
      {viewsRequest.error && <Alert tone="error">{viewsRequest.error}</Alert>}
      {views && views.length === 0 && (
        <p className="pp-muted">No saved Linear views yet. Create one in Linear, or use another tab.</p>
      )}
      {hasViews && (
        <div className="tk-search-block">
          <div className="tk-search">
            <span className="tk-search-icon" aria-hidden="true">
              <Icon name="search" size={16} />
            </span>
            <input
              ref={searchRef}
              className="pp-input tk-search-input"
              type="search"
              aria-label="Search views"
              placeholder="Search views by name, description or team"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Escape" || query === "") return;
                event.preventDefault();
                event.stopPropagation();
                setQuery("");
              }}
            />
            {searching && (
              <button
                type="button"
                className="tk-search-clear"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
              >
                <Icon name="x" size={14} />
              </button>
            )}
          </div>
          <p className="tk-count" aria-live="polite">
            {searching ? `${visibleCount} of ${plural(total, "view")}` : plural(visibleCount, "view")}
          </p>
          {!searching && <p className="pp-muted">Showing your favourites and personal views. Search to find shared views.</p>}
        </div>
      )}
      {hasViews && visibleCount === 0 && searching && <p className="pp-muted">{`No views match "${query.trim()}".`}</p>}
      {hasViews && visibleCount === 0 && !searching && (
        <p className="pp-muted">You have no personal views yet. Search to find shared ones.</p>
      )}
      <ViewGroup title="Favourites" views={arranged.favorites} selectedId={selected?.id ?? null} onPick={open} />
      <ViewGroup title="Shared" views={arranged.shared} selectedId={selected?.id ?? null} onPick={open} />
      <ViewGroup title="Personal" views={arranged.personal} selectedId={selected?.id ?? null} onPick={open} />
      {listing.error && <Alert tone="error">{listing.error}</Alert>}
      {selected && listing.busy && !current && <Spinner label="Loading tickets" />}
      {selected && current && (
        <TicketPicker
          key={current.gen}
          listing={current}
          busy={listing.busy}
          roomIds={roomIds}
          roomCount={roomCount}
          emptyText="This view has no tickets right now."
          onAdd={onAdd}
          onLoadMore={current.nextCursor ? loadMore : null}
        />
      )}
    </div>
  );
}

function ProjectTab({ service, roomIds, roomCount, onAdd }: TabProps) {
  const projectsRequest = useRequests();
  const listing = useRequests();
  const [projects, setProjects] = useState<LinearProject[] | null>(null);
  const [selected, setSelected] = useState<LinearProject | null>(null);
  const [onlyUnestimated, setOnlyUnestimated] = useState(true);
  const [current, setCurrent] = useState<Listing | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { run: loadProjects } = projectsRequest;
  const { run: loadIssues, cancel } = listing;

  useEffect(() => {
    loadProjects(() => service.listProjects(), setProjects);
  }, [service, loadProjects]);

  useEffect(() => {
    if (!projects) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [projects]);

  function loadFirstPage(project: LinearProject, unestimated: boolean) {
    loadIssues(
      () => service.issuesFromProject(project.id, { onlyUnestimated: unestimated }),
      (page) => setCurrent(nextListing(page.tickets, page.nextCursor)),
    );
  }

  function pick(project: LinearProject) {
    setSelected(project);
    setCurrent(null);
    loadFirstPage(project, onlyUnestimated);
  }

  function clearProject() {
    setSelected(null);
    setCurrent(null);
    cancel();
  }

  function changeFilter(value: boolean) {
    setOnlyUnestimated(value);
    if (!selected) return;
    setCurrent(null);
    loadFirstPage(selected, value);
  }

  function loadMore() {
    if (!selected || !current?.nextCursor) return;
    const cursor = current.nextCursor;
    loadIssues(
      () => service.issuesFromProject(selected.id, { onlyUnestimated }, cursor),
      (page) =>
        setCurrent((previous) =>
          previous
            ? { gen: previous.gen, tickets: appendUnique(previous.tickets, page.tickets), nextCursor: page.nextCursor }
            : previous,
        ),
    );
  }

  return (
    <div className="tk-tab">
      {projectsRequest.busy && <Spinner label="Loading projects" />}
      {projectsRequest.error && <Alert tone="error">{projectsRequest.error}</Alert>}
      {projects && projects.length === 0 && (
        <p className="pp-muted">No projects in your Linear workspace yet. Create one in Linear, or use another tab.</p>
      )}
      {projects && projects.length > 0 && (
        <ProjectCombobox projects={projects} inputRef={inputRef} onPick={pick} />
      )}
      {selected && (
        <div className="tk-project-chip-row">
          <span className="tk-project-chip">
            <span className="tk-project-chip-name">{selected.name}</span>
            <button
              type="button"
              className="tk-project-chip-x"
              aria-label={`Clear project ${selected.name}`}
              onClick={clearProject}
            >
              <Icon name="x" size={12} />
            </button>
          </span>
        </div>
      )}
      {selected && (
        <Toggle
          checked={onlyUnestimated}
          onChange={changeFilter}
          label="Only Todo tickets without an estimate"
        />
      )}
      {selected && listing.error && <Alert tone="error">{listing.error}</Alert>}
      {selected && listing.busy && !current && <Spinner label="Loading tickets" />}
      {selected && current && (
        <TicketPicker
          key={current.gen}
          listing={current}
          busy={listing.busy}
          roomIds={roomIds}
          roomCount={roomCount}
          emptyText={
            onlyUnestimated
              ? `No Todo tickets without an estimate in ${selected.name}.`
              : `${selected.name} has no open tickets.`
          }
          onAdd={onAdd}
          onLoadMore={current.nextCursor ? loadMore : null}
        />
      )}
    </div>
  );
}

function PasteTab({
  service,
  roomIds,
  roomCount,
  onAdd,
  text,
  onTextChange,
}: TabProps & { text: string; onTextChange: (value: string) => void }) {
  const listing = useRequests();
  const [current, setCurrent] = useState<Listing | null>(null);
  const [notFound, setNotFound] = useState<string[]>([]);
  const refs = useMemo(() => parseRefs(text), [text]);
  const { run: loadRefs } = listing;

  function fetchRefs() {
    if (refs.length === 0) return;
    setNotFound([]);
    loadRefs(
      () => service.issuesByRefs(refs),
      (result) => {
        setNotFound(result.notFound);
        setCurrent(nextListing(result.tickets, null));
      },
    );
  }

  return (
    <div className="tk-tab">
      <label className="tk-field">
        <span className="pp-field-label">Identifiers or Linear links</span>
        <textarea
          className="tk-textarea"
          rows={5}
          value={text}
          placeholder={"CLFP-12\nhttps://linear.app/your-team/issue/CLFP-13/title"}
          onChange={(event) => onTextChange(event.target.value)}
        />
      </label>
      <p className="pp-muted" aria-live="polite">
        {refs.length > 0 ? `Found: ${refs.join(", ")}` : "Paste identifiers or links, one per line or mixed into text."}
      </p>
      <div>
        <PillButton variant="secondary" size="sm" disabled={refs.length === 0 || listing.busy} onClick={fetchRefs}>
          Fetch tickets
        </PillButton>
      </div>
      {listing.busy && <Spinner label="Fetching from Linear" />}
      {listing.error && <Alert tone="error">{listing.error}</Alert>}
      {notFound.length > 0 && <Alert tone="warn">{`Not found in Linear: ${notFound.join(", ")}`}</Alert>}
      {current && (
        <TicketPicker
          key={current.gen}
          listing={current}
          busy={listing.busy}
          roomIds={roomIds}
          roomCount={roomCount}
          emptyText="None of those tickets could be loaded."
          onAdd={onAdd}
          onLoadMore={null}
        />
      )}
    </div>
  );
}

function SearchTab({
  service,
  roomIds,
  roomCount,
  onAdd,
  query,
  onQueryChange,
}: TabProps & { query: string; onQueryChange: (value: string) => void }) {
  const listing = useRequests();
  const [current, setCurrent] = useState<Listing | null>(null);
  const { run: loadSearch, cancel } = listing;

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      cancel();
      setCurrent(null);
      return;
    }
    const timer = window.setTimeout(() => {
      loadSearch(
        () => service.searchIssues(term),
        (tickets) => setCurrent(nextListing(tickets, null)),
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      cancel();
    };
  }, [query, service, loadSearch, cancel]);

  const term = query.trim();

  return (
    <div className="tk-tab">
      <label className="tk-field">
        <span className="pp-field-label">Search Linear</span>
        <input
          className="pp-input"
          type="search"
          value={query}
          placeholder="Search by ticket ID (CTTP-1234, CTTP-12 or just 1234) or by title"
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>
      {!term && <p className="pp-muted">Type a full or partial ticket ID, or a few words from the title.</p>}
      {listing.busy && <Spinner label="Searching" />}
      {listing.error && <Alert tone="error">{listing.error}</Alert>}
      {term && current && (
        <TicketPicker
          key={current.gen}
          listing={current}
          busy={listing.busy}
          roomIds={roomIds}
          roomCount={roomCount}
          emptyText={`No tickets match "${term}".`}
          onAdd={onAdd}
          onLoadMore={null}
        />
      )}
    </div>
  );
}

function ImportBody({ onDone }: { onDone: () => void }) {
  const { service } = useLinear();
  const { state, send } = useRoomApi();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("views");
  const [pasteText, setPasteText] = useState("");
  const [query, setQuery] = useState("");
  const entries = state?.tickets ?? [];
  const roomIds = useMemo(() => new Set(entries.map((entry) => entry.ticket.id)), [entries]);

  if (!service) {
    return <p className="pp-muted">Linear is not connected for this room. Create a new room to sign in.</p>;
  }

  function addTickets(tickets: Ticket[]) {
    const prepared = tickets.map((ticket) => ({ ...ticket, description: trimDescription(ticket.description) }));
    send({ type: "addTickets", tickets: prepared });
    if (service) requestReferences(service, prepared, entries, state?.references ?? {}, send);
    toast(`Added ${plural(prepared.length, "ticket")}`, "success");
    onDone();
  }

  const shared: TabProps = { service, roomIds, roomCount: entries.length, onAdd: addTickets };

  return (
    <div className="tk-import">
      <div className="tk-segment" role="tablist" aria-label="Import source">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tk-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls="tk-tabpanel"
            className={cx(tab === item.id && "is-on")}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="tk-tabpanel" aria-labelledby={`tk-tab-${tab}`}>
        {tab === "views" && <ViewsTab {...shared} />}
        {tab === "project" && <ProjectTab {...shared} />}
        {tab === "paste" && <PasteTab {...shared} text={pasteText} onTextChange={setPasteText} />}
        {tab === "search" && <SearchTab {...shared} query={query} onQueryChange={setQuery} />}
      </div>
    </div>
  );
}

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Import tickets" wide>
      <ImportBody onDone={onClose} />
    </Modal>
  );
}
