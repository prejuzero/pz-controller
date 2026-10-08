import { SePermitido } from '../../_casca/se-permitido';

import { Rejeicoes } from './rejeicoes';

export default function PaginaRejeicoes() {
  return (
    <SePermitido permissao="admin:tenants">
      <Rejeicoes />
    </SePermitido>
  );
}
