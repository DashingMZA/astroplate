import searchData from "../../../.json/search.json";
import config from "@/config/config.json";
import { escapeRegExp } from "@/lib/utils/seo";
import React, { useEffect, useRef, useState } from "react";
import SearchResult from "./SearchResult";
import type { ISearchItem } from "./searchTypes";

const { default_language } = config.settings;

// Search modal (client-side regex search over .json/search.json).
// Accessibility contract:
// - role="dialog" + aria-modal + aria-label so AT announces the modal.
// - Focus moves into the input on open, is trapped inside while open, and
//   returns to the trigger that opened it on close.
// - The document-level keydown listener is registered ONCE (empty deps);
//   arrow-key handling fires only while the modal is open, and Ctrl/Cmd+K
//   is preventDefaulted only when it opens/focuses the modal.
// - Enter/exit animation is a plain CSS transition (search.css), not
//   motion: motion/react adds ~144 KB to this chunk for a 150 ms fade, and
//   motion/react-mini has no AnimatePresence for the exit. The modal stays
//   mounted while closed (visibility hidden + inert + aria-hidden) so the
//   exit transition can play. (Motion removal pulled forward from 0dac79d:
//   motion is not installed.)
// - While closed the modal is inert + aria-hidden so it is not focusable
//   or announced.
const SearchModal = ({ lang }: { lang: string | undefined }) => {
  lang = lang || default_language;
  const [searchString, setSearchString] = useState("");
  const [open, setOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The trigger that opened the modal, so focus can return to it on close.
  const lastTriggerRef = useRef<Element | null>(null);
  const selectedIndexRef = useRef(-1);
  // Refs mirror state for the once-registered document listeners.
  const openRef = useRef(false);

  const prefersReducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const openModal = (trigger: Element | null) => {
    lastTriggerRef.current = trigger;
    openRef.current = true;
    setOpen(true);
  };

  const closeModal = () => {
    openRef.current = false;
    setOpen(false);
    // Return focus to the trigger that opened the modal.
    const trigger = lastTriggerRef.current;
    if (trigger instanceof HTMLElement) {
      trigger.focus();
    }
    lastTriggerRef.current = null;
  };

  // handle input change
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchString(e.currentTarget.value.replace("\\", "").toLowerCase());
  };

  // generate search result
  const doSearch = (searchData: ISearchItem[]) => {
    const regex = new RegExp(escapeRegExp(searchString), "gi");
    if (searchString === "") {
      return [];
    } else {
      const searchResult = searchData.filter((item) => {
        const title = item.frontmatter.title.toLowerCase().match(regex);
        const description = item.frontmatter.description
          ?.toLowerCase()
          .match(regex);
        const categories = item.frontmatter.categories
          ?.join(" ")
          .toLowerCase()
          .match(regex);
        const tags = item.frontmatter.tags
          ?.join(" ")
          .toLowerCase()
          .match(regex);
        const content = item.content.toLowerCase().match(regex);

        if (title || content || description || categories || tags) {
          return item;
        }
      });
      return searchResult;
    }
  };

  // filter language specific search data
  const filterSearchData = searchData.filter((item) => item.lang === lang);

  // get search result
  const startTime = performance.now();
  const searchResult = doSearch(filterSearchData);
  const endTime = performance.now();
  const totalTime = ((endTime - startTime) / 1000).toFixed(3);

  // New results invalidate the arrow-key selection.
  useEffect(() => {
    selectedIndexRef.current = -1;
  }, [searchString]);

  // Focus the input whenever the modal opens.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open ]);

  // Register trigger + document listeners exactly once.
  useEffect(() => {
    const searchModalTriggers = document.querySelectorAll(
      "[data-search-trigger]",
    );

    const onTriggerClick = (event: Event) => {
      openModal(event.currentTarget as Element);
    };
    searchModalTriggers.forEach((button) => {
      button.addEventListener("click", onTriggerClick);
    });

    const getResultItems = () =>
      modalRef.current?.querySelectorAll(".search-result-item") ?? [];

    const updateSelection = () => {
      const items = getResultItems();
      items.forEach((item, index) => {
        item.classList.toggle(
          "search-result-item-active",
          index === selectedIndexRef.current,
        );
      });
      // Smooth scrolling is disabled for reduced-motion users.
      items[selectedIndexRef.current]?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "nearest",
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // Ctrl/Cmd+K opens (or focuses) the modal; prevent the browser's
      // own Ctrl+K behaviour only for this shortcut.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!openRef.current) {
          openModal(document.activeElement);
        } else {
          inputRef.current?.focus();
        }
        return;
      }

      // Everything below applies only while the modal is open — arrow keys
      // must not hijack page scrolling when it is closed.
      if (!openRef.current) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }

      // Focus trap: Tab cycles within the modal instead of escaping to the
      // background page.
      if (event.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) {
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const items = getResultItems();
        if (event.key === "ArrowUp" && selectedIndexRef.current > 0) {
          selectedIndexRef.current--;
        } else if (
          event.key === "ArrowDown" &&
          selectedIndexRef.current < items.length - 1
        ) {
          selectedIndexRef.current++;
        }
        updateSelection();
        return;
      }

      if (event.key === "Enter") {
        const activeLink = modalRef.current?.querySelector(
          ".search-result-item-active a",
        ) as HTMLAnchorElement | null;
        if (activeLink) {
          activeLink.click();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      searchModalTriggers.forEach((button) => {
        button.removeEventListener("click", onTriggerClick);
      });
    };
    // Deliberately []: the handlers read state through refs so they never
    // go stale, and re-binding on every keystroke (the old [searchString]
    // dep) also re-registered the trigger listeners each time.
  }, []);

  return (
    <div
      id="searchModal"
      ref={modalRef}
      className={open ? "search-modal show" : "search-modal"}
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      aria-hidden={!open}
      inert={!open}
    >
          {/* Full-screen close control (a real button, not a clickable div). */}
          <button
            type="button"
            aria-label="Close search"
            className="search-modal-overlay"
            onClick={closeModal}
          />
          <div className="search-wrapper">
            <div className="search-wrapper-header">
              <label htmlFor="searchInput" className="sr-only">
                Search the site
              </label>
              {searchString ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearchString("");
                    inputRef.current?.focus();
                  }}
                  className="absolute left-7 top-[calc(50%-7px)] cursor-pointer hover:text-red-500"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 512 512"
                    height="18"
                    width="18"
                    className="-mt-0.5"
                  >
                    <path
                      fill="currentcolor"
                      d="M256 512A256 256 0 10256 0a256 256 0 100 512zM175 175c9.4-9.4 24.6-9.4 33.9.0l47 47 47-47c9.4-9.4 24.6-9.4 33.9.0s9.4 24.6.0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6.0 33.9s-24.6 9.4-33.9.0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9.0s-9.4-24.6.0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6.0-33.9z"
                    ></path>
                  </svg>
                </button>
              ) : (
                <span
                  aria-hidden="true"
                  className="absolute left-7 top-[calc(50%-7px)]"
                >
                  <svg
                    viewBox="0 0 512 512"
                    height="18"
                    width="18"
                    className="-mt-0.5"
                  >
                    <path
                      fill="currentcolor"
                      d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8.0 45.3s-32.8 12.5-45.3.0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9.0 208S93.1.0 208 0 416 93.1 416 208zM208 352a144 144 0 100-288 144 144 0 100 288z"
                    ></path>
                  </svg>
                </span>
              )}
              <input
                id="searchInput"
                ref={inputRef}
                placeholder="Search..."
                className="search-wrapper-header-input"
                type="search"
                name="search"
                value={searchString}
                onChange={handleSearch}
                autoComplete="off"
              />
            </div>
            <SearchResult
              searchResult={searchResult}
              searchString={searchString}
              lang={lang}
            />
            <div className="search-wrapper-footer">
              <span className="flex items-center">
                <kbd>
                  <svg
                    width="14"
                    height="14"
                    fill="currentcolor"
                    viewBox="0 0 16 16"
                  >
                    <path d="M3.204 11h9.592L8 5.519 3.204 11zm-.753-.659 4.796-5.48a1 1 0 011.506.0l4.796 5.48c.566.647.106 1.659-.753 1.659H3.204a1 1 0 01-.753-1.659z"></path>
                  </svg>
                </kbd>
                <kbd>
                  <svg
                    width="14"
                    height="14"
                    fill="currentcolor"
                    viewBox="0 0 16 16"
                  >
                    <path d="M3.204 5h9.592L8 10.481 3.204 5zm-.753.659 4.796 5.48a1 1 0 001.506.0l4.796-5.48c.566-.647.106-1.659-.753-1.659H3.204a1 1 0 00-.753 1.659z"></path>
                  </svg>
                </kbd>
                to navigate
              </span>
              <span className="flex items-center">
                <kbd>
                  <svg
                    width="12"
                    height="12"
                    fill="currentcolor"
                    viewBox="0 0 16 16"
                  >
                    <path
                      fillRule="evenodd"
                      d="M14.5 1.5a.5.5.0 01.5.5v4.8a2.5 2.5.0 01-2.5 2.5H2.707l3.347 3.346a.5.5.0 01-.708.708l-4.2-4.2a.5.5.0 010-.708l4-4a.5.5.0 11.708.708L2.707 8.3H12.5A1.5 1.5.0 0014 6.8V2a.5.5.0 01.5-.5z"
                    ></path>
                  </svg>
                </kbd>
                to select
              </span>
              {searchString && (
                <span aria-live="polite">
                  <strong>{searchResult.length} </strong> results - in{" "}
                  <strong>{totalTime} </strong> seconds
                </span>
              )}
              <span>
                <kbd>ESC</kbd> to close
              </span>
            </div>
          </div>
    </div>
  );
};

export default SearchModal;
