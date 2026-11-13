import React, { useId, useState } from "react";

const Accordion = ({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) => {
  const [show, setShow] = useState(false);
  const panelId = useId();
  const buttonId = `${panelId}-button`;

  return (
    <div className={`accordion ${show ? "active" : ""} ${className}`}>
      <button
        id={buttonId}
        className="accordion-header"
        aria-expanded={show}
        aria-controls={panelId}
        onClick={() => setShow(!show)}
      >
        {title}
        <svg
          className="accordion-icon"
          x="0px"
          y="0px"
          viewBox="0 0 512 512"
          xmlSpace="preserve"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M505.755,123.592c-8.341-8.341-21.824-8.341-30.165,0L256.005,343.176L36.421,123.592c-8.341-8.341-21.824-8.341-30.165,0 s-8.341,21.824,0,30.165l234.667,234.667c4.16,4.16,9.621,6.251,15.083,6.251c5.462,0,10.923-2.091,15.083-6.251l234.667-234.667 C514.096,145.416,514.096,131.933,505.755,123.592z"
          ></path>
        </svg>
      </button>
      {/* `hidden` removes the collapsed panel from the accessibility tree
        and tab order; the max-height open/close animation still runs on
        expand (the attribute is removed together with the class change). */}
      <div
        id={panelId}
        className="accordion-content"
        role="region"
        aria-labelledby={buttonId}
        hidden={!show}
      >
        {children}
      </div>
    </div>
  );
};

export default Accordion;
