import { useEffect, useRef } from 'react'
import { Sphere } from './shapes'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import * as React from 'react'
import * as easing from 'maath/easing'
import { useImperativeHandle } from 'react'
import { useMemo } from 'react'

type EasingFunction = (t: number) => number

interface EasingType {
  In?: EasingFunction
  Out?: EasingFunction
  InOut?: EasingFunction
  None?: EasingFunction
}

interface Ease {
  Linear: EasingType
  Sine: EasingType
  Cubic: EasingType
  Quint: EasingType
  Circ: EasingType
  Quart: EasingType
  Expo: EasingType
}

export const Ease: Ease = {
  Linear: {
    None: function (t) {
      return t
    },
  },
  Sine: {
    In: function (x: number): number {
      return 1 - Math.cos((x * Math.PI) / 2)
    },
    Out: function (x: number): number {
      return Math.sin((x * Math.PI) / 2)
    },
    InOut: function (x: number): number {
      return -(Math.cos(Math.PI * x) - 1) / 2
    },
  },
  Cubic: {
    In: function (x: number): number {
      return x * x * x
    },
    Out: function (x: number): number {
      return 1 - Math.pow(1 - x, 3)
    },
    InOut: function (x: number): number {
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
    },
  },
  Quint: {
    In: function (x: number): number {
      return x * x * x * x * x
    },
    Out: function (x: number): number {
      return 1 - Math.pow(1 - x, 5)
    },
    InOut: function (x: number): number {
      return x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2
    },
  },
  Circ: {
    In: function (x: number): number {
      return 1 - Math.sqrt(1 - Math.pow(x, 2))
    },
    Out: function (x: number): number {
      return Math.sqrt(1 - Math.pow(x - 1, 2))
    },
    InOut: function (x: number): number {
      return x < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * x, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * x + 2, 2)) + 1) / 2
    },
  },

  Quart: {
    In: function (t) {
      return t * t * t * t
    },
    Out: function (t) {
      return 1 - --t * t * t * t
    },
    InOut: function (t) {
      return t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t
    },
  },
  Expo: {
    In: function (x: number): number {
      return x === 0 ? 0 : Math.pow(2, 10 * x - 10)
    },
    Out: function (x: number): number {
      return x === 1 ? 1 : 1 - Math.pow(2, -10 * x)
    },
    InOut: function (x: number): number {
      return x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2
    },
  },
}

// cubicbezier cuve
export class CubicBezierCurve3 extends THREE.Curve<THREE.Vector3> {
  isCubicBezierCurve3: boolean
  type: string
  v0: any
  v1: any
  v2: any
  v3: any
  constructor(v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3()) {
    super()
    this.isCubicBezierCurve3 = true
    this.type = 'CubicBezierCurve3'
    this.v0 = v0
    this.v1 = v1
    this.v2 = v2
    this.v3 = v3
  }
}

// catmull-rom curve
export class CatmullRomCurve3 extends THREE.Curve<THREE.Vector3> {
  isCatmullRomCurve3: boolean
  type: string
  points: THREE.Vector3[]
  constructor(points: THREE.Vector3[] = []) {
    super()

    this.isCatmullRomCurve3 = true
    this.type = 'CatmullRomCurve3'
    this.points = points
  }
}

export const linear = (t: number) => t
export const expo = (t: number) => 1 / (1 + t + 0.48 * t * t + 0.235 * t * t * t)

interface MotionPathProps {
  curves: (CubicBezierCurve3 | CatmullRomCurve3)[]
  animationSpeed: number
  duration: number
  showPath: boolean
  loop: boolean
  autoStart: boolean
  object: React.MutableRefObject<THREE.Object3D | undefined>
  focusObject: React.MutableRefObject<THREE.Object3D | undefined>
  easeFunction: any | undefined
}

export type MotionPathControlsApi = THREE.EventDispatcher & {
  update: (delta: number) => void
}

export const MotionPathControls = React.forwardRef<MotionPathControlsApi, MotionPathProps>(
  (
    {
      children,
      curves = [],
      object,
      animationSpeed = 0.0018,
      duration = 5,
      showPath = false,
      loop = true,
      autoStart = true,
      focusObject,
      easeFunction,
    },
    fref
  ) => {
    const ref = useRef<any>()
    const pathRef = useRef(new THREE.CurvePath<THREE.Vector3>())
    const rate = useRef(animationSpeed)
    const currentT = useRef(0)
    const { camera } = useThree()
    const motionRef = useRef<THREE.Object3D>(camera)
    const index = useRef(0)
    const offsetRef = useRef()

    // parse the curves
    React.useLayoutEffect(() => {
      const _curves = curves.length > 0 ? curves : ref.current?.__r3f.objects

      for (var i = 0; i < _curves.length; i++) {
        var curve: any = null
        if (_curves[i].isCubicBezierCurve3) {
          curve = new THREE.CubicBezierCurve3(_curves[i].v0, _curves[i].v1, _curves[i].v2, _curves[i].v3)
        } else if (_curves[i].isCatmullRomCurve3) {
          curve = new THREE.CatmullRomCurve3(_curves[i].points)
        }

        pathRef.current.add(curve!)
      }
    }, [])

    // update the progression, externally
    const update = React.useCallback<MotionPathControlsApi['update']>(function (t: number) {
      offsetRef.current = t
    })

    // Ref API
    const api = useMemo<MotionPathControlsApi>(
      () =>
        Object.assign(Object.create(THREE.EventDispatcher.prototype), {
          update,
        }),
      [update]
    )
    // expose the api
    useImperativeHandle(fref, () => api, [])

    // useFrame
    useFrame((state: any, delta: number | undefined) => {
      if (autoStart) {
        // easing or damp
        if (easeFunction) {
          currentT.current = easeFunction(offsetRef.current ?? index.current) ?? animationSpeed
          // when progress is updated externally
          if (offsetRef.current) {
            index.current = offsetRef.current
          } else {
            index.current += animationSpeed
          }
        } else {
          easing.damp(currentT, 'current', 1, duration, offsetRef.current ?? animationSpeed, undefined, expo)
          index.current = currentT.current
        }

        if (index.current >= 1.0) {
          if (loop) {
            index.current = 0.0
            currentT.current = 0.0
          } else {
            currentT.current = 1.0
          }
        }
      } else {
        currentT.current = 0
      }

      if (pathRef.current.getCurveLengths().length > 0) {
        const pos = pathRef.current.getPointAt(Math.max(currentT.current, 0))
        const tangent = pathRef.current.getTangentAt(Math.max(currentT.current, 0)).normalize()
        const nextPos = pathRef.current.getPointAt(Math.min(currentT.current + rate.current, 1))

        if (object?.current instanceof THREE.Object3D) {
          motionRef.current = object.current
        } else {
          if (camera instanceof THREE.Object3D) {
            motionRef.current = camera
          }
        }

        motionRef.current?.position.copy(pos)

        if (focusObject?.current instanceof THREE.Object3D) {
          motionRef.current?.lookAt(focusObject?.current.position)
        } else {
          motionRef.current?.lookAt(motionRef.current?.position.clone().add(tangent))
          motionRef.current?.lookAt(nextPos)
        }
      }
    })

    const DebugPath = () => {
      const [points, setPoints] = React.useState<THREE.Vector3[]>([])

      useEffect(() => {
        if (pathRef.current) {
          setPoints(pathRef.current.getPoints(100))
        }
      }, [])

      return (
        <>
          {points.map((item: { x: any; y: any; z: any }, index: any) => (
            <Sphere args={[0.05, 16, 16]} key={index} position={[item.x, item.y, item.z]}>
              <meshToonMaterial color="red" />
            </Sphere>
          ))}
        </>
      )
    }

    const debugPathMemo = React.useMemo(() => <DebugPath />, [showPath])

    return (
      <group ref={ref}>
        {children}
        {showPath && debugPathMemo}
      </group>
    )
  }
)
