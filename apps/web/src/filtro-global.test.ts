import { describe, expect, it } from 'vitest';

import { campos, comFiltroGlobal, hrefComFiltro, lerFiltroGlobal } from './filtro-global';

const ANA = '01a10e00-0000-7000-8000-0000000e0003';

describe('filtro global na URL (HU27)', () => {
  it('lê os campos válidos e ignora os inválidos', () => {
    const filtro = lerFiltroGlobal(
      new URLSearchParams(
        `de=2026-11-01&ate=2026-11-30&responsavelId=${ANA}&tribunal=TJGO&clienteId=x&visao=semana`,
      ),
    );
    expect(filtro).toEqual({
      de: '2026-11-01',
      ate: '2026-11-30',
      responsavelId: ANA,
      tribunal: 'TJGO',
    });
    expect(lerFiltroGlobal(new URLSearchParams('de=2026-02-30&tribunal='))).toEqual({});
  });

  it('período invertido fica só com o início', () => {
    expect(lerFiltroGlobal(new URLSearchParams('de=2026-11-30&ate=2026-11-01'))).toEqual({
      de: '2026-11-30',
    });
  });

  it('troca o filtro e mantém os outros parâmetros da tela', () => {
    const url = comFiltroGlobal(new URLSearchParams('visao=semana&tribunal=TJGO&de=2026-11-01'), {
      tribunal: ' TJSP ',
      clienteId: '',
    });
    expect(url.toString()).toBe('visao=semana&tribunal=TJSP');
  });

  it('o menu leva o filtro só às telas que o aplicam', () => {
    const atual = new URLSearchParams(`tribunal=TJGO&responsavelId=${ANA}&visao=mes`);
    expect(hrefComFiltro('/calendario', atual)).toBe(
      `/calendario?responsavelId=${ANA}&tribunal=TJGO`,
    );
    expect(hrefComFiltro('/', new URLSearchParams())).toBe('/');
    expect(hrefComFiltro('/processos', atual)).toBe('/processos');
  });

  it('separa os campos aceitos por cada tela', () => {
    expect(campos({ tribunal: 'TJGO', de: '2026-11-01' }, ['tribunal', 'responsavelId'])).toEqual({
      tribunal: 'TJGO',
    });
  });
});
