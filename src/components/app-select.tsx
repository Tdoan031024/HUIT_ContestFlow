'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

export type AppSelectOption = { value: string; label: string; disabled?: boolean };

type AppSelectProps = {
  value: string;
  options: AppSelectOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  name?: string;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
};

export function AppSelect({ value, options, onValueChange, placeholder = 'Chọn một mục', disabled = false, name, className = '', style, 'aria-label': ariaLabel }: AppSelectProps) {
  const generatedId = useId();
  const listboxId = `select-options-${generatedId}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
  const selectedLabel = selectedIndex >= 0 ? options[selectedIndex].label : '';

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const gap = 6;
    const roomBelow = window.innerHeight - rect.bottom - gap - 12;
    const roomAbove = rect.top - gap - 12;
    const placeAbove = roomBelow < Math.min(280, Math.max(160, roomAbove)) && roomAbove > roomBelow;
    const maxHeight = Math.max(120, Math.min(420, placeAbove ? roomAbove : roomBelow));
    setPosition({
      top: placeAbove ? Math.max(8, rect.top - gap - Math.min(420, roomAbove)) : rect.bottom + gap,
      left: Math.min(Math.max(8, rect.left), window.innerWidth - Math.min(rect.width, window.innerWidth - 16) - 8),
      width: Math.min(rect.width, window.innerWidth - 16),
      maxHeight,
    });
  }, []);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const selected = selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled);
    const nextIndex = Math.max(0, selected);
    setActiveIndex(nextIndex);
    requestAnimationFrame(() => optionRefs.current[nextIndex]?.focus());
  }, [open, selectedIndex, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => updatePosition();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !listboxRef.current?.contains(target)) close();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(true); }
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [close, open, updatePosition]);

  function moveActive(direction: 1 | -1) {
    if (!options.length) return;
    let next = activeIndex;
    for (let attempts = 0; attempts < options.length; attempts += 1) {
      next = (next + direction + options.length) % options.length;
      if (!options[next].disabled) break;
    }
    setActiveIndex(next);
    requestAnimationFrame(() => optionRefs.current[next]?.focus());
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) setOpen(true);
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowDown') { event.preventDefault(); moveActive(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); moveActive(-1); }
    else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = event.key === 'Home' ? options.findIndex((option) => !option.disabled) : options.findLastIndex((option) => !option.disabled);
      if (next >= 0) { setActiveIndex(next); optionRefs.current[next]?.focus(); }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!options[index].disabled) { onValueChange(options[index].value); close(true); }
    } else if (event.key === 'Tab') close();
  }

  return <>
    {name && <input type="hidden" name={name} value={value} disabled={disabled} />}
    <button
      ref={triggerRef}
      className={`app-select-trigger ${className}`.trim()}
      type="button"
      role="combobox"
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
      disabled={disabled}
      style={style}
      onClick={() => setOpen((current) => !current)}
      onKeyDown={handleTriggerKeyDown}
    >
      <span className={selectedLabel ? 'app-select-value' : 'app-select-value is-placeholder'}>{selectedLabel || placeholder}</span>
      <svg className="app-select-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>
    </button>
    {open && position && typeof document !== 'undefined' && createPortal(
      <div
        ref={listboxRef}
        id={listboxId}
        className="app-select-popover"
        role="listbox"
        aria-label={ariaLabel}
        style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}
      >
        {options.map((option, index) => <button
          ref={(node) => { optionRefs.current[index] = node; }}
          id={`${listboxId}-option-${index}`}
          key={option.value}
          className={`app-select-option${value === option.value ? ' is-selected' : ''}${index === activeIndex ? ' is-active' : ''}`}
          type="button"
          role="option"
          aria-selected={value === option.value}
          aria-disabled={option.disabled || undefined}
          disabled={option.disabled}
          tabIndex={index === activeIndex ? 0 : -1}
          onFocus={() => setActiveIndex(index)}
          onKeyDown={(event) => handleOptionKeyDown(event, index)}
          onClick={() => { onValueChange(option.value); close(true); }}
        >
          <span>{option.label}</span>
          {value === option.value && <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg>}
        </button>)}
      </div>,
      document.body,
    )}
  </>;
}
