import { ReactNode } from "react";

export const Row = ({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) => (
  <div className="srow">
    <span className="grow">{label}{hint && <span className="muted small block">{hint}</span>}</span>
    {children}
  </div>
);

export const Toggle = ({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) => (
  <label className="srow">
    <span className="grow">{label}{hint && <span className="muted small block">{hint}</span>}</span>
    <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
  </label>
);

export function Choice<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="srow wrap">
      <span className="grow">{label}</span>
      <span className="pills" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={String(v)} role="radio" aria-checked={v === value} className={`pill${v === value ? " on" : ""}`} onClick={() => onChange(v)}>{text}</button>
        ))}
      </span>
    </div>
  );
}

export const Slider = ({ label, value, min, max, step = 1, onChange, show }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; show?: string }) => (
  <label className="srow">
    <span className="grow">{label}</span>
    {show && <span className="muted small">{show}</span>}
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
  </label>
);

export const TimeField = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <label className="srow">
    <span className="grow">{label}</span>
    <input type="time" className="in timein" value={value} onChange={(e) => onChange(e.target.value || value)} aria-label={label} />
  </label>
);

export const Group = ({ title, children }: { title?: string; children: ReactNode }) => (
  <>
    {title && <div className="cap">{title}</div>}
    <section className="card">{children}</section>
  </>
);
