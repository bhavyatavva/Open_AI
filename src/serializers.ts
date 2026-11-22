import type { Project } from './types.ts';

function safeCsvCell(value: string, delimiter: string): string {
  const normalized = value.replace(/\t/g, ' ').replace(/[\r\n]+/g, ' ');
  const guarded = /^[=+\-@]/.test(normalized.trimStart())
    ? `'${normalized}`
    : normalized;
  if (
    delimiter === ',' &&
    (guarded.includes(',') || guarded.includes('"') || guarded.includes('\n'))
  ) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

export function serializeExport(
  project: Project,
  fmt: 'json' | 'md' | 'csv' | 'anki',
): { body: string; mime: string; extension: string } {
  if (fmt === 'json') {
    return {
      body: JSON.stringify({ schema_version: 1, ...project }, null, 2),
      mime: 'application/json; charset=utf-8',
      extension: 'json',
    };
  }

  if (fmt === 'md') {
    const lines: string[] = [
      `# ${project.title}`,
      '',
      `Source: ${project.filename}`,
      '',
      'Learning profile: ' + JSON.stringify(project.settings),
      '',
    ];

    for (const a of project.artifacts) {
      const d = a.data;
      lines.push(
        `## ${a.kind}: ${d.title}`,
        '',
        'Generation profile: ' + JSON.stringify(a.profile),
        '',
        'Review status: ' + (a.reviewed ? 'Reviewed' : 'Needs review'),
        '',
      );
      for (const obj of d.objectives) {
        lines.push(`- ${obj}`);
      }
      for (const s of d.sections) {
        lines.push(
          '',
          `### ${s.heading}`,
          '',
          s.body,
          '',
          `Grounding: ${s.grounding} | Sources: ${s.source_ids.join(', ')}`,
        );
      }
      for (const c of d.flashcards) {
        lines.push('', `**Q:** ${c.front}`, '', `**A:** ${c.back}`);
      }
      lines.push('', 'Quality flags: ' + d.quality_flags.join('; '));
    }

    lines.push('', '## Source passages');
    for (const s of project.source) {
      lines.push(`\n### ${s.id} (page ${s.page ?? 'n/a'})\n\n${s.text}`);
    }

    return {
      body: lines.join('\n'),
      mime: 'text/markdown; charset=utf-8',
      extension: 'md',
    };
  }

  const delimiter = fmt === 'anki' ? '\t' : ',';
  const rows: string[] = [];
  if (fmt === 'csv') {
    rows.push('Front,Back,Tags');
  }
  for (const a of project.artifacts) {
    for (const c of a.data.flashcards) {
      rows.push(
        [
          safeCsvCell(c.front, delimiter),
          safeCsvCell(c.back, delimiter),
          safeCsvCell(c.tags.join(' '), delimiter),
        ].join(delimiter),
      );
    }
  }
  return {
    body: rows.join('\n') + (rows.length ? '\n' : ''),
    mime:
      fmt === 'anki'
        ? 'text/plain; charset=utf-8'
        : 'text/csv; charset=utf-8',
    extension: fmt === 'anki' ? 'tsv' : 'csv',
  };
}
