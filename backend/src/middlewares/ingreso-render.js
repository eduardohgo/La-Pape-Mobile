import { BlockList, isIP } from 'node:net';

const origin = Symbol('trustedRenderOrigin');

// An explicitly verified TCP proxy is the default. The Render Free exception
// relies on provider-enforced public ingress; it must never be enabled on paid
// plans or other hosts, which can receive private requests with forged headers.
export function renderIngress(proxyIps = [], { managedFreeEdge = false, expectedHost = '' } = {}) {
  const peers = new BlockList();
  for (const ip of proxyIps) peers.addAddress(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4');

  return (req, _res, next) => {
    const peer = req.socket.remoteAddress;
    const family = isIP(peer);
    const client = req.headers['cf-connecting-ip'];
    const trustedPeer = family && (managedFreeEdge
      ? req.headers.host === expectedHost && Boolean(expectedHost)
      : peers.check(peer, family === 6 ? 'ipv6' : 'ipv4'));
    if (trustedPeer && req.headers['x-forwarded-proto'] === 'https'
      && typeof client === 'string' && !client.includes('%') && isIP(client)) {
      req[origin] = client;
    }

    for (const name of Object.keys(req.headers)) {
      if (name === 'forwarded' || name.startsWith('x-forwarded-') || name === 'cf-connecting-ip') {
        delete req.headers[name];
      }
    }
    next();
  };
}

export function hasTrustedRenderHttps(req) {
  return Boolean(req[origin]);
}

export function clientAddress(req) {
  return req[origin] ?? req.ip;
}
