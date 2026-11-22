import { serializeExport } from './serializers.ts';
import type { Me, Project } from './types.ts';

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'lesson'
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function triggerBlobDownload(
  filename: string,
  body: BlobPart,
  mime: string,
): void {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1500);
}

export function downloadProjectExport(
  project: Project,
  fmt: 'json' | 'md' | 'csv' | 'anki',
): void {
  const { body, mime, extension } = serializeExport(project, fmt);
  triggerBlobDownload(
    `lessonly-${slugify(project.title)}.${extension}`,
    body,
    mime,
  );
}

export function buildStandaloneKitHtml(project: Project): string {
  const sourceMap = new Map(project.source.map((s) => [s.id, s]));
  const artifactBlocks = project.artifacts
    .map((a) => {
      const d = a.data;
      const objectives = d.objectives
        .map((o) => `<li>${escapeHtml(o)}</li>`)
        .join('');
      const sections = d.sections
        .map((s) => {
          const cites = s.source_ids
            .map((id) => {
              const found = sourceMap.get(id);
              return `<details><summary>${escapeHtml(id)}</summary><p>${escapeHtml(
                found?.text || 'Source passage unavailable',
              )}</p></details>`;
            })
            .join('');
          return `<section class="sec">
            <h3>${escapeHtml(s.heading)}</h3>
            <p class="preserve">${escapeHtml(s.body)}</p>
            <div class="grounding"><span class="badge">${escapeHtml(
              s.grounding,
            )}</span>${cites}</div>
          </section>`;
        })
        .join('');

      const cards = d.flashcards.length
        ? `<h3>Flashcards (${d.flashcards.length})</h3><div class="cards">${d.flashcards
            .map(
              (c) =>
                `<details class="card"><summary>${escapeHtml(
                  c.front,
                )}</summary><p>${escapeHtml(c.back)}</p><small>${escapeHtml(
                  c.tags.join(' · '),
                )}</small></details>`,
            )
            .join('')}</div>`
        : '';

      const flags = d.quality_flags.length
        ? `<aside class="notice"><strong>Review notes</strong><ul>${d.quality_flags
            .map((f) => `<li>${escapeHtml(f)}</li>`)
            .join('')}</ul></aside>`
        : '';

      return `<article class="doc">
        <div class="kicker">${escapeHtml(a.kind)} · ${
          a.reviewed ? 'Educator reviewed' : 'Needs educator review'
        } · Revision ${a.revision}</div>
        <h2>${escapeHtml(d.title)}</h2>
        ${objectives ? `<h3>Learning objectives</h3><ul>${objectives}</ul>` : ''}
        ${sections}
        ${cards}
        ${flags}
      </article>`;
    })
    .join('');

  const passages = project.source
    .map(
      (s) => `<article class="passage">
        <span class="badge">${escapeHtml(s.id)}${
          s.page ? ` · page ${s.page}` : ''
        }</span>
        <p class="preserve">${escapeHtml(s.text)}</p>
      </article>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(project.title)} · Lessonly Offline Kit</title>
<style>
  :root{--paper:#fbfcf7;--ink:#20382b;--deep:#1e4032;--green:#476e4a;--muted:#657568;--line:#dce4d7}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.6 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:40px 20px}
  main{max-width:920px;margin:0 auto}
  h1,h2,h3{font-family:Georgia,'Times New Roman',serif;font-weight:500;line-height:1.2}
  h1{font-size:34px;margin:6px 0 8px;letter-spacing:-0.8px}
  .meta{color:var(--muted);font-size:13px;margin-bottom:28px;border-bottom:1px solid var(--line);padding-bottom:18px}
  .badge{display:inline-block;border-radius:20px;padding:3px 10px;color:#325d44;background:#e7efe7;font-size:11px;font-weight:600}
  .doc{background:#fff;border:1px solid var(--line);border-radius:14px;padding:28px;margin-bottom:24px}
  .kicker{text-transform:uppercase;letter-spacing:1px;font-size:10px;color:var(--muted)}
  .sec{margin-top:20px;padding-top:14px;border-top:1px solid var(--line)}
  .preserve{white-space:pre-wrap;overflow-wrap:anywhere}
  .grounding{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:flex-start}
  details{font-size:12px}
  summary{cursor:pointer;color:var(--green);font-weight:600}
  .grounding p{background:#f3f6f0;padding:10px;border-radius:8px;margin-top:6px;white-space:pre-wrap}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:12px}
  .card{border:1px solid var(--line);border-radius:10px;padding:14px;background:#f8faf5}
  .notice{background:#faf1df;padding:14px;border-radius:8px;margin-top:18px;font-size:12px}
  .passage{background:#fff;border:1px solid var(--line);border-radius:10px;padding:18px;margin-bottom:12px}
  @media print{body{background:#fff;padding:0}.doc{break-before:page;border:none;padding:0}}
</style>
</head>
<body>
<main>
  <span class="badge">Lessonly Studio · Offline Kit Reader</span>
  <h1>${escapeHtml(project.title)}</h1>
  <p class="meta">${escapeHtml(project.settings.subject)} · ${escapeHtml(
    project.settings.level,
  )} · Bloom’s: ${escapeHtml(project.settings.bloom)} · ${
    project.settings.minutes
  } min · ${escapeHtml(project.settings.language)}</p>
  ${
    artifactBlocks ||
    '<p class="meta">No artifacts generated yet. Source passages are included below.</p>'
  }
  <h2>Source passages (${project.source.length})</h2>
  ${passages}
</main>
</body>
</html>`;
}

export function downloadProjectHtml(project: Project): void {
  const html = buildStandaloneKitHtml(project);
  triggerBlobDownload(
    `lessonly-${slugify(project.title)}-kit.html`,
    html,
    'text/html; charset=utf-8',
  );
}

function wrapCanvasLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) {
        lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -1)}…`;
        return lines;
      }
    } else {
      current = test;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

export async function renderProjectPosterBlob(project: Project): Promise<Blob> {
  const width = 1600;
  const height = 1040;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas rendering unavailable in this browser.');

  // Background
  ctx.fillStyle = '#fbfcf7';
  ctx.fillRect(0, 0, width, height);

  // Subtle top editorial band
  ctx.fillStyle = '#e5ecdd';
  ctx.fillRect(0, 0, width, 240);

  // Border frame
  ctx.strokeStyle = '#dce4d7';
  ctx.lineWidth = 3;
  ctx.strokeRect(36, 36, width - 72, height - 72);

  // Brand mark
  ctx.fillStyle = '#1e4032';
  ctx.beginPath();
  ctx.roundRect(76, 72, 48, 48, 12);
  ctx.fill();
  ctx.fillStyle = '#f1d79a';
  ctx.font = 'bold 28px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✦', 100, 97);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#20382b';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('lessonly · Teaching Studio Kit Summary', 142, 97);

  // Title
  ctx.fillStyle = '#20382b';
  ctx.font = '500 44px Georgia, serif';
  const titleLines = wrapCanvasLines(ctx, project.title, width - 160, 2);
  titleLines.forEach((line, i) => {
    ctx.fillText(line, 76, 168 + i * 50);
  });

  // Metadata pills line
  ctx.fillStyle = '#476e4a';
  ctx.font = '600 20px system-ui, sans-serif';
  const meta = `${project.settings.subject}   •   ${project.settings.level}   •   Bloom’s: ${project.settings.bloom}   •   ${project.settings.minutes} min   •   ${project.settings.language}`;
  ctx.fillText(meta, 76, 286);

  // Stats boxes
  const cards: [string, string][] = [
    ['SAVED ARTIFACTS', String(project.artifacts.length)],
    [
      'EDUCATOR REVIEWED',
      String(project.artifacts.filter((a) => a.reviewed).length),
    ],
    ['CITED PASSAGES', String(project.source.length)],
  ];
  cards.forEach(([label, val], idx) => {
    const x = 76 + idx * 490;
    const y = 326;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#dce4d7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, 456, 140, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#657568';
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.fillText(label, x + 28, y + 40);

    ctx.fillStyle = '#1e4032';
    ctx.font = '500 52px Georgia, serif';
    ctx.fillText(val, x + 28, y + 98);
  });

  // Artifacts & Key Source Preview
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#dce4d7';
  ctx.beginPath();
  ctx.roundRect(76, 502, 710, 444, 16);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#476e4a';
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillText('INCLUDED ARTIFACTS', 106, 546);

  const artList = project.artifacts.slice(0, 7);
  if (artList.length === 0) {
    ctx.fillStyle = '#657568';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText('Source prepared — ready to shape learning kit.', 106, 604);
  } else {
    artList.forEach((a, i) => {
      const rowY = 592 + i * 48;
      ctx.fillStyle = a.reviewed ? '#245f3c' : '#c77559';
      ctx.beginPath();
      ctx.arc(114, rowY, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#20382b';
      ctx.font = '600 20px system-ui, sans-serif';
      ctx.fillText(a.kind, 134, rowY + 1);

      ctx.fillStyle = '#657568';
      ctx.font = '16px system-ui, sans-serif';
      const sub = `${a.data.sections.length} sections${
        a.data.flashcards.length ? ` · ${a.data.flashcards.length} cards` : ''
      } · ${a.reviewed ? 'Reviewed' : 'Needs review'}`;
      ctx.fillText(sub, 360, rowY + 1);
    });
  }

  // Right card: Objectives or source excerpt
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#dce4d7';
  ctx.beginPath();
  ctx.roundRect(816, 502, 708, 444, 16);
  ctx.fill();
  ctx.stroke();

  const firstObjs = project.artifacts.flatMap((a) => a.data.objectives).slice(0, 5);
  ctx.fillStyle = '#476e4a';
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillText(
    firstObjs.length ? 'KEY LEARNING OBJECTIVES' : 'SOURCE MATERIAL EXCERPT',
    846,
    546,
  );

  ctx.fillStyle = '#20382b';
  if (firstObjs.length) {
    ctx.font = '20px Georgia, serif';
    let yCursor = 596;
    for (const obj of firstObjs) {
      const wrapped = wrapCanvasLines(ctx, `• ${obj}`, 644, 2);
      for (const line of wrapped) {
        if (yCursor < 915) {
          ctx.fillText(line, 846, yCursor);
          yCursor += 30;
        }
      }
      yCursor += 10;
    }
  } else {
    ctx.font = '21px Georgia, serif';
    const excerpt = wrapCanvasLines(
      ctx,
      project.source[0]?.text || 'No source excerpt available.',
      644,
      9,
    );
    excerpt.forEach((line, i) => {
      ctx.fillText(line, 846, 598 + i * 34);
    });
  }

  // Footer
  ctx.fillStyle = '#657568';
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText(
    `Offline summary card · File: ${project.filename} · Exported ${new Date().toLocaleDateString()}`,
    76,
    982,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode summary PNG.'));
    }, 'image/png');
  });
}

export async function downloadProjectPng(project: Project): Promise<void> {
  const blob = await renderProjectPosterBlob(project);
  triggerBlobDownload(
    `lessonly-${slugify(project.title)}-summary.png`,
    blob,
    'image/png',
  );
}

export async function downloadPortableStudio(
  user: Me['user'],
  projects: Project[],
  isServerMode: boolean,
): Promise<void> {
  if (isServerMode) {
    const res = await fetch('/api/portable-html', { credentials: 'same-origin' });
    if (!res.ok) {
      throw new Error('Could not package offline HTML bundle.');
    }
    const html = await res.text();
    triggerBlobDownload(
      'lessonly-studio-offline.html',
      html,
      'text/html; charset=utf-8',
    );
    return;
  }

  // Running locally via file://: snapshot current HTML shell with latest projects
  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  const rootEl = clone.querySelector('#root');
  if (rootEl) {
    rootEl.innerHTML = '';
  }
  const oldSnapshot = clone.querySelector('#lessonly-snapshot');
  if (oldSnapshot) {
    oldSnapshot.remove();
  }
  const snapshotScript = document.createElement('script');
  snapshotScript.id = 'lessonly-snapshot';
  snapshotScript.type = 'application/json';
  snapshotScript.textContent = JSON.stringify({
    user,
    projects,
    exportedAt: Date.now(),
  }).replace(/<\/script/gi, '<\\/script');

  const bodyEl = clone.querySelector('body');
  if (bodyEl) {
    bodyEl.appendChild(snapshotScript);
  }
  const html = `<!doctype html>\n${clone.outerHTML}`;
  triggerBlobDownload(
    'lessonly-studio-offline.html',
    html,
    'text/html; charset=utf-8',
  );
}
