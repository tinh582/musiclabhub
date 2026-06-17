import { lazy, Suspense } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleProvider';
import { useSiteContent } from '../hooks/useSiteContent';

const MODULES = {
  recommendation: lazy(() => import('../components/RecommendationStudio').then((module) => ({ default: module.RecommendationStudio }))),
  practice: lazy(() => import('../components/PracticeRoom').then((module) => ({ default: module.PracticeRoom }))),
  transcription: lazy(() => import('../components/TranscriptionLab').then((module) => ({ default: module.TranscriptionLab }))),
  classification: lazy(() => import('../components/ClassificationLab').then((module) => ({ default: module.ClassificationLab }))),
  visualizations: lazy(() => import('../components/VisualizationsLab').then((module) => ({ default: module.VisualizationsLab }))),
  analytics: lazy(() => import('../components/AnalyticsLab').then((module) => ({ default: module.AnalyticsLab }))),
  effects: lazy(() => import('../components/EffectsLab').then((module) => ({ default: module.EffectsLab }))),
  composer: lazy(() => import('../components/ComposerLab').then((module) => ({ default: module.ComposerLab }))),
  instrument: lazy(() => import('../components/InstrumentLab').then((module) => ({ default: module.InstrumentLab }))),
};

function getAccentLabel(accent, t) {
  if (accent === 'gold') return t('feature.accent.gold', 'Golden data story');
  if (accent === 'coral') return t('feature.accent.coral', 'Creative analysis');
  if (accent === 'blue') return t('feature.accent.blue', 'Experimental mode');
  return t('feature.accent.teal', 'Realtime workflow');
}

export function FeaturePage() {
  const { t } = useLocale();
  const { featurePages } = useSiteContent();
  const { slug } = useParams();
  const {
    workspaceAudio,
    moduleHandoff,
    sendModuleHandoff,
    clearModuleHandoff,
    moduleWorkspaceState,
    setModuleState,
    clearModuleState,
    saveAnalysis,
  } = useOutletContext();
  const page = featurePages.find((item) => item.slug === slug);
  const ActiveModule = MODULES[slug];

  if (!page) {
    return (
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">{t('feature.missing.eyebrow', 'Missing page')}</p>
          <h3>{t('feature.missing.title', 'That module was not found.')}</h3>
          <p>{t('feature.missing.body', 'Return to the dashboard and choose one of the available music feature pages.')}</p>
          <div className="hero-actions">
            <Link className="button button--primary" to="/">
              {t('feature.back', 'Back to dashboard')}
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
              {t('feature.back', 'Back to dashboard')}
            </Link>
            <span className="hero-note">{getAccentLabel(page.accent, t)}</span>
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

      {ActiveModule ? (
        <Suspense fallback={<div className="module-loading">Loading {page.label}...</div>}>
          <ActiveModule
            workspaceAudio={workspaceAudio}
            moduleHandoff={moduleHandoff}
            sendModuleHandoff={sendModuleHandoff}
            clearModuleHandoff={clearModuleHandoff}
            moduleState={moduleWorkspaceState?.[slug] || null}
            setModuleState={(nextState) => setModuleState?.(slug, nextState)}
            clearModuleState={() => clearModuleState?.(slug)}
            saveAnalysis={saveAnalysis}
          />
        </Suspense>
      ) : null}

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
        <article className="panel panel--accent">
          <div className="section-heading">
            <p className="eyebrow">{t('feature.evaluation.eyebrow', 'Evaluation focus')}</p>
            <h4>{t('feature.evaluation.title', 'Keep the demo measurable and thesis-friendly.')}</h4>
          </div>
          <p className="evaluation-copy">{page.evaluation}</p>
        </article>
      </section>
    </div>
  );
}
