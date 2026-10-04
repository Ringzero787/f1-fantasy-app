import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { NAME_MAX, normalizeName } from '../lib/profileApi';

/**
 * A name you can change where it is shown (F-100): click the name or its pencil to edit in place,
 * Enter saves, Escape cancels. The saver decides; a refusal comes back as the sentence to show.
 */
export function NameEditor({ value, label, save, className, inputClassName }: { value: string; label: string; save: (name: string) => Promise<void>; className?: string; inputClassName?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const cancelled = useRef(false);
  const wasEditing = useRef(false);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  // focus follows the edit: into the field when it opens, back to the name when it closes
  useEffect(() => { if (editing) ref.current?.select(); else if (wasEditing.current) btn.current?.focus(); wasEditing.current = editing; }, [editing]);
  const close = () => { cancelled.current = true; setEditing(false); setErr(null); setBusy(false); };
  const commit = async () => {
    const name = normalizeName(draft);
    if (!name) { setErr(`Use 2 to ${NAME_MAX} characters.`); return; }
    if (name === normalizeName(value)) { setEditing(false); return; }
    setBusy(true); setErr(null); cancelled.current = false;
    try { await save(name); if (!cancelled.current) setEditing(false); } catch (e) { if (!cancelled.current) setErr((e as Error).message); } finally { if (!cancelled.current) setBusy(false); }
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') void commit(); if (e.key === 'Escape') close(); };
  if (!editing) {
    return (
      <button ref={btn} type="button" className={`namebtn ${className ?? ''}`} onClick={() => setEditing(true)} aria-label={`${label}: ${value}. Edit`} title={`Edit ${label.toLowerCase()}`}>
        <span>{value}</span><span className="pencil" aria-hidden="true">✎</span>
      </button>
    );
  }
  return (
    <span className={`nameedit ${className ?? ''}`}>
      <input ref={ref} className={inputClassName} value={draft} maxLength={NAME_MAX} disabled={busy} aria-label={label} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={() => { if (!busy && normalizeName(draft) === normalizeName(value)) setEditing(false); }} />
      <span className="srow">
        <button type="button" className="cta sm" disabled={busy} onClick={() => void commit()}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="ghost" onClick={close}>{busy ? 'Stop waiting' : 'Cancel'}</button>
      </span>
      {err ? <span className="err" role="alert">{err}</span> : null}
    </span>
  );
}
