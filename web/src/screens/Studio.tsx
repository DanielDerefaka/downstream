import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '@/state/store.ts';
import { bytes, duration as fmtDuration, timecode } from '@/lib/format.ts';
import MediaStage from '@/components/studio/MediaStage.tsx';
import TrimTimeline from '@/components/studio/TrimTimeline.tsx';
import FormatLadder from '@/components/studio/FormatLadder.tsx';
import {
  ArrowLeftIcon,
  DownloadIcon,
  LayersIcon,
  ScissorsIcon,
} from '@/components/Icons.tsx';

export default function Studio() {
  const media = useStore((s) => s.media);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const selectedRungId = useStore((s) => s.selectedRungId);
  const selectRung = useStore((s) => s.selectRung);
  const trim = useStore((s) => s.trim);
  const setTrim = useStore((s) => s.setTrim);
  const trimEnabled = useStore((s) => s.trimEnabled);
  const setTrimEnabled = useStore((s) => s.setTrimEnabled);
  const preciseCut = useStore((s) => s.preciseCut);
  const setPreciseCut = useStore((s) => s.setPreciseCut);
  const selectedSubtitles = useStore((s) => s.selectedSubtitles);
  const toggleSubtitle = useStore((s) => s.toggleSubtitle);
  const startDownload = useStore((s) => s.startDownload);
  const startPlaylistDownload = useStore((s) => s.startPlaylistDownload);
  const reset = useStore((s) => s.reset);

  const selected = useMemo(() => {
    if (!media || !selectedRungId) return null;
    return (
      media.video.find((r) => r.id === selectedRungId) ??
      media.audio.find((r) => r.id === selectedRungId) ??
      null
    );
  }, [media, selectedRungId]);

  if (!media) return null;

  const clipLength = trim ? Math.max(0, trim.end - trim.start) : (media.duration ?? 0);
  const isClipped =
    trimEnabled && media.duration !== null && clipLength < media.duration - 0.05;

  /**
   * When the user trims, the estimate must shrink with the selection — showing
   * the full-length size next to a 30-second clip is the kind of small lie that
   * makes a tool feel untrustworthy.
   */
  const estimatedBytes = useMemo(() => {
    if (!selected?.bytes) return null;
    if (!isClipped || !media.duration) return selected.bytes;
    return Math.round(selected.bytes * (clipLength / media.duration));
  }, [selected, isClipped, clipLength, media.duration]);

  const container =
    selected && 'container' in selected ? selected.container.toUpperCase() : null;
  const audioFormat = selected && 'format' in selected ? selected.format.toUpperCase() : null;

  return (
    <div className="flex min-h-full flex-col px-5 pt-4 pb-6 sm:px-7">
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={reset}
          className="btn-ghost flex h-8 items-center gap-1.5 rounded-[9px] pr-3 pl-2 text-[12.5px] text-chalk-dim"
        >
          <ArrowLeftIcon size={15} />
          New link
        </button>
        {media.playlist && (
          <div className="flex min-w-0 items-center gap-2 rounded-[9px] bg-iris-600/12 px-3 py-1.5 text-[12px] text-iris-300 ring-1 ring-iris-500/25 ring-inset">
            <LayersIcon size={14} className="shrink-0" />
            <span className="truncate">
              Playlist · {media.playlist.count} videos
            </span>
          </div>
        )}
      </div>

      <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
        {/* ---------------------------------------------------- left column */}
        <div className="flex min-w-0 flex-col gap-4">
          <MediaStage media={media} />

          {media.duration !== null && !media.isLive && (
            <div className="surface-2 hatch rounded-[var(--radius-panel)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <ScissorsIcon size={16} className={trimEnabled ? 'text-iris-400' : 'text-chalk-faint'} />
                  <div>
                    <p className="text-[13px] font-medium text-chalk">Trim before downloading</p>
                    <p className="text-[11.5px] text-chalk-faint">
                      Only the selected range is fetched — a 30s cut of a 4K film costs 30s of
                      bandwidth.
                    </p>
                  </div>
                </div>
                <button
                  role="switch"
                  aria-checked={trimEnabled}
                  aria-label="Trim before downloading"
                  onClick={() => setTrimEnabled(!trimEnabled)}
                  className="relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors duration-200"
                  style={{
                    background: trimEnabled
                      ? 'linear-gradient(120deg, var(--color-iris-600), var(--color-iris-400))'
                      : 'rgb(255 255 255 / 0.09)',
                  }}
                >
                  <motion.span
                    layout
                    transition={{ type: 'spring', stiffness: 620, damping: 34 }}
                    className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-sm"
                    style={{ left: trimEnabled ? 23 : 3 }}
                  />
                </button>
              </div>

              <AnimatePresence initial={false}>
                {trimEnabled && trim && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="pt-4">
                      <TrimTimeline
                        duration={media.duration}
                        chapters={media.chapters}
                        value={trim}
                        onChange={setTrim}
                      />

                      <div className="mt-4 flex items-start gap-2.5 border-t border-white/[0.06] pt-3.5">
                        <button
                          role="switch"
                          aria-checked={preciseCut}
                          aria-label="Frame-accurate cut"
                          onClick={() => setPreciseCut(!preciseCut)}
                          className="relative mt-px h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200"
                          style={{
                            background: preciseCut
                              ? 'linear-gradient(120deg, var(--color-iris-600), var(--color-iris-400))'
                              : 'rgb(255 255 255 / 0.09)',
                          }}
                        >
                          <motion.span
                            layout
                            transition={{ type: 'spring', stiffness: 620, damping: 34 }}
                            className="absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm"
                            style={{ left: preciseCut ? 19 : 3 }}
                          />
                        </button>
                        <div className="min-w-0">
                          <p className="text-[12.5px] font-medium text-chalk">
                            Frame-accurate cut
                          </p>
                          <p className="text-[11.5px] leading-relaxed text-chalk-faint">
                            {preciseCut
                              ? 'Exact to the millisecond. The clip is re-encoded, so it lands as H.264 rather than the codec above.'
                              : `Lossless — keeps the original ${
                                  selected && 'codec' in selected
                                    ? selected.codec === 'h264'
                                      ? 'H.264'
                                      : selected.codec.toUpperCase()
                                    : 'stream'
                                }. Starts at the nearest keyframe, usually within a second or two.`}
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* --------------------------------------------------- right column */}
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="surface-2 flex min-h-[300px] flex-1 flex-col rounded-[var(--radius-panel)] p-4">
            <FormatLadder
              media={media}
              tab={tab}
              selectedId={selectedRungId}
              onSelect={selectRung}
              onTabChange={setTab}
              subtitles={media.subtitles}
              selectedSubtitles={selectedSubtitles}
              onToggleSubtitle={toggleSubtitle}
            />
          </div>

          <div className="mt-4">
            <button
              onClick={() => void startDownload()}
              disabled={!selected}
              className="btn-primary flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[var(--radius-control)] text-[15px] font-semibold text-white"
            >
              <DownloadIcon size={18} />
              {selected ? `Download ${selected.label}` : 'Pick a format'}
            </button>

            {selected && (
              <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11.5px] text-chalk-faint">
                <span className="tabular">
                  {estimatedBytes ? `~${bytes(estimatedBytes)}` : 'size unknown'}
                </span>
                <span className="text-chalk-ghost">·</span>
                <span>{container ?? audioFormat}</span>
                <span className="text-chalk-ghost">·</span>
                <span className="tabular">
                  {isClipped && trim ? (
                    <span className="text-iris-300">
                      {timecode(trim.start, 0)}–{timecode(trim.end, 0)} ({fmtDuration(clipLength)})
                    </span>
                  ) : (
                    fmtDuration(media.duration)
                  )}
                </span>
                {selectedSubtitles.length > 0 && tab === 'video' && (
                  <>
                    <span className="text-chalk-ghost">·</span>
                    <span>
                      {selectedSubtitles.length} caption
                      {selectedSubtitles.length === 1 ? '' : 's'}
                    </span>
                  </>
                )}
              </div>
            )}

            {media.playlist && (
              <button
                onClick={() => void startPlaylistDownload()}
                disabled={!selected}
                className="btn-ghost mt-2.5 flex h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] text-[13px] text-chalk-dim"
              >
                <LayersIcon size={15} />
                Queue all {media.playlist.count} at this quality
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
