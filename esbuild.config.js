const fs = require('fs')
const http = require('http')
const path = require('path')
const crypto = require('crypto')
const esbuild = require('esbuild')
const sizeOf = require('image-size')
const mime = require('mime')
var flowRemoveTypes = require('flow-remove-types')

let cache = new Map()
let updateCache = false
const cacheFile = './react-native-removed-flow.json'
if (fs.existsSync(cacheFile)) cache = new Map(JSON.parse(fs.readFileSync(cacheFile).toString()))
const packagesRemoveFlow = ((modules) =>
  new RegExp(modules.map((module) => `node_modules[/|\\\\]${module}.*\\.jsx?$`).join('|'), 'g'))([
  'react-native',
  '@react-native-community[/|\\\\]masked-view',
])
const rnRemovedFlowPlugin = {
  name: 'createFlowRemoveTypesPlugin',
  setup(build) {
    build.onLoad({ filter: packagesRemoveFlow, namespace: 'file' }, async (args) => {
      const relpath = path.relative(process.cwd(), args.path)
      const cacheResult = cache.get(relpath)
      if (cacheResult) {
        return { contents: cacheResult, loader: 'jsx' }
      }

      const source = fs.readFileSync(relpath, 'utf8')
      const output = flowRemoveTypes('// @flow\n' + source, { pretty: true, all: true })
      const contents = output.toString().replace(/static\s+\+/g, 'static ')
      cache.set(relpath, contents)
      updateCache = true
      return { contents, loader: 'jsx' }
    })
  },
}

const platform = 'android'
let files = {}
const extensions = ['.native.tsx',  '.native.ts',  '.native.jsx',  '.native.js',  '.tsx',  '.ts',  '.jsx',  '.js'] //prettier-ignore
const imageExtensions = ['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp']
const assetExtensions = ['.ttf', ...imageExtensions]
const assetLoaders = assetExtensions.reduce((loaders, ext) => {
  loaders[ext] = 'file'
  return loaders
}, {})
mime.define({ 'application/javascript': ['bundle'] }, true)
const relod = () => {
  http.request('http://127.0.0.1:19000/reload', (res) => {
    console.log(res, 'res')
  })
}

const banner = `
var __BUNDLE_START_TIME__=this.nativePerformanceNow?nativePerformanceNow():Date.now(),__DEV__=true,process=this.process||{};process.env=process.env||{};process.env.NODE_ENV=process.env.NODE_ENV||"development";
var window = typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : typeof window !== 'undefined' ? window : this;
var global = window, require = function() {};
`

const stdinContent = `
require('./node_modules/react-native/Libraries/polyfills/console.js');
require('./node_modules/react-native/Libraries/polyfills/error-guard.js');
require('./node_modules/react-native/Libraries/polyfills/Object.es7.js');
require('./node_modules/react-native/Libraries/Core/InitializeCore');
require('./node_modules/expo/AppEntry');`

const assetsPlugin = {
  name: 'assets',
  setup(build) {
    build.onStart(() => {
      console.log('build started')
      console.time('Esbuild Time:')
    })
    build.onResolve({ filter: /\.jpg$|\.png$|\.ttf$/ }, (args) =>
      path.parse(args.importer).base === path.parse(args.path + '.ast.js').base
        ? { path: path.resolve(args.resolveDir, args.path), namespace: 'file' }
        : { path: path.resolve(args.resolveDir, args.path) + '.ast.js', namespace: 'assets' }
    )
    build.onLoad({ filter: /.*/, namespace: 'assets' }, (args) => {
      const assetPath = args.path.slice(0, -7)
      const { name, base, ext } = path.parse(assetPath)

      const hasher = crypto.createHash('md5')
      hasher.update(fs.readFileSync(assetPath))
      const hash = hasher.digest('hex')

      const isImage = imageExtensions.includes(ext)
      let dimensions = {}
      if (isImage) dimensions = sizeOf(assetPath)

      const contents = `
      const { registerAsset,  getAssetByID } = require('react-native/Libraries/Image/AssetRegistry.js')
      const  resolveAssetSource = require('react-native/Libraries/Image/resolveAssetSource.js')
      const file = require('./${base}')
      const asset = registerAsset({
          __packager_asset: true,
          httpServerLocation: '/assets',
          scales: [1],
          hash: '${hash}',
          name: '${name}',
          type:'${ext.slice(1)}',
          fileHashes: ['${hash}'],
        })
      const width = ${dimensions.width}
      const height = ${dimensions.height}
      if (${isImage} && width && height ) { asset.width = width; asset.height = height }
      module.exports = asset
      `
      return { contents, loader: 'js', resolveDir: path.resolve(path.parse(args.path).dir) }
    })
  },
}

function logger(result, error) {
  if (error) throw error
  result.outputFiles?.forEach(
    (file) =>
      (file.relativePath = '/' + path.relative(process.cwd(), file.path).replace(/\\/g, '/'))
  )
  files = result
  console.log(
    `build"with errors: ${result.errors.length}, warnings: ${result.warnings.length} Cached files: ${cache.size}`,
    error
  )
  console.timeEnd('Esbuild Time:')
  if (updateCache) fs.writeFileSync(cacheFile, JSON.stringify([...cache.entries()]))
}

false &&
  esbuild
    .build({
      stdin: {
        contents: stdinContent,
        resolveDir: '.',
        sourcefile: 'index.bundle',
        loader: 'js',
      },
      outfile: '/index.bundle',
      write: false,
      allowOverwrite: true,
      bundle: true,
      minify: false,
      sourcemap: true,
      assetNames: 'assets/[name]',
      publicPath: '/',
      incremental: true,
      resolveExtensions : [`.${platform}.tsx`, `.${platform}.ts`, `.${platform}.jsx`, `.${platform}.js`, ...extensions], //prettier-ignore
      plugins: [rnRemovedFlowPlugin, assetsPlugin],
      loader: { ...assetLoaders, '.js': 'jsx' },
      banner: { js: banner },
      watch: {
        onRebuild(error, result) {
          logger(result, error)
        },
      },
    })
    .then((result, error) => {
      logger(result, error)
    })
    .catch((err) => {
      console.error(err?.message)
      process.exit(1)
    })

const esbuildMiddleware = (metroMiddleware, server) => {
  return (req, res, next) => {
    const url = req.url.replace('index.map', 'index.bundle.map')
    const file = files.outputFiles?.filter((v) => v.relativePath === url.split('?')[0])[0]
    console.log(url, '.....')
    if (file && file.relativePath) {
      res.writeHead(200, {
        'Content-Length': file.contents.length,
        'Content-Type': mime.getType(file.relativePath),
      })
      res.write(file.contents)
      res.end(null)
    } else {
      return metroMiddleware(req, res, next)
    }
  }
}

module.exports = esbuildMiddleware
