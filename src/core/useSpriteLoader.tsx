/* eslint react-hooks/exhaustive-deps: 1 */
import { Texture, TextureLoader } from 'three'
import { useLoader, useThree } from '@react-three/fiber'
import { useState } from 'react'
import * as React from 'react'
import * as THREE from 'three'

type Size = {
  w: number
  h: number
}

type FrameData = {
  frame: {
    x: number
    y: number
    w: number
    h: number
  }
  rotated: boolean
  trimmed: boolean
  spriteSourceSize: {
    x: number
    y: number
    w: number
    h: number
  }
  sourceSize: Size
}

type MetaData = {
  version: string
  size: {
    w: number
    h: number
  }
  rows: number
  columns: number
  frameWidth: number
  frameHeight: number
  scale: string
}

type SpriteData = {
  frames: Record<string, FrameData[]> | FrameData[]
  meta: MetaData
}

// utils
export const getFirstItem = (param: FrameData[] | Record<string, FrameData[]>) => {
  if (Array.isArray(param)) {
    return param[0]
  } else if (typeof param === 'object' && param !== null) {
    const keys = Object.keys(param)

    return param[keys[0]][0]
  } else {
    return { w: 0, h: 0, sourceSize: { w: 0, h: 0 } }
  }
}

export const checkIfFrameIsEmpty = (frameData: Uint8ClampedArray) => {
  for (let i = 3; i < frameData.length; i += 4) {
    if (frameData[i] !== 0) {
      return false
    }
  }
  return true
}

type SpriteMetaDimension = {
  row: number
  col: number
}

export function useSpriteLoader<Url extends string>(
  input?: Url | null,
  json?: string | null,
  animationNames?: string[] | null,
  numberOfFrames?: number | null,
  onLoad?: (texture: Texture, textureData?: any) => void,
  canvasRenderingContext2DSettings?: CanvasRenderingContext2DSettings
): any {
  const viewport = useThree((state) => state.viewport)
  const spriteDataRef = React.useRef<SpriteData | null>(null)
  const totalFrames = React.useRef(0)
  const aspectFactor = 0.1
  const [spriteData, setSpriteData] = useState<Record<string, any> | null>(null)
  const [spriteTexture, setSpriteTexture] = React.useState<THREE.Texture>(new THREE.Texture())
  const textureLoader = React.useMemo(() => new THREE.TextureLoader(), [])
  const [spriteObj, setSpriteObj] = useState<Record<string, any> | null>(null)

  const calculateAspectRatio = React.useCallback(
    (width: number, height: number, factor: number) => {
      const adaptedHeight =
        height * (viewport.aspect > width / height ? viewport.width / width : viewport.height / height)
      const adaptedWidth =
        width * (viewport.aspect > width / height ? viewport.width / width : viewport.height / height)
      const scaleX = adaptedWidth * factor
      const scaleY = adaptedHeight * factor
      const currentMaxScale = 1
      // Calculate the maximum scale based on the aspect ratio and max scale limit
      let finalMaxScaleW = Math.min(currentMaxScale, scaleX)
      let finalMaxScaleH = Math.min(currentMaxScale, scaleY)

      // Ensure that scaleX and scaleY do not exceed the max scale while maintaining aspect ratio
      if (scaleX > currentMaxScale) {
        finalMaxScaleW = currentMaxScale
        finalMaxScaleH = (scaleY / scaleX) * currentMaxScale
      }

      return new THREE.Vector3(finalMaxScaleW, finalMaxScaleH, 1)
    },
    [viewport]
  )

  // refs
  const loadJsonRef = React.useRef(
    (textureUrl: string, jsonUrl: string, callback: (json: SpriteData, texture: THREE.Texture) => void) => {
      loadJsonAndTextureAndExecuteCallback(textureUrl, jsonUrl, callback)
    }
  )

  const loadStandaloneSpriteRef = React.useRef((textureUrl?: string) => {
    loadStandaloneSprite(textureUrl)
  })

  const parseSpriteRef = React.useRef((json: SpriteData | null, spriteTexture: THREE.Texture) => {
    parseSpriteData(json, spriteTexture)
  })

  const calculateAspectRatioRef = React.useRef((width: number, height: number, factor: number) => {
    return calculateAspectRatio(width, height, factor)
  })

  const getRowsAndColumns = React.useCallback(
    (texture: THREE.Texture, totalFrames: number) => {
      if (texture.image) {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', canvasRenderingContext2DSettings)

        if (!ctx) {
          throw new Error('Failed to get 2d context')
        }

        canvas.width = texture.image.width
        canvas.height = texture.image.height

        ctx.drawImage(texture.image, 0, 0)

        const width = texture.image.width
        const height = texture.image.height

        // Calculate rows and columns based on the number of frames and image dimensions
        const cols = Math.round(Math.sqrt(totalFrames * (width / height)))
        const rows = Math.round(totalFrames / cols)

        const frameWidth = width / cols
        const frameHeight = height / rows

        const emptyFrames: SpriteMetaDimension[] = []

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const frameIndex = row * cols + col

            if (frameIndex >= totalFrames) {
              emptyFrames.push({ row, col })
              continue
            }

            const frameData = ctx.getImageData(col * frameWidth, row * frameHeight, frameWidth, frameHeight).data

            const isEmpty = checkIfFrameIsEmpty(frameData)
            if (isEmpty) {
              emptyFrames.push({ row, col })
            }
          }
        }

        return { rows, columns: cols, frameWidth, frameHeight, emptyFrames }
      } else {
        return { rows: 0, columns: 0, frameWidth: 0, frameHeight: 0, emptyFrames: [] }
      }
    },
    [canvasRenderingContext2DSettings]
  )

  // for frame based JSON Hash sprite data
  const parseFrames = React.useCallback((): any => {
    const sprites: Record<string, any> = {}
    const data = spriteDataRef.current
    const delimiters = animationNames

    if (data) {
      if (delimiters && Array.isArray(data['frames'])) {
        for (let i = 0; i < delimiters.length; i++) {
          // we convert each named animation group into an array
          sprites[delimiters[i]] = []

          for (const value of data['frames']) {
            const frameData = value['frame']
            const x = frameData['x']
            const y = frameData['y']
            const width = frameData['w']
            const height = frameData['h']
            const sourceWidth = value['sourceSize']['w']
            const sourceHeight = value['sourceSize']['h']

            if (
              typeof value['filename'] === 'string' &&
              value['filename'].toLowerCase().indexOf(delimiters[i].toLowerCase()) !== -1
            ) {
              sprites[delimiters[i]].push({
                x: x,
                y: y,
                w: width,
                h: height,
                frame: frameData,
                sourceSize: { w: sourceWidth, h: sourceHeight },
              })
            }
          }
        }

        for (const frame in sprites) {
          sprites[frame].frame = calculateScaleRatio(sprites[frame])
        }

        return sprites
      } else if (delimiters && typeof data['frames'] === 'object') {
        for (let i = 0; i < delimiters.length; i++) {
          // we convert each named animation group into an array
          sprites[delimiters[i]] = []

          for (const innerKey in data['frames']) {
            const value = data['frames'][innerKey]
            const frameData = value['frame']
            const x = frameData['x']
            const y = frameData['y']
            const width = frameData['w']
            const height = frameData['h']
            const sourceWidth = value['sourceSize']['w']
            const sourceHeight = value['sourceSize']['h']

            if (typeof innerKey === 'string' && innerKey.toLowerCase().indexOf(delimiters[i].toLowerCase()) !== -1) {
              sprites[delimiters[i]].push({
                x: x,
                y: y,
                w: width,
                h: height,
                frame: frameData,
                sourceSize: { w: sourceWidth, h: sourceHeight },
              })
            }
          }
        }

        for (const frame in sprites) {
          sprites[frame].frame = calculateScaleRatio(sprites[frame])
        }

        return sprites
      } else {
        // we need to convert it into an array
        let spritesArr: FrameData[] = []

        if (data?.frames) {
          if (Array.isArray(data.frames)) {
            // If frames is already an array, use it directly
            spritesArr = [...data.frames]
          } else {
            // If frames is an object, spread all the arrays into one
            spritesArr = Object.values(data.frames).flat()
          }
        }

        // Now calculateScaleRatio will work with the properly typed array
        return calculateScaleRatio(spritesArr)
      }
    }
  }, [animationNames])

  const parseSpriteData = React.useCallback(
    (json: SpriteData | null, _spriteTexture: THREE.Texture) => {
      let aspect = new THREE.Vector3(1, 1, 1)
      // sprite only case
      if (json === null) {
        if (_spriteTexture && numberOfFrames) {
          //get size from texture
          const width = _spriteTexture.image.width
          const height = _spriteTexture.image.height
          totalFrames.current = numberOfFrames
          const { rows, columns, frameWidth, frameHeight, emptyFrames } = getRowsAndColumns(
            _spriteTexture,
            numberOfFrames
          )
          const nonJsonFrames: SpriteData = {
            frames: [],
            meta: {
              version: '1.0',
              size: { w: width, h: height },
              rows,
              columns,
              frameWidth,
              frameHeight,
              scale: '1',
            },
          }

          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < columns; col++) {
              const isExcluded = (emptyFrames ?? []).some((coord) => coord.row === row && coord.col === col)

              if (isExcluded) {
                continue
              }

              if (Array.isArray(nonJsonFrames.frames)) {
                nonJsonFrames.frames.push({
                  frame: {
                    x: col * frameWidth,
                    y: row * frameHeight,
                    w: frameWidth,
                    h: frameHeight,
                  },
                  rotated: false,
                  trimmed: false,
                  spriteSourceSize: {
                    x: 0,
                    y: 0,
                    w: frameWidth,
                    h: frameHeight,
                  },
                  sourceSize: {
                    w: frameWidth,
                    h: frameHeight,
                  },
                })
              }
            }
          }

          aspect = calculateAspectRatioRef.current(frameWidth, frameHeight, aspectFactor)

          spriteDataRef.current = nonJsonFrames
        }

        //scale ratio for stadalone sprite
        if (spriteDataRef.current && spriteDataRef.current.frames) {
          spriteDataRef.current.frames = calculateScaleRatio(spriteDataRef.current.frames)
        }
      } else if (_spriteTexture) {
        spriteDataRef.current = json
        spriteDataRef.current.frames = parseFrames()

        totalFrames.current = Array.isArray(json.frames) ? json.frames.length : Object.keys(json.frames).length
        const { w, h } = getFirstItem(json.frames).sourceSize
        aspect = calculateAspectRatioRef.current(w, h, aspectFactor)
      }

      setSpriteData(spriteDataRef.current)

      if ('encoding' in _spriteTexture) {
        _spriteTexture.encoding = 3001 // sRGBEncoding
      } else {
        //@ts-ignore
        _spriteTexture.colorSpace = THREE.SRGBColorSpace
      }

      setSpriteTexture(_spriteTexture)
      setSpriteObj({
        spriteTexture: _spriteTexture,
        spriteData: spriteDataRef.current,
        aspect: aspect,
      })
    },
    [getRowsAndColumns, numberOfFrames, parseFrames]
  )

  function loadJsonAndTexture(textureUrl: string, jsonUrl?: string) {
    if (jsonUrl && textureUrl) {
      loadJsonAndTextureAndExecuteCallback(jsonUrl, textureUrl, parseSpriteRef.current)
    } else {
      loadStandaloneSprite(textureUrl)
    }
  }

  const loadStandaloneSprite = React.useCallback(
    (textureUrl?: string) => {
      if (!textureUrl && !input) {
        throw new Error('Either textureUrl or input must be provided')
      }

      const validUrl = textureUrl ?? input
      if (!validUrl) {
        throw new Error('A valid texture URL must be provided')
      }

      new Promise<THREE.Texture>((resolve) => {
        textureLoader.load(validUrl, resolve)
      }).then((texture) => {
        parseSpriteRef.current(null, texture)
      })
    },
    [input, textureLoader]
  )

  /**
   *
   */
  const loadJsonAndTextureAndExecuteCallback = React.useCallback(
    (jsonUrl: string, textureUrl: string, callback: (json: SpriteData, texture: THREE.Texture) => void): void => {
      const jsonPromise = fetch(jsonUrl).then((response) => response.json())
      const texturePromise = new Promise<THREE.Texture>((resolve) => {
        textureLoader.load(textureUrl, resolve)
      })

      Promise.all([jsonPromise, texturePromise]).then((response) => {
        callback(response[0], response[1])
      })
    },
    [textureLoader]
  )

  // calculate scale ratio for the frames
  const calculateScaleRatio = (frames: FrameData[] | Record<string, FrameData[]>) => {
    // Helper function to calculate scale ratio for an array of frames
    const processFrameArray = (frameArray: FrameData[]) => {
      // Find the largest frame
      let largestFrame: { w: number; h: number; area: number } | null = null

      for (const frame of frameArray) {
        const { w, h } = frame.frame
        const area = w * h
        if (!largestFrame || area > largestFrame.area) {
          largestFrame = { w, h, area }
        }
      }

      // Set scaleRatio property on each frame
      return frameArray.map((frame) => {
        const { w, h } = frame.frame
        const area = w * h
        const scaleRatio = largestFrame ? (area === largestFrame.area ? 1 : Math.sqrt(area / largestFrame.area)) : 1

        return {
          ...frame,
          scaleRatio,
        }
      })
    }

    // Handle both array and record cases
    if (Array.isArray(frames)) {
      return processFrameArray(frames)
    } else {
      // Process each animation sequence separately
      const result: Record<string, any[]> = {}
      for (const key in frames) {
        result[key] = processFrameArray(frames[key])
      }
      return result
    }
  }

  React.useLayoutEffect(() => {
    if (json && input) {
      loadJsonRef.current(json, input, parseSpriteRef.current)
    } else if (input) {
      // only load the texture, this is an image sprite only
      loadStandaloneSpriteRef.current()
    }

    return () => {
      if (input) {
        useLoader.clear(TextureLoader, input)
      }
    }
  }, [input, json])

  React.useLayoutEffect(() => {
    onLoad?.(spriteTexture, spriteData)
  }, [spriteTexture, spriteData, onLoad])

  return { spriteObj, loadJsonAndTexture }
}

useSpriteLoader.preload = (url: string) => useLoader.preload(TextureLoader, url)
useSpriteLoader.clear = (input: string) => useLoader.clear(TextureLoader, input)
