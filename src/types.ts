export const kinds = [
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

export type Kind = (typeof kinds)[number];

export const blooms = [
  'Remember',
  'Understand',
  'Apply',
  'Analyze',
  'Evaluate',
  'Create',
] as const;

export type Bloom = (typeof blooms)[number];

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

export interface Project {
  id: string;
  title: string;
  filename: string;
  settings: Profile;
  created: number;
  updated: number;
  artifact_count: number;
  reviewed_count: number;
  kinds: Kind[];
  job: Job | null;
  source: Source[];
  artifacts: Artifact[];
}

export interface Me {
  user: {
    id: string;
    name: string;
    email: string;
  };
  csrf: string;
  ai_ready: boolean;
  model: string;
  mode?: 'server' | 'offline';
}

export interface Sample {
  id: string;
  title: string;
  text: string;
}
