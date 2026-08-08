import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { MediaProbe, VideoRung } from '@shared/types.ts';
import { compactNumber, duration as formatDuration, uploadDate } from '@/lib/format.ts';
import { HdrIcon, PlayIcon, SparkIcon } from '@/components/Icons.tsx';

type Capability = { key: string; label: string; kind: 'res' | 'hdr' };

function deriveCapabilities(rungs: VideoRung[]): Capability[] {
  let tallest = 0;
  let hdr = false;
  for (const rung of rungs) {
    if (Number.isFinite(rung.height) && rung.height > tallest) tallest = rung.height;
    if (rung.hdr) hdr = true;
  }
  const pills: Capability[] = [];
  if (tallest >= 4320) pills.push({ key: '8k', label: '8K', kind: 'res' });
  else if (tallest >= 2160) pills.push({ key: '4k', label: '4K', kind: 'res' });
  if (hdr) pills.push({ key: 'hdr', label: 'HDR', kind: 'hdr' });
  return pills;
}

function isYouTubeish(extractor: string | null | undefined): boolean {
  return typeof extractor === 'string' && /youtu/i.test(extractor);
}

function Dot() {
  return <span className="text-chalk-ghost select-none">·</span>;
}

export default function MediaStage({ media }: { media: MediaProbe }) {
  const [frameReady, setFrameReady] = useState(false);

  const capabilities = useMemo(() => deriveCapabilities(media.video), [media.video]);

  /**
   * Vertical sources (TikTok, Reels, Shorts) would sit in a 16:9 box as a
   * sliver between two black bars. Take the aspect from the best rung and cap
   * it so an extreme ratio cannot push the format list off screen.
   */
  const stageStyle = useMemo(() => {
    const best = media.video.find((r) => r.width > 0 && r.height > 0);
    const ratio = best ? best.width / best.height : 16 / 9;
    if (ratio >= 1) return { aspectRatio: '16 / 9', width: '100%' };
    // Drive a portrait stage from its height, so a 9:16 clip fills the column
    // vertically instead of stretching it to roughly a thousand pixels tall.
    return {
      aspectRatio: `${Math.max(ratio, 0.5).toFixed(4)} / 1`,
      height: 'min(58vh, 460px)',
      width: 'auto',
    };
  }, [media.video]);

  const embeddable = isYouTubeish(media.extractor) && media.id.trim().length > 0;
  const embedSrc = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(
    media.id,
  )}?rel=0&modestbranding=1&enablejsapi=1`;

  const chips = useMemo(() => {
    const out: { key: string; label: string }[] = [];
    if (media.channel) out.push({ key: 'channel', label: media.channel });
    if (media.isLive) out.push({ key: 'live', label: 'Live' });
    else if (media.duration !== null && Number.isFinite(media.duration)) {
      out.push({ key: 'duration', label: formatDuration(media.duration) });
    }
    if (media.viewCount !== null && media.viewCount !== undefined) {
      out.push({ key: 'views', label: `${compactNumber(media.viewCount)} views` });
    }
    const uploaded = uploadDate(media.uploadDate);
    if (uploaded) out.push({ key: 'uploaded', label: uploaded });
    return out;
  }, [media.channel, media.isLive, media.duration, media.viewCount, media.uploadDate]);

  return (
    <section className="flex flex-col gap-3.5">
      <div
        style={stageStyle}
        className="relative mx-auto max-w-full overflow-hidden rounded-[var(--radius-panel)] bg-ink-950 shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.08),0_18px_46px_-22px_rgb(0_0_0_/_0.9)]"
      >
        {media.thumbnail ? (
          <img
            src={media.thumbnail}
            alt=""
            aria-hidden="true"
            className={`drag-none absolute inset-0 h-full w-full scale-110 object-cover blur-xl transition-opacity duration-500 ${
              frameReady && embeddable ? 'opacity-0' : 'opacity-45'
            }`}
          />
        ) : (
          <div className="hatch absolute inset-0 bg-ink-900" />
        )}

        {embeddable ? (
          <>
            <iframe
              src={embedSrc}
              title={media.title || 'Video preview'}
              onLoad={() => setFrameReady(true)}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0"
            />
            {!frameReady && (
              <div className="animate-shimmer pointer-events-none absolute inset-0 overflow-hidden" />
            )}
          </>
        ) : (
          <a
            href={media.webpageUrl || media.url}
            target="_blank"
            rel="noreferrer noopener"
            className="group absolute inset-0 block focus-visible:outline-none"
            aria-label={`Open ${media.title || 'this video'} in a new tab`}
          >
            {media.thumbnail && (
              <img
                src={media.thumbnail}
                alt=""
                aria-hidden="true"
                className="drag-none absolute inset-0 h-full w-full object-cover transition-transform duration-700 [transition-timing-function:var(--ease-out-soft)] group-hover:scale-[1.03]"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-ink-1000/80 via-ink-1000/10 to-transparent" />
            <div className="absolute inset-0 grid place-items-center">
              <motion.span
                initial={false}
                whileHover={{ scale: 1.07 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                className="grid h-16 w-16 place-items-center rounded-full bg-ink-900/70 pl-1 text-chalk shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.18),0_10px_30px_-8px_rgb(0_0_0_/_0.8)] backdrop-blur-md"
              >
                <PlayIcon size={26} />
              </motion.span>
            </div>
            <span className="absolute bottom-3 left-3 rounded-full bg-ink-1000/70 px-2.5 py-1 text-[11px] font-medium text-chalk-dim backdrop-blur-sm">
              Open original
            </span>
          </a>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="line-clamp-2 text-[15px] leading-snug font-semibold text-chalk">
          {media.title || 'Untitled'}
        </h2>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-chalk-dim">
          {chips.map((chip, i) => (
            <span key={chip.key} className="flex items-center gap-2">
              {i > 0 && <Dot />}
              <span className={chip.key === 'channel' ? 'font-medium text-chalk' : 'tabular'}>
                {chip.label}
              </span>
            </span>
          ))}

          {capabilities.length > 0 && (
            <span className="flex items-center gap-1.5 pl-0.5">
              {chips.length > 0 && <Dot />}
              {capabilities.map((cap) => (
                <span
                  key={cap.key}
                  className="inline-flex items-center gap-1 rounded-full bg-iris-600/16 px-2 py-[3px] text-[10.5px] font-semibold tracking-wide text-iris-300 uppercase shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-iris-500)_40%,transparent)]"
                >
                  {cap.kind === 'hdr' ? <HdrIcon size={11} /> : <SparkIcon size={11} />}
                  {cap.label}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
