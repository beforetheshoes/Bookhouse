export function CoverAmbience() {
  return (
    <div
      data-testid="cover-ambience"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div
        className="absolute"
        style={{
          top: -120,
          left: -120,
          width: 600,
          height: 600,
          background:
            "radial-gradient(circle, var(--bh-glow, transparent) 0%, transparent 60%)",
          opacity: 0.45,
        }}
      />
      <div
        className="absolute"
        style={{
          top: 20,
          right: -180,
          width: 500,
          height: 500,
          background:
            "radial-gradient(circle, var(--bh-accent, transparent) 0%, transparent 60%)",
          opacity: 0.3,
        }}
      />
    </div>
  );
}
