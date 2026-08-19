import { useEffect, useState } from 'react';

interface EditableNumberProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  onChange: (value: number) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function EditableNumber({ value, min, max, step = 1, label, onChange }: EditableNumberProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function apply(raw: string) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    onChange(clamp(parsed, min, max));
  }

  function normalize() {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = clamp(parsed, min, max);
    setDraft(String(next));
    onChange(next);
  }

  return (
    <input
      type="number"
      aria-label={`${label} value`}
      min={min}
      max={max}
      step={step}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        apply(event.target.value);
      }}
      onBlur={normalize}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(String(value));
          event.currentTarget.blur();
        }
      }}
      className="w-[54px] cursor-text border border-transparent bg-transparent px-1.5 py-0.5 text-right font-mono text-[10px] text-[#d9dbe2] outline-none transition-colors [appearance:textfield] hover:border-[#3a3d49] hover:bg-[#0d0f17] focus:border-[var(--acid)] focus:bg-[#0d0f17] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}
