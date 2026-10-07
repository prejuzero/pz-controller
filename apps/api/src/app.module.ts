import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ArmazenamentoS3 } from '@pz/adapter-s3';
import { DESCRITOR_SES, WebhooksSes } from '@pz/adapter-ses';
import { FilaDeMortosBullMq, ReprocessarJobMorto } from '@pz/administracao';
import { TrilhaPostgres } from '@pz/auditoria';
import {
  AdicionarOab,
  AdvogadosPostgres,
  AlterarCobertura,
  AtualizarCliente,
  AtualizarPerfil,
  AtualizarProcesso,
  CadastrarAdvogado,
  CadastrarCliente,
  CadastrarProcesso,
  ClientesPostgres,
  ConsultarCliente,
  ConsultarPerfil,
  ConsultarProcesso,
  ListarClientes,
  ListarProcessos,
  ProcessosPostgres,
  RemoverCliente,
  RemoverOab,
} from '@pz/cadastro';
import {
  AprovarEventoDoCalendario,
  CacheDeDiasNaoUteisRedis,
  CadastrarFeriadoLocal,
  ConsultarCalendario,
  ConsultarDiasNaoUteis,
  ConsultarDiasNaoUteisDoProcesso,
  EventosGlobaisPostgres,
  FeriadosLocaisPostgres,
  ImportarCalendario,
  ProporEventoDoCalendario,
  RevogarEventoDoCalendario,
  RevogarFeriadoLocal,
} from '@pz/calendario';
import { Banco, OutboxPostgres, WebhooksPostgres } from '@pz/db';
import {
  AtivarSegundoFator,
  Autenticar,
  CifraAesGcm,
  AcessosPostgres,
  DispositivosPostgres,
  ListarDispositivos,
  RegistrarDispositivo,
  RenovacoesRedis,
  RenovarTokens,
  RevogarDispositivo,
  noTenantDoBanco,
  PublicadorOutbox,
  RedefinicoesRedis,
  RedefinirSenha,
  RegistrarCredencial,
  SolicitarRedefinicaoDeSenha,
  ConfigurarSegundoFator,
  ConsultarAcessos,
  ConsultarPermissoes,
  CredenciaisPostgres,
  EncerrarImpersonacao,
  IniciarImpersonacao,
  TenantsPostgres,
  PerfisPostgres,
  ElevarSessao,
  EmailsDosUsuariosPostgres,
  EncerrarSessao,
  ProtecaoDeAcesso,
  GeradorDeTokensSeguro,
  HasherArgon2,
  ContasPostgres,
  CriarConta,
  SolicitarVerificacaoDeEmail,
  VerificacaoDeEmailPostgres,
  VerificarEmail,
  SegredosTotp,
  SegundoFatorPostgres,
  SessoesRedis,
  TentativasRedis,
  ValidarSessao,
  VerificarSegundoFator,
} from '@pz/identidade';
import { SystemClock } from '@pz/kernel';
import {
  ConcederConsentimento,
  ConsentimentosPostgres,
  ConsultarAvisosDeEntrega,
  DesativarDestinoPush,
  DestinosPushPostgres,
  ListarConsentimentos,
  NotificacoesPostgres,
  RegistrarDestinoPush,
  RevogarConsentimento,
  SupressaoPostgres,
} from '@pz/notificacoes';
import { criarLogger, registrarErro } from '@pz/observability';
import {
  AprovarVersaoDaTabela,
  CadastrarTipoDeAto,
  ConsultarTabelaDePrazos,
  ProporVersaoDaTabela,
  TabelaPostgres,
  TiposDeAtoPostgres,
} from '@pz/prazos';
import { ConsultarExportacao, ExportacoesPostgres, SolicitarExportacao } from '@pz/privacidade';
import { ConsultarSituacao, VerificadorHttp, VerificadorTcp } from '@pz/saude';
import {
  AceitarDocumento,
  AceitesPostgres,
  ConsultarTermosPendentes,
  DocumentosPostgres,
  ListarAceites,
} from '@pz/termos';
import { Redis } from 'ioredis';

import { AdminController } from './admin/admin.controller.js';
import { AuthController } from './auth/auth.controller.js';
import { ContextoDoUsuario } from './auth/contexto-do-usuario.js';
import { CadastroController } from './cadastro/cadastro.controller.js';
import { ProcessosController } from './cadastro/processos.controller.js';
import { CalendarioController } from './calendario/calendario.controller.js';
import {
  AMBIENTE,
  CAIXA_DE_WEBHOOKS,
  FILAS_DO_PAINEL,
  JANELA_DE_REQUISICOES,
  RECEPTORES_DE_WEBHOOK,
  RELOGIO,
  VERIFICADORES,
} from './fichas.js';
import { GuardaDeAcesso } from './http/acesso.js';
import { GuardaDeLimite, JanelaRedis } from './http/limite.js';
import { FiltroDeProblemas } from './http/problemas.js';
import { NotificacoesController } from './notificacoes/notificacoes.controller.js';
import { OpenApiController } from './openapi.controller.js';
import { TabelaPrazosController } from './prazos/tabela-prazos.controller.js';
import { PrivacidadeController } from './privacidade/privacidade.controller.js';
import { SaudeController, SondasController } from './saude/saude.controller.js';
import { TermosController } from './termos/termos.controller.js';
import { WebhooksController } from './webhooks/webhooks.controller.js';

import type { AmbienteApi } from './ambiente.js';
import type { JanelaDeRequisicoes } from './http/limite.js';
import type { CaixaDeWebhooks } from './webhooks/webhooks.controller.js';
import type { DynamicModule, Provider, Type } from '@nestjs/common';
import type { DependenciasDoReprocessamento } from '@pz/administracao';
import type { TrilhaDeAuditoria } from '@pz/auditoria';
import type {
  CriadorDeConta,
  PreparadorDeVerificacao,
  RepositorioDeAdvogados,
  RepositorioDeClientes,
  RepositorioDeProcessos,
  UnidadeNoTenant,
} from '@pz/cadastro';
import type {
  CacheDeDiasNaoUteis,
  RepositorioDeEventosGlobais,
  RepositorioDeFeriadosLocais,
} from '@pz/calendario';
import type { Transacao } from '@pz/db';
import type {
  Email,
  DependenciasDaImpersonacao,
  ArmazemDeRenovacoes,
  RepositorioDeDispositivos,
  ArmazemDeRedefinicoes,
  PublicadorDeEventos,
  ArmazemDeSessoes,
  ControleDeTentativas,
  RegistroDeAcessos,
  RepositorioDeCredenciais,
  RepositorioDePerfis,
  RepositorioDeSegundoFator,
} from '@pz/identidade';
import type { ReceptorWebhook, ArmazenamentoArquivos } from '@pz/integracoes';
import type { Clock, Outbox, UnidadeDeTrabalho } from '@pz/kernel';
import type {
  DestinosDoUsuario,
  ListaDeSupressao,
  RepositorioDeConsentimentos,
  RepositorioDeDestinosPush,
  RepositorioDeNotificacoes,
} from '@pz/notificacoes';
import type { RepositorioDaTabela, RepositorioDeTiposDeAto } from '@pz/prazos';
import type { RepositorioDeExportacoes } from '@pz/privacidade';
import type { VerificadorDeDependencia } from '@pz/saude';
import type {
  RepositorioDeAceites,
  RepositorioDeDocumentos,
  UnidadeNoTenant as UnidadeNoTenantDosTermos,
} from '@pz/termos';
import type { Queue } from 'bullmq';

export interface OpcoesApi {
  readonly ambiente: AmbienteApi;
  /** Substituições para testes (ex.: relógio fixo, verificadores falsos). */
  readonly relogio?: Clock;
  readonly verificadores?: readonly VerificadorDeDependencia[];
  readonly controllersExtras?: readonly Type[];
  readonly caixaDeWebhooks?: CaixaDeWebhooks;
  /** Receptores por ID do adaptador; cada adaptador com webhook entra aqui (HU30 em diante). */
  readonly receptoresDeWebhook?: ReadonlyMap<string, ReceptorWebhook>;
  /** Credenciais e sessões em memória nos testes (sem PostgreSQL e Redis). */
  readonly identidade?: {
    readonly credenciais: RepositorioDeCredenciais;
    readonly sessoes: ArmazemDeSessoes;
    readonly segundoFator: RepositorioDeSegundoFator;
    readonly tentativas: ControleDeTentativas;
    readonly acessos: RegistroDeAcessos;
    readonly publicador?: PublicadorDeEventos;
    readonly redefinicoes?: ArmazemDeRedefinicoes;
    readonly verificacoesDeEmail?: ArmazemDeRedefinicoes;
    readonly dispositivos?: RepositorioDeDispositivos;
    readonly renovacoes?: ArmazemDeRenovacoes;
    readonly perfis?: RepositorioDePerfis;
    /** Banco, tenants e trilha da impersonação (o resto vem da composição). */
    readonly impersonacao?: Pick<
      DependenciasDaImpersonacao<unknown>,
      'unidade' | 'tenants' | 'trilha'
    >;
  };
  readonly janelaDeRequisicoes?: JanelaDeRequisicoes;
  /** DLQ, banco e trilha do reprocessamento e filas do painel nos testes (sem Redis). */
  /** Calendário forense (HU13); nos testes, repositórios em memória. */
  readonly calendario?: DependenciasDoCalendario;
  /** Tabela de prazos (HU15); nos testes, repositórios em memória. */
  readonly tabelaDePrazos?: DependenciasDaTabelaDePrazos;
  /** Exportação de dados (HU38); nos testes, repositório e armazenamento em memória. */
  readonly privacidade?: DependenciasDaPrivacidade;
  /** Termos e aceite versionado (HU38); nos testes, repositórios em memória. */
  readonly termos?: DependenciasDosTermos;
  /** Cadastro do advogado (HU11); nos testes, repositórios em memória. */
  readonly cadastro?: (relogio: Clock) => DependenciasDoCadastro;
  /** Avisos de entrega do portal (HU30); nos testes, repositórios em memória. */
  readonly notificacoes?: (relogio: Clock) => DependenciasDeNotificacoes;
  readonly filas?: {
    readonly reprocessamento: DependenciasDoReprocessamento<unknown>;
    readonly painel: readonly Queue[];
  };
}

/** Dependências que /health/ready e /v1/saude conferem (ADR-010). */
function verificadoresDoAmbiente(ambiente: AmbienteApi): VerificadorDeDependencia[] {
  return [
    new VerificadorTcp('banco', ambiente.DATABASE_URL),
    new VerificadorTcp('redis', ambiente.REDIS_URL),
    ...(ambiente.S3_ENDPOINT === undefined
      ? []
      : [new VerificadorHttp('armazenamento', ambiente.S3_ENDPOINT)]),
  ];
}

const logger = criarLogger('api');

/** Conexões da api (PostgreSQL como pz_app e Redis), fechadas no desligamento. */
class RecursosDaApi {
  readonly banco: Banco;
  readonly redis: Redis;
  #ultimoErroRedis = Number.NEGATIVE_INFINITY;

  constructor(ambiente: AmbienteApi) {
    this.banco = new Banco({ url: ambiente.DATABASE_URL });
    this.redis = new Redis(ambiente.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });
    // Sem tratador, o ioredis imprime cada falha de reconexão fora do log estruturado.
    this.redis.on('error', (erro: Error) => {
      if (performance.now() - this.#ultimoErroRedis < 60_000) return;
      this.#ultimoErroRedis = performance.now();
      registrarErro(logger, erro, 'conexão com o Redis indisponível', 'api.redis');
    });
  }

  async onApplicationShutdown(): Promise<void> {
    this.redis.disconnect();
    await this.banco.encerrar();
  }
}

/**
 * Composição da api/** DLQs no Redis e reprocessamento auditado no PostgreSQL (HU07). */
function filasDoAmbiente(recursos: RecursosDaApi): NonNullable<OpcoesApi['filas']> {
  const mortos = new FilaDeMortosBullMq(recursos.redis);
  const reprocessamento = {
    filaDeMortos: mortos,
    unidade: recursos.banco,
    trilha: new TrilhaPostgres(),
  };
  return { reprocessamento, painel: mortos.todas() };
}

interface DependenciasDoCalendario {
  readonly unidade: UnidadeDeTrabalho<unknown>;
  readonly globais: RepositorioDeEventosGlobais<unknown>;
  readonly locais: RepositorioDeFeriadosLocais<unknown>;
  readonly trilha: TrilhaDeAuditoria<unknown>;
  readonly outbox: Outbox<unknown>;
  /** Ausente: sem cache (testes). */
  readonly cache?: CacheDeDiasNaoUteis;
}

interface DependenciasDaTabelaDePrazos {
  readonly unidade: UnidadeDeTrabalho<unknown>;
  readonly tipos: RepositorioDeTiposDeAto<unknown>;
  readonly tabela: RepositorioDaTabela<unknown>;
  readonly trilha: TrilhaDeAuditoria<unknown>;
  readonly outbox: Outbox<unknown>;
}

interface DependenciasDaPrivacidade {
  readonly unidade: UnidadeDeTrabalho<unknown>;
  readonly exportacoes: RepositorioDeExportacoes<unknown>;
  readonly trilha: TrilhaDeAuditoria<unknown>;
  readonly outbox: Outbox<unknown>;
  readonly armazenamento: ArmazenamentoArquivos;
}

/** Exportação de dados (HU38): pedido e consulta na API; a geração é do worker. */
function provedoresDaPrivacidade(d: DependenciasDaPrivacidade): Provider[] {
  return [
    {
      provide: SolicitarExportacao,
      inject: [RELOGIO],
      useFactory: (r: Clock) =>
        new SolicitarExportacao(d.unidade, d.exportacoes, d.trilha, d.outbox, r),
    },
    {
      provide: ConsultarExportacao,
      inject: [RELOGIO],
      useFactory: (r: Clock) =>
        new ConsultarExportacao(d.unidade, d.exportacoes, d.armazenamento, r),
    },
  ];
}

/** Arquivos do sistema (exportações LGPD) no S3 ou RustFS local, só JSON e CSV. */
function arquivosDoAmbiente(ambiente: AmbienteApi): ArmazenamentoArquivos {
  return new ArmazenamentoS3(
    {
      bucket: ambiente.ARQUIVOS_BUCKET,
      regiao: ambiente.S3_REGION,
      ...(ambiente.S3_ENDPOINT === undefined ? {} : { endpoint: ambiente.S3_ENDPOINT }),
      ...(ambiente.S3_ACCESS_KEY_ID === undefined || ambiente.S3_SECRET_ACCESS_KEY === undefined
        ? {}
        : {
            credenciais: {
              idChave: ambiente.S3_ACCESS_KEY_ID,
              segredo: ambiente.S3_SECRET_ACCESS_KEY,
            },
          }),
      forcarPathStyle: ambiente.S3_FORCE_PATH_STYLE,
      criptografia: ambiente.S3_ENDPOINT === undefined ? 'AES256' : 'nenhuma',
      tiposPermitidos: ['application/json', 'text/csv'],
      tamanhoMaximoBytes: 100 * 1024 * 1024,
    },
    new SystemClock(),
  );
}

interface DependenciasDosTermos {
  readonly noTenant: UnidadeNoTenantDosTermos<unknown>;
  readonly documentos: RepositorioDeDocumentos<unknown>;
  readonly aceites: RepositorioDeAceites<unknown>;
  readonly trilha: TrilhaDeAuditoria<unknown>;
}

/** Casos de uso dos termos (HU38): o guarda consulta as pendências a cada requisição. */
function provedoresDosTermos(d: DependenciasDosTermos): Provider[] {
  return [
    {
      provide: ConsultarTermosPendentes,
      useValue: new ConsultarTermosPendentes(d.noTenant, d.documentos, d.aceites),
    },
    { provide: ListarAceites, useValue: new ListarAceites(d.noTenant, d.aceites) },
    {
      provide: AceitarDocumento,
      inject: [RELOGIO],
      useFactory: (r: Clock) =>
        new AceitarDocumento(d.noTenant, d.documentos, d.aceites, d.trilha, r),
    },
  ];
}

/** Casos de uso da tabela de prazos (HU15). */
function provedoresDaTabelaDePrazos(d: DependenciasDaTabelaDePrazos): Provider[] {
  return [
    {
      provide: CadastrarTipoDeAto,
      useValue: new CadastrarTipoDeAto(d.unidade, d.tipos, d.trilha),
    },
    {
      provide: ProporVersaoDaTabela,
      inject: [RELOGIO],
      useFactory: (r: Clock) => new ProporVersaoDaTabela(d.unidade, d.tipos, d.tabela, d.trilha, r),
    },
    {
      provide: AprovarVersaoDaTabela,
      inject: [RELOGIO],
      useFactory: (r: Clock) =>
        new AprovarVersaoDaTabela(d.unidade, d.tabela, d.trilha, d.outbox, r),
    },
    {
      provide: ConsultarTabelaDePrazos,
      useValue: new ConsultarTabelaDePrazos(d.unidade, d.tipos, d.tabela),
    },
  ];
}

/** Casos de uso do calendário (HU13), ligados aos mesmos repositórios. */
function provedoresDoCalendario(d: DependenciasDoCalendario): Provider[] {
  const comRelogio = <T>(classe: Type<T>, criar: (relogio: Clock) => T): Provider => ({
    provide: classe,
    inject: [RELOGIO],
    useFactory: criar,
  });
  return [
    comRelogio(
      ProporEventoDoCalendario,
      (r) => new ProporEventoDoCalendario(d.unidade, d.globais, d.trilha, r),
    ),
    comRelogio(
      AprovarEventoDoCalendario,
      (r) => new AprovarEventoDoCalendario(d.unidade, d.globais, d.trilha, d.outbox, r),
    ),
    comRelogio(
      RevogarEventoDoCalendario,
      (r) => new RevogarEventoDoCalendario(d.unidade, d.globais, d.trilha, d.outbox, r),
    ),
    comRelogio(
      ImportarCalendario,
      (r) => new ImportarCalendario(d.unidade, d.globais, d.trilha, r),
    ),
    comRelogio(
      CadastrarFeriadoLocal,
      (r) => new CadastrarFeriadoLocal(d.unidade, d.locais, d.trilha, d.outbox, r),
    ),
    comRelogio(
      RevogarFeriadoLocal,
      (r) => new RevogarFeriadoLocal(d.unidade, d.locais, d.trilha, d.outbox, r),
    ),
    {
      provide: ConsultarCalendario,
      useValue: new ConsultarCalendario(d.unidade, d.globais, d.locais),
    },
    {
      provide: ConsultarDiasNaoUteis,
      useValue: new ConsultarDiasNaoUteis(d.unidade, d.globais, d.locais, d.cache),
    },
    {
      // O calendário lê o processo só pela API pública do cadastro (CLAUDE.md, seção 6).
      provide: ConsultarDiasNaoUteisDoProcesso,
      inject: [ConsultarProcesso, ConsultarDiasNaoUteis],
      useFactory: (processos: ConsultarProcesso<unknown>, dias: ConsultarDiasNaoUteis<unknown>) =>
        new ConsultarDiasNaoUteisDoProcesso(async (id) => {
          const r = await processos.executar(id);
          return r.ok ? { tribunal: r.valor.tribunal, comarca: r.valor.comarca } : undefined;
        }, dias),
    },
  ];
}

interface DependenciasDoCadastro {
  readonly noTenant: UnidadeNoTenant<unknown>;
  readonly unidade: UnidadeDeTrabalho<unknown>;
  readonly contas: CriadorDeConta<unknown>;
  readonly verificacao: PreparadorDeVerificacao;
  readonly advogados: RepositorioDeAdvogados<unknown>;
  readonly processos: RepositorioDeProcessos<unknown>;
  readonly clientes: RepositorioDeClientes<unknown>;
  readonly trilha: TrilhaDeAuditoria<unknown>;
  readonly outbox: Outbox<unknown>;
}

/** Casos de uso do cadastro (HU11), ligados aos mesmos repositórios. */
function provedoresDoCadastro(criar: (relogio: Clock) => DependenciasDoCadastro): Provider[] {
  const DEPENDENCIAS = Symbol('dependencias do cadastro');
  const caso = <T>(
    classe: Type<T>,
    montar: (d: DependenciasDoCadastro, r: Clock) => T,
  ): Provider => ({
    provide: classe,
    inject: [DEPENDENCIAS, RELOGIO],
    useFactory: montar,
  });
  return [
    { provide: DEPENDENCIAS, inject: [RELOGIO], useFactory: criar },
    caso(
      CadastrarAdvogado,
      (d, r) =>
        new CadastrarAdvogado(
          d.noTenant,
          d.contas,
          d.verificacao,
          d.advogados,
          d.trilha,
          d.outbox,
          r,
        ),
    ),
    caso(ConsultarPerfil, (d) => new ConsultarPerfil(d.unidade, d.advogados)),
    caso(AtualizarPerfil, (d) => new AtualizarPerfil(d.unidade, d.advogados, d.trilha)),
    caso(AdicionarOab, (d) => new AdicionarOab(d.unidade, d.advogados, d.trilha, d.outbox)),
    caso(RemoverOab, (d) => new RemoverOab(d.unidade, d.advogados, d.trilha, d.outbox)),
    // Processos e clientes (HU12).
    caso(ListarProcessos, (d) => new ListarProcessos(d.unidade, d.processos)),
    caso(ConsultarProcesso, (d) => new ConsultarProcesso(d.unidade, d.processos)),
    caso(
      CadastrarProcesso,
      (d, r) => new CadastrarProcesso(d.unidade, d.processos, d.clientes, d.trilha, d.outbox, r),
    ),
    caso(
      AtualizarProcesso,
      (d) => new AtualizarProcesso(d.unidade, d.processos, d.clientes, d.trilha),
    ),
    caso(AlterarCobertura, (d) => new AlterarCobertura(d.unidade, d.processos, d.trilha, d.outbox)),
    caso(ListarClientes, (d) => new ListarClientes(d.unidade, d.clientes)),
    caso(ConsultarCliente, (d) => new ConsultarCliente(d.unidade, d.clientes)),
    caso(CadastrarCliente, (d, r) => new CadastrarCliente(d.unidade, d.clientes, d.trilha, r)),
    caso(AtualizarCliente, (d) => new AtualizarCliente(d.unidade, d.clientes, d.trilha)),
    caso(RemoverCliente, (d) => new RemoverCliente(d.unidade, d.clientes, d.trilha)),
  ];
}

interface DependenciasDeNotificacoes {
  readonly unidade: UnidadeDeTrabalho<unknown>;
  readonly notificacoes: RepositorioDeNotificacoes<unknown>;
  readonly destinos: DestinosDoUsuario<unknown>;
  readonly supressao: ListaDeSupressao<unknown>;
  readonly consentimentos: RepositorioDeConsentimentos<unknown>;
  readonly push: RepositorioDeDestinosPush<unknown>;
  readonly trilha: TrilhaDeAuditoria<unknown>;
  readonly outbox: Outbox<unknown>;
}

/** Casos de uso das notificações (HU30): avisos de entrega, consentimentos e push. */
function provedoresDeNotificacoes(
  criar: (relogio: Clock) => DependenciasDeNotificacoes,
): Provider[] {
  const DEPENDENCIAS = Symbol('dependencias das notificacoes');
  const caso = <T>(
    classe: Type<T>,
    montar: (d: DependenciasDeNotificacoes, r: Clock) => T,
  ): Provider => ({ provide: classe, inject: [DEPENDENCIAS, RELOGIO], useFactory: montar });
  return [
    { provide: DEPENDENCIAS, inject: [RELOGIO], useFactory: criar },
    caso(
      ConsultarAvisosDeEntrega,
      (d, r) => new ConsultarAvisosDeEntrega(d.unidade, d.notificacoes, d.destinos, d.supressao, r),
    ),
    caso(ListarConsentimentos, (d) => new ListarConsentimentos(d.unidade, d.consentimentos)),
    caso(
      ConcederConsentimento,
      (d, r) => new ConcederConsentimento(d.unidade, d.consentimentos, d.trilha, d.outbox, r),
    ),
    caso(
      RevogarConsentimento,
      (d, r) => new RevogarConsentimento(d.unidade, d.consentimentos, d.trilha, d.outbox, r),
    ),
    caso(RegistrarDestinoPush, (d, r) => new RegistrarDestinoPush(d.unidade, d.push, d.trilha, r)),
    caso(DesativarDestinoPush, (d) => new DesativarDestinoPush(d.unidade, d.push, d.trilha)),
  ];
}

/**
 * Composição da api (CLAUDE.md, seção 6): só liga módulos, controllers e infraestrutura HTTP.
 * Módulos entram por lista explícita.
 */

/** Webhooks de entrada por adaptador; sem tópico SNS configurado, `/v1/webhooks/ses` é 404. */
function receptoresDoAmbiente(ambiente: AmbienteApi): ReadonlyMap<string, ReceptorWebhook> {
  const receptores = new Map<string, ReceptorWebhook>();
  if (ambiente.SES_TOPICOS_SNS.length > 0) {
    receptores.set(DESCRITOR_SES.id, new WebhooksSes({ topicos: ambiente.SES_TOPICOS_SNS }));
  }
  return receptores;
}

@Module({})
export class AppModule {
  static registrar(opcoes: OpcoesApi): DynamicModule {
    const recursos = new RecursosDaApi(opcoes.ambiente);
    const webhooks = new WebhooksPostgres();
    const credenciais = opcoes.identidade?.credenciais ?? new CredenciaisPostgres(recursos.banco);
    const sessoes = opcoes.identidade?.sessoes ?? new SessoesRedis(recursos.redis);
    const segundoFator =
      opcoes.identidade?.segundoFator ?? new SegundoFatorPostgres(recursos.banco);
    const segredos = new SegredosTotp();
    const cifra = new CifraAesGcm(opcoes.ambiente.CHAVE_CIFRAGEM);
    const tokens = new GeradorDeTokensSeguro();
    const acessos = opcoes.identidade?.acessos ?? new AcessosPostgres(recursos.banco);
    const tentativas = opcoes.identidade?.tentativas ?? new TentativasRedis(recursos.redis);
    const publicador = opcoes.identidade?.publicador ?? new PublicadorOutbox(recursos.banco);
    const redefinicoes = opcoes.identidade?.redefinicoes ?? new RedefinicoesRedis(recursos.redis);
    const hasher = new HasherArgon2();
    const dispositivos =
      opcoes.identidade?.dispositivos ?? new DispositivosPostgres(recursos.banco);
    const renovacoes = opcoes.identidade?.renovacoes ?? new RenovacoesRedis(recursos.redis);
    const perfis = opcoes.identidade?.perfis ?? new PerfisPostgres(recursos.banco);
    const impersonacao = opcoes.identidade?.impersonacao ?? {
      unidade: recursos.banco,
      tenants: new TenantsPostgres(),
      trilha: new TrilhaPostgres(),
    };
    const filas = opcoes.filas ?? filasDoAmbiente(recursos);
    const calendario = opcoes.calendario ?? {
      unidade: recursos.banco,
      globais: new EventosGlobaisPostgres(),
      locais: new FeriadosLocaisPostgres(),
      trilha: new TrilhaPostgres(),
      outbox: new OutboxPostgres(),
      cache: new CacheDeDiasNaoUteisRedis(recursos.redis, (erro) => {
        registrarErro(logger, erro, 'cache do calendário indisponível', 'calendario.cache');
      }),
    };
    // Tokens de verificação de e-mail (HU11): mesmo armazém da redefinição, outro prefixo.
    const verificacoesDeEmail =
      opcoes.identidade?.verificacoesDeEmail ??
      new RedefinicoesRedis(recursos.redis, 'pz:verificacao-email:');
    const cadastro =
      opcoes.cadastro ??
      ((relogio: Clock): DependenciasDoCadastro => ({
        noTenant: {
          executar: (tenantId, trabalho) =>
            noTenantDoBanco(tenantId, () => recursos.banco.executar(trabalho)),
        },
        unidade: recursos.banco,
        contas: new CriarConta(hasher, new ContasPostgres()),
        verificacao: {
          preparar: (conta) =>
            new SolicitarVerificacaoDeEmail(verificacoesDeEmail, tokens, cifra, relogio).preparar({
              ...conta,
              email: conta.email as Email,
            }),
        },
        advogados: new AdvogadosPostgres(relogio),
        processos: new ProcessosPostgres(relogio),
        clientes: new ClientesPostgres(),
        trilha: new TrilhaPostgres(),
        outbox: new OutboxPostgres(),
      }));
    const notificacoes =
      opcoes.notificacoes ??
      ((relogio: Clock): DependenciasDeNotificacoes => {
        // Destinos pelas APIs públicas: e-mail da conta (identidade) e cópias (cadastro).
        const contas = new EmailsDosUsuariosPostgres();
        const advogados = new AdvogadosPostgres(relogio);
        const destinos: DestinosDoUsuario<Transacao> = {
          emails: async (tx, usuarioId) => {
            const principal = await contas.emailDe(tx, usuarioId);
            const advogado = await advogados.buscarPorUsuario(tx, usuarioId);
            return {
              ...(principal === undefined ? {} : { principal }),
              copias: advogado?.estado.emailsAdicionais ?? [],
            };
          },
        };
        return {
          unidade: recursos.banco,
          notificacoes: new NotificacoesPostgres(),
          destinos,
          supressao: new SupressaoPostgres(),
          consentimentos: new ConsentimentosPostgres(),
          push: new DestinosPushPostgres(),
          trilha: new TrilhaPostgres(),
          outbox: new OutboxPostgres(),
        };
      });
    const provedores: Provider[] = [
      { provide: RecursosDaApi, useValue: recursos },
      ...provedoresDeNotificacoes(notificacoes),
      { provide: AMBIENTE, useValue: opcoes.ambiente },
      { provide: RELOGIO, useValue: opcoes.relogio ?? new SystemClock() },
      {
        provide: VERIFICADORES,
        useValue: opcoes.verificadores ?? verificadoresDoAmbiente(opcoes.ambiente),
      },
      {
        provide: ConsultarSituacao,
        inject: [VERIFICADORES, RELOGIO],
        useFactory: (verificadores: VerificadorDeDependencia[], relogio: Clock) =>
          new ConsultarSituacao(verificadores, relogio, opcoes.ambiente.VERSAO),
      },
      {
        provide: CAIXA_DE_WEBHOOKS,
        // Webhook gravado sem tenant (ainda desconhecido), como pz_app: só INSERT na tabela global.
        useValue:
          opcoes.caixaDeWebhooks ??
          ({
            gravar: (webhook) =>
              recursos.banco.executarSemTenant('webhook de entrada', (tx) =>
                webhooks.gravar(tx, webhook),
              ),
          } satisfies CaixaDeWebhooks),
      },
      {
        provide: ProtecaoDeAcesso,
        inject: [RELOGIO],
        useFactory: (relogio: Clock) =>
          new ProtecaoDeAcesso(tentativas, acessos, relogio, publicador),
      },
      {
        provide: Autenticar,
        inject: [RELOGIO, ProtecaoDeAcesso],
        useFactory: (relogio: Clock, protecao: ProtecaoDeAcesso) =>
          new Autenticar(credenciais, new HasherArgon2(), sessoes, tokens, relogio, protecao),
      },
      { provide: ConsultarAcessos, useValue: new ConsultarAcessos(acessos) },
      {
        provide: ConsultarPermissoes,
        useValue: new ConsultarPermissoes(perfis, (permissao) => {
          registrarErro(
            logger,
            new Error(`Permissão fora do catálogo concedida por perfil: ${permissao}`),
            'perfil concede permissão desconhecida (ignorada)',
            'api.permissoes',
          );
        }),
      },
      {
        provide: RegistrarDispositivo,
        inject: [RELOGIO],
        useFactory: (relogio: Clock) =>
          new RegistrarDispositivo(dispositivos, sessoes, renovacoes, tokens, publicador, relogio),
      },
      {
        provide: RenovarTokens,
        inject: [RELOGIO],
        useFactory: (relogio: Clock) =>
          new RenovarTokens(
            dispositivos,
            sessoes,
            renovacoes,
            tokens,
            publicador,
            relogio,
            noTenantDoBanco,
          ),
      },
      { provide: ListarDispositivos, useValue: new ListarDispositivos(dispositivos) },
      {
        provide: RevogarDispositivo,
        inject: [RELOGIO],
        useFactory: (relogio: Clock) =>
          new RevogarDispositivo(dispositivos, sessoes, renovacoes, publicador, relogio),
      },
      {
        provide: SolicitarRedefinicaoDeSenha,
        inject: [RELOGIO],
        useFactory: (relogio: Clock) =>
          new SolicitarRedefinicaoDeSenha(
            credenciais,
            redefinicoes,
            tokens,
            cifra,
            publicador,
            relogio,
          ),
      },
      {
        provide: RedefinirSenha,
        useValue: new RedefinirSenha(
          redefinicoes,
          new RegistrarCredencial(credenciais, hasher, sessoes),
          tentativas,
          noTenantDoBanco,
        ),
      },
      {
        provide: JANELA_DE_REQUISICOES,
        useValue: opcoes.janelaDeRequisicoes ?? new JanelaRedis(recursos.redis),
      },
      {
        provide: ValidarSessao,
        inject: [RELOGIO],
        useFactory: (relogio: Clock) => new ValidarSessao(sessoes, relogio),
      },
      {
        provide: EncerrarSessao,
        inject: [ProtecaoDeAcesso],
        useFactory: (protecao: ProtecaoDeAcesso) => new EncerrarSessao(sessoes, protecao),
      },
      {
        provide: ConfigurarSegundoFator,
        useValue: new ConfigurarSegundoFator(segundoFator, segredos, cifra),
      },
      {
        provide: AtivarSegundoFator,
        inject: [RELOGIO],
        useFactory: (relogio: Clock) =>
          new AtivarSegundoFator(segundoFator, segredos, cifra, relogio),
      },
      {
        provide: VerificarSegundoFator,
        inject: [RELOGIO, ProtecaoDeAcesso],
        useFactory: (relogio: Clock, protecao: ProtecaoDeAcesso) =>
          new VerificarSegundoFator(segundoFator, segredos, cifra, relogio, protecao),
      },
      {
        provide: ElevarSessao,
        inject: [RELOGIO],
        useFactory: (relogio: Clock) => new ElevarSessao(sessoes, tokens, relogio),
      },
      {
        provide: IniciarImpersonacao,
        inject: [RELOGIO],
        useFactory: (relogio: Clock) =>
          new IniciarImpersonacao({ ...impersonacao, sessoes, noTenant: noTenantDoBanco, relogio }),
      },
      {
        provide: EncerrarImpersonacao,
        inject: [RELOGIO],
        useFactory: (relogio: Clock) =>
          new EncerrarImpersonacao({
            ...impersonacao,
            sessoes,
            noTenant: noTenantDoBanco,
            relogio,
          }),
      },
      { provide: ReprocessarJobMorto, useValue: new ReprocessarJobMorto(filas.reprocessamento) },
      { provide: FILAS_DO_PAINEL, useValue: filas.painel },
      ...provedoresDoCalendario(calendario),
      ...provedoresDaPrivacidade(
        opcoes.privacidade ?? {
          unidade: recursos.banco,
          exportacoes: new ExportacoesPostgres(),
          trilha: new TrilhaPostgres(),
          outbox: new OutboxPostgres(),
          armazenamento: arquivosDoAmbiente(opcoes.ambiente),
        },
      ),
      ...provedoresDosTermos(
        opcoes.termos ?? {
          noTenant: {
            executar: (tenantId, trabalho) =>
              noTenantDoBanco(tenantId, () => recursos.banco.executar(trabalho)),
          },
          documentos: new DocumentosPostgres(),
          aceites: new AceitesPostgres(),
          trilha: new TrilhaPostgres(),
        },
      ),
      ...provedoresDaTabelaDePrazos(
        opcoes.tabelaDePrazos ?? {
          unidade: recursos.banco,
          tipos: new TiposDeAtoPostgres(),
          tabela: new TabelaPostgres(),
          trilha: new TrilhaPostgres(),
          outbox: new OutboxPostgres(),
        },
      ),
      ...provedoresDoCadastro(cadastro),
      {
        provide: VerificarEmail,
        inject: [RELOGIO],
        useFactory: (relogio: Clock) =>
          new VerificarEmail(
            verificacoesDeEmail,
            recursos.banco,
            new VerificacaoDeEmailPostgres(),
            new TrilhaPostgres(),
            noTenantDoBanco,
            relogio,
          ),
      },
      { provide: APP_INTERCEPTOR, useClass: ContextoDoUsuario },
      {
        provide: RECEPTORES_DE_WEBHOOK,
        useValue: opcoes.receptoresDeWebhook ?? receptoresDoAmbiente(opcoes.ambiente),
      },
      // Ordem importa: o limite por IP vem antes da autenticação.
      { provide: APP_GUARD, useClass: GuardaDeLimite },
      { provide: APP_GUARD, useClass: GuardaDeAcesso },
      { provide: APP_FILTER, useClass: FiltroDeProblemas },
    ];
    return {
      module: AppModule,
      controllers: [
        AuthController,
        AdminController,
        CalendarioController,
        TabelaPrazosController,
        TermosController,
        PrivacidadeController,
        CadastroController,
        ProcessosController,
        NotificacoesController,
        SaudeController,
        SondasController,
        OpenApiController,
        WebhooksController,
        ...(opcoes.controllersExtras ?? []),
      ],
      providers: provedores,
    };
  }
}
