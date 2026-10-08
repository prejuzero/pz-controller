import { SePermitido } from '../../_casca/se-permitido';

import { Integracoes } from './integracoes';

export default function PaginaIntegracoes() {
  return (
    <SePermitido permissao="admin:filas">
      <Integracoes />
    </SePermitido>
  );
}
