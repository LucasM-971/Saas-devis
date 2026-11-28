import { Check } from 'lucide-react';
import { TRADES, type TradeId } from '@/lib/trades';
import { cn } from '@/lib/cn';

type Props = {
  value: TradeId[];
  onChange: (ids: TradeId[]) => void;
};

// Choix des métiers (plusieurs possibles ; le premier coché est le principal).
export function TradePicker({ value, onChange }: Props) {
  const toggle = (id: TradeId) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div role="group" aria-label="Métiers" className="grid gap-2 sm:grid-cols-2">
      {TRADES.map((t) => {
        const Icon = t.icon;
        const active = value.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            role="checkbox"
            aria-checked={active}
            onClick={() => toggle(t.id)}
            className={cn(
              'group focus-visible:outline-brand-500 flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
              active
                ? 'border-brand-500 bg-brand-50 ring-brand-500 ring-1'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
            )}
          >
            <Icon
              className={cn('size-5 shrink-0', active ? 'text-brand-600' : 'text-slate-400')}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">{t.label}</span>
            <span
              aria-hidden="true"
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded border',
                active ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white',
              )}
            >
              {active && <Check className="size-3.5" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
