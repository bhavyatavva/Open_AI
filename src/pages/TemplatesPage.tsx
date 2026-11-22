import { Badge } from '../components.tsx';
import type { Kind, Profile } from '../types.ts';

const TEMPLATES = [
  {
    name: 'The first encounter',
    text: 'Introduce unfamiliar concepts with scaffolding and frequent checks.',
    level: 'Introductory' as Profile['level'],
    bloom: 'Understand',
    minutes: 45,
    types: ['Lesson plan', 'Study guide', 'Flashcards'] as Kind[],
  },
  {
    name: 'The practice lab',
    text: 'Turn understanding into application, with meaningful feedback.',
    level: 'Intermediate' as Profile['level'],
    bloom: 'Apply',
    minutes: 60,
    types: ['Quiz bank', 'Rubric', 'Assignment brief'] as Kind[],
  },
  {
    name: 'The seminar',
    text: 'Make space for evidence, competing ideas, and original thought.',
    level: 'Advanced' as Profile['level'],
    bloom: 'Evaluate',
    minutes: 90,
    types: ['Discussion prompts', 'Concept map', 'Exit ticket'] as Kind[],
  },
];

export default function TemplatesPage({
  onApply,
}: {
  onApply: (t: {
    level: Profile['level'];
    bloom: string;
    minutes: number;
    types: Kind[];
  }) => void;
}) {
  return (
    <div className="library-grid">
      {TEMPLATES.map((t, i) => (
        <article className="template-card" key={t.name}>
          <span className="template-number">0{i + 1}</span>
          <h2>{t.name}</h2>
          <p>{t.text}</p>
          <Badge>
            {t.level} · {t.minutes} min
          </Badge>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              onApply({
                level: t.level,
                bloom: t.bloom,
                minutes: t.minutes,
                types: t.types,
              })
            }
          >
            Use this template →
          </button>
        </article>
      ))}
    </div>
  );
}
