-- Retenção (HU38, LGPD). Decisões do produto de 07/10/2026, a confirmar com o jurídico:
-- registros de acesso por 1 ano; provas pseudonimizadas de escritório encerrado por 5 anos.
-- Os prazos chegam como parâmetro (configuração do worker); só o papel sistema executa. Os
-- acessos antigos o próprio sistema apaga (BYPASSRLS), sem função privilegiada.

-- Provas pseudonimizadas de um escritório encerrado há mais que o prazo. A trilha de auditoria
-- (imutável, ADR-006) e os feriados locais (sem dado pessoal) não saem por aqui.
CREATE FUNCTION pz_expurgar_provas(p_tenant uuid, p_dias integer) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant::text, true);
  IF p_dias < 1 OR NOT EXISTS (
    SELECT 1 FROM tenant
     WHERE id = p_tenant AND encerrado_em IS NOT NULL
       AND encerrado_em < now() - make_interval(days => p_dias)
  ) THEN
    RAISE EXCEPTION 'tenant % não está encerrado há mais de % dias', p_tenant, p_dias
      USING ERRCODE = 'check_violation';
  END IF;
  DELETE FROM acesso WHERE tenant_id = p_tenant;
  DELETE FROM aceite_documento WHERE tenant_id = p_tenant;
  DELETE FROM notificacao WHERE tenant_id = p_tenant;
  DELETE FROM consentimento_canal WHERE tenant_id = p_tenant;
  DELETE FROM auditoria_dado_pessoal WHERE tenant_id = p_tenant;
  DELETE FROM encerramento_conta WHERE tenant_id = p_tenant;
  DELETE FROM usuario WHERE tenant_id = p_tenant;
END
$$;

REVOKE ALL ON FUNCTION pz_expurgar_provas(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pz_expurgar_provas(uuid, integer) TO pz_sistema;
