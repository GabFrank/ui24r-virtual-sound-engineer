module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
    'header-max-length': [2, 'always', 72],
    'scope-enum': [
      2,
      'always',
      [
        'docs', 'adr', 'spike', 'gate', 'field',
        'domain', 'adapter', 'dsp', 'safety', 'audio',
        'mobile', 'ui', 'tools', 'ci', 'deps',
      ],
    ],
  },
};
