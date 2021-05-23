const { getDefaultConfig } = require('expo/metro-config')
const esbuildMiddleware = require('./esbuild.config')

const defaultConfig = getDefaultConfig(__dirname)

defaultConfig.server.enhanceMiddleware = esbuildMiddleware

module.exports = defaultConfig
