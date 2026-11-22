export const KINDS = [
  'Lesson plan',
  'Quiz bank',
  'Study guide',
  'Flashcards',
  'Rubric',
  'Exit ticket',
  'Discussion prompts',
  'Concept map',
  'Assignment brief',
] as const;

export type Kind = (typeof KINDS)[number];

export const BLOOMS = [
  'Remember',
  'Understand',
  'Apply',
  'Analyze',
  'Evaluate',
  'Create',
] as const;

export type Bloom = (typeof BLOOMS)[number];

export interface Profile {
  subject: string;
  level: 'Introductory' | 'Intermediate' | 'Advanced';
  bloom: string;
  minutes: number;
  language: 'English' | 'Spanish' | 'French' | 'German' | 'Hindi';
  tone: 'Warm & academic' | 'Concise' | 'Conversational';
  objectives: string;
  standards: string;
}

export interface Source {
  id: string;
  page: number | null;
  text: string;
}

export interface Section {
  heading: string;
  body: string;
  grounding: 'Directly supported' | 'Reasonable inference' | 'Needs educator review';
  source_ids: string[];
}

export interface Card {
  front: string;
  back: string;
  tags: string[];
}

export interface ArtifactData {
  title: string;
  objectives: string[];
  sections: Section[];
  flashcards: Card[];
  quality_flags: string[];
}

export interface Artifact {
  id: string;
  kind: Kind;
  data: ArtifactData;
  profile: Profile;
  revision: number;
  reviewed: boolean;
  created: number;
  updated: number;
}

export interface Job {
  id: string;
  state: 'queued' | 'running' | 'completed' | 'failed';
  kinds: Kind[];
  completed: number;
  error: string;
}

export interface ProjectRecord {
  id: string;
  user_id: string;
  title: string;
  filename: string;
  settings: Profile;
  source: Source[];
  artifacts: Artifact[];
  job: (Job & { created: number }) | null;
  created: number;
  updated: number;
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  created: number;
}

export interface SessionRecord {
  tokenDigest: string;
  user_id: string;
  csrf: string;
  expires: number;
}

export const DEFAULT_PROFILE: Profile = {
  subject: 'General',
  level: 'Introductory',
  bloom: 'Understand',
  minutes: 45,
  language: 'English',
  tone: 'Warm & academic',
  objectives: '',
  standards: '',
};

const LEVELS = new Set(['Introductory', 'Intermediate', 'Advanced']);
const LANGUAGES = new Set(['English', 'Spanish', 'French', 'German', 'Hindi']);
const TONES = new Set(['Warm & academic', 'Concise', 'Conversational']);
const GROUNDINGS = new Set([
  'Directly supported',
  'Reasonable inference',
  'Needs educator review',
]);

export function validateProfile(input: unknown): Profile {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const subject =
    typeof raw.subject === 'string' && raw.subject.trim().length > 0
      ? raw.subject.trim().slice(0, 100)
      : 'General';
  const level =
    typeof raw.level === 'string' && LEVELS.has(raw.level)
      ? (raw.level as Profile['level'])
      : 'Introductory';
  const bloom =
    typeof raw.bloom === 'string' && (BLOOMS as readonly string[]).includes(raw.bloom)
      ? raw.bloom
      : 'Understand';
  const minutesRaw = Number(raw.minutes ?? 45);
  if (!Number.isFinite(minutesRaw) || minutesRaw < 10 || minutesRaw > 240) {
    throw new Error('Learning time must be between 10 and 240 minutes.');
  }
  const language =
    typeof raw.language === 'string' && LANGUAGES.has(raw.language)
      ? (raw.language as Profile['language'])
      : 'English';
  const tone =
    typeof raw.tone === 'string' && TONES.has(raw.tone)
      ? (raw.tone as Profile['tone'])
      : 'Warm & academic';
  const objectives =
    typeof raw.objectives === 'string' ? raw.objectives.slice(0, 2000) : '';
  const standards =
    typeof raw.standards === 'string' ? raw.standards.slice(0, 1000) : '';

  return {
    subject,
    level,
    bloom,
    minutes: Math.round(minutesRaw),
    language,
    tone,
    objectives,
    standards,
  };
}

export function validateArtifact(
  rawData: unknown,
  source: Source[],
  kind: Kind,
): ArtifactData {
  if (!rawData || typeof rawData !== 'object') {
    throw new Error('Artifact data must be an object.');
  }
  const d = rawData as Record<string, unknown>;
  const title = typeof d.title === 'string' ? d.title.trim().slice(0, 200) : '';
  if (!title) {
    throw new Error('Artifact title is required.');
  }

  const objectives = Array.isArray(d.objectives)
    ? d.objectives.map((x) => String(x ?? '').trim()).filter(Boolean)
    : [];

  if (!Array.isArray(d.sections) || d.sections.length === 0 || d.sections.length > 40) {
    throw new Error('Artifact must contain between 1 and 40 sections.');
  }

  const validIds = new Set(source.map((s) => s.id));

  const sections: Section[] = d.sections.map((rawSec) => {
    if (!rawSec || typeof rawSec !== 'object') {
      throw new Error('Invalid section format.');
    }
    const sec = rawSec as Record<string, unknown>;
    const heading =
      typeof sec.heading === 'string' ? sec.heading.trim().slice(0, 200) : '';
    const body = typeof sec.body === 'string' ? sec.body.trim().slice(0, 12000) : '';
    const grounding =
      typeof sec.grounding === 'string' && GROUNDINGS.has(sec.grounding)
        ? (sec.grounding as Section['grounding'])
        : 'Needs educator review';
    if (!heading || !body) {
      throw new Error('Every section requires a heading and body.');
    }
    const sourceIds = Array.isArray(sec.source_ids)
      ? Array.from(new Set(sec.source_ids.map((s) => String(s).trim()).filter(Boolean)))
      : [];

    for (const sid of sourceIds) {
      if (!validIds.has(sid)) {
        throw new Error('AI returned an unknown source reference.');
      }
    }
    if (grounding === 'Directly supported' && sourceIds.length === 0) {
      throw new Error('Supported sections must include source references.');
    }

    return { heading, body, grounding, source_ids: sourceIds };
  });

  const rawCards = Array.isArray(d.flashcards) ? d.flashcards.slice(0, 50) : [];
  const flashcards: Card[] = rawCards.map((rawCard) => {
    if (!rawCard || typeof rawCard !== 'object') {
      throw new Error('Invalid flashcard format.');
    }
    const card = rawCard as Record<string, unknown>;
    const front = typeof card.front === 'string' ? card.front.trim().slice(0, 2000) : '';
    const back = typeof card.back === 'string' ? card.back.trim().slice(0, 4000) : '';
    if (!front || !back) {
      throw new Error('Flashcards require both front and back text.');
    }
    const tags = Array.isArray(card.tags)
      ? card.tags.map((t) => String(t ?? '').trim()).filter(Boolean)
      : [];
    return { front, back, tags };
  });

  if (kind === 'Flashcards' && flashcards.length === 0) {
    throw new Error('Flashcard deck is empty.');
  }

  const quality_flags = Array.isArray(d.quality_flags)
    ? d.quality_flags.map((f) => String(f ?? '').trim()).filter(Boolean)
    : [];

  return { title, objectives, sections, flashcards, quality_flags };
}
