import { BlockList, isIP } from 'node:net';

/**
 * Faixas que um webhook nunca alcança fora do ambiente local (SSRF): loopback, redes privadas,
 * link-local (inclui o serviço de metadados da nuvem), CGNAT, multicast e reservadas.
 */
const INTERNAS = new BlockList();
for (const [rede, prefixo] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  INTERNAS.addSubnet(rede, prefixo, 'ipv4');
}
for (const [rede, prefixo] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  INTERNAS.addSubnet(rede, prefixo, 'ipv6');
}

/** IPv4 escrito como IPv6 (`::ffff:10.0.0.1`) é checado como IPv4. */
export function enderecoInterno(endereco: string): boolean {
  const mapeado = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(endereco)?.[1];
  if (mapeado !== undefined) return INTERNAS.check(mapeado, 'ipv4');
  const versao = isIP(endereco);
  if (versao === 0) return true;
  return INTERNAS.check(endereco, versao === 4 ? 'ipv4' : 'ipv6');
}
