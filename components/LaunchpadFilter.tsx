import { Launchpad } from '@/lib/types';
import { launchpadColors } from '@/lib/chain';

interface LaunchpadFilterProps {
  value: 'all' | Launchpad;
  onChange: (value: 'all' | Launchpad) => void;
  available: Launchpad[];
}

export function LaunchpadFilter({ value, onChange, available }: LaunchpadFilterProps) {
  const bg = '#0f1115';
  const all: { key: 'all' | Launchpad; label: string; color: string }[] = [
    { key: 'all', label: 'ALL', color: 'var(--color-pulse)' },
    ...available.map((l) => ({ key: l, label: l.toUpperCase(), color: launchpadColors[l] || launchpadColors.other })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {all.map((item) => {
        const active = value === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px] font-bold tracking-wide transition-all ${
              active ? '' : 'hover:bg-surface-2'
            }`}
            style={
              active
                ? { color: bg, background: item.color, borderColor: item.color }
                : {
                    color: item.color,
                    borderColor: `${item.color}55`,
                    background: 'rgba(255,255,255,0.04)',
                  }
            }
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: active ? bg : item.color }}
            />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
