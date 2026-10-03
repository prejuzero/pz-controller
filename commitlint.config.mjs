// Conventional Commits (CLAUDE.md, seção 16). Assunto em português, sem forçar caixa.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
  },
};
