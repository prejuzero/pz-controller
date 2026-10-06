import { EstadoVazio } from '@pz/ui';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function NaoEncontrado() {
  const t = await getTranslations('erros');
  return (
    <main className="mx-auto max-w-xl p-6">
      <EstadoVazio
        titulo={t('naoEncontrado')}
        descricao={t('naoEncontradoDescricao')}
        acao={
          <Link href="/" className="text-primaria underline">
            {t('voltarInicio')}
          </Link>
        }
      />
    </main>
  );
}
