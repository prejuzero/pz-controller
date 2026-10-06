import { init } from '@sentry/browser';

import { iniciarMonitoramento } from './monitoramento';

iniciarMonitoramento(process.env.NEXT_PUBLIC_SENTRY_DSN, init);
