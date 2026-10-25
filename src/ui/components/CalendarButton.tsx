import { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { buildIcs, exportable, type CalItem } from '../../loop/ics.ts';
import { todayLocal } from '../../engine/dates.ts';
import { CloseButton, Overlay } from './common.tsx';
import { useSession } from '../hooks/session.tsx';

export function CalendarButton({ items, small = false, label = 'Add to calendar' }: { items: CalItem[]; small?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { announce } = useSession();
  const ok = exportable(items);
  if (!ok.length) return null;
  const download = () => {
    const url = URL.createObjectURL(new Blob([buildIcs(items, details)], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `sakhi-${todayLocal()}.ics`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setMsg('The calendar file download has started. Open it to add the dates to your calendar.');
    announce('Calendar file download started.');
  };
  return (
    <>
      <button type="button" className={small ? 'btn-link' : 'btn btn-quiet btn-sm'} onClick={() => { setMsg(null); setOpen(true); }}>
        <CalendarPlus size={small ? 14 : 16} aria-hidden="true" /> {label}
      </button>
      <Overlay open={open} onClose={() => setOpen(false)} label="Add to calendar" variant="dialog">
        <div className="row-between"><h2 style={{ margin: 0 }}>Add to calendar</h2><CloseButton onClick={() => setOpen(false)} /></div>
        <p>{ok.length} {ok.length === 1 ? 'date' : 'dates'} will go into a calendar file, each with a reminder at 9 in the morning the day before. Medicines are never included.</p>
        <label className="switch"><input type="checkbox" checked={details} onChange={e => setDetails(e.target.checked)} /> Include details in the calendar entry</label>
        <p className="caption">{details ? 'Entries will show the clinician\'s name and what you were told.' : 'Entries will only say "Sakhi reminder".'} Calendar apps may sync this to other devices. Once added, Sakhi cannot remove it from your calendar.</p>
        {msg && <p role="status" className="status status-ready">{msg}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)}>Close</button>
          <button type="button" className="btn btn-primary" onClick={download}>Download calendar file</button>
        </div>
      </Overlay>
    </>
  );
}
