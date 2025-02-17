import { useLoader, useThree } from '@react-three/fiber'
import {
  EquirectangularReflectionMapping,
  CubeTextureLoader,
  Texture,
  Loader,
  CubeReflectionMapping,
  CubeTexture,
} from 'three'
import { RGBELoader, EXRLoader } from 'three-stdlib'
import { GainMapLoader, HDRJPGLoader } from '@monogrid/gainmap-js'
import { presetsObj, PresetsType } from '../helpers/environment-assets'
import { LinearEncoding, sRGBEncoding, TextureEncoding } from '../helpers/deprecated'
import { useLayoutEffect } from 'react'

const CUBEMAP_ROOT = 'https://raw.githack.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/'
const isArray = (arr: any): arr is string[] => Array.isArray(arr)

export type EnvironmentLoaderProps = {
  files?: string | string[]
  path?: string
  preset?: PresetsType
  extensions?: (loader: Loader) => void
  encoding?: TextureEncoding
}

const defaultFiles = ['/px.png', '/nx.png', '/py.png', '/ny.png', '/pz.png', '/nz.png']

export function useEnvironment({
  files = defaultFiles,
  path = '',
  preset = undefined,
  encoding = undefined,
  extensions,
}: Partial<EnvironmentLoaderProps> = {}) {
  let loader: typeof Loader | null = null
  let multiFile: boolean = false

  if (preset) {
    validatePreset(preset)
    files = presetsObj[preset]
    path = CUBEMAP_ROOT
  }

  // Everything else
  multiFile = isArray(files)

  const { extension, isCubemap } = getExtension(files)

  loader = getLoader(extension)
  if (!loader) throw new Error('useEnvironment: Unrecognized file extension: ' + files)

  const gl = useThree((state) => state.gl)

  useLayoutEffect(() => {
    // Only required for gainmap
    if (extension !== 'webp' && extension !== 'jpg' && extension !== 'jpeg') return

    function clearGainmapTexture() {
      useLoader.clear(
        // @ts-expect-error
        loader,
        multiFile ? [files] : files
      )
    }

    gl.domElement.addEventListener('webglcontextlost', clearGainmapTexture, { once: true })
  }, [files, gl.domElement])

  const loaderResult: Texture | Texture[] = useLoader(
    // @ts-expect-error
    loader,
    multiFile ? [files] : files,
    (loader) => {
      // Gainmap requires a renderer
      if (extension === 'webp' || extension === 'jpg' || extension === 'jpeg') {
        loader.setRenderer(gl)
      }
      loader.setPath?.(path)
      if (extensions) extensions(loader)
    }
  ) as Texture | Texture[]
  let texture: Texture | CubeTexture = multiFile
    ? // @ts-ignore
      loaderResult[0]
    : loaderResult

  if (extension === 'jpg' || extension === 'jpeg' || extension === 'webp') {
    texture = (texture as any).renderTarget?.texture
  }

  texture.mapping = isCubemap ? CubeReflectionMapping : EquirectangularReflectionMapping

  if ('colorSpace' in texture) (texture as any).colorSpace = (encoding ?? isCubemap) ? 'srgb' : 'srgb-linear'
  else (texture as any).encoding = (encoding ?? isCubemap) ? sRGBEncoding : LinearEncoding

  return texture
}

type EnvironmentLoaderPreloadOptions = Omit<EnvironmentLoaderProps, 'encoding'>
const preloadDefaultOptions = {
  files: defaultFiles,
  path: '',
  preset: undefined,
  extensions: undefined,
}

useEnvironment.preload = (preloadOptions?: EnvironmentLoaderPreloadOptions) => {
  const options = { ...preloadDefaultOptions, ...preloadOptions }
  let { files, path = '' } = options
  const { preset, extensions } = options

  if (preset) {
    validatePreset(preset)
    files = presetsObj[preset]
    path = CUBEMAP_ROOT
  }

  const { extension } = getExtension(files)

  if (extension === 'webp' || extension === 'jpg' || extension === 'jpeg') {
    throw new Error('useEnvironment: Preloading gainmaps is not supported')
  }

  const loader = getLoader(extension)
  if (!loader) throw new Error('useEnvironment: Unrecognized file extension: ' + files)

  useLoader.preload(
    // @ts-expect-error
    loader,
    isArray(files) ? [files] : files,
    (loader) => {
      loader.setPath?.(path)
      if (extensions) extensions(loader)
    }
  )
}

type EnvironmentLoaderClearOptions = Pick<EnvironmentLoaderProps, 'files' | 'preset'>
const clearDefaultOptins = {
  files: defaultFiles,
  preset: undefined,
}

useEnvironment.clear = (clearOptions?: EnvironmentLoaderClearOptions) => {
  const options = { ...clearDefaultOptins, ...clearOptions }
  let { files } = options
  const { preset } = options

  if (preset) {
    validatePreset(preset)
    files = presetsObj[preset]
  }

  const { extension } = getExtension(files)
  const loader = getLoader(extension)
  if (!loader) throw new Error('useEnvironment: Unrecognized file extension: ' + files)
  useLoader.clear(
    // @ts-expect-error
    loader,
    isArray(files) ? [files] : files
  )
}

function validatePreset(preset: string) {
  if (!(preset in presetsObj)) throw new Error('Preset must be one of: ' + Object.keys(presetsObj).join(', '))
}

function getExtension(files: string | string[]) {
  const isCubemap = isArray(files) && files.length === 6
  const isGainmap = isArray(files) && files.length === 3 && files.some((file) => file.endsWith('json'))
  const firstEntry = isArray(files) ? files[0] : files

  // Everything else
  const extension: string | false | undefined = isCubemap
    ? 'cube'
    : isGainmap
      ? 'webp'
      : firstEntry.startsWith('data:application/exr')
        ? 'exr'
        : firstEntry.startsWith('data:application/hdr')
          ? 'hdr'
          : firstEntry.startsWith('data:image/jpeg')
            ? 'jpg'
            : firstEntry.split('.').pop()?.split('?')?.shift()?.toLowerCase()

  return { extension, isCubemap, isGainmap }
}

function getLoader(extension: string | undefined) {
  const loader: typeof Loader | null =
    extension === 'cube'
      ? CubeTextureLoader
      : extension === 'hdr'
        ? RGBELoader
        : extension === 'exr'
          ? EXRLoader
          : extension === 'jpg' || extension === 'jpeg'
            ? (HDRJPGLoader as unknown as typeof Loader)
            : extension === 'webp'
              ? (GainMapLoader as unknown as typeof Loader)
              : null

  return loader
}
