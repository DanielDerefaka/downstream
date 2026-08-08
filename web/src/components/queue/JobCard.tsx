import { useState } from 'react';
import type { ReactNode } from 'react';
import { ACTIVE_STATUSES } from '@shared/types.ts';
import type { Job, JobStatus } from '@shared/types.ts';
import { useStore } from '@/state/store.ts';
import { api } from '@/lib/api.ts';
import { bytes, eta, relativeTime, speed } from '@/lib/format.ts';
import {
  CloseIcon,
  DownloadIcon,
  FilmIcon,
  FolderIcon,
  RetryIcon,
  TrashIcon,
} from '@/components/Icons.tsx';

const ACTIVE = new Set<JobStatus>(ACTIVE_STATUSES);

/** Phases the engine reports without byte counts, so the bar can only be indeterminate. */
const INDETERMINATE = new Set<JobStatus>(['probing', 'merging', 'finalizing']);

const PHASE_FALLBACK: Record<string, string> = {
  probing: 'Reading the source',
  downloading: 'Downloading',
  merging: 'Merging video and audio',
  trimming: 'Trimming',
  converting: 'Converting',
  finalizing: 'Finishing up',
};

function accentFor(status: JobStatus): string {
  if (status === 'done') return 'bg-mint';
  if (status === 'failed') return 'bg-coral';
  if (ACTIVE.has(status)) return 'bg-iris-500';
  return 'bg-chalk-ghost';
}

function IconAction({
  label,
  onClick,
  always = false,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  always?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`btn-ghost grid size-7 place-items-center rounded-[9px] text-chalk-dim transition duration-200 ease-[var(--ease-out-soft)] focus-visible:opacity-100 ${
        always ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      } ${danger ? 'hover:text-coral' : 'hover:text-chalk'}`}
    >
      {children}
    </button>
  );
}

export default function JobCard({ job }: { job: Job }) {
  const cancelJob = useStore((s) => s.cancelJob);
  const retryJob = useStore((s) => s.retryJob);
  const removeJob = useStore((s) => s.removeJob);
  const revealJob = useStore((s) => s.revealJob);

  const [thumbBroken, setThumbBroken] = useState(false);

  const thumb = api.thumbUrl(job.thumbnail);
  const isActive = ACTIVE.has(job.status);
  const isQueued = job.status === 'queued';
  const showBar = isActive;
  const indeterminate = INDETERMINATE.has(job.status);
  const percent = Math.max(0, Math.min(1, job.progress)) * 100;

  return (
    <div className="group surface-2 relative flex items-center gap-3 overflow-hidden rounded-[var(--radius-panel)] py-2.5 pr-2 pl-3.5 row-interactive">
      <span
        aria-hidden="true"
        className={`absolute top-2 bottom-2 left-0 w-[2px] rounded-r-full ${accentFor(job.status)} ${
          isActive ? 'opacity-90' : 'opacity-60'
        }`}
      />

      <div className="relative h-9 w-16 shrink-0 overflow-hidden rounded-[7px] bg-ink-800 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)]">
        {thumb && !thumbBroken ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            onError={() => setThumbBroken(true)}
            className="drag-none h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-ink-700 to-ink-900 text-chalk-ghost">
            <FilmIcon size={15} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-chalk" title={job.title}>
          {job.title}
        </p>

        <div className="mt-0.5 min-h-[15px]">
          {isQueued && <p className="text-[11.5px] text-chalk-faint">Waiting in queue</p>}

          {isActive && (
            <>
              <p className="truncate text-[11.5px] text-chalk-dim">
                {job.phase ?? PHASE_FALLBACK[job.status] ?? 'Working'}
              </p>
              {job.status === 'downloading' && (
                <p className="tabular mt-0.5 truncate text-[11px] text-chalk-faint">
                  {job.downloadedBytes !== null
                    ? [
                        `${bytes(job.downloadedBytes)} / ${bytes(job.totalBytes)}`,
                        job.speed !== null ? speed(job.speed) : null,
                        job.eta !== null ? eta(job.eta) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : /* Trimmed clips are fetched by ffmpeg, which reports a
                         position in the clip but never a byte count. */
                      `${Math.round(job.progress * 100)}% of the selected range`}
                </p>
              )}
            </>
          )}

          {job.status === 'done' && (
            <p className="tabular text-[11.5px] text-chalk-faint">
              {bytes(job.outputBytes)}
              {job.finishedAt !== null && ` · ${relativeTime(job.finishedAt)}`}
            </p>
          )}

          {job.status === 'failed' && (
            <p
              className="line-clamp-2 text-[11.5px] leading-[1.35] text-coral"
              title={job.error ?? 'Download failed.'}
            >
              {job.error ?? 'Download failed.'}
            </p>
          )}

          {job.status === 'canceled' && <p className="text-[11.5px] text-chalk-faint">Canceled</p>}
        </div>

        {showBar && (
          <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-white/8">
            {indeterminate ? (
              <div className="animate-shimmer relative h-full w-full overflow-hidden rounded-full bg-iris-600/30" />
            ) : (
              <div
                className="h-full rounded-full bg-gradient-to-r from-iris-600 to-iris-400 transition-[width] duration-300 ease-[var(--ease-out-soft)]"
                style={{ width: `${percent}%` }}
              />
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 self-start pt-0.5">
        {(isActive || isQueued) && (
          <IconAction label="Cancel download" always onClick={() => void cancelJob(job.id)}>
            <CloseIcon size={15} />
          </IconAction>
        )}

        {job.status === 'done' && (
          <>
            <IconAction label="Reveal in folder" always onClick={() => void revealJob(job.id)}>
              <FolderIcon size={15} />
            </IconAction>
            <a
              href={api.fileUrl(job.id)}
              download
              aria-label="Save a copy to your browser downloads"
              title="Save a copy to your browser downloads"
              className="btn-ghost grid size-7 place-items-center rounded-[9px] text-chalk-dim opacity-0 transition duration-200 ease-[var(--ease-out-soft)] group-hover:opacity-100 hover:text-chalk focus-visible:opacity-100"
            >
              <DownloadIcon size={15} />
            </a>
          </>
        )}

        {(job.status === 'failed' || job.status === 'canceled') && (
          <IconAction label="Retry download" always onClick={() => void retryJob(job.id)}>
            <RetryIcon size={15} />
          </IconAction>
        )}

        <IconAction label="Remove from list" danger onClick={() => void removeJob(job.id)}>
          <TrashIcon size={15} />
        </IconAction>
      </div>
    </div>
  );
}
