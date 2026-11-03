# Plano de resposta a incidentes (HU37, PZ-222)

> **Rascunho da engenharia para revisão do jurídico e do encarregado (DPO).** Só vale depois da aprovação deles, registrada neste arquivo por PR. Prazos e conteúdos de comunicação foram transcritos da [Resolução CD/ANPD nº 15/2024](https://bibliotecadigital.mj.gov.br/bitstream/1/12879/2/RES_ANPD_2024_15.html) (Regulamento de Comunicação de Incidente de Segurança, RCIS), conferida em 03/11/2026. Itens marcados _a validar_ dependem de parecer. Requisito: RNF25.

## 1. Escopo

Vale para qualquer evento que comprometa a confidencialidade, a integridade ou a disponibilidade do PrejuZero ou dos dados que ele trata: vazamento, acesso indevido, perda de dados, quebra da cadeia da trilha de auditoria, indisponibilidade prolongada, falha na captura do DJEN ou no envio de notificações que possa causar perda de prazo.

Incidente que afeta **dados pessoais** segue também a seção 6 (ANPD e titulares).

## 2. Papéis

| Papel                    | Quem                                   | Responsabilidade                                                                  |
| ------------------------ | -------------------------------------- | --------------------------------------------------------------------------------- |
| Coordenador do incidente | plantonista de engenharia que detectou | abre o registro, convoca, decide contenção técnica, mantém a linha do tempo       |
| Encarregado (DPO)        | _a definir_ (ver `docs/lgpd`)          | avalia risco aos titulares, decide e redige a comunicação à ANPD e aos titulares  |
| Jurídico                 | _a definir_                            | enquadramento legal, relação controlador × operador com os escritórios, contratos |
| Comunicação com clientes | responsável pelo produto               | aviso aos escritórios afetados, página de status, respostas ao suporte            |
| Responsável técnico      | dono do sistema afetado                | investigação, correção, preservação de evidências                                 |

Contatos de plantão ficam fora do repositório (cofre da equipe). _A validar:_ quem substitui cada papel em férias e fora do horário.

## 3. Classificação

| Severidade | Critério                                                                                                                                                 | Resposta inicial |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **S1**     | dados pessoais ou sigilosos expostos; acesso entre tenants; credenciais ou chaves vazadas; cadeia da auditoria quebrada; prazo exibido com data errada   | imediata, 24×7   |
| **S2**     | captura do DJEN ou notificações paradas com risco de perda de prazo; indisponibilidade do portal; vulnerabilidade explorável sem evidência de exploração | até 1 hora       |
| **S3**     | degradação sem risco a prazo ou a dados; vulnerabilidade sem exploração conhecida                                                                        | próximo dia útil |

Na dúvida, classifique na severidade maior. Incidentes que tocam prazo têm o mesmo peso de vazamento: o produto promete que nenhum prazo será perdido.

## 4. Fluxo

1. **Detectar e registrar.** Fontes: alertas ([alertas.md](alertas.md)), Sentry, verificador diário da cadeia de auditoria, relato de cliente, DAST/pentest, aviso de terceiro. O coordenador abre o registro (seção 7) com a hora do conhecimento (horário do servidor, UTC).
2. **Conter.** Exemplos: revogar sessões e tokens (`identidade`), rotacionar chaves ([rotacao-de-chaves.md](rotacao-de-chaves.md)), desligar o adaptador afetado pela configuração, bloquear IP ou rota, pausar filas no BullMQ. Contenção nunca apaga evidência (seção 5).
3. **Avaliar dados pessoais.** Se houve dados pessoais, o DPO aplica os critérios da seção 6.1 e decide a comunicação. O relógio do art. 6º, § 1º, do RCIS começa no conhecimento de que dados pessoais foram afetados.
4. **Erradicar e recuperar.** Correção pelo fluxo normal (PR, revisão, CI); hotfix só com 2 revisores nas áreas do CLAUDE.md §15. Se houver risco a prazo, levantar os prazos afetados e avisar os escritórios para conferência manual.
5. **Comunicar.** Interna (canal do incidente), clientes (seção 6.4), ANPD e titulares (seção 6).
6. **Encerrar e aprender.** Revisão sem culpados em até 5 dias úteis: linha do tempo, causa raiz, o que funcionou, ações com dono e prazo (viram cards no quadro). Bug corrigido traz teste que o reproduz.

## 5. Preservação de evidências

- Não reiniciar, apagar ou recriar o recurso comprometido antes de capturar o estado: snapshot de disco e banco, export de logs (pino/OpenTelemetry), eventos do Sentry, cabeçalhos e corpo da requisição suspeita (sem segredos).
- A trilha `evento_auditoria` é imutável e encadeada por hash (ADR-006): registrar o último hash válido e o resultado do verificador no momento da detecção.
- Guardar as evidências em local de acesso restrito, com registro de quem acessou e quando (cadeia de custódia), e anexar a lista ao registro do incidente.
- Logs nunca contêm CPF, senha, token ou teor sigiloso (CLAUDE.md §3); se um log vazado contiver, isso é um segundo incidente.

## 6. Comunicação à ANPD e aos titulares

### 6.1 Quando comunicar (RCIS, art. 5º)

O incidente pode acarretar risco ou dano relevante quando puder **afetar significativamente** interesses e direitos fundamentais dos titulares **e**, cumulativamente, envolver ao menos um dos critérios (art. 5º, I a VI): dados sensíveis; dados de crianças, adolescentes ou idosos; dados financeiros; dados de autenticação em sistemas; dados protegidos por sigilo legal, judicial ou profissional; dados em larga escala.

Atenção ao PrejuZero: intimações, processos e anotações dos advogados são, em regra, dados sob **sigilo profissional** (inciso V), e senhas/2FA são **dados de autenticação** (inciso IV). A decisão final de comunicar é do controlador, com parecer do DPO.

### 6.2 Quem comunica — _a validar pelo jurídico_

O RCIS atribui a comunicação ao **controlador**. Para os dados dos processos e clientes dos escritórios, o PrejuZero tende a atuar como **operador** e o escritório como controlador; para os dados de conta e cobrança, o PrejuZero é controlador. O jurídico deve definir essa divisão no contrato e no [registro de tratamento](../lgpd/registro-de-tratamento.md), e a forma e o prazo em que o PrejuZero avisa o escritório controlador.

### 6.3 Prazos (RCIS)

| Comunicação                    | Prazo                                                                 | Fundamento                   |
| ------------------------------ | --------------------------------------------------------------------- | ---------------------------- |
| ANPD                           | 3 dias úteis do conhecimento de que o incidente afetou dados pessoais | art. 6º, caput e § 1º        |
| Complemento à ANPD             | 20 dias úteis da data da comunicação, de maneira fundamentada         | art. 6º, § 3º                |
| Titulares                      | 3 dias úteis do conhecimento de que o incidente afetou dados pessoais | art. 9º, caput               |
| Agente de pequeno porte        | prazos acima em dobro                                                 | art. 6º, § 8º; art. 9º, § 6º |
| Registro do incidente (guarda) | mínimo de 5 anos da data do registro, inclusive dos não comunicados   | art. 10, caput               |

_A validar:_ se o PrejuZero se enquadra como agente de pequeno porte; se a ressalva de legislação específica do art. 6º se aplica a algum caso.

### 6.4 Conteúdo mínimo

**À ANPD** (art. 6º, § 2º, I a XII): natureza e categoria dos dados; número de titulares afetados (discriminando crianças, adolescentes e idosos); medidas de segurança antes e depois; riscos e possíveis impactos; motivos da demora, se fora do prazo; medidas para reverter ou mitigar; data da ocorrência (se possível) e do conhecimento; dados do encarregado; identificação do controlador (e declaração de pequeno porte, se for o caso); identificação do operador; descrição do incidente e causa principal; total de titulares tratados nas atividades afetadas.

**Aos titulares** (art. 9º, I a VII, e § 1º): natureza e categoria dos dados; medidas de segurança; riscos e impactos; motivos da demora; medidas de mitigação; data do conhecimento; contato para informações e do encarregado. Linguagem simples, de forma direta e individualizada quando for possível identificá-los.

**Aos escritórios clientes** (contratual, _a validar_): o que aconteceu, dados e período afetados, o que já foi feito, o que o escritório precisa fazer (ex.: conferir prazos manualmente, trocar senha) e o contato do incidente. Seguindo o CLAUDE.md §10, avisos por e-mail não expõem partes nem teor sigiloso.

## 7. Registro do incidente (RCIS, art. 10, § 1º)

Todo incidente, comunicado ou não, tem registro guardado por no mínimo 5 anos, com: data de conhecimento; circunstâncias; natureza e categoria dos dados; número de titulares; avaliação de risco e possíveis danos; medidas de correção e mitigação; forma e conteúdo das comunicações feitas; motivos da não comunicação, quando for o caso. Acrescentar: severidade, linha do tempo, evidências preservadas e ações da revisão.

_A validar:_ onde o registro fica (fora do produto, com acesso restrito ao DPO e à coordenação).

## 8. Simulação de mesa (tabletop)

Frequência proposta: semestral e após mudança relevante na equipe ou na arquitetura (_a validar_). Duração: 1 hora, com todos os papéis da seção 2. Cada simulação gera um registro (data, participantes, cenário, lacunas, ações).

Cenários sugeridos:

1. **Vazamento entre tenants:** cliente relata ver um processo de outro escritório. Testar: contenção, verificação de RLS, enquadramento do art. 5º (sigilo profissional), quem comunica (seção 6.2) e contagem dos 3 dias úteis.
2. **Captura do DJEN parada há 2 dias** sem alerta. Testar: levantamento de prazos afetados, aviso aos escritórios para conferência manual, por que o alerta falhou.
3. **Chave de dados exposta** em log ou repositório. Testar: rotação ([rotacao-de-chaves.md](rotacao-de-chaves.md)), recifra, gitleaks, avaliação de risco.
4. **Cadeia da auditoria quebrada** apontada pelo verificador diário. Testar: preservação, identificação do evento adulterado, acesso privilegiado ao banco ([alertas.md](alertas.md)).

## 9. Revisão deste plano

Revisar a cada 12 meses, depois de cada incidente S1 e quando a ANPD alterar o RCIS. Aprovação: jurídico e DPO, registrada por PR neste arquivo.
