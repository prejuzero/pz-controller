import { Botao, Paragrafo, Tela, Titulo } from '../../src/components/tela';
import { t } from '../../src/i18n';

/** Entrada do app: o login OAuth 2.1 + PKCE pelo navegador do sistema chega na HU65 [MOBILE]. */
export default function Entrar() {
  return (
    <Tela>
      <Titulo>{t('entrar.titulo')}</Titulo>
      <Paragrafo>{t('entrar.descricao')}</Paragrafo>
      <Botao
        rotulo={t('entrar.botao')}
        aoTocar={() => {
          // HU65 [MOBILE]: abre a autorização com PKCE (client_id CLIENTE_OAUTH_DO_APP).
        }}
      />
    </Tela>
  );
}
