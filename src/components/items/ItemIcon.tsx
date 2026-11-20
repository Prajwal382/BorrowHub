import type { ReactNode } from "react";

// Categories are free text set by administrators, so match on keywords and fall back to a box.
const ICONS: { match: RegExp; paths: ReactNode }[] = [
  {
    match: /camera|photo|video/i,
    paths: (
      <>
        <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
        <circle cx="12" cy="13" r="3.5" />
      </>
    ),
  },
  {
    match: /laptop|computer|notebook/i,
    paths: (
      <>
        <rect x="4" y="5" width="16" height="11" rx="1.5" />
        <path d="M2 19h20" />
      </>
    ),
  },
  {
    match: /projector/i,
    paths: (
      <>
        <rect x="3" y="8" width="18" height="9" rx="2" />
        <circle cx="15" cy="12.5" r="2.5" />
        <path d="M6 12h3" />
      </>
    ),
  },
  {
    match: /audio|mic|sound|recorder/i,
    paths: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <path d="M12 18v3" />
      </>
    ),
  },
  {
    match: /tablet|ipad/i,
    paths: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M11 18h2" />
      </>
    ),
  },
  {
    match: /vr|headset/i,
    paths: (
      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4l-2-2h-2l-2 2H5a2 2 0 0 1-2-2z" />
    ),
  },
];

const FALLBACK = (
  <>
    <path d="M3 7l9-4 9 4-9 4z" />
    <path d="M3 7v10l9 4 9-4V7" />
    <path d="M12 11v10" />
  </>
);

// Decorative only: the item's name and category are always written next to it.
export function ItemIcon({
  name,
  category,
  size = 48,
}: {
  name: string;
  category: string;
  size?: number;
}) {
  // The category decides first, so "Rode VideoMic" in Audio gets a mic, not a camera.
  const paths =
    ICONS.find((icon) => icon.match.test(category))?.paths ??
    ICONS.find((icon) => icon.match.test(name))?.paths ??
    FALLBACK;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}
