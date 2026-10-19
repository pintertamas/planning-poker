import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { matchProjects } from "../../linear/projectSearch";
import type { LinearProject } from "../../linear/types";
import { Chip, Icon } from "../../ui";
import { cx } from "../../ui/cx";

type ProjectComboboxProps = {
  projects: LinearProject[];
  inputRef: RefObject<HTMLInputElement>;
  onPick: (project: LinearProject) => void;
};

export type PanelPlacement = { top: number; left: number; width: number; maxHeight: number };

const PANEL_GAP = 8;
const PANEL_MAX_HEIGHT = 412;
const PANEL_MIN_HEIGHT = 120;
const VIEWPORT_MARGIN = 16;

export function placePanel(anchor: Pick<DOMRect, "bottom" | "left" | "width">, viewportHeight: number): PanelPlacement {
  const top = anchor.bottom + PANEL_GAP;
  const room = viewportHeight - top - VIEWPORT_MARGIN;
  return {
    top,
    left: anchor.left,
    width: anchor.width,
    maxHeight: Math.max(PANEL_MIN_HEIGHT, Math.min(PANEL_MAX_HEIGHT, room)),
  };
}

export function ProjectCombobox({ projects, inputRef, onPick }: ProjectComboboxProps) {
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<PanelPlacement | null>(null);

  const options = useMemo(() => matchProjects(projects, query), [projects, query]);
  const activeIndex = Math.min(active, Math.max(options.length - 1, 0));
  const activeOption = options[activeIndex];
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!open || !input) return;
    function place() {
      if (!input) return;
      setPlacement(placePanel(input.getBoundingClientRect(), window.innerHeight));
    }
    place();
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [open, inputRef]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || options.length === 0) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, options.length]);

  function choose(project: LinearProject) {
    onPick(project);
    setQuery("");
    setActive(0);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (options.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + options.length) % options.length);
      return;
    }
    if (event.key === "Enter") {
      if (!open || !activeOption) return;
      event.preventDefault();
      choose(activeOption);
      return;
    }
    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className="tk-combo" ref={rootRef}>
      <div className="tk-search">
        <span className="tk-search-icon" aria-hidden="true">
          <Icon name="search" size={16} />
        </span>
        <input
          ref={inputRef}
          className="pp-input tk-search-input"
          type="search"
          role="combobox"
          aria-label="Search projects"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-activedescendant={open && activeOption ? optionId(activeIndex) : undefined}
          autoComplete="off"
          placeholder="Search projects by name or paste a project link"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {query !== "" && (
          <button
            type="button"
            className="tk-search-clear"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setActive(0);
              inputRef.current?.focus();
            }}
          >
            <Icon name="x" size={14} />
          </button>
        )}
      </div>
      {open &&
        placement &&
        createPortal(
          <ul
            ref={panelRef}
            id={listboxId}
            role="listbox"
            aria-label="Projects"
            className="tk-combo-panel"
            style={{ top: placement.top, left: placement.left, width: placement.width, maxHeight: placement.maxHeight }}
          >
            {options.length === 0 ? (
              <li role="presentation" className="tk-combo-empty">
                No projects match
              </li>
            ) : (
              options.map((project, index) => (
                <li
                  key={project.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={cx("tk-combo-option", index === activeIndex && "is-active")}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(project)}
                >
                  <span className="tk-combo-name">{project.name}</span>
                  <span className="tk-combo-meta">
                    {project.teamKeys.map((key) => (
                      <Chip key={key} tone="outline">
                        {key}
                      </Chip>
                    ))}
                    <span className="tk-combo-status">{project.stateName}</span>
                  </span>
                </li>
              ))
            )}
          </ul>,
          document.body,
        )}
    </div>
  );
}
