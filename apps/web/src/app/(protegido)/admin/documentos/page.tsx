import { SePermitido } from '../../_casca/se-permitido';

import { DocumentosLegais } from './documentos';

export default function PaginaDocumentosLegais() {
  return (
    <SePermitido permissao="admin:documentos-legais">
      <DocumentosLegais />
    </SePermitido>
  );
}
