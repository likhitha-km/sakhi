import Dexie, { type Table } from 'dexie';
import type { Entry, Exclusion, Meta, Profile, Settings } from '../types/entry.ts';
import type { AdviceItem, Attachment, CareEvent, Concern, Disclosure, NextVisit, Provider, Visit } from '../types/care.ts';
import type { BriefDraft } from '../types/brief.ts';

export class SakhiDB extends Dexie {
  entries!: Table<Entry, string>;
  exclusions!: Table<Exclusion, string>;
  profile!: Table<Profile, number>;
  settings!: Table<Settings, number>;
  briefs!: Table<BriefDraft, number>;
  meta!: Table<Meta, string>;
  providers!: Table<Provider, string>;
  careEvents!: Table<CareEvent, string>;
  attachments!: Table<Attachment, string>;
  visits!: Table<Visit, string>;
  advice!: Table<AdviceItem, string>;
  concerns!: Table<Concern, string>;
  disclosures!: Table<Disclosure, [string, string]>;
  nextVisits!: Table<NextVisit, string>;

  constructor(name = 'sakhi') {
    super(name);
    this.version(1).stores({
      entries: 'id, occurredOn, kind, symptomCode',
      exclusions: 'entryId',
      profile: 'id',
      settings: 'id',
      briefs: 'id',
      meta: 'id',
      providers: 'id',
      careEvents: 'id, kind, date, providerId',
      attachments: 'id',
    });
    // Version 2: the visit loop. Existing tables are unchanged, so no data needs moving.
    this.version(2).stores({
      visits: 'id, providerId, on',
      advice: 'id, visitId, status, dueOn',
      concerns: 'id, visitId',
      disclosures: '[treatmentId+providerId], treatmentId, providerId',
      nextVisits: 'id, providerId, on',
    });
    // Version 3: skip reasons, done dates, result notes, life stage and card opened date.
    // All new fields are optional, so existing records need no change. A stray reason on a
    // record that is not skipped is cleared.
    this.version(3).stores({}).upgrade(tx => tx.table('advice').toCollection().modify((a: Record<string, unknown>) => {
      if (a.status !== 'skipped') { delete a.reason; delete a.reasonText; }
    }));
  }
}

export const DB_VERSION = 3;
export const db = new SakhiDB();
