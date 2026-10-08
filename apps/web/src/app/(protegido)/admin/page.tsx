import { SePermitido } from '../_casca/se-permitido';

import { Tenants } from './tenants';

export default function PaginaAdmin() {
  return (
    <SePermitido permissao="admin:tenants">
      <Tenants />
    </SePermitido>
  );
}
