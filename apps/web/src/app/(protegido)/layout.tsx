import { Suspense, type ReactNode } from 'react';

import { Casca } from './_casca/casca';
import { GuardaSegundoFator } from './_casca/guarda-segundo-fator';

export default function LayoutProtegido({ children }: { children: ReactNode }) {
  return (
    <Casca>
      {/* useSearchParams exige Suspense para não desligar a renderização estática. */}
      <Suspense>
        <GuardaSegundoFator />
      </Suspense>
      {children}
    </Casca>
  );
}
