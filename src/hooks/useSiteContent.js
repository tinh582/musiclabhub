import { useMemo } from 'react';
import { useLocale } from '../i18n/LocaleProvider';
import { buildSiteContent } from '../data/siteContent';

export function useSiteContent() {
  const { t } = useLocale();
  return useMemo(() => buildSiteContent(t), [t]);
}
