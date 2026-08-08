import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { MediaProbe, SubtitleTrack } from '@shared/types.ts';
import { ChevronDownIcon, FilmIcon, MusicIcon, SubtitlesIcon } from '@/components/Icons.tsx';
import { AudioRungRow, VideoRungRow } from '@/components/studio/RungRow.tsx';

type Tab = 'video' | 'audio';

const TABS: { id: Tab; label: string; Icon: typeof FilmIcon }[] = [
  { id: 'video', label: 'Video', Icon: FilmIcon },
  { id: 'audio', label: 'Audio', Icon: MusicIcon },
];

const SUBTITLE_PREVIEW = 12;

interface FormatLadderProps {
  media: MediaProbe;
  tab: Tab;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onTabChange: (tab: Tab) => void;
  subtitles: SubtitleTrack[];
  selectedSubtitles: string[];
  onToggleSubtitle: (lang: string) => void;
}

export default function FormatLadder({
  media,
  tab,
  selectedId,
  onSelect,
  onTabChange,
  subtitles,
  selectedSubtitles,
  onToggleSubtitle,
}: FormatLadderProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const maxBytes = useMemo(() => {
    const source = tab === 'video' ? media.video : media.audio;
    return source.reduce((max, rung) => (rung.bytes !== null && rung.bytes > max ? rung.bytes : max), 0);
  }, [media, tab]);

  const isEmpty = tab === 'video' ? media.video.length === 0 : media.audio.length === 0;

  // role="radio" children own arrow-key traversal; clicking the focused one keeps
  // selection and focus in sync the way a native radio group behaves.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight';
    const back = event.key === 'ArrowUp' || event.key === 'ArrowLeft';
    if (!forward && !back) return;
    const container = listRef.current;
    if (!container) return;

    const nodes = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    if (nodes.length === 0) return;

    event.preventDefault();
    const focused = nodes.findIndex((node) => node === document.activeElement);
    const checked = nodes.findIndex((node) => node.getAttribute('aria-checked') === 'true');
    const from = focused !== -1 ? focused : checked !== -1 ? checked : 0;
    const target = nodes[(from + (forward ? 1 : -1) + nodes.length) % nodes.length];
    if (!target) return;
    target.focus();
    target.click();
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div
        role="tablist"
        aria-label="Download format"
        className="surface-2 relative flex gap-1 rounded-[var(--radius-panel)] p-1"
      >
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(id)}
              className={[
                'relative flex flex-1 items-center justify-center gap-2 rounded-[9px] px-3 py-2 text-[13px] font-medium drag-none',
                'transition-[color,transform] duration-200 ease-[var(--ease-spring)] active:scale-[0.98]',
                active ? 'text-chalk' : 'text-chalk-faint hover:text-chalk-dim',
              ].join(' ')}
            >
              {active && (
                <motion.span
                  layoutId="format-ladder-tab"
                  aria-hidden="true"
                  className="absolute inset-0 rounded-[9px]"
                  style={{
                    background:
                      'linear-gradient(140deg, color-mix(in oklab, var(--color-iris-600) 90%, transparent), color-mix(in oklab, var(--color-iris-500) 70%, transparent))',
                    boxShadow:
                      'inset 0 1px 0 0 rgb(255 255 255 / 0.28), 0 6px 18px -8px color-mix(in oklab, var(--color-iris-600) 90%, transparent)',
                  }}
                  transition={{ type: 'spring', stiffness: 460, damping: 36, mass: 0.7 }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <Icon size={15} />
                {label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="h-full"
          >
            {isEmpty ? (
              <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
                <p className="text-[13px] text-chalk-dim">
                  No {tab} formats for this source
                </p>
                <p className="text-[11.5px] text-chalk-faint">
                  Try the other tab, or paste a different link.
                </p>
              </div>
            ) : (
              <div
                ref={listRef}
                role="radiogroup"
                aria-label={tab === 'video' ? 'Video quality' : 'Audio quality'}
                onKeyDown={handleKeyDown}
                className="mask-fade-y flex h-full flex-col gap-1 overflow-y-auto py-1 pr-1"
              >
                {tab === 'video'
                  ? media.video.map((rung) => (
                      <VideoRungRow
                        key={rung.id}
                        rung={rung}
                        maxBytes={maxBytes}
                        selected={rung.id === selectedId}
                        onSelect={() => onSelect(rung.id)}
                      />
                    ))
                  : media.audio.map((rung) => (
                      <AudioRungRow
                        key={rung.id}
                        rung={rung}
                        maxBytes={maxBytes}
                        selected={rung.id === selectedId}
                        onSelect={() => onSelect(rung.id)}
                      />
                    ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {tab === 'video' && (
        <SubtitleSection
          subtitles={subtitles}
          selectedSubtitles={selectedSubtitles}
          onToggleSubtitle={onToggleSubtitle}
        />
      )}
    </div>
  );
}

function SubtitleSection({
  subtitles,
  selectedSubtitles,
  onToggleSubtitle,
}: {
  subtitles: SubtitleTrack[];
  selectedSubtitles: string[];
  onToggleSubtitle: (lang: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  if (subtitles.length === 0) return null;

  const chosen = new Set(selectedSubtitles);
  const visible = showAll ? subtitles : subtitles.slice(0, SUBTITLE_PREVIEW);
  const hidden = subtitles.length - visible.length;

  return (
    <div className="surface-2 overflow-hidden rounded-[var(--radius-panel)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="row-interactive flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left drag-none"
      >
        <SubtitlesIcon size={16} className="shrink-0 text-chalk-faint" />
        <span className="flex-1 text-[13px] font-medium text-chalk">Subtitles</span>
        <span className="tabular text-[11.5px] text-chalk-faint">
          {chosen.size > 0 ? `${chosen.size} selected` : `${subtitles.length} available`}
        </span>
        <motion.span
          aria-hidden="true"
          className="text-chalk-faint"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <ChevronDownIcon size={15} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="tracks"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-1.5 px-3.5 pb-3 pt-0.5">
              {visible.map((track) => {
                const on = chosen.has(track.lang);
                return (
                  <button
                    key={`${track.lang}:${track.auto ? 'auto' : 'authored'}`}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onToggleSubtitle(track.lang)}
                    className={[
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium drag-none',
                      'transition-[background,box-shadow,transform,color] duration-200 ease-[var(--ease-spring)]',
                      'active:scale-[0.96]',
                      on
                        ? 'bg-iris-600/25 text-iris-300 shadow-[inset_0_0_0_1px_var(--color-iris-500)]'
                        : 'bg-white/5 text-chalk-dim shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)] hover:bg-white/10 hover:text-chalk',
                    ].join(' ')}
                  >
                    {track.label || track.lang}
                    {track.auto && (
                      <span className="text-[9px] uppercase tracking-[0.08em] text-chalk-faint">
                        auto
                      </span>
                    )}
                  </button>
                );
              })}

              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="btn-ghost inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-medium text-chalk-dim drag-none"
                >
                  Show all {subtitles.length}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
