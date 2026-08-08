import { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ACTIVE_STATUSES } from '@shared/types.ts';
import type { Job, JobStatus } from '@shared/types.ts';
import { useStore } from '@/state/store.ts';
import { CloseIcon, QueueIcon } from '@/components/Icons.tsx';
import JobCard from '@/components/queue/JobCard.tsx';

const ACTIVE = new Set<JobStatus>(ACTIVE_STATUSES);
const FINISHED = new Set<JobStatus>(['done', 'failed', 'canceled']);

function summarize(downloading: number, waiting: number): string {
  const parts: string[] = [];
  if (downloading > 0) parts.push(`${downloading} downloading`);
  if (waiting > 0) parts.push(`${waiting} queued`);
  return parts.length ? parts.join(' · ') : 'Nothing queued';
}

function Section({ label, jobs }: { label: string; jobs: Job[] }) {
  if (jobs.length === 0) return null;
  return (
    <section className="mb-5">
      <h3 className="mb-2 px-1 text-[10.5px] font-semibold tracking-wider text-chalk-faint uppercase">
        {label}
      </h3>
      <div className="flex flex-col gap-2">
        <AnimatePresence initial={false} mode="popLayout">
          {jobs.map((job) => (
            <motion.div
              key={job.id}
              layout
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }}
            >
              <JobCard job={job} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

export default function QueueDrawer() {
  const jobs = useStore((s) => s.jobs);
  const queueOpen = useStore((s) => s.queueOpen);
  const setQueueOpen = useStore((s) => s.setQueueOpen);
  const clearFinished = useStore((s) => s.clearFinished);
  const connected = useStore((s) => s.connected);
  const active = useStore((s) => s.active);
  const queued = useStore((s) => s.queued);

  useEffect(() => {
    if (!queueOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setQueueOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [queueOpen, setQueueOpen]);

  const { inFlight, recent } = useMemo(() => {
    const a: Job[] = [];
    const r: Job[] = [];
    for (const job of jobs) {
      if (job.status === 'queued' || ACTIVE.has(job.status)) a.push(job);
      else r.push(job);
    }
    return { inFlight: a, recent: r };
  }, [jobs]);

  // The server's queue:stats frame may not have landed yet (or may lag a fast
  // burst of creations), so fall back to what the job list already tells us.
  const derivedActive = inFlight.filter((j) => j.status !== 'queued').length;
  const derivedQueued = inFlight.length - derivedActive;
  const downloadingCount = active || derivedActive;
  const waitingCount = queued || derivedQueued;

  const hasFinished = recent.some((j) => FINISHED.has(j.status));

  return (
    <AnimatePresence>
      {queueOpen && (
        <div className="fixed inset-0 z-40">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => setQueueOpen(false)}
            className="absolute inset-0 bg-ink-1000/55 backdrop-blur-[6px]"
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Download queue"
            initial={{ x: '100%', opacity: 0.4 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.2 }}
            transition={{ type: 'spring', stiffness: 320, damping: 36, mass: 0.9 }}
            className="glass-card absolute inset-y-0 right-0 flex w-full flex-col sm:w-[420px] sm:rounded-l-[var(--radius-card)]"
          >
            <header className="flex items-start gap-3 px-5 pt-5 pb-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold tracking-tight text-chalk">Queue</h2>
                <p className="tabular mt-0.5 truncate text-[11.5px] text-chalk-faint">
                  {summarize(downloadingCount, waitingCount)}
                </p>
              </div>

              {hasFinished && (
                <button
                  type="button"
                  onClick={() => void clearFinished()}
                  className="mt-0.5 rounded-md px-1.5 py-1 text-[11.5px] text-chalk-dim transition duration-200 ease-[var(--ease-out-soft)] hover:text-chalk active:scale-95"
                >
                  Clear finished
                </button>
              )}

              <button
                type="button"
                onClick={() => setQueueOpen(false)}
                aria-label="Close queue"
                title="Close queue"
                className="btn-ghost grid size-8 shrink-0 place-items-center rounded-[10px] text-chalk-dim transition duration-200 ease-[var(--ease-out-soft)] hover:text-chalk"
              >
                <CloseIcon size={16} />
              </button>
            </header>

            <div className="mask-fade-y min-h-0 flex-1 overflow-y-auto px-4 py-2">
              {jobs.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
                  <span className="text-chalk-ghost/50">
                    <QueueIcon size={40} />
                  </span>
                  <div>
                    <p className="text-[13px] font-medium text-chalk-dim">Nothing here yet</p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-chalk-faint">
                      Paste a link and pick a quality — downloads you start will show up here.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <Section label="Active" jobs={inFlight} />
                  <Section label="Recent" jobs={recent} />
                </>
              )}
            </div>

            <footer className="flex items-center gap-2 border-t border-white/6 px-5 py-3.5">
              <span
                aria-hidden="true"
                className={`size-[7px] rounded-full ${
                  connected ? 'bg-mint shadow-[0_0_8px_var(--color-mint)]' : 'animate-pulse bg-amber'
                }`}
              />
              <span className="text-[11.5px] text-chalk-faint">
                {connected ? 'Engine connected' : 'Reconnecting…'}
              </span>
            </footer>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
