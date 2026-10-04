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
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);
  const commit = async () => {
    const name = normalizeName(draft);
    if (!name) { setErr(`Use 2 to ${NAME_MAX} characters.`); return; }
    if (name === value) { setEditing(false); return; }
    setBusy(true); setErr(null);
    try { await save(name); setEditing(false); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') void commit(); if (e.key === 'Escape') { setEditing(false); setErr(null); } };
  if (!editing) {
    return (
      <button type="button" className={`namebtn ${className ?? ''}`} onClick={() => setEditing(true)} aria-label={`${label}: ${value}. Edit`} title={`Edit ${label.toLowerCase()}`}>
        <span>{value}</span><span className="pencil" aria-hidden="true">✎</span>
      </button>
    );
  }
  return (
    <span className={`nameedit ${className ?? ''}`}>
      <input ref={ref} className={inputClassName} value={draft} maxLength={NAME_MAX} disabled={busy} aria-label={label} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={() => { if (!busy && normalizeName(draft) === value) setEditing(false); }} />
      <span className="srow">
        <button type="button" className="cta sm" disabled={busy} onClick={() => void commit()}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="ghost" disabled={busy} onClick={() => { setEditing(false); setErr(null); }}>Cancel</button>
      </span>
      {err ? <span className="err" role="alert">{err}</span> : null}
    </span>
  );
}
