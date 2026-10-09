import { useEffect, useRef, useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';

import { checkApiHealth } from '@/services/health.service';
import { ApiError } from '@/services/http/errors';

export function ApiHealthCheck() {
  const active = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Sin comprobar');

  useEffect(() => () => {
    active.current?.abort();
    active.current = null;
  }, []);

  async function check() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setMessage('Comprobando API…');
    try {
      await checkApiHealth({ signal: controller.signal });
      if (active.current === controller) setMessage('API disponible: GET /health correcto.');
    } catch (error) {
      if (active.current === controller) {
        const failure = error instanceof ApiError ? error : new ApiError('network');
        setMessage(`${failure.message}${failure.status ? ` (HTTP ${failure.status})` : ''}`);
      }
    } finally {
      if (active.current === controller) {
        active.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <View style={styles.container}>
      <Button title={loading ? 'Comprobando…' : 'Comprobar API'} disabled={loading} onPress={check} />
      <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 16, alignItems: 'center' },
  message: { marginTop: 8, textAlign: 'center' },
});
