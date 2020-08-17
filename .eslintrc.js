module.exports = {
  env: {
    browser: true,
    es6: true,
    node: true,
  },
  extends: [
    'plugin:jsx-a11y/recommended',
    'plugin:lodash/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
    'prettier/react',
    'standard',
    'standard-react',
    'plugin:@next/next/recommended',
  ],
  parser: 'babel-eslint',
  plugins: [
    'jsx-a11y',
    'lodash',
    'react',
    'react-hooks',
    'prettier',
    '@next/next',
  ],
  rules: {
    'comma-dangle': ['error', 'only-multiline'],
    'sort-imports': [
      'error',
      {
        ignoreCase: true,
        ignoreDeclarationSort: true,
        ignoreMemberSort: false,
      },
    ],
    'import/order': [
      'error',
      { alphabetize: { order: 'asc', caseInsensitive: true } },
    ],
    'prettier/prettier': 'error',
    'react/jsx-sort-props': ['error'],
    'space-before-function-paren': 'off',
    'jsx-quotes': ['error', 'prefer-double'],
  },
  globals: {
    React: 'writable',
  },
}
