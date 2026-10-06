import type { formatos, IDIOMA_PADRAO } from './configuracao';
import type mensagens from '../mensagens/pt-BR.json';

// Chaves do catálogo e formatos tipados: chave inexistente é erro de compilação.
declare module 'next-intl' {
  interface AppConfig {
    Locale: typeof IDIOMA_PADRAO;
    Messages: typeof mensagens;
    Formats: typeof formatos;
  }
}
