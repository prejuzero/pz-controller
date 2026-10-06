import { getRequestConfig } from 'next-intl/server';

import mensagens from '../mensagens/pt-BR.json';

import { formatos, FUSO_PADRAO, IDIOMA_PADRAO } from './configuracao';

// Um idioma por enquanto, sem prefixo na URL. Outro idioma = novo arquivo em src/mensagens e a
// escolha aqui (preferência do usuário ou Accept-Language).
export default getRequestConfig(() =>
  Promise.resolve({
    locale: IDIOMA_PADRAO,
    timeZone: FUSO_PADRAO,
    formats: formatos,
    messages: mensagens,
  }),
);
