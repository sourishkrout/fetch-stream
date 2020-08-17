const plugins = [
  [
    'module-resolver',
    {
      root: ['./'],
      alias: { '^~/(.+)': './\\1' },
    },
  ],
]

module.exports = {
  presets: ['next/babel'],
  plugins: plugins,
}
