import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AudioRung, VideoRung } from '@shared/types.ts';
import { bytes } from '@/lib/format.ts';
import { CheckIcon } from '@/components/Icons.tsx';
import { CodecBadge, HdrBadge, Pill } from '@/components/studio/CodecBadge.tsx';

interface ShellProps {
  label: string;
  tier: string;
  badges: ReactNode;
  sizeBytes: number | null;
  approximate: boolean;
  maxBytes: number;
  selected: boolean;
  onSelect: () => void;
  ariaLabel: string;
}

function RungShell({
  label,
  tier,
  badges,
  sizeBytes,
  approximate,
  maxBytes,
  selected,
  onSelect,
  ariaLabel,
}: ShellProps) {
  // maxBytes can legitimately be 0 when every rung's size is unknown.
  const ratio = sizeBytes !== null && maxBytes > 0 ? Math.min(1, sizeBytes / maxBytes) : 0;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={ariaLabel}
      onClick={onSelect}
      className={[
        'group relative flex w-full items-center gap-3 rounded-[var(--radius-panel)] py-2.5 pl-3.5 pr-3 text-left drag-none',
        'transition-[background,box-shadow,transform] duration-200 ease-[var(--ease-spring)]',
        'active:scale-[0.994] active:duration-75',
        selected ? 'row-selected' : 'row-interactive hover:-translate-y-px',
      ].join(' ')}
    >
      <span className="flex w-[92px] shrink-0 flex-col gap-0.5">
        <span
          className={`tabular text-[15px] font-semibold leading-none ${
            selected ? 'text-chalk' : 'text-chalk group-hover:text-chalk'
          }`}
        >
          {label}
        </span>
        <span className="truncate text-[11px] leading-none text-chalk-faint">{tier}</span>
      </span>

      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{badges}</span>

      <span className="flex w-[86px] shrink-0 flex-col items-end gap-1.5">
        <span className="tabular text-[12.5px] font-medium leading-none text-chalk-dim">
          {sizeBytes === null ? '—' : `${approximate ? '~' : ''}${bytes(sizeBytes)}`}
        </span>
        <span
          aria-hidden="true"
          className="relative h-[3px] w-full overflow-hidden rounded-full"
          style={{ background: 'rgb(255 255 255 / 0.07)' }}
        >
          <motion.span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              background: selected
                ? 'linear-gradient(90deg, var(--color-iris-500), var(--color-iris-300))'
                : 'linear-gradient(90deg, color-mix(in oklab, var(--color-iris-500) 55%, transparent), color-mix(in oklab, var(--color-iris-300) 70%, transparent))',
              boxShadow: selected
                ? '0 0 8px -1px color-mix(in oklab, var(--color-iris-400) 80%, transparent)'
                : 'none',
            }}
            initial={{ width: 0 }}
            animate={{ width: `${ratio * 100}%` }}
            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
          />
        </span>
      </span>

      <span className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center">
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full transition-colors duration-200"
          style={{
            boxShadow: selected
              ? 'inset 0 0 0 1px color-mix(in oklab, var(--color-iris-400) 70%, transparent)'
              : 'inset 0 0 0 1px rgb(255 255 255 / 0.1)',
            background: selected
              ? 'color-mix(in oklab, var(--color-iris-500) 30%, transparent)'
              : 'transparent',
          }}
        />
        <AnimatePresence initial={false}>
          {selected && (
            <motion.span
              key="check"
              className="relative text-iris-300"
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.3, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 520, damping: 26, mass: 0.6 }}
            >
              <CheckIcon size={12} strokeWidth={2.6} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </button>
  );
}

export function VideoRungRow({
  rung,
  selected,
  onSelect,
  maxBytes,
}: {
  rung: VideoRung;
  selected: boolean;
  onSelect: () => void;
  maxBytes: number;
}) {
  const fps = Math.round(rung.fps);

  return (
    <RungShell
      label={rung.label}
      tier={rung.tier}
      selected={selected}
      onSelect={onSelect}
      maxBytes={maxBytes}
      sizeBytes={rung.bytes}
      approximate={rung.approximate}
      ariaLabel={`${rung.label} ${rung.tier}${rung.hdr ? ' HDR' : ''}, ${rung.container.toUpperCase()}, ${
        rung.bytes === null ? 'size unknown' : bytes(rung.bytes)
      }`}
      badges={
        <>
          <CodecBadge codec={rung.codec} />
          {rung.hdr && <HdrBadge />}
          {fps >= 50 && <Pill tone="accent">{fps}fps</Pill>}
          <Pill>{rung.container.toUpperCase()}</Pill>
        </>
      }
    />
  );
}

export function AudioRungRow({
  rung,
  selected,
  onSelect,
  maxBytes,
}: {
  rung: AudioRung;
  selected: boolean;
  onSelect: () => void;
  maxBytes: number;
}) {
  const rate = rung.kbps === null ? 'Lossless' : `${rung.kbps} kbps`;

  return (
    <RungShell
      label={rung.label}
      tier={rung.tier}
      selected={selected}
      onSelect={onSelect}
      maxBytes={maxBytes}
      sizeBytes={rung.bytes}
      approximate={rung.approximate}
      ariaLabel={`${rung.label}, ${rung.format.toUpperCase()} ${rate}, ${
        rung.bytes === null ? 'size unknown' : bytes(rung.bytes)
      }`}
      badges={
        <>
          <Pill tone="accent">{rung.format.toUpperCase()}</Pill>
          <Pill tone={rung.kbps === null ? 'mint' : 'neutral'}>{rate}</Pill>
          {rung.transcoded && (
            <Pill tone="amber" title="Re-encoded from the source stream rather than copied.">
              converted
            </Pill>
          )}
        </>
      }
    />
  );
}
