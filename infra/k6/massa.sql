-- Massa sintética da carga (HU40, PZ-231). Dados 100% FICTÍCIOS: nomes, CPFs, OABs e números
-- de processo gerados por sequência. Os vencimentos são valores de teste para encher as telas,
-- não prazos calculados (o cálculo de prazo é só do motor, CLAUDE.md seção 4).
-- Idempotente: ids derivados de md5('carga-...'); rodar de novo não duplica.
-- Uso (infra/k6/carga.sh, só no ambiente local): psql -U pz_dev -v tenants=1000 -f massa.sql
\set ON_ERROR_STOP on
\if :{?tenants}
\else
  \set tenants 1000
\endif

BEGIN;

-- Id determinístico no formato UUIDv7 (versão 7, variante 8): o kernel recusa UUID fora do padrão.
CREATE FUNCTION pg_temp.id_carga(semente text) RETURNS uuid LANGUAGE sql IMMUTABLE AS
  $$ SELECT overlay(overlay(md5(semente) PLACING '7' FROM 13) PLACING '8' FROM 17)::uuid $$;

-- 1 escritório por número; cada um com 1 usuário advogado, 5 OABs, 20 processos, 40 prazos e
-- 75 publicações do dia (1.000 escritórios = 5.000 OABs e 75 mil publicações por dia).
CREATE TEMP TABLE carga_tenant ON COMMIT DROP AS
SELECT n,
       pg_temp.id_carga('carga-tenant-' || n) AS tenant_id,
       pg_temp.id_carga('carga-usuario-' || n) AS usuario_id,
       pg_temp.id_carga('carga-advogado-' || n) AS advogado_id
FROM generate_series(1, :tenants) AS n;

INSERT INTO tenant (id, nome, tipo)
SELECT tenant_id, 'Carga k6 ' || n || ' (fictício)', 'escritorio' FROM carga_tenant
ON CONFLICT DO NOTHING;

INSERT INTO usuario (id, tenant_id, nome, email)
SELECT usuario_id, tenant_id, 'Advogada Carga ' || n, 'carga' || n || '@carga.invalid'
FROM carga_tenant
ON CONFLICT DO NOTHING;

INSERT INTO usuario_perfil (tenant_id, usuario_id, perfil)
SELECT tenant_id, usuario_id, 'advogado' FROM carga_tenant
ON CONFLICT DO NOTHING;

-- Aceite dos termos vigentes: sem ele toda rota responde "termos-pendentes".
INSERT INTO aceite_documento (tenant_id, usuario_id, documento_id, aceito_em, ip, user_agent)
SELECT t.tenant_id, t.usuario_id, d.id, now(), '127.0.0.1', 'k6-carga'
FROM carga_tenant t CROSS JOIN documento_legal d
ON CONFLICT DO NOTHING;

INSERT INTO advogado (id, tenant_id, usuario_id, nome, celular, cpf)
SELECT advogado_id, tenant_id, usuario_id, 'Advogada Carga ' || n, '11900000000',
       lpad(n::text, 11, '0')
FROM carga_tenant
ON CONFLICT DO NOTHING;

INSERT INTO oab (id, tenant_id, advogado_id, numero, uf, tipo)
SELECT pg_temp.id_carga('carga-oab-' || t.n || '-' || k), t.tenant_id, t.advogado_id,
       lpad((t.n * 10 + k)::text, 6, '0'), 'XA',
       (CASE WHEN k = 1 THEN 'principal' ELSE 'suplementar' END)::tipo_oab
FROM carga_tenant t CROSS JOIN generate_series(1, 5) AS k
ON CONFLICT DO NOTHING;

INSERT INTO processo (id, tenant_id, numero_cnj)
SELECT pg_temp.id_carga('carga-processo-' || t.n || '-' || k), t.tenant_id,
       lpad((t.n * 100 + k)::text, 7, '0') || '2026' || '8' || '26' || '0100' || '00'
FROM carga_tenant t CROSS JOIN generate_series(1, 20) AS k
ON CONFLICT DO NOTHING;

INSERT INTO prazo (id, tenant_id, processo_id, tipo_ato, memoria_calculo, origem, jurisdicao,
                   status, inicio, vencimento)
SELECT pg_temp.id_carga('carga-prazo-' || t.n || '-' || k), t.tenant_id,
       pg_temp.id_carga('carga-processo-' || t.n || '-' || (k % 20 + 1)),
       'Manifestação (carga fictícia)', '{"origem": "carga-k6"}', 'manual', '{}',
       (CASE WHEN k % 4 = 0 THEN 'a_confirmar' ELSE 'pendente' END)::status_prazo,
       current_date - 5, current_date + (k % 45)
FROM carga_tenant t CROSS JOIN generate_series(1, 40) AS k
ON CONFLICT DO NOTHING;

-- Publicações do dia: conteúdo global (ADR-014) e o destinatário no escritório.
INSERT INTO publicacao_conteudo (id, fonte, id_externo, hash_conteudo, data_disponibilizacao,
                                 teor, url_fonte, adaptador_versao, capturado_em)
SELECT pg_temp.id_carga('carga-publicacao-' || t.n || '-' || k), 'djen', 'carga-' || t.n || '-' || k,
       md5('carga-hash-' || t.n || '-' || k) || md5('carga-hash2-' || t.n || '-' || k),
       current_date, 'Intimação fictícia de carga ' || t.n || '-' || k || '. Prazo de 15 dias.',
       'https://carga.invalid/' || t.n || '/' || k, 'carga', date_trunc('day', now())
FROM carga_tenant t CROSS JOIN generate_series(1, 75) AS k
ON CONFLICT DO NOTHING;

INSERT INTO publicacao_destinatario (tenant_id, conteudo_id, conteudo_capturado_em, processo_id)
SELECT t.tenant_id, pg_temp.id_carga('carga-publicacao-' || t.n || '-' || k), date_trunc('day', now()),
       pg_temp.id_carga('carga-processo-' || t.n || '-' || (k % 20 + 1))
FROM carga_tenant t CROSS JOIN generate_series(1, 75) AS k
ON CONFLICT DO NOTHING;

COMMIT;
