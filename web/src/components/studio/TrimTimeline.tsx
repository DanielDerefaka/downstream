import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Chapter, TrimRange } from '@shared/types.ts';
import { duration as formatDuration, parseTimecode, timecode } from '@/lib/format.ts';
import { ScissorsIcon } from '@/components/Icons.tsx';

const BAR_COUNT = 120;
const MIN_SELECTION = 0.5;
const CHAPTER_HOVER_PX = 9;

/**
 * Hash-based, not Math.random: the bar heights are read on every render (and
 * every pointermove during a drag), so they have to be a pure function of the
 * index or the waveform would boil while the user scrubs.
 */
function seededHeight(index: number): number {
  const hash = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  const noise = hash - Math.floor(hash);
  const swell = 0.5 + 0.5 * Math.sin(index / 8.7) * Math.cos(index / 21.3 + 1.1);
  return 0.14 + (noise * 0.55 + swell * 0.45) * 0.86;
}

const BAR_HEIGHTS: readonly number[] = Array.from({ length: BAR_COUNT }, (_, i) => seededHeight(i));

function clamp(n: number, min: number, max: number): number {
  if (max < min) return min;
  return n < min ? min : n > max ? max : n;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

type DragMode = 'start' | 'end' | 'region';
type DragState = { mode: DragMode; grab: number; len: number };
type HoverChapter = { title: string; left: number };

export default function TrimTimeline({
  duration,
  chapters,
  value,
  onChange,
  disabled = false,
}: {
  duration: number;
  chapters: Chapter[];
  value: TrimRange;
  onChange: (r: TrimRange) => void;
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState<DragMode | null>(null);
  const [hover, setHover] = useState<HoverChapter | null>(null);

  const total = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const minGap = Math.min(MIN_SELECTION, total);

  const start = clamp(Math.min(value.start, value.end), 0, total);
  const end = clamp(Math.max(value.start, value.end), start, total);
  const length = end - start;

  const pct = useCallback((t: number) => (total > 0 ? (t / total) * 100 : 0), [total]);

  const commit = useCallback(
    (next: TrimRange) => {
      if (next.start === start && next.end === end) return;
      onChange({ start: round(next.start), end: round(next.end) });
    },
    [onChange, start, end],
  );

  const timeAt = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || total <= 0) return 0;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      return clamp(((clientX - rect.left) / rect.width) * total, 0, total);
    },
    [total],
  );

  const applyDrag = useCallback(
    (clientX: number) => {
      const drag = dragRef.current;
      if (!drag) return;
      const t = timeAt(clientX);
      if (drag.mode === 'start') {
        commit({ start: clamp(t, 0, end - minGap), end });
      } else if (drag.mode === 'end') {
        commit({ start, end: clamp(t, start + minGap, total) });
      } else {
        const nextStart = clamp(t - drag.grab, 0, Math.max(0, total - drag.len));
        commit({ start: nextStart, end: Math.min(total, nextStart + drag.len) });
      }
    },
    [commit, end, minGap, start, timeAt, total],
  );

  const beginDrag = useCallback(
    (mode: DragMode, e: ReactPointerEvent<HTMLElement>) => {
      const track = trackRef.current;
      if (disabled || total <= 0 || !track) return;
      e.preventDefault();
      // Capture on the track (not the handle) so a single pair of move/up
      // handlers owns the gesture, and so a fast flick that leaves the element
      // — or the window — still scrubs instead of silently dropping.
      track.setPointerCapture(e.pointerId);
      dragRef.current = { mode, grab: timeAt(e.clientX) - start, len: length };
      setDragging(mode);
      setHover(null);
    },
    [disabled, length, start, timeAt, total],
  );

  const onTrackPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled || total <= 0) return;
      const t = timeAt(e.clientX);
      const mode: DragMode = Math.abs(t - start) <= Math.abs(t - end) ? 'start' : 'end';
      beginDrag(mode, e);
      dragRef.current = { mode, grab: 0, len: length };
      if (mode === 'start') commit({ start: clamp(t, 0, end - minGap), end });
      else commit({ start, end: clamp(t, start + minGap, total) });
    },
    [beginDrag, commit, disabled, end, length, minGap, start, timeAt, total],
  );

  const onTrackPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (dragRef.current) {
        applyDrag(e.clientX);
        return;
      }
      const el = trackRef.current;
      if (!el || chapters.length === 0 || total <= 0) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      const x = e.clientX - rect.left;
      let best: HoverChapter | null = null;
      let bestDist = CHAPTER_HOVER_PX;
      for (const chapter of chapters) {
        const cx = (clamp(chapter.start, 0, total) / total) * rect.width;
        const dist = Math.abs(cx - x);
        if (dist < bestDist) {
          bestDist = dist;
          best = { title: chapter.title, left: (cx / rect.width) * 100 };
        }
      }
      setHover((prev) => {
        if (prev === best) return prev;
        if (prev && best && prev.title === best.title && Math.abs(prev.left - best.left) < 0.01) {
          return prev;
        }
        return best;
      });
    },
    [applyDrag, chapters, disabled, total],
  );

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const nudge = useCallback(
    (which: 'start' | 'end', delta: number) => {
      if (which === 'start') commit({ start: clamp(start + delta, 0, end - minGap), end });
      else commit({ start, end: clamp(end + delta, start + minGap, total) });
    },
    [commit, end, minGap, start, total],
  );

  const onHandleKeyDown = useCallback(
    (which: 'start' | 'end', e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (disabled || total <= 0) return;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        nudge(which, -step);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        nudge(which, step);
      } else if (e.key === 'Home') {
        e.preventDefault();
        if (which === 'start') commit({ start: 0, end });
        else commit({ start, end: start + minGap });
      } else if (e.key === 'End') {
        e.preventDefault();
        if (which === 'start') commit({ start: end - minGap, end });
        else commit({ start, end: total });
      }
    },
    [commit, disabled, end, minGap, nudge, start, total],
  );

  const presets = useMemo(
    () => [
      { key: 'full', label: 'Full', range: { start: 0, end: total } },
      { key: 'first30', label: 'First 30s', range: { start: 0, end: Math.min(30, total) } },
      { key: 'first60', label: 'First 60s', range: { start: 0, end: Math.min(60, total) } },
      { key: 'last30', label: 'Last 30s', range: { start: Math.max(0, total - 30), end: total } },
    ],
    [total],
  );

  const bars = useMemo(() => {
    const cell = total > 0 ? total / BAR_COUNT : 0;
    return BAR_HEIGHTS.map((height, i) => {
      const center = (i + 0.5) * cell;
      return { height, inside: total > 0 && center >= start && center <= end };
    });
  }, [end, start, total]);

  return (
    <div
      className={`flex flex-col gap-3.5 transition-opacity duration-200 ${
        disabled ? 'pointer-events-none opacity-45' : 'opacity-100'
      }`}
    >
      <div className="flex items-end gap-3">
        <TimeField
          label="Start"
          seconds={start}
          disabled={disabled}
          onCommit={(next) => commit({ start: clamp(next, 0, end - minGap), end })}
        />

        <div className="flex flex-1 flex-col items-center gap-0.5 pb-1">
          <span className="flex items-center gap-1.5 text-[10px] font-medium tracking-[0.14em] text-chalk-faint uppercase">
            <ScissorsIcon size={12} />
            Clip length
          </span>
          <span className="tabular text-[19px] leading-none font-semibold text-iris-300">
            {timecode(length)}
          </span>
          <span className="tabular text-[10.5px] text-chalk-faint">
            of {formatDuration(total)}
          </span>
        </div>

        <TimeField
          label="End"
          align="right"
          seconds={end}
          disabled={disabled}
          onCommit={(next) => commit({ start, end: clamp(next, start + minGap, total) })}
        />
      </div>

      <div className="relative">
        <AnimatePresence>
          {hover && (
            <motion.div
              key={hover.title}
              initial={{ opacity: 0, y: 4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}
              style={{ left: `${hover.left}%` }}
              className="pointer-events-none absolute bottom-full z-30 mb-2 max-w-[220px] -translate-x-1/2 truncate rounded-[8px] surface-3 px-2.5 py-1.5 text-[11px] whitespace-nowrap text-chalk"
            >
              {hover.title}
            </motion.div>
          )}
        </AnimatePresence>

        <div
          ref={trackRef}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={() => {
            if (!dragRef.current) setHover(null);
          }}
          className="drag-none relative h-16 w-full cursor-pointer touch-none rounded-[var(--radius-panel)] surface-2 shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.07)]"
        >
          <div className="absolute inset-0 flex items-center gap-px overflow-hidden rounded-[inherit] px-1.5">
            {bars.map((bar, i) => (
              <span
                key={i}
                style={{ height: `${bar.height * 74}%` }}
                className={`flex-1 rounded-[1px] transition-[background-color,opacity] duration-150 ${
                  bar.inside ? 'bg-iris-400 opacity-95' : 'bg-chalk-ghost opacity-25'
                }`}
              />
            ))}
          </div>

          <div
            className="pointer-events-none absolute inset-y-0 left-0 rounded-l-[inherit] bg-ink-1000/45"
            style={{ width: `${pct(start)}%` }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 right-0 rounded-r-[inherit] bg-ink-1000/45"
            style={{ width: `${100 - pct(end)}%` }}
          />

          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
            {chapters.map((chapter, i) => (
              <span
                key={`${chapter.start}-${i}`}
                style={{ left: `${pct(clamp(chapter.start, 0, total))}%` }}
                className={`absolute inset-y-1.5 w-px transition-colors duration-150 ${
                  hover && hover.title === chapter.title ? 'bg-chalk/80' : 'bg-chalk/25'
                }`}
              />
            ))}
          </div>

          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              beginDrag('region', e);
            }}
            style={{ left: `${pct(start)}%`, width: `${Math.max(0, pct(end) - pct(start))}%` }}
            className={`absolute inset-y-0 rounded-[6px] bg-iris-500/10 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-iris-500)_38%,transparent)] transition-[background-color,box-shadow] duration-200 ${
              dragging === 'region'
                ? 'cursor-grabbing bg-iris-500/18'
                : 'cursor-grab hover:bg-iris-500/16'
            }`}
          />

          <Handle
            which="start"
            time={start}
            leftPct={pct(start)}
            total={total}
            active={dragging === 'start'}
            disabled={disabled}
            onPointerDown={(e) => {
              e.stopPropagation();
              beginDrag('start', e);
            }}
            onKeyDown={(e) => onHandleKeyDown('start', e)}
          />
          <Handle
            which="end"
            time={end}
            leftPct={pct(end)}
            total={total}
            active={dragging === 'end'}
            disabled={disabled}
            onPointerDown={(e) => {
              e.stopPropagation();
              beginDrag('end', e);
            }}
            onKeyDown={(e) => onHandleKeyDown('end', e)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {presets.map((preset) => {
          const active =
            Math.abs(preset.range.start - start) < 0.05 && Math.abs(preset.range.end - end) < 0.05;
          return (
            <button
              key={preset.key}
              type="button"
              disabled={disabled || total <= 0}
              onClick={() => commit(preset.range)}
              className={`btn-ghost rounded-full px-3 py-1.5 text-[11.5px] font-medium transition-colors ${
                active ? 'text-iris-300' : 'text-chalk-dim hover:text-chalk'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Handle({
  which,
  time,
  leftPct,
  total,
  active,
  disabled,
  onPointerDown,
  onKeyDown,
}: {
  which: 'start' | 'end';
  time: number;
  leftPct: number;
  total: number;
  active: boolean;
  disabled: boolean;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={which === 'start' ? 'Clip start' : 'Clip end'}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={time}
      aria-valuetext={timecode(time)}
      aria-orientation="horizontal"
      aria-disabled={disabled || undefined}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      style={{ left: `${leftPct}%` }}
      className="group absolute inset-y-0 z-20 -ml-[11px] flex w-[22px] cursor-ew-resize touch-none items-center justify-center rounded-[8px] focus-visible:outline-none"
    >
      <span
        className={`absolute inset-y-1 w-[2px] rounded-full transition-colors duration-150 ${
          active ? 'bg-iris-300' : 'bg-iris-400/70 group-hover:bg-iris-300'
        }`}
      />
      <motion.span
        initial={false}
        animate={{ scale: active ? 1.12 : 1 }}
        whileHover={{ scale: 1.12 }}
        transition={{ type: 'spring', stiffness: 480, damping: 26 }}
        className="relative flex h-[26px] w-[12px] items-center justify-center gap-[2px] rounded-[6px] bg-gradient-to-b from-iris-300 to-iris-500 shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.5),0_3px_10px_-2px_rgb(0_0_0_/_0.7)] group-focus-visible:ring-2 group-focus-visible:ring-iris-300 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-ink-900"
      >
        <span className="h-[10px] w-px rounded-full bg-ink-1000/45" />
        <span className="h-[10px] w-px rounded-full bg-ink-1000/45" />
      </motion.span>
    </div>
  );
}

function TimeField({
  label,
  seconds,
  disabled,
  onCommit,
  align = 'left',
}: {
  label: string;
  seconds: number;
  disabled: boolean;
  onCommit: (next: number) => void;
  align?: 'left' | 'right';
}) {
  const [text, setText] = useState(() => timecode(seconds));
  const [focused, setFocused] = useState(false);

  // While the field has focus the user's raw text wins; the slider only writes
  // back into it once they have left the field.
  useEffect(() => {
    if (!focused) setText(timecode(seconds));
  }, [seconds, focused]);

  const commitText = () => {
    const parsed = parseTimecode(text);
    if (parsed === null || !Number.isFinite(parsed)) {
      setText(timecode(seconds));
      return;
    }
    onCommit(parsed);
  };

  return (
    <label className="flex w-[104px] flex-col gap-1.5">
      <span
        className={`text-[10px] font-medium tracking-[0.14em] text-chalk-faint uppercase ${
          align === 'right' ? 'text-right' : ''
        }`}
      >
        {label}
      </span>
      <span className="input-field flex items-center rounded-[var(--radius-control)] px-2.5 py-2">
        <input
          value={text}
          disabled={disabled}
          inputMode="numeric"
          spellCheck={false}
          autoComplete="off"
          aria-label={`${label} timecode`}
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => {
            setFocused(true);
            e.currentTarget.select();
          }}
          onBlur={() => {
            setFocused(false);
            commitText();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setText(timecode(seconds));
              e.currentTarget.blur();
            }
          }}
          className={`tabular w-full bg-transparent font-mono text-[13px] text-chalk outline-none placeholder:text-chalk-ghost disabled:cursor-not-allowed ${
            align === 'right' ? 'text-right' : ''
          }`}
        />
      </span>
    </label>
  );
}
