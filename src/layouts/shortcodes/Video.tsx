import React from "react";

type VideoProps = {
  title: string;
  width?: number;
  height?: number | "auto";
  src: string;
  // Extra attributes passed through to <video> (e.g. loop, muted, poster).
  [key: string]: string | number | boolean | undefined;
};

function Video({
  title,
  width = 500,
  height = "auto",
  src,
  ...rest
}: VideoProps) {
  // No captions file exists for the videos this shortcode plays (demo
  // content); a <track> without a src is invalid HTML, so the rule
  // cannot be satisfied without a real captions (.vtt) asset. If
  // captioned video is ever needed, add a `captions` prop plus a .vtt
  // file and render a <track kind="captions"> for it.
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- see note above
    <video
      className="overflow-hidden rounded-lg"
      width={width}
      height={height}
      controls
      {...rest}
    >
      <source
        src={src.match(/^http/) ? src : `/videos/${src}`}
        type="video/mp4"
      />
      {title}
    </video>
  );
}

export default Video;
