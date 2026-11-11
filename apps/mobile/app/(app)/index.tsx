import { Paragrafo, Tela, Titulo } from '../../src/components/tela';
import { t } from '../../src/i18n';

/** Painel (HU66): por enquanto só o esqueleto da rota, espelhando o portal. */
export default function Painel() {
  return (
    <Tela>
      <Titulo>{t('painel.titulo')}</Titulo>
      <Paragrafo>{t('painel.emBreve')}</Paragrafo>
    </Tela>
  );
}
