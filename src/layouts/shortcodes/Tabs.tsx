import { marked } from "marked";
import React, { useEffect, useRef, useState } from "react";

// Tabs shortcode: <Tabs><Tab name="…">…</Tab>…</Tabs> in MDX.
// The Tab children arrive as one HTML string on `children.props.value`
// (see Tab.tsx); tab names/content are parsed out of the
// `<div data-name="…">` chunks. Content is author-controlled MDX, parsed
// with marked — the same trust boundary as the rest of the content.
const Tabs = ({
  children,
}: {
  children: React.ReactElement<{ value?: string }>;
}) => {
  const [active, setActive] = useState<number>(0);
  const [defaultFocus, setDefaultFocus] = useState<boolean>(false);

  const tabRefs = useRef<(HTMLLIElement | null)[]>([]);
  useEffect(() => {
    if (defaultFocus) {
      tabRefs.current[active]?.focus();
    } else {
      setDefaultFocus(true);
    }
  }, [active, defaultFocus]);

  const tabLinks = Array.from(
    (children.props.value ?? "").matchAll(
      /<div\s+data-name="([^"]+)"[^>]*>((?:.|\n)*?)<\/div>/g,
    ),
    (match: RegExpMatchArray) => ({ name: match[1], children: match[0] }),
  );

  const activateTab = (index: number) => {
    setActive(((index % tabLinks.length) + tabLinks.length) % tabLinks.length);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<EventTarget>,
    index: number,
  ) => {
    // Space must not scroll the page when it activates a tab.
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activateTab(index);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      activateTab(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      activateTab(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      activateTab(0);
    } else if (event.key === "End") {
      event.preventDefault();
      activateTab(tabLinks.length - 1);
    }
  };

  return (
    <div className="tab">
      <ul className="tab-nav" role="tablist">
        {tabLinks.map(
          (item: { name: string; children: string }, index: number) => (
            <li
              key={index}
              id={`tab-${index}`}
              className={`tab-nav-item ${index === active ? "active" : ""}`}
              role="tab"
              aria-selected={index === active}
              aria-controls={`tabpanel-${index}`}
              tabIndex={index === active ? 0 : -1}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onClick={() => setActive(index)}
              ref={(ref) => {
                tabRefs.current[index] = ref;
              }}
            >
              {item.name}
            </li>
          ),
        )}
      </ul>
      {tabLinks.map((item: { name: string; children: string }, i: number) => (
        <div
          id={`tabpanel-${i}`}
          className={active === i ? "tab-content block px-5" : "hidden"}
          role="tabpanel"
          aria-labelledby={`tab-${i}`}
          hidden={active !== i}
          key={i}
          dangerouslySetInnerHTML={{
            __html: marked.parse(item.children, { async: false }),
          }}
        />
      ))}
    </div>
  );
};

export default Tabs;
