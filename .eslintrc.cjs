module.exports = {
  root: true,
  env: {
    browser: true,
    jquery: true,
    mocha: true,
    node: true
  },
  plugins: ['prettier'],
  extends: ['eslint:recommended', 'prettier'],
  rules: {
    'no-undef': 'error',
    'no-unsafe-finally': 'error',
    'no-unsafe-negation': 'error',
    'no-unsafe-optional-chaining': 'error',
    'no-var': 'error'
  },
  parser: 'espree',
  parserOptions: {
    ecmaVersion: 2015,
    requireConfigFile: true,
    sourceType: 'module'
  }
};
