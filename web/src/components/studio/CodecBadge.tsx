import type { CSSProperties, ReactNode } from 'react';
import type { CodecFamily } from '@shared/types.ts';
import { CODEC_LABEL, CODEC_NOTE } from '@/lib/format.ts';

/** Unknown has no token of its own, so it borrows the muted text colour. */
const CODEC_COLOR: Record<CodecFamily, string> = {
  av1: 'var(--color-codec-av1)',
  vp9: 'var(--color-codec-vp9)',
  h264: 'var(--color-codec-h264)',
  h265: 'var(--color-codec-h265)',
  unknown: 'var(--color-chalk-faint)',
};

const CHIP_BASE =
  'inline-flex shrink-0 items-center rounded-md px-1.5 py-[3px] font-mono text-[9.5px] font-semibold uppercase leading-none tracking-[0.06em] drag-none';

export function CodecBadge({ codec }: { codec: CodecFamily }) {
  const color = CODEC_COLOR[codec];
  const note = CODEC_NOTE[codec];
  const style: CSSProperties = {
    color,
    background: `color-mix(in oklab, ${color} 18%, transparent)`,
    boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 26%, transparent)`,
  };

  return (
    <span className={CHIP_BASE} style={style} title={note || undefined}>
      {CODEC_LABEL[codec] ?? codec.toUpperCase()}
    </span>
  );
}

export function HdrBadge() {
  return (
    <span
      className={`${CHIP_BASE} text-ink-1000`}
      style={{
        background: 'linear-gradient(115deg, var(--color-amber), var(--color-coral))',
        boxShadow: 'inset 0 1px 0 0 rgb(255 255 255 / 0.35)',
      }}
      title="High dynamic range — brighter highlights and a wider colour gamut."
    >
      HDR
    </span>
  );
}

export type PillTone = 'neutral' | 'accent' | 'mint' | 'amber';

const PILL_TONE: Record<PillTone, CSSProperties> = {
  neutral: {
    color: 'var(--color-chalk-dim)',
    background: 'rgb(255 255 255 / 0.055)',
    boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.07)',
  },
  accent: {
    color: 'var(--color-iris-300)',
    background: 'color-mix(in oklab, var(--color-iris-500) 16%, transparent)',
    boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--color-iris-500) 28%, transparent)',
  },
  mint: {
    color: 'var(--color-mint)',
    background: 'color-mix(in oklab, var(--color-mint) 14%, transparent)',
    boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--color-mint) 26%, transparent)',
  },
  amber: {
    color: 'var(--color-amber)',
    background: 'color-mix(in oklab, var(--color-amber) 14%, transparent)',
    boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--color-amber) 26%, transparent)',
  },
};

export function Pill({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  tone?: PillTone;
  title?: string;
}) {
  return (
    <span
      className="tabular inline-flex shrink-0 items-center rounded-md px-1.5 py-[3px] text-[10px] font-medium leading-none tracking-[0.01em] drag-none"
      style={PILL_TONE[tone]}
      title={title}
    >
      {children}
    </span>
  );
}
