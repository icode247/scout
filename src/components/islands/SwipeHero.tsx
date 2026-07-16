import { useEffect, useRef, useState } from "react";

type Job = {
  title: string;
  company: string;
  location: string;
  salary: string;
  match: number;
  tag: string;
};

const JOBS: Job[] = [
  { title: "Senior Product Designer", company: "Linear", location: "Remote · US", salary: "$150-185k", match: 96, tag: "Design" },
  { title: "Backend Engineer", company: "Stripe", location: "Remote · Global", salary: "$170-210k", match: 94, tag: "Engineering" },
  { title: "Growth Marketing Lead", company: "Notion", location: "San Francisco, CA", salary: "$140-170k", match: 91, tag: "Marketing" },
  { title: "Data Analyst", company: "Ramp", location: "New York, NY", salary: "$120-150k", match: 89, tag: "Analytics" },
  { title: "Customer Success Manager", company: "Vercel", location: "Remote · US", salary: "$110-135k", match: 88, tag: "Success" },
];

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function SwipeHero() {
  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState(0);
  const [flyOut, setFlyOut] = useState<0 | 1 | -1>(0);
  const startX = useRef<number | null>(null);
  const dragging = useRef(false);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = prefersReducedMotion();
  }, []);

  // Auto-advance (skipped under reduced-motion).
  useEffect(() => {
    if (reduced.current) return;
    const t = setInterval(() => advance(1), 2800);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function advance(dir: 1 | -1) {
    setFlyOut(dir);
    window.setTimeout(() => {
      setIndex((i) => (i + 1) % JOBS.length);
      setDrag(0);
      setFlyOut(0);
    }, 280);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (reduced.current) return;
    dragging.current = true;
    startX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current || startX.current === null) return;
    setDrag(e.clientX - startX.current);
  }
  function onPointerUp() {
    if (!dragging.current) return;
    dragging.current = false;
    if (Math.abs(drag) > 90) advance(drag > 0 ? 1 : -1);
    else setDrag(0);
    startX.current = null;
  }

  const visible = [0, 1, 2].map((o) => JOBS[(index + o) % JOBS.length]);
  const applied = drag > 40 || flyOut === 1;
  const skipped = drag < -40 || flyOut === -1;

  return (
    <div
      className="relative mx-auto h-[420px] w-full max-w-[360px] select-none"
      aria-hidden="true"
    >
      {visible
        .map((job, o) => ({ job, o }))
        .reverse()
        .map(({ job, o }) => {
          const isTop = o === 0;
          const x = isTop ? (flyOut ? flyOut * 520 : drag) : 0;
          const rot = isTop ? x / 22 : 0;
          const scale = 1 - o * 0.04;
          const ty = o * 14;
          const transition = dragging.current && isTop
            ? "none"
            : "transform 280ms cubic-bezier(0.22,1,0.36,1), opacity 280ms ease-out";
          return (
            <div
              key={job.title}
              className="absolute inset-x-0 top-0 rounded-3xl border border-black/5 bg-white p-5 shadow-lift"
              style={{
                transform: `translateX(${x}px) translateY(${ty}px) rotate(${rot}deg) scale(${scale})`,
                opacity: flyOut && isTop ? 0 : 1 - o * 0.06,
                zIndex: 10 - o,
                transition,
                touchAction: "pan-y",
                cursor: isTop ? "grab" : "default",
              }}
              onPointerDown={isTop ? onPointerDown : undefined}
              onPointerMove={isTop ? onPointerMove : undefined}
              onPointerUp={isTop ? onPointerUp : undefined}
              onPointerCancel={isTop ? onPointerUp : undefined}
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">{job.tag}</span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{job.match}% match
                </span>
              </div>
              <h3 className="mt-4 font-display text-xl font-bold leading-tight text-ink">{job.title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{job.company} · {job.location}</p>
              <div className="mt-5 rounded-2xl bg-surface-soft p-4">
                <p className="text-xs text-ink-muted">Estimated comp</p>
                <p className="text-lg font-semibold text-ink">{job.salary}</p>
              </div>
              <div className="mt-5 flex items-center gap-2 text-xs text-ink-muted">
                <span className="rounded-md bg-surface-sunken px-2 py-1">Tailored resume ready</span>
                <span className="rounded-md bg-surface-sunken px-2 py-1">Cover letter ready</span>
              </div>

              {isTop && (
                <>
                  <span
                    className="absolute left-5 top-5 rounded-lg border-2 border-emerald-500 px-2 py-1 text-xs font-bold uppercase text-emerald-600"
                    style={{ opacity: applied ? 1 : 0, transition: "opacity 150ms ease-out" }}
                  >Applied</span>
                  <span
                    className="absolute right-5 top-5 rounded-lg border-2 border-rose-400 px-2 py-1 text-xs font-bold uppercase text-rose-500"
                    style={{ opacity: skipped ? 1 : 0, transition: "opacity 150ms ease-out" }}
                  >Skip</span>
                </>
              )}
            </div>
          );
        })}
      <p className="sr-only">An animated stack of job cards. Swipe right to auto-apply with a tailored resume and cover letter; swipe left to skip.</p>
    </div>
  );
}
