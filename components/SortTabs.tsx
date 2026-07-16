type SortKey = 'newest' | 'score' | 'liquidity' | 'volume';

const options: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'score', label: 'Score' },
  { value: 'liquidity', label: 'Liquidity' },
  { value: 'volume', label: 'Volume' },
];

interface SortTabsProps {
  value: SortKey;
  onChange: (value: SortKey) => void;
}

export function SortTabs({ value, onChange }: SortTabsProps) {
  return (
    <div className="inline-flex items-center rounded-xl border border-edge bg-surface p-1">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`rounded-lg px-3 py-1.5 text-[13px] font-bold transition-colors ${
              active
                ? 'bg-pulse text-bg'
                : 'text-ink-3 hover:text-ink-2'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
