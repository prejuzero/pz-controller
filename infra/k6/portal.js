/* global __ENV, __VU -- variáveis globais do k6 */
// Cenário do portal (HU40, PZ-231): advogados usando dashboard, prazos, publicações e busca ao
// mesmo tempo, cada um no próprio escritório (massa FICTÍCIA de infra/k6/massa.sql).
// Os limites são os SLOs da página Padrões de engenharia.
import { check, sleep } from 'k6';
import http from 'k6/http';

const ALVO = __ENV.CARGA_ALVO || 'http://localhost:3000';
const TENANTS = Number(__ENV.CARGA_TENANTS || 1000);
const VUS = Number(__ENV.CARGA_VUS || 500);
const DURACAO = __ENV.CARGA_DURACAO || '3m';

export const options = {
  scenarios: {
    portal: {
      executor: 'ramping-vus',
      stages: [
        { duration: '1m', target: VUS },
        { duration: DURACAO, target: VUS },
        { duration: '20s', target: 0 },
      ],
    },
  },
  thresholds: {
    // Disponibilidade ≥ 99,5%.
    http_req_failed: ['rate<0.005'],
    // API: p95 < 300 ms na leitura; busca: p95 < 500 ms.
    'http_req_duration{tipo:leitura}': ['p(95)<300'],
    'http_req_duration{tipo:busca}': ['p(95)<500'],
    checks: ['rate>0.995'],
  },
};

/** Sessão pronta do escritório (gravada por carga.sh no Redis; só existe localmente). */
function cabecalhos(n) {
  return {
    Authorization: `Bearer cargak6${String(n).padStart(8, '0')}sessaoficticia`,
    'Content-Type': 'application/json',
  };
}

function ler(caminho, headers, nome) {
  const r = http.get(`${ALVO}${caminho}`, { headers, tags: { tipo: 'leitura', name: nome } });
  check(r, { [`${nome} 200`]: (x) => x.status === 200 });
}

export default function () {
  const n = ((__VU - 1) % TENANTS) + 1;
  const headers = cabecalhos(n);
  // Abrir o portal: dashboard.
  ler('/v1/dashboard/resumo', headers, 'dashboard-resumo');
  ler('/v1/dashboard/proximos-prazos?limite=10', headers, 'dashboard-proximos');
  ler('/v1/dashboard/linha-do-tempo?dias=30', headers, 'dashboard-linha');
  sleep(1 + Math.random() * 2);
  // Lista de prazos e publicações novas.
  ler('/v1/prazos?limite=50', headers, 'prazos');
  ler('/v1/publicacoes?limite=50&novas=true', headers, 'publicacoes');
  sleep(1 + Math.random() * 2);
  // Busca (POST de leitura: sem CSRF com Bearer).
  const busca = http.post(
    `${ALVO}/v1/busca/publicacoes`,
    JSON.stringify({ palavraChave: 'intimação', limite: 20 }),
    { headers, tags: { tipo: 'busca', name: 'busca-publicacoes' } },
  );
  check(busca, { 'busca 200': (x) => x.status === 200 });
  sleep(2 + Math.random() * 3);
}
