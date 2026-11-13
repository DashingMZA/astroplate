import type { ComponentType, HTMLAttributes } from "react";
import { useEffect } from "react";

// `lite-youtube` is a custom element (web component); React's JSX
// namespace does not know it. Typing the tag as a component keeps its
// props checked without a global JSX augmentation (banned by the lint
// config) or @ts-ignore, so a typo in a prop name is still a type error.
type LiteYoutubeProps = HTMLAttributes<HTMLElement> & {
  videoid: string;
  videotitle: string;
  [key: string]: unknown;
};

const LiteYoutube =
  "lite-youtube" as unknown as ComponentType<LiteYoutubeProps>;

const Youtube = ({
  id,
  title,
  ...rest
}: {
  id: string;
  title: string;
  // Extra attributes passed through to <lite-youtube>.
  [key: string]: string | number | boolean | undefined;
}) => {
  useEffect(() => {
    import("@justinribeiro/lite-youtube");
  }, []);

  return (
    <LiteYoutube
      className="rounded-lg"
      videoid={id}
      videotitle={title}
      {...rest}
    />
  );
};

export default Youtube;
