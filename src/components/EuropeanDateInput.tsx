import React, { useEffect, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { formatEuropeanDate, isValidIsoDate, parseEuropeanDate } from '../lib/golf-schedule';

interface EuropeanDateInputProps {
  id?: string;
  value: string;
  onChange: (isoDate: string) => void;
  ariaLabel?: string;
  required?: boolean;
  className?: string;
}

export const EuropeanDateInput: React.FC<EuropeanDateInputProps> = ({
  id,
  value,
  onChange,
  ariaLabel,
  required = false,
  className = 'px-3.5 py-2 text-xs font-mono bg-white border border-[#E2E5EB] rounded-lg text-[#111827]',
}) => {
  const [textValue, setTextValue] = useState<string>(() => formatEuropeanDate(value));
  const nativePickerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTextValue(formatEuropeanDate(value));
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setTextValue(raw);
    const parsed = parseEuropeanDate(raw);
    if (parsed) {
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    const parsed = parseEuropeanDate(textValue);
    if (parsed) {
      setTextValue(formatEuropeanDate(parsed));
      if (parsed !== value) {
        onChange(parsed);
      }
    } else {
      setTextValue(formatEuropeanDate(value));
    }
  };

  const openNativePicker = () => {
    const el = nativePickerRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === 'function') {
        el.showPicker();
        return;
      }
    } catch {
      // Fallback below if browser restricts showPicker
    }
    el.focus();
    el.click();
  };

  return (
    <div className={`relative inline-flex items-center justify-between gap-2 ${className}`}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        maxLength={10}
        required={required}
        aria-label={ariaLabel}
        placeholder="DD-MM-AAAA"
        value={textValue}
        onChange={handleTextChange}
        onBlur={handleBlur}
        className="w-[10.5ch] min-w-0 flex-1 bg-transparent outline-none font-mono tabular-nums text-inherit"
      />
      <div className="relative shrink-0 flex items-center justify-center">
        <button
          type="button"
          onClick={openNativePicker}
          aria-label={ariaLabel ? `Abrir calendario: ${ariaLabel}` : 'Abrir calendario'}
          className="p-0.5 rounded text-[#555C68] hover:text-[#111827] hover:bg-[#EBEEF3] transition-colors"
        >
          <Calendar className="w-3.5 h-3.5" />
        </button>
        <input
          ref={nativePickerRef}
          type="date"
          value={isValidIsoDate(value) ? value : ''}
          onChange={(e) => {
            if (e.target.value) {
              onChange(e.target.value);
            }
          }}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 h-full w-6 opacity-0"
        />
      </div>
    </div>
  );
};
