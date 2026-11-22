import { useMemo } from 'react';
import { kinds, type Project } from '../types.ts';

export default function InsightsPage({ projects }: { projects: Project[] }) {
  const insights = useMemo(() => {
    const artifactTotal = projects.reduce((n, p) => n + p.artifact_count, 0);
    const reviewedTotal = projects.reduce((n, p) => n + p.reviewed_count, 0);
    const byKind = kinds.map((k) => ({
      kind: k,
      count: projects.reduce(
        (n, p) => n + p.kinds.filter((x) => x === k).length,
        0,
      ),
    }));
    return { artifactTotal, reviewedTotal, byKind };
  }, [projects]);

  return (
    <>
      <div className="stats">
        {[
          ['Saved projects', projects.length],
          ['Learning artifacts', insights.artifactTotal],
          ['Educator reviewed', insights.reviewedTotal],
        ].map(([label, value]) => (
          <div className="stat" key={String(label)}>
            <small>{label}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="panel">
        <h2>What you’re creating</h2>
        {insights.byKind.map(({ kind, count }) => (
          <div className="insight-row" key={kind}>
            <span>{kind}</span>
            <strong>{count}</strong>
          </div>
        ))}
        <p className="muted">
          Counts reflect your saved projects (up to 200 most recent). These are
          content metrics, not measures of student learning.
        </p>
      </div>
    </>
  );
}
