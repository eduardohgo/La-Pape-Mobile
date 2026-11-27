export function createRegistrationMailer(config, request = fetch) {
  return Object.freeze({
    async send(email, code) {
      if (!/^\d{6}$/.test(code)) throw new Error('Correo de verificación no disponible');
      const controller = new AbortController();
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, 5000);
      });
      try {
        await Promise.race([timeout, (async () => {
          const response = await request('https://api.brevo.com/v3/smtp/email', {
            method: 'POST', redirect: 'error', signal: controller.signal,
            headers: { 'api-key': config.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ sender: { name: 'La Pape', email: config.sender }, to: [{ email }],
              subject: 'Verifica tu cuenta de La Pape',
              textContent: 'Tu código de verificación es ' + code + '. Caduca en 15 minutos y solo puede usarse una vez. Si no lo solicitaste, ignora este mensaje. No compartas tu código.' }),
          });
          if (response.status !== 201) throw new Error('provider');
          const result = await response.json();
          if (typeof result?.messageId !== 'string' || !result.messageId) throw new Error('provider');
        })()]);
      } catch { throw new Error('Correo de verificación no disponible'); }
      finally { clearTimeout(timer); }
    },
  });
}
