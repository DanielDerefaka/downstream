import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore, normalizeUrl } from '@/state/store.ts';
import Aurora from '@/components/Aurora.tsx';
import WindowChrome from '@/components/WindowChrome.tsx';
import Toast from '@/components/Toast.tsx';
import QueueDrawer from '@/components/queue/QueueDrawer.tsx';
import SettingsPanel from '@/components/SettingsPanel.tsx';
import Intake from '@/screens/Intake.tsx';
import Studio from '@/screens/Studio.tsx';

export default function App() {
  const screen = useStore((s) => s.screen);
  const init = useStore((s) => s.init);
  const submitUrl = useStore((s) => s.submitUrl);
  const setUrl = useStore((s) => s.setUrl);
  const setQueueOpen = useStore((s) => s.setQueueOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const reset = useStore((s) => s.reset);

  useEffect(() => init(), [init]);

  /**
   * Paste-anywhere. The reference app makes you click into the field first;
   * here a ⌘V from any point in the window starts the fetch, which is how
   * people actually use a downloader — copy link, switch app, paste.
   */
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      const text = event.clipboardData?.getData('text')?.trim();
      if (!text) return;
      const candidate = normalizeUrl(text);
      if (!/^https?:\/\//i.test(candidate)) return;
      event.preventDefault();
      setUrl(candidate);
      void submitUrl(candidate);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [setUrl, submitUrl]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const inField =
        event.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(event.target.tagName);
      const meta = event.metaKey || event.ctrlKey;

      if (meta && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        setQueueOpen(!useStore.getState().queueOpen);
      } else if (meta && event.key === ',') {
        event.preventDefault();
        setSettingsOpen(true);
      } else if (event.key === 'Escape' && !inField) {
        const { queueOpen, settingsOpen, screen: current } = useStore.getState();
        if (!queueOpen && !settingsOpen && current === 'studio') reset();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setQueueOpen, setSettingsOpen, reset]);

  return (
    <>
      <Aurora />

      <div className="relative flex h-full items-center justify-center p-0 sm:p-6 lg:p-8">
        <div
          className="glass-card flex h-full w-full flex-col overflow-hidden rounded-none sm:h-auto sm:max-h-full sm:rounded-[var(--radius-card)]"
          style={{ maxWidth: screen === 'studio' ? 1180 : 720 }}
        >
          <WindowChrome />

          <main className="hatch min-h-0 flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={screen}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                className="min-h-full"
              >
                {screen === 'intake' ? <Intake /> : <Studio />}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      <QueueDrawer />
      <SettingsPanel />
      <Toast />
    </>
  );
}
