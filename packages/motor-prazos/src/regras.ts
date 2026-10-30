import { err, LocalDate, ok } from '@pz/kernel';

import {
  contarDias,
  esteOuProximoQueConta,
  proximoDiaQueConta,
  semContar,
  semContarFimDeSemanaE,
} from './dias.js';

import type { CalendarioForense, Efeito } from './calendario.js';
import type { Avanco, CalendarioEsgotado, CriterioDeContagem, DiaDesconsiderado } from './dias.js';
import type {
  Alternativa,
  EntradaDoCalculo,
  MotivoAConfirmar,
  PrazoDaTabela,
  Ramo,
  ResultadoDoCalculo,
} from './modelo.js';
import type { Result } from '@pz/kernel';

/** Gravada em cada prazo calculado (ADR-007): muda a cada alteração de regra ou de saída. */
export const VERSAO_DO_MOTOR = '1.1.0';

/** Texto aprovado pela curadoria (V2, aba 8) para comarca sem feriados locais levantados. */
export const AVISO_FERIADO_LOCAL =
  'Feriado local não verificado — confira o calendário da comarca e a legislação aplicável antes de considerar o prazo definitivo.';
export const AVISO_ALTERNATIVAS =
  'Há outras datas possíveis: confira as alternativas e o fundamento de cada uma antes de confirmar.';
const FUSO_DE_BRASILIA = 'America/Sao_Paulo';
const avisoDeFuso = (fuso: string) =>
  `O prazo termina às 24h no horário do juízo (${fuso}), diferente do horário de Brasília.`;

function fusoValido(fuso: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: fuso });
    return true;
  } catch {
    // O Intl só recusa fuso desconhecido (RangeError): é dado de entrada inválido e vira
    // "a confirmar" com o motivo, não exceção.
    return false;
  }
}

// Toda regra abaixo vem da revisão da curadoria (docs/curadoria, V1 de 08/10/2026 e V2 de
// 29/10/2026). Vigências da aba 3 da V2. Nada aqui é memória do modelo (CLAUDE.md, seção 4).

interface Regime {
  readonly contagem: 'uteis' | 'corridos';
  readonly fundamentoDaContagem: string;
  /** Primeiro dia em que a regra de contagem vale (CPC, art. 14: aplica-se a do início do prazo). */
  readonly vigencia: LocalDate;
  /** Suspensão de 20/12 a 20/01 (RN02, parametrizada por ramo). */
  readonly suspensaoDeFimDeAno: { readonly fundamento: string; readonly vigencia: LocalDate };
}

const CPC_VIGENCIA = LocalDate.de(2016, 3, 18);
const CPP_VIGENCIA = LocalDate.de(1942, 1, 1);
// Lei 14.365/2022: incluiu o art. 798-A no CPP.
const CPP_798A_VIGENCIA = LocalDate.de(2022, 6, 3);
const SUSPENSAO_CIVEL = { fundamento: 'CPC, art. 220', vigencia: CPC_VIGENCIA };
const SUSPENSAO_PENAL = { fundamento: 'CPP, art. 798-A', vigencia: CPP_798A_VIGENCIA };

const REGIMES: Readonly<Record<Ramo, Regime>> = {
  civel: {
    contagem: 'uteis',
    fundamentoDaContagem: 'CPC, arts. 219 e 224',
    vigencia: CPC_VIGENCIA,
    suspensaoDeFimDeAno: SUSPENSAO_CIVEL,
  },
  // Lei 13.728/2018: art. 12-A; a suspensão segue o CPC, art. 220, aplicado subsidiariamente.
  juizados: {
    contagem: 'uteis',
    fundamentoDaContagem: 'Lei 9.099/1995, art. 12-A',
    vigencia: LocalDate.de(2018, 11, 1),
    suspensaoDeFimDeAno: SUSPENSAO_CIVEL,
  },
  // Lei 13.467/2017 (art. 775) e Lei 13.545/2017 (art. 775-A).
  trabalhista: {
    contagem: 'uteis',
    fundamentoDaContagem: 'CLT, art. 775',
    vigencia: LocalDate.de(2017, 11, 11),
    suspensaoDeFimDeAno: { fundamento: 'CLT, art. 775-A', vigencia: LocalDate.de(2017, 12, 20) },
  },
  penal: {
    contagem: 'corridos',
    fundamentoDaContagem: 'CPP, art. 798, caput e §1º',
    vigencia: CPP_VIGENCIA,
    suspensaoDeFimDeAno: SUSPENSAO_PENAL,
  },
  // V2, Q17: CPP, art. 798, aplicado por força da Lei 9.099/1995, art. 92.
  'juizado-criminal': {
    contagem: 'corridos',
    fundamentoDaContagem: 'CPP, art. 798, caput e §1º, c/c Lei 9.099/1995, art. 92',
    vigencia: CPP_VIGENCIA,
    suspensaoDeFimDeAno: SUSPENSAO_PENAL,
  },
};

/**
 * Contagem do ramo (RN01, RN07), para quem monta a entrada sem linha na tabela (prazo fixado só
 * no ato judicial, CPC, art. 218, §1º): a contagem continua sendo a da regra do ramo.
 */
export function contagemDoRamo(ramo: Ramo): 'uteis' | 'corridos' {
  return REGIMES[ramo].contagem;
}

const ehPenal = (ramo: Ramo) => ramo === 'penal' || ramo === 'juizado-criminal';

/** Variações que o motor testa para mostrar as datas possíveis (CLAUDE.md, seção 4.4). */
interface Opcoes {
  readonly dobrarNoVerificar: boolean;
  readonly suspenderPenalSemInformacao: boolean;
  readonly prorrogarSabadoPenal: boolean;
}

const SUGERIDA: Opcoes = {
  dobrarNoVerificar: false,
  suspenderPenalSemInformacao: false,
  prorrogarSabadoPenal: false,
};

interface Calculo {
  readonly publicacao?: LocalDate;
  readonly ciencia?: LocalDate;
  readonly inicio: LocalDate;
  readonly vencimento: LocalDate;
  readonly diasDesconsiderados: readonly DiaDesconsiderado[];
  readonly fundamentos: readonly string[];
  /** A regra deixou uma decisão em aberto que, tomada de outro jeito, muda a data. */
  readonly emAberto: {
    readonly dobro: boolean;
    readonly suspensaoPenal: boolean;
    readonly sabadoPenal: boolean;
  };
}

interface AConfirmar {
  readonly motivo: MotivoAConfirmar;
  readonly detalhe: string;
}

const aConfirmar = (motivo: MotivoAConfirmar, detalhe: string): Result<never, AConfirmar> =>
  err({ motivo, detalhe });

const esgotado = (erro: CalendarioEsgotado): AConfirmar => ({
  motivo: 'calendario-esgotado',
  detalhe: `calendário sem dia útil a partir de ${erro.aPartirDe.paraIso()}`,
});

function combinar(...criterios: readonly CriterioDeContagem[]): CriterioDeContagem {
  return (data) => criterios.flatMap((conta) => conta(data));
}

/** RN02: 20/12 a 20/01, inclusive, a partir da vigência da regra do ramo. */
function suspensaoDeFimDeAno(regra: Regime['suspensaoDeFimDeAno']): CriterioDeContagem {
  return (data) => {
    const dentro = (data.mes === 12 && data.dia >= 20) || (data.mes === 1 && data.dia <= 20);
    if (!dentro || data.ehAntesDe(regra.vigencia)) return [];
    return [{ data, motivo: 'suspensão de prazos de 20/12 a 20/01', fundamento: regra.fundamento }];
  };
}

/** Quantidade de dias depois do prazo em dobro (RN06), conforme a política da tabela. */
function quantidadeDoPrazo(
  entrada: EntradaDoCalculo,
  prazo: PrazoDaTabela,
  opcoes: Opcoes,
): { quantidade: number; fundamento?: string; emAberto: boolean } {
  const { ente, litisconsortesComProcuradoresDistintos, autosFisicos } = entrada.condicoes;
  const dobro = (fundamento: string) => ({
    quantidade: prazo.quantidade * 2,
    fundamento,
    emAberto: false,
  });
  const simples = { quantidade: prazo.quantidade, emAberto: false };
  switch (prazo.dobro) {
    case 'entes-cpc':
      if (ente === 'fazenda-publica') return dobro('CPC, art. 183');
      if (ente === 'ministerio-publico') return dobro('CPC, art. 180');
      if (ente === 'defensoria') return dobro('CPC, art. 186');
      // CPC, art. 229, §2º: não se aplica aos autos eletrônicos.
      if (litisconsortesComProcuradoresDistintos === true && autosFisicos === true) {
        return dobro('CPC, art. 229');
      }
      return simples;
    case 'so-defensoria':
      return ente === 'defensoria' ? dobro('LC 80/1994, arts. 44, I, 89, I, e 128, I') : simples;
    case 'fazenda-para-recorrer':
      return ente === 'fazenda-publica' ? dobro('Decreto-Lei 779/1969, art. 1º, III') : simples;
    case 'nao-dobra':
      return simples;
    case 'verificar':
      if (ente === undefined) return simples;
      if (opcoes.dobrarNoVerificar) return dobro('CPC, art. 183, c/c CLT, art. 769');
      return { ...simples, emAberto: true };
  }
}

interface Marco {
  readonly publicacao?: LocalDate;
  readonly ciencia?: LocalDate;
  readonly inicio: LocalDate;
  readonly desconsiderados: readonly DiaDesconsiderado[];
  readonly fundamentos: readonly string[];
}

/** RN03, RN04 e ciência manual: de quando o prazo começa a correr. */
function marcoInicial(
  entrada: EntradaDoCalculo,
  diaUtil: CriterioDeContagem,
  inicioConta: CriterioDeContagem,
  conta: CriterioDeContagem,
): Result<Marco, AConfirmar> {
  const penal = ehPenal(entrada.ramo);
  const referencia = entrada.dataDeReferencia;

  if (entrada.meio === 'djen') {
    // Lei 11.419/2006, art. 4º, §3º: publicação no 1º dia útil seguinte à disponibilização.
    const publicacao = proximoDiaQueConta(referencia, diaUtil);
    if (!publicacao.ok) return err(esgotado(publicacao.erro));
    // Art. 4º, §4º: o prazo começa no 1º dia útil seguinte à publicação.
    const inicio = proximoDiaQueConta(publicacao.valor.data, inicioConta);
    if (!inicio.ok) return err(esgotado(inicio.erro));
    return ok({
      publicacao: publicacao.valor.data,
      inicio: inicio.valor.data,
      desconsiderados: [...publicacao.valor.desconsiderados, ...inicio.valor.desconsiderados],
      fundamentos: penal
        ? ['Lei 11.419/2006, art. 4º, §§3º e 4º']
        : ['Lei 11.419/2006, art. 4º, §§3º e 4º', 'CPC, art. 224, §§2º e 3º'],
    });
  }

  if (entrada.meio === 'portal') {
    if (penal) {
      return aConfirmar(
        'ramo-sem-regra',
        'ciência pelo portal no processo penal sem regra cadastrada',
      );
    }
    const consulta = entrada.dataDaConsulta;
    if (consulta?.ehAntesDe(referencia) === true) {
      return aConfirmar('dados-insuficientes', 'consulta anterior ao envio da intimação');
    }
    // Lei 11.419/2006, art. 5º, §3º: 10 dias corridos contados do dia seguinte ao envio (V2, C04).
    const tacita = referencia.maisDias(10);
    let ciencia: Avanco;
    if (consulta !== undefined && !consulta.ehDepoisDe(tacita)) {
      // Art. 5º, §2º: consulta em dia não útil vale no primeiro dia útil seguinte.
      const naConsulta = esteOuProximoQueConta(consulta, diaUtil);
      if (!naConsulta.ok) return err(esgotado(naConsulta.erro));
      ciencia = naConsulta.valor;
    } else if (diaUtil(tacita).length > 0) {
      // V2, C04: o 10º dia em dia não útil não tem regra operacional aprovada.
      return aConfirmar(
        'sem-regra-legal',
        'ciência tácita em dia não útil: regra pendente com a curadoria',
      );
    } else {
      ciencia = { data: tacita, desconsiderados: [] };
    }
    // CPC, art. 231, V: o prazo começa no dia útil seguinte à ciência (V2, C04 e CT04).
    const inicio = proximoDiaQueConta(ciencia.data, inicioConta);
    if (!inicio.ok) return err(esgotado(inicio.erro));
    return ok({
      ciencia: ciencia.data,
      inicio: inicio.valor.data,
      desconsiderados: [...ciencia.desconsiderados, ...inicio.valor.desconsiderados],
      fundamentos: ['Lei 11.419/2006, art. 5º, §§1º a 3º', 'CPC, art. 231, V'],
    });
  }

  // Ciência informada pelo advogado: exclui o dia do começo.
  if (penal) {
    // CPP, art. 798, §1º: em dias corridos, o dia seguinte já conta, salvo se suspenso.
    const inicio = proximoDiaQueConta(referencia, conta);
    if (!inicio.ok) return err(esgotado(inicio.erro));
    return ok({
      ciencia: referencia,
      inicio: inicio.valor.data,
      desconsiderados: inicio.valor.desconsiderados,
      fundamentos: [],
    });
  }
  // CPC, art. 224, caput e §3º: começa no primeiro dia útil seguinte.
  const inicio = proximoDiaQueConta(referencia, inicioConta);
  if (!inicio.ok) return err(esgotado(inicio.erro));
  return ok({
    ciencia: referencia,
    inicio: inicio.valor.data,
    desconsiderados: inicio.valor.desconsiderados,
    fundamentos: ['CPC, art. 224, caput e §3º'],
  });
}

/** Vencimento em dia sem expediente ou com indisponibilidade (RN08; penal: CPP, art. 798, §3º). */
function prorrogar(
  entrada: EntradaDoCalculo,
  vencimento: LocalDate,
  diaUtilEIndisponibilidade: CriterioDeContagem,
  opcoes: Opcoes,
): Result<{ avanco: Avanco; fundamento?: string; sabadoEmAberto: boolean }, AConfirmar> {
  const motivos = diaUtilEIndisponibilidade(vencimento);
  if (motivos.length === 0)
    return ok({ avanco: { data: vencimento, desconsiderados: [] }, sabadoEmAberto: false });

  if (!ehPenal(entrada.ramo)) {
    const prorrogado = esteOuProximoQueConta(vencimento, diaUtilEIndisponibilidade);
    if (!prorrogado.ok) return err(esgotado(prorrogado.erro));
    return ok({
      avanco: prorrogado.valor,
      fundamento: 'CPC, art. 224, §1º; Lei 11.419/2006, art. 10, §2º',
      sabadoEmAberto: false,
    });
  }

  // CPP, art. 798, §3º prorroga o que termina em domingo ou feriado; o sábado não está no texto e
  // a curadoria não definiu a regra (V2, C01): sugere o sábado e mostra a prorrogação.
  const soSabado = motivos.every((m) => m.motivo === 'sábado');
  if (soSabado && !opcoes.prorrogarSabadoPenal) {
    return ok({ avanco: { data: vencimento, desconsiderados: [] }, sabadoEmAberto: true });
  }
  const prorrogado = esteOuProximoQueConta(vencimento, diaUtilEIndisponibilidade);
  if (!prorrogado.ok) return err(esgotado(prorrogado.erro));
  const indisponivel = entrada.calendario
    .ocorrencias(vencimento)
    .some((o) => o.efeito === 'indisponibilidade');
  return ok({
    avanco: prorrogado.valor,
    fundamento: indisponivel ? 'Lei 11.419/2006, art. 10, §2º' : 'CPP, art. 798, §3º',
    sabadoEmAberto: soSabado,
  });
}

function calcular(
  entrada: EntradaDoCalculo,
  prazo: PrazoDaTabela,
  opcoes: Opcoes,
): Result<Calculo, AConfirmar> {
  const regime = REGIMES[entrada.ramo];
  const penal = ehPenal(entrada.ramo);
  const calendario: CalendarioForense = entrada.calendario;

  const excecao = entrada.condicoes.excecaoDaSuspensaoPenal;
  const suspensaoPenalEmAberto = penal && excecao === undefined;
  const aplicaSuspensao =
    !penal || excecao === false || (excecao === undefined && opcoes.suspenderPenalSemInformacao);
  const rn02 = aplicaSuspensao ? [suspensaoDeFimDeAno(regime.suspensaoDeFimDeAno)] : [];

  const efeitos = (...lista: Efeito[]) => lista;
  // Dia útil para publicação e ciência: sábado, domingo e dias sem expediente não contam.
  const diaUtil = semContarFimDeSemanaE(calendario, efeitos('sem-expediente'));
  // Dias suspensos não entram na contagem nem podem ser o início.
  const conta = penal
    ? combinar(semContar(calendario, efeitos('suspensao-de-prazos')), ...rn02)
    : combinar(
        semContarFimDeSemanaE(calendario, efeitos('sem-expediente', 'suspensao-de-prazos')),
        ...rn02,
      );
  // Início: dia útil não suspenso; no não penal, a indisponibilidade também adia (CPC, art. 224, §1º).
  const inicioConta = penal
    ? combinar(
        semContarFimDeSemanaE(calendario, efeitos('sem-expediente', 'suspensao-de-prazos')),
        ...rn02,
      )
    : combinar(
        semContarFimDeSemanaE(
          calendario,
          efeitos('sem-expediente', 'suspensao-de-prazos', 'indisponibilidade'),
        ),
        ...rn02,
      );
  const diaUtilEIndisponibilidade = semContarFimDeSemanaE(
    calendario,
    efeitos('sem-expediente', 'indisponibilidade'),
  );

  const marco = marcoInicial(entrada, diaUtil, inicioConta, conta);
  if (!marco.ok) return marco;
  const { inicio } = marco.valor;
  if (inicio.ehAntesDe(regime.vigencia)) {
    return aConfirmar(
      'sem-regra-legal',
      `regra de contagem vigente em ${inicio.paraIso()} não cadastrada`,
    );
  }

  const {
    quantidade,
    fundamento: fundamentoDoDobro,
    emAberto: dobroEmAberto,
  } = quantidadeDoPrazo(entrada, prazo, opcoes);
  const contagem = contarDias(inicio, quantidade, conta);
  if (!contagem.ok) return err(esgotado(contagem.erro));
  const prorrogacao = prorrogar(entrada, contagem.valor.data, diaUtilEIndisponibilidade, opcoes);
  if (!prorrogacao.ok) return prorrogacao;

  const diasDesconsiderados = [
    ...marco.valor.desconsiderados,
    ...contagem.valor.desconsiderados,
    ...prorrogacao.valor.avanco.desconsiderados,
  ];
  const suspendeu = diasDesconsiderados.some(
    (dia) => dia.fundamento === regime.suspensaoDeFimDeAno.fundamento,
  );
  const fundamentos = [
    ...marco.valor.fundamentos,
    regime.fundamentoDaContagem,
    prazo.fundamento,
    ...(fundamentoDoDobro === undefined ? [] : [fundamentoDoDobro]),
    ...(suspendeu ? [regime.suspensaoDeFimDeAno.fundamento] : []),
    ...(prorrogacao.valor.fundamento === undefined ? [] : [prorrogacao.valor.fundamento]),
  ];
  // Só fica em aberto a suspensão penal que cairia dentro do prazo.
  const periodoAteVencimento = inicio.diasAte(prorrogacao.valor.avanco.data) + 1;
  const cruzaFimDeAno =
    suspensaoPenalEmAberto &&
    Array.from({ length: periodoAteVencimento }, (_, i) => inicio.maisDias(i)).some(
      (dia) => suspensaoDeFimDeAno(regime.suspensaoDeFimDeAno)(dia).length > 0,
    );

  return ok({
    ...(marco.valor.publicacao === undefined ? {} : { publicacao: marco.valor.publicacao }),
    ...(marco.valor.ciencia === undefined ? {} : { ciencia: marco.valor.ciencia }),
    inicio,
    vencimento: prorrogacao.valor.avanco.data,
    diasDesconsiderados,
    fundamentos,
    emAberto: {
      dobro: dobroEmAberto,
      suspensaoPenal: cruzaFimDeAno && !opcoes.suspenderPenalSemInformacao,
      sabadoPenal: prorrogacao.valor.sabadoEmAberto && !opcoes.prorrogarSabadoPenal,
    },
  });
}

const VARIACOES: readonly {
  readonly chave: keyof Calculo['emAberto'];
  readonly opcoes: Opcoes;
  readonly descricao: string;
  readonly fundamentos: (regime: Regime) => readonly string[];
}[] = [
  {
    chave: 'dobro',
    opcoes: { ...SUGERIDA, dobrarNoVerificar: true },
    descricao: 'prazo em dobro para o ente (tabela: verificar caso a caso)',
    fundamentos: () => ['CPC, art. 183, c/c CLT, art. 769'],
  },
  {
    chave: 'suspensaoPenal',
    opcoes: { ...SUGERIDA, suspenderPenalSemInformacao: true },
    descricao:
      'com a suspensão de 20/12 a 20/01 (processo sem réu preso, Lei Maria da Penha ou medida urgente)',
    fundamentos: (regime) => [regime.suspensaoDeFimDeAno.fundamento],
  },
  {
    chave: 'sabadoPenal',
    opcoes: { ...SUGERIDA, prorrogarSabadoPenal: true },
    descricao: 'prorrogação do vencimento no sábado para o próximo dia útil',
    fundamentos: () => ['CPP, art. 798, §3º'],
  },
];

/**
 * Calcula o vencimento sugerido de um prazo. Ordem das regras: (1) regra legal e unidade;
 * (2) contagem do ramo (RN01, RN07); (3) publicação, ciência e início (RN03, RN04); (4) vigência da
 * regra no início (CPC, art. 14); (5) dobro (RN06); (6) contagem com calendário e suspensões
 * (RN05, RN02); (7) prorrogação do vencimento (RN08). Quando a regra deixa uma decisão em aberto,
 * a data sugerida é a mais cedo e as outras vão em `alternativas` (CLAUDE.md, seção 4.4).
 */
export function calcularPrazo(entrada: EntradaDoCalculo): ResultadoDoCalculo {
  const prazo = entrada.prazo;
  if (prazo === undefined) {
    return {
      situacao: 'a-confirmar',
      motivo: 'sem-regra-legal',
      detalhe: 'sem regra legal cadastrada para este ato',
      fundamentos: [],
    };
  }
  if (prazo.unidade !== 'dias') {
    return {
      situacao: 'a-confirmar',
      motivo: 'unidade-sem-regra',
      detalhe: `prazo em ${prazo.unidade} sem regra de contagem cadastrada`,
      fundamentos: [prazo.fundamento],
    };
  }
  if (!fusoValido(entrada.fusoDoJuizo)) {
    return {
      situacao: 'a-confirmar',
      motivo: 'dados-insuficientes',
      detalhe: `fuso do juízo desconhecido: ${entrada.fusoDoJuizo}`,
      fundamentos: ['CPC, art. 213, parágrafo único'],
    };
  }
  const regime = REGIMES[entrada.ramo];
  if (prazo.contagem !== regime.contagem) {
    return {
      situacao: 'a-confirmar',
      motivo: 'dados-insuficientes',
      detalhe: `a tabela conta em dias ${prazo.contagem} e a regra do ramo em dias ${regime.contagem}`,
      fundamentos: [prazo.fundamento, regime.fundamentoDaContagem],
    };
  }

  const sugerido = calcular(entrada, prazo, SUGERIDA);
  if (!sugerido.ok) {
    return { situacao: 'a-confirmar', ...sugerido.erro, fundamentos: [prazo.fundamento] };
  }

  const { emAberto, ...calculo } = sugerido.valor;
  const alternativas: Alternativa[] = [];
  for (const variacao of VARIACOES) {
    if (!emAberto[variacao.chave]) continue;
    // Cada decisão em aberto só alonga o prazo: a alternativa é sempre mais tardia que a sugerida.
    const outro = calcular(entrada, prazo, variacao.opcoes);
    // Sem calcular a alternativa, o advogado não vê todas as datas: nada de sugestão parcial.
    if (!outro.ok)
      return { situacao: 'a-confirmar', ...outro.erro, fundamentos: [prazo.fundamento] };
    alternativas.push({
      vencimento: outro.valor.vencimento,
      descricao: variacao.descricao,
      fundamentos: variacao.fundamentos(regime),
    });
  }

  const avisos = [
    ...(entrada.calendario.feriadosLocaisVerificados ? [] : [AVISO_FERIADO_LOCAL]),
    ...(entrada.fusoDoJuizo === FUSO_DE_BRASILIA ? [] : [avisoDeFuso(entrada.fusoDoJuizo)]),
    ...(alternativas.length === 0 ? [] : [AVISO_ALTERNATIVAS]),
    ...(prazo.alerta === undefined ? [] : [prazo.alerta]),
  ];
  return {
    situacao: 'calculado',
    ...calculo,
    // CPC, art. 213, parágrafo único; Lei 11.419/2006, art. 3º, parágrafo único.
    fimDoPrazo: calculo.vencimento.maisDias(1).inicioNoFuso(entrada.fusoDoJuizo),
    fusoDoJuizo: entrada.fusoDoJuizo,
    alternativas,
    avisos,
    versaoDoMotor: VERSAO_DO_MOTOR,
    versaoDaTabela: prazo.versao,
  };
}
