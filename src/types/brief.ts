export type BriefSectionKey =
  | 'ageBand' | 'lifeStage' | 'diagnoses' | 'medicines' | 'goal' | 'coverage' | 'highlights'
  | 'symptoms' | 'impact' | 'bleeding' | 'timing' | 'overlap' | 'care' | 'careNames'
  | 'priorities' | 'questions' | 'notes' | 'excluded';

export interface BriefDraft {
  id: 1;
  windowDays: 28 | 56;
  sections: Partial<Record<BriefSectionKey, boolean>>;
  goal: string;
  priorities: string[];
  questionEdits: Record<string, string | null>; // suggested question id -> edited text, or null when removed
  customQuestions: string[];
  pinned: string[];            // statements she chose with "Add to my brief"
  updatedAt: string;
}

export interface BriefQuestion { id: string; text: string; suggested: boolean }
