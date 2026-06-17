import { useEffect, useState } from 'react';
import { extractAudioFeatures } from '../utils/audioFeatures';

export function useAudioFeatures(url, options = {}) {
  const enabled = options.enabled ?? true;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    if (!url || !enabled) {
      setData(null);
      setError(null);
      setLoading(false);
      return () => {};
    }

    setLoading(true);
    setError(null);

    extractAudioFeatures(url)
      .then((features) => {
        if (!active) return;
        setData(features);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [url, enabled]);

  return { data, loading, error };
}
