import { BlockList, isIP } from 'node:net';

const origin = Symbol('trustedRenderOrigin');

// Express itself never interprets forwarded headers. The public edge supplies a
// single client address; the direct TCP peer must belong to the verified ingress.
export function renderIngress(proxyIps = []) {
  const peers = new BlockList();
  for (const ip of proxyIps) peers.addAddress(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4');

  return (req, _res, next) => {
    const peer = req.socket.remoteAddress;
    const family = isIP(peer);
    const client = req.headers['cf-connecting-ip'];
    if (family && peers.check(peer, family === 6 ? 'ipv6' : 'ipv4')
      && req.headers['x-forwarded-proto'] === 'https'
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
