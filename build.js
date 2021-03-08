var spawn = require('child_process').spawn
var servor = require('servor')
var app = require('./app.json')

var prod = !(process.argv[2] === 'dev')

require('esbuild')
  .build({
    entryPoints: ['./src/index.js'],
    outfile: './public/bundle.js',
    tsconfig: 'tsconfig.json',
    define: {
      'process.env.NODE_ENV': prod ? '"production"' : '"development"',
      'process.env.APP_MANIFEST': JSON.stringify(app),
      __DEV__: !prod,
      global: 'window',
    },
    loader: { '.png': 'file', '.jpg': 'file', '.ttf': 'file', '.js': 'jsx' },
    resolveExtensions: [".web.tsx", ".web.ts", ".web.jsx", ".web.js", ".tsx", ".ts", ".jsx", ".js"], //prettier-ignore
    format: 'esm',
    bundle: true,
    minify: prod,
    assetNames: 'assets/[name]-[hash]',
    sourcemap: true,
    plugins: [],
    incremental: !prod,
    publicPath: '/',
    watch: prod
      ? false
      : {
          onRebuild(error, result) {
            console.log(error ? error : '...')
          },
        },
  })
  .then((result, error) => {
    const port = 8081
    if (!prod) {
      servor({ root: './public', reload: true, port })
        .then((result, error) => {
          if (error) console.log(result, error)
          else spawn('cmd', ['/c', 'start', `http://localhost:${port}`])
        }) //Interagierende-Systeme/openurl2
        .catch(() => process.exit(1))
    }
    console.log(error ? error : `[servor] web-server started at localhost:${port}`)
  })
  .catch(() => process.exit(1))
