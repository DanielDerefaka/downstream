import { motion } from 'framer-motion';
import type { ComponentType, SVGProps } from 'react';
import { OTHER_PLATFORM, PLATFORMS, type PlatformId } from '@/lib/platforms.ts';
import {
  GlobeGlyph,
  InstagramGlyph,
  TikTokGlyph,
  XGlyph,
  YouTubeGlyph,
} from '@/components/Icons.tsx';

const GLYPHS: Record<PlatformId, ComponentType<SVGProps<SVGSVGElement> & { size?: number }>> = {
  youtube: YouTubeGlyph,
  x: XGlyph,
  tiktok: TikTokGlyph,
  instagram: InstagramGlyph,
  other: GlobeGlyph,
};

interface Props {
  /** The tab the user picked, or the one detected from what they typed. */
  active: PlatformId;
  /** True when `active` came from parsing the field rather than a click. */
  detected: boolean;
  onSelect: (id: PlatformId) => void;
}

export default function PlatformNav({ active, detected, onSelect }: Props) {
  const tabs = [...PLATFORMS, OTHER_PLATFORM];

  return (
    <div
      role="tablist"
      aria-label="Video source"
      className="surface-2 flex gap-0.5 rounded-[var(--radius-panel)] p-1"
    >
      {tabs.map((platform) => {
        const Glyph = GLYPHS[platform.id];
        const isActive = platform.id === active;
        return (
          <button
            key={platform.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onSelect(platform.id)}
            title={platform.name}
            className={[
              'relative flex flex-1 items-center justify-center gap-1.5 rounded-[9px] px-2 py-2',
              'text-[12px] font-medium drag-none transition-colors duration-200',
              isActive ? 'text-white' : 'text-chalk-faint hover:text-chalk-dim',
            ].join(' ')}
          >
            {isActive && (
              <motion.span
                layoutId="platform-nav-pill"
                transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                className="absolute inset-0 rounded-[9px]"
                style={{
                  background:
                    'linear-gradient(120deg, var(--color-iris-600), var(--color-iris-500) 60%, var(--color-iris-400))',
                  boxShadow: 'inset 0 1px 0 0 rgb(255 255 255 / 0.3)',
                }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              <Glyph size={14} />
              {/* The label is noise at phone widths; the glyph carries it. */}
              <span className="hidden sm:inline">{platform.name}</span>
            </span>
            {isActive && detected && (
              <span
                className="absolute -top-px -right-px h-1.5 w-1.5 rounded-full bg-white/90"
                title="Detected from your link"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
