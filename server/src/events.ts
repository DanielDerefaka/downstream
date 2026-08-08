import type { ServerEvent } from '../../shared/types.ts';

type Sink = (event: ServerEvent) => void;

const sinks = new Set<Sink>();

export function subscribe(sink: Sink): () => void {
  sinks.add(sink);
  return () => sinks.delete(sink);
}

export function emit(event: ServerEvent): void {
  for (const sink of sinks) {
    try {
      sink(event);
    } catch {
      // A dead client must not take down the emit loop; the SSE route prunes
      // its own sink on close.
    }
  }
}

export function subscriberCount(): number {
  return sinks.size;
}
