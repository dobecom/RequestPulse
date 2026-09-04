import { Check, ChevronDown } from 'lucide-react'
import { useMemo } from 'react'

interface CountedOption {
  value: string
  count?: number
}

interface MultiSelectProps {
  label: string
  options: CountedOption[]
  selected: string[]
  onChange: (values: string[]) => void
  compact?: boolean
}

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  compact,
}: MultiSelectProps) {
  const selectedSet = useMemo(() => new Set(selected), [selected])
  return (
    <details className={`multi-select${compact ? ' multi-select--compact' : ''}`}>
      <summary>
        <span>
          {label}
          {selected.length > 0 && <b>{selected.length}</b>}
        </span>
        <ChevronDown size={15} />
      </summary>
      <div className="multi-select__menu">
        {options.length === 0 ? (
          <p className="empty-option">No values</p>
        ) : (
          options.map(({ value, count }) => {
            const checked = selectedSet.has(value)
            return (
              <label key={value || '(empty)'} className="check-option">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange(
                      checked
                        ? selected.filter((item) => item !== value)
                        : [...selected, value],
                    )
                  }
                />
                <span className="check-box">{checked && <Check size={12} />}</span>
                <span className="check-option__value">{value || '(empty)'}</span>
                {count !== undefined && <span className="count-badge">{count}</span>}
              </label>
            )
          })
        )}
        {selected.length > 0 && (
          <button type="button" className="text-button" onClick={() => onChange([])}>
            Clear selection
          </button>
        )}
      </div>
    </details>
  )
}
