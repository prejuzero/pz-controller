import { Casca } from './_casca/casca';

import type { ReactNode } from 'react';

export default function LayoutProtegido({ children }: { children: ReactNode }) {
  return <Casca>{children}</Casca>;
}
