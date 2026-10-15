import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { buildNative } from './scripts/build-native.mjs'

export default defineConfig({
  main: {
    plugins: [{ name: 'margin-native-rename', buildStart: buildNative }]
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
