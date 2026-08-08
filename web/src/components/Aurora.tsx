/**
 * The light source the whole UI is lit by.
 *
 * Three oversized, heavily-blurred radial blobs drifting on long offset loops.
 * Because the window above is a real backdrop-filter glass surface, the blobs
 * bleed through it — which is what gives the card its colour variation instead
 * of the flat charcoal of the reference. A film-grain overlay on top kills the
 * banding that big soft gradients always produce on 8-bit displays.
 */
export default function Aurora() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-ink-1000" />

      <div
        className="animate-aurora absolute -top-[22%] left-[8%] h-[70vmax] w-[70vmax] rounded-full opacity-[0.55] blur-[120px]"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, #6350e6 0%, rgba(99,80,230,0.35) 42%, transparent 68%)',
        }}
      />
      <div
        className="animate-aurora absolute -bottom-[28%] right-[2%] h-[62vmax] w-[62vmax] rounded-full opacity-[0.42] blur-[130px]"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, #b8a6ff 0%, rgba(184,166,255,0.28) 40%, transparent 66%)',
          animationDelay: '-9s',
          animationDuration: '32s',
        }}
      />
      <div
        className="animate-aurora absolute top-[32%] right-[26%] h-[42vmax] w-[42vmax] rounded-full opacity-[0.22] blur-[120px]"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, #6ee7f0 0%, rgba(110,231,240,0.22) 38%, transparent 64%)',
          animationDelay: '-17s',
          animationDuration: '38s',
        }}
      />

      {/* Vignette: pulls focus to the centre and stops the blobs reaching the edges. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 90% 70% at 50% 45%, transparent 0%, rgba(4,4,10,0.55) 62%, #04040a 100%)',
        }}
      />

      <div
        className="absolute inset-0 opacity-[0.16] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 240 240' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundSize: '220px 220px',
        }}
      />
    </div>
  );
}
