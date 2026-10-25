// Renders card sections. Used by the card, show mode, print and the shared link viewer.
// It must not import anything that touches storage, because the viewer runs on the clinician's device.
import type { ReactNode } from 'react';
import { CircleCheck, CircleDashed, CircleHelp, TriangleAlert } from 'lucide-react';
import { SOURCE_LABEL, type Line, type Section, type Seg } from '../../visits/sections.ts';
import { CARD_FOOTER } from '../../visits/basics.ts';

const ICON = { told: CircleCheck, not_told: CircleDashed, unsure: CircleHelp, overdue: TriangleAlert };

/** Renders card sections. With onNumber, numbers become buttons; without it they are plain text. */
export function SectionsView({ sections, onNumber, footer, footerText }: { sections: Section[]; onNumber?: (s: Exclude<Seg, string>) => void; footer?: ReactNode; footerText?: string }) {
  const seg = (s: Seg, i: number) => typeof s === 'string' ? <span key={i}>{s}</span>
    : onNumber ? <button key={i} type="button" className="num" onClick={() => onNumber(s)} aria-label={`${s.n}: ${s.title}. Show the records`}>{s.n}</button>
      : <strong key={i}>{s.n}</strong>;
  const renderLines = (lines: Line[]) => {
    const out: ReactNode[] = [];
    for (let i = 0; i < lines.length;) {
      const l = lines[i];
      if (l.kind === 'li' || l.kind === 'ol') {
        const group: Line[] = [];
        while (i < lines.length && lines[i].kind === l.kind) group.push(lines[i++]);
        const items = group.map((g, j) => { const I = g.icon ? ICON[g.icon] : null; return <li key={j} className={g.icon ? `told-${g.icon}` : undefined}>{I && <I size={14} aria-hidden="true" />} {g.segs.map(seg)}{g.src && <span className={`src-tag src-${g.src}`}> ({SOURCE_LABEL[g.src]})</span>}</li>; });
        out.push(l.kind === 'ol' ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>);
      } else { out.push(<p key={i} className={l.kind === 'group' ? 'caption-card' : undefined}>{l.segs.map(seg)}</p>); i++; }
    }
    return out;
  };
  return (
    <div className="consult-card">
      {sections.map(s => <section key={s.key}><h2>{s.heading.map(seg)}</h2>{renderLines(s.lines)}</section>)}
      <p className="card-foot">{footerText ?? CARD_FOOTER}{footer}</p>
    </div>
  );
}

