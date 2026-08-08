/**
 * Hand-drawn icon set on a 24px grid, 1.7px strokes, round caps.
 *
 * Rolled by hand rather than pulled from a library so the weight matches Inter
 * at the sizes we use it, and so the whole set ships in one file with no
 * tree-shaking guesswork.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M4 20h16" />
  </Svg>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12h15" />
    <path d="m13 6 6 6-6 6" />
  </Svg>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12H5" />
    <path d="m11 6-6 6 6 6" />
  </Svg>
);

export const PlayIcon = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M8 5.2c0-.9 1-1.5 1.8-1L19 11a1.2 1.2 0 0 1 0 2l-9.2 6.8c-.8.5-1.8-.1-1.8-1z" />
  </Svg>
);

export const PauseIcon = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <rect x="7" y="5" width="3.6" height="14" rx="1.3" />
    <rect x="13.4" y="5" width="3.6" height="14" rx="1.3" />
  </Svg>
);

export const ScissorsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="6" r="2.6" />
    <circle cx="6" cy="18" r="2.6" />
    <path d="M8.1 7.9 20 18" />
    <path d="M8.1 16.1 20 6" />
  </Svg>
);

export const MusicIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 18V5.5l11-2V16" />
    <circle cx="6.5" cy="18" r="2.6" />
    <circle cx="17.5" cy="16" r="2.6" />
  </Svg>
);

export const FilmIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.4" />
    <path d="M8 4.5v15M16 4.5v15M3 12h18M3 8.2h5M3 15.8h5M16 8.2h5M16 15.8h5" />
  </Svg>
);

export const LayersIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </Svg>
);

export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.5v2.6M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1 5.3 5.3" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5" />
    <circle cx="12" cy="16.4" r="0.9" fill="currentColor" stroke="none" />
  </Svg>
);

export const RetryIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4v4.5h-4.5" />
  </Svg>
);

export const FolderIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7.5A2 2 0 0 1 5 5.5h3.6a2 2 0 0 1 1.5.7l1 1.2H19a2 2 0 0 1 2 2v7.1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 7h15" />
    <path d="M9.5 7V5.2a1.2 1.2 0 0 1 1.2-1.2h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
    <path d="M6.6 7l.8 11.2a1.8 1.8 0 0 0 1.8 1.7h5.6a1.8 1.8 0 0 0 1.8-1.7L17.4 7" />
  </Svg>
);

export const ClipboardIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8" y="3.2" width="8" height="4" rx="1.4" />
    <path d="M16 5.4h1.8A2 2 0 0 1 19.8 7.4v11.4a2 2 0 0 1-2 2H6.2a2 2 0 0 1-2-2V7.4a2 2 0 0 1 2-2H8" />
  </Svg>
);

export const SparkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.2 13.9 9l5.8 1.9-5.8 1.9L12 18.6 10.1 12.8 4.3 10.9 10.1 9Z" />
    <path d="M18.5 3.5v3M20 5h-3" />
  </Svg>
);

export const SubtitlesIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.4" />
    <path d="M7 14.2h4M13.5 14.2H17M7 10.6h2.5M12 10.6H17" />
  </Svg>
);

export const HdrIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.6v2.2M12 19.2v2.2M21.4 12h-2.2M4.8 12H2.6M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6 17 17M7 7 5.4 5.4" />
  </Svg>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9.5 6 6 6-6" />
  </Svg>
);

export const QueueIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6.5h11M4 12h11M4 17.5h7" />
    <path d="M18.5 12v7.5" />
    <path d="m15.8 17 2.7 2.7 2.7-2.7" />
  </Svg>
);

export const LinkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.2 13.8a4 4 0 0 0 5.7 0l2.9-2.9a4 4 0 0 0-5.7-5.7l-1.5 1.5" />
    <path d="M13.8 10.2a4 4 0 0 0-5.7 0l-2.9 2.9a4 4 0 1 0 5.7 5.7l1.5-1.5" />
  </Svg>
);

/* ------------------------------------------------------------- platforms */
/* Simplified monochrome glyphs, drawn to read at 16px rather than to
   reproduce each company's exact mark. */

export const YouTubeGlyph = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M22.6 7.2a2.9 2.9 0 0 0-2-2C18.8 4.7 12 4.7 12 4.7s-6.8 0-8.6.5a2.9 2.9 0 0 0-2 2C1 9 1 12 1 12s0 3 .4 4.8a2.9 2.9 0 0 0 2 2c1.8.5 8.6.5 8.6.5s6.8 0 8.6-.5a2.9 2.9 0 0 0 2-2C23 15 23 12 23 12s0-3-.4-4.8ZM9.8 15.3V8.7l5.7 3.3-5.7 3.3Z" />
  </Svg>
);

export const XGlyph = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M17.7 3h3.3l-7.2 8.3L22.3 21h-6.6l-5.2-6.8L4.6 21H1.3l7.7-8.8L1.7 3h6.8l4.7 6.2L17.7 3Zm-1.2 16h1.8L7.6 4.8H5.7L16.5 19Z" />
  </Svg>
);

export const TikTokGlyph = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M16.6 2h-3.1v13.2a2.6 2.6 0 1 1-2-2.5v-3.2a5.8 5.8 0 1 0 5.1 5.7V8.9a7 7 0 0 0 4.1 1.3V7.1a4.1 4.1 0 0 1-4.1-4.1V2Z" />
  </Svg>
);

export const InstagramGlyph = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="3.8" />
    <circle cx="17.2" cy="6.8" r="1.05" fill="currentColor" stroke="none" />
  </Svg>
);

export const GlobeGlyph = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3.3 9h17.4M3.3 15h17.4" />
    <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18Z" />
  </Svg>
);

/** The Downstream mark: a downward chevron cradled by a play triangle. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="ds-mark" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7C6BFF" />
          <stop offset="0.55" stopColor="#9A85FF" />
          <stop offset="1" stopColor="#D3C8FF" />
        </linearGradient>
        <linearGradient id="ds-sheen" x1="8" y1="6" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity="0.42" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="37" height="37" rx="11.5" fill="url(#ds-mark)" />
      <rect x="1.5" y="1.5" width="37" height="37" rx="11.5" fill="url(#ds-sheen)" />
      <rect
        x="1.5"
        y="1.5"
        width="37"
        height="37"
        rx="11.5"
        stroke="white"
        strokeOpacity="0.28"
        strokeWidth="1.2"
      />
      <path
        d="M20 10.5v13.2"
        stroke="#0B0B15"
        strokeOpacity="0.85"
        strokeWidth="2.9"
        strokeLinecap="round"
      />
      <path
        d="m14.6 18.6 5.4 5.4 5.4-5.4"
        stroke="#0B0B15"
        strokeOpacity="0.85"
        strokeWidth="2.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12.5 28.8h15" stroke="#0B0B15" strokeOpacity="0.5" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
