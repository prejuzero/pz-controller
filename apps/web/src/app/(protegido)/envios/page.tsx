import { SePermitido } from '../_casca/se-permitido';

import { EnviosRecentes } from './envios';

export default function PaginaEnvios() {
  return (
    <SePermitido permissao="relatorios:exportar">
      <EnviosRecentes />
    </SePermitido>
  );
}
