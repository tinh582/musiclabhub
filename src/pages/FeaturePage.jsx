import { Link, useParams } from 'react-router-dom';
import { RecommendationStudio } from '../components/RecommendationStudio';
import { PracticeRoom } from '../components/PracticeRoom';
import { TranscriptionLab } from '../components/TranscriptionLab';
import { ClassificationLab } from '../components/ClassificationLab';
import { VisualizationsLab } from '../components/VisualizationsLab';
import { AnalyticsLab } from '../components/AnalyticsLab';
import { EffectsLab } from '../components/EffectsLab';
import { ComposerLab } from '../components/ComposerLab';
import { InstrumentLab } from '../components/InstrumentLab';
import { featurePages } from '../data/siteContent';

function getAccentLabel(accent) {
  if (accent === 'gold') return 'Golden data story';
  if (accent === 'coral') return 'Creative analysis';
  if (accent === 'blue') return 'Experimental mode';
  return 'Realtime workflow';
}

export function FeaturePage() {
  const { slug } = useParams();
  const page = featurePages.find((item) => item.slug === slug);

  if (!page) {
    return (
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Missing page</p>
          <h3>That module was not found.</h3>
          <p>Return to the dashboard and choose one of the available music feature pages.</p>
          <div className="hero-actions">
            <Link className="button button--primary" to="/">
              Back to dashboard
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="page-stack">
      <section className={`hero-card hero-card--feature accent-${page.accent}`}>
        <div className="hero-copy">
          <p className="eyebrow">{page.label}</p>
          <h3>{page.title}</h3>
          <p>{page.summary}</p>
          <div className="hero-actions">
            <Link className="button button--primary" to="/">
              Back to dashboard
            </Link>
            <span className="hero-note">{getAccentLabel(page.accent)}</span>
          </div>
        </div>
        <div className="metric-strip">
          {page.metrics.map((metric) => (
            <article key={metric.label} className="metric-card">
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
            </article>
          ))}
        </div>
      </section>

      {page.slug === 'recommendation' ? <RecommendationStudio /> : null}
      {page.slug === 'practice' ? <PracticeRoom /> : null}
      {page.slug === 'classification' ? <ClassificationLab /> : null}
      {page.slug === 'transcription' ? <TranscriptionLab /> : null}
      {page.slug === 'visualizations' ? <VisualizationsLab /> : null}
      {page.slug === 'composer' ? <ComposerLab /> : null}
      {page.slug === 'analytics' ? <AnalyticsLab /> : null}
      {page.slug === 'effects' ? <EffectsLab /> : null}
      {page.slug === 'instrument' ? <InstrumentLab /> : null}

      <section className="content-grid content-grid--three">
        {page.panels.map((panel) => (
          <article key={panel.title} className="panel panel--filled">
            <div className="section-heading">
              <p className="eyebrow">{panel.title}</p>
            </div>
            <ul className="feature-list">
              {panel.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel">
          <div className="section-heading">
            <p className="eyebrow">Suggested stack</p>
            <h4>Use these building blocks as the technical base for the module.</h4>
          </div>
          <div className="tag-row">
            {page.stack.map((item) => (
              <span key={item} className="tag">
                {item}
              </span>
            ))}
          </div>
        </article>

        <article className="panel panel--accent">
          <div className="section-heading">
            <p className="eyebrow">Evaluation focus</p>
            <h4>Keep the demo measurable and thesis-friendly.</h4>
          </div>
          <p className="evaluation-copy">{page.evaluation}</p>
        </article>
      </section>
    </div>
  );
}
