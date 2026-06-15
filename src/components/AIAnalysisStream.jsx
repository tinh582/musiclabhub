import { useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleProvider';

export function AIAnalysisStream({
  active = false,
  title = 'AI analysis',
  steps = [],
  findings = [],
  model = 'Local audio intelligence',
}) {
  const { t } = useLocale();
  const [visibleStep, setVisibleStep] = useState(active ? 0 : steps.length);

  useEffect(() => {
    if (!active) {
      setVisibleStep(steps.length);
      return undefined;
    }
    setVisibleStep(0);
    const timer = window.setInterval(() => {
      setVisibleStep((current) => Math.min(current + 1, Math.max(0, steps.length - 1)));
    }, 650);
    return () => window.clearInterval(timer);
  }, [active, steps.length]);

  if (!active && !findings.length) return null;

  return (
    <section className={`ai-stream${active ? ' is-active' : ' is-complete'}`} aria-label={title}>
      <div className="ai-stream__header">
        <div>
          <p className="eyebrow">{t('ai.process', 'Analysis process')}</p>
          <h4>{title}</h4>
        </div>
        <span role="status" aria-live="polite">
          {active ? t('ai.status.active', 'Analyzing now') : t('ai.status.complete', 'Analysis complete')}
        </span>
      </div>

      <div className="ai-stream__model">
        <span className="ai-stream__pulse" aria-hidden="true" />
        <span>{model}</span>
      </div>

      <ol className="ai-stream__steps">
        {steps.map((step, index) => {
          const complete = !active || index < visibleStep;
          const current = active && index === visibleStep;
          return (
            <li key={step} className={`${complete ? 'is-complete' : ''}${current ? ' is-current' : ''}`}>
              <span aria-hidden="true">{complete ? '✓' : current ? '•' : ''}</span>
              <strong>{step}</strong>
              <small>
                {complete
                  ? t('ai.step.done', 'Done')
                  : current
                    ? t('ai.step.running', 'Running')
                    : t('ai.step.queued', 'Queued')}
              </small>
            </li>
          );
        })}
      </ol>

      {!active && findings.length ? (
        <div className="ai-stream__findings">
          {findings.map((finding) => (
            <div key={`${finding.label}-${finding.value}`}>
              <span>{finding.label}</span>
              <strong>{finding.value}</strong>
              {finding.detail ? <small>{finding.detail}</small> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
