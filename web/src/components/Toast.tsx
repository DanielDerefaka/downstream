import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '@/state/store.ts';
import { AlertIcon, CheckIcon } from '@/components/Icons.tsx';

export default function Toast() {
  const toast = useStore((s) => s.toast);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 18, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="glass-card pointer-events-auto flex max-w-[440px] items-center gap-2.5 rounded-full py-2.5 pr-5 pl-3.5"
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                toast.tone === 'error' ? 'bg-coral/20 text-coral' : 'bg-mint/20 text-mint'
              }`}
            >
              {toast.tone === 'error' ? <AlertIcon size={13} /> : <CheckIcon size={12} />}
            </span>
            <span className="truncate text-[13px] text-chalk">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
