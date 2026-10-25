import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db.ts';
import { DEFAULT_PROFILE } from '../../db/repo.ts';
import { computeEvidence } from '../../engine/compute.ts';
import { checkEntries } from '../../engine/checks.ts';
import { getAccount } from '../../db/account.ts';
import type { Entry, Exclusion } from '../../types/entry.ts';
import type { AdviceItem, CareEvent, Concern, Disclosure, NextVisit, Provider, Visit } from '../../types/care.ts';

const EMPTY: never[] = [];

export function useAppData() {
  const entries = useLiveQuery(() => db.entries.toArray(), [], undefined) as Entry[] | undefined;
  const exclusions = useLiveQuery(() => db.exclusions.toArray(), [], undefined) as Exclusion[] | undefined;
  const profile = useLiveQuery(() => db.profile.get(1), [], null);
  const settings = useLiveQuery(() => db.settings.get(1), [], null);
  const care = useLiveQuery(() => db.careEvents.toArray(), [], undefined) as CareEvent[] | undefined;
  const providers = useLiveQuery(() => db.providers.toArray(), [], undefined) as Provider[] | undefined;
  const visits = useLiveQuery(() => db.visits.toArray(), [], undefined) as Visit[] | undefined;
  const advice = useLiveQuery(() => db.advice.toArray(), [], undefined) as AdviceItem[] | undefined;
  const concerns = useLiveQuery(() => db.concerns.toArray(), [], undefined) as Concern[] | undefined;
  const disclosures = useLiveQuery(() => db.disclosures.toArray(), [], undefined) as Disclosure[] | undefined;
  const nextVisits = useLiveQuery(() => db.nextVisits.toArray(), [], undefined) as NextVisit[] | undefined;
  const account = useLiveQuery(async () => (await getAccount()) ?? null, [], undefined);
  const loading = entries === undefined || exclusions === undefined || care === undefined || providers === undefined || profile === null || settings === null || account === undefined
    || visits === undefined || advice === undefined || concerns === undefined || disclosures === undefined || nextVisits === undefined;
  return {
    loading,
    entries: entries ?? EMPTY, visits: visits ?? EMPTY, advice: advice ?? EMPTY, concerns: concerns ?? EMPTY,
    disclosures: disclosures ?? EMPTY, nextVisits: nextVisits ?? EMPTY, exclusions: exclusions ?? EMPTY, care: care ?? EMPTY, providers: providers ?? EMPTY,
    profile: profile ?? DEFAULT_PROFILE, settings: settings ?? undefined, account: account ?? null,
  };
}

export function useEvidence(windowDays: 28 | 56) {
  const d = useAppData();
  const bundle = useMemo(
    () => computeEvidence({ entries: d.entries, exclusions: d.exclusions, profile: d.profile, windowDays }),
    [d.entries, d.exclusions, d.profile, windowDays],
  );
  return { ...d, bundle };
}

export function useChecks() {
  const d = useAppData();
  return useMemo(() => checkEntries(d.entries, d.exclusions, d.care), [d.entries, d.exclusions, d.care]);
}
