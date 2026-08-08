import { motion } from 'framer-motion';
import { useStore } from '@/state/store.ts';
import { Logo, QueueIcon, SettingsIcon } from '@/components/Icons.tsx';

/**
 * The macOS-style title bar from the reference, made functional: the traffic
 * lights are decorative (this is a browser window), but the right side carries
 * the queue badge and settings, which is where a desktop app would put them.
 */
export default function WindowChrome() {
  const active = useStore((s) => s.active);
  const queued = useStore((s) => s.queued);
  const jobs = useStore((s) => s.jobs);
  const setQueueOpen = useStore((s) => s.setQueueOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);

  const inFlight = active + queued;
  const finished = jobs.filter((j) => j.status === 'done').length;

  return (
    <header className="relative flex h-[46px] shrink-0 items-center border-b border-white/[0.06] px-4">
      <div className="flex items-center gap-2" aria-hidden="true">
        <span className="h-[11px] w-[11px] rounded-full bg-[#ff5f57] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.25)]" />
        <span className="h-[11px] w-[11px] rounded-full bg-[#febc2e] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.25)]" />
        <span className="h-[11px] w-[11px] rounded-full bg-[#28c840] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.25)]" />
      </div>

      <div className="pointer-events-none absolute inset-x-0 flex items-center justify-center gap-2">
        <Logo size={15} />
        <span className="text-[12.5px] font-medium tracking-[-0.01em] text-chalk-dim">
          Downstream
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={() => setQueueOpen(true)}
          className="btn-ghost relative flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-[12px] text-chalk-dim"
          aria-label={`Open queue — ${inFlight} in progress, ${finished} finished`}
          title="Queue"
        >
          <QueueIcon size={15} />
          {inFlight > 0 ? (
            <motion.span
              key={inFlight}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 24 }}
              className="tabular text-iris-300"
            >
              {inFlight}
            </motion.span>
          ) : (
            finished > 0 && <span className="tabular text-chalk-ghost">{finished}</span>
          )}
          {active > 0 && (
            <span className="animate-pulse-ring absolute -top-px -right-px h-1.5 w-1.5 rounded-full bg-iris-400" />
          )}
        </button>

        <button
          onClick={() => setSettingsOpen(true)}
          className="btn-ghost flex h-8 w-8 items-center justify-center rounded-[9px] text-chalk-dim"
          aria-label="Settings"
          title="Settings"
        >
          <SettingsIcon size={15} />
        </button>
      </div>
    </header>
  );
}
