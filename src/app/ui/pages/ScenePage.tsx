"use client"
import { useSearchParams } from 'next/navigation'
import { useScenes, ScenesType } from '../hookes/useScenes'
import { useEffect, useRef, useState, MouseEvent, useMemo, useCallback } from 'react'
//babylon-mmd & babylonjs


import { AbstractMesh, ArcRotateCamera, AssetContainer, Color3, DirectionalLight, Engine, FlyCamera, FreeCamera, HemisphericLight, loadAssetContainerAsync, Mesh, MeshBuilder, Quaternion, Scene, SceneLoader, ShadowGenerator, Vector3 } from '@babylonjs/core'
import { GLTF2Export } from "babylonjs-serializers"
import { getMmdWasmInstance, MmdStandardMaterialBuilder, MmdWasmInstanceTypeMPD, MmdWasmModel, MmdWasmPhysics, MmdWasmRuntime, SdefInjector } from 'babylon-mmd'
import { AkiraButton } from '../components/AkiraButton'
import { ArrowsAltOutlined, EyeInvisibleOutlined, EyeOutlined, MutedOutlined, PauseOutlined, PlayCircleOutlined, SettingFilled, SoundOutlined, VideoCameraFilled } from '@ant-design/icons'

import { AkiraDrawer } from "../components/AkiraDrawer";
import { FilesetResolver, GestureRecognizer, HolisticLandmarker } from "@mediapipe/tasks-vision";
import { SkeletonShow } from "../logic/Skeleton";
import { KeyFrameType, MMDModelBones, MotionModel, MotionSettingsType, SETTINGS_CONFIGType } from '../logic/MotionModel'
import AkiraRadioButton from '../components/AkiraRadioButton'
import { IsUUID } from '../logic/extentions'
import { useSavedModel } from '../hookes/useSavedModel'
import { InputNumber } from 'antd'
import { AnimationControlUI } from '../components/AnimationControls/AnimationControlUI'


export default function ScenePage() {
    const searchParams = useSearchParams()
    const sceneId = searchParams.get('sceneId')
    const scenes = useScenes((state) => state.scenes);
    const [scene, setScene] = useState<ScenesType>();
    const [DrawerStates, setOpen] = useState<{
        VideoDrawerOpened: boolean,
        SettingsDrawerOpened: boolean,
        SkeletonModelOpened: boolean,
    }>({
        VideoDrawerOpened: false,
        SettingsDrawerOpened: false,
        SkeletonModelOpened: false
    });
    const { GetModelData } = useSavedModel((state) => state);
    function OpenDrawer(selected: keyof typeof DrawerStates, value: boolean) {
        const newState: typeof DrawerStates = {
            ...DrawerStates,
        }
        newState[selected] = value;
        setOpen(newState)

    }
    //video
    const VideoCurrentRef = useRef<HTMLVideoElement>(null)
    const SkeletonCanvasRef = useRef<HTMLCanvasElement>(null);
    type videoState = {
        isPlaying: boolean,
        SkeletonPlaced: boolean,
        SoundEnabled: boolean
    }
    const [VideoState, SetVideoState] = useState<videoState>({
        isPlaying: false,
        SkeletonPlaced: true,
        SoundEnabled: false
    });
    const onClicked = (ev: MouseEvent<HTMLButtonElement>) => {
        const newState: typeof VideoState = {
            ...VideoState,
        }
        newState[ev.currentTarget.id as keyof typeof VideoState] = !newState[ev.currentTarget.id as keyof typeof VideoState]
        SetVideoState(newState)
    }
    //mediapipe with drawing
    const [MotionCap, SetMotionCap] = useState(new MotionModel())
    const HolisticRef = useRef<HolisticLandmarker>(null)
    const [OnHolisticLoaded, SetHolisticLoaded] = useState(false)
    const loadHolistic = async () => {
        return FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        ).then(async vision => {
            const holisticLandmarker = await HolisticLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath:
                        "https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/latest/holistic_landmarker.task",
                    delegate: "GPU",
                },
                runningMode: "VIDEO",
            })

            HolisticRef.current = holisticLandmarker;
        })
    }
    const runAnimation = async () => {

        if (HolisticRef.current && VideoCurrentRef.current && !VideoCurrentRef.current.paused && VideoCurrentRef.current.readyState >= 2) {
            var timestamp = performance.now()
            HolisticRef.current!.detectForVideo(VideoCurrentRef.current, timestamp, (res) => {
                if (VideoState.SkeletonPlaced) {
                    SkeletonShow.onShowSkeleton(SkeletonCanvasRef, res)
                }
                if (MMDStates.MMDRuntime && MMDStates.MMDModel) {
                    MotionCap.motionCalculate(res)
                    SetKeyFrames(MotionCap.keyframes)
                }
            });
        }
        requestAnimationFrame(runAnimation)
    }
    useEffect(() => {
        loadHolistic();
    }, [])
    useEffect(() => {
        if (HolisticRef.current) {
            console.log("Holistic loaded");
            SetHolisticLoaded(true)
        }
    }, [HolisticRef.current])
    //babylon-mmd
    const [MotionCaptureSettings, SetMotionCaptureSettings] = useState<MotionSettingsType>({
        BodyCalculate: true,
        LegsCalculate: true,
        ArmsCalculate: true,
        HeadCalculate: true,
        FacialAndEyesCalculate: true
    })
    const [SETTINGS_CONFIG, SetSETTINGS_CONFIG] = useState<SETTINGS_CONFIGType>({
        POSE_Y_SCALE: 0
    })
    const [KeyFrames,SetKeyFrames] = useState<KeyFrameType[]>([])
    const [MMDStates, SetMMDStates] = useState<{
        MMDScene?: Scene,
        MMDRuntime?: MmdWasmRuntime,
        MMDModel?: MmdWasmModel,
        MMDEngine?: Engine,
        MMDAssetContainer?: AssetContainer
        MMDShadowManager?: ShadowGenerator
    }>({})
    const Materials = useMemo(() => MMDStates.MMDModel?.mesh.metadata.materials || [], [MMDStates.MMDModel])
    const [MaterialBuilder, _] = useState(new MmdStandardMaterialBuilder())
    const convRef = useRef<HTMLCanvasElement>(null)

    const loadModel = async (
        eng: Engine,
        modelScene: Scene,
        modelName: string,
        mmdRuntime: MmdWasmRuntime,
        shadowGenerator: ShadowGenerator
    ) => {

        if (MMDStates.MMDModel && MMDStates.MMDAssetContainer) {
            shadowGenerator?.removeShadowCaster(MMDStates.MMDModel.mesh);
            MMDStates.MMDModel.mesh.dispose(true, true);
            mmdRuntime.destroyMmdModel(MMDStates.MMDModel);
            MMDStates.MMDAssetContainer.removeAllFromScene();
            MMDStates.MMDAssetContainer.dispose();
        }

        if (!modelName) throw new Error("Invalid model name");
        let modelUrl: string;
        let blobUrl: string | null = null;

        if (IsUUID(modelName)) {
            const modelData = await GetModelData(modelName);
            if (!modelData) throw new Error("Model data not found");
            const blob = new Blob([modelData], { type: "application/octet-stream" });
            blobUrl = URL.createObjectURL(blob);
            modelUrl = blobUrl;
        } else {
            modelUrl = modelName;
        }

        // Load assets
        const [modelMesh, assetContainer] = await loadAssetContainerAsync(
            modelUrl,
            modelScene,
            {
                rootUrl: IsUUID(modelName) ? undefined : `${window.location.origin}/model/`,
                pluginExtension: IsUUID(modelName) ? ".bpmx" : undefined,
                onProgress: (event) => {
                    eng.loadingUIText = `\n\n\nLoading model... ${event.loaded}/${event.total} 
                            (${Math.floor((event.loaded / event.total) * 100)}%)`;
                },
                pluginOptions: {
                    mmdmodel: {
                        materialBuilder: MaterialBuilder,
                        boundingBoxMargin: 60,
                        loggingEnabled: true
                    }
                }
            }
        ).then(res => {
            // Validate loaded assets
            if (!res.meshes || res.meshes.length === 0) {
                throw new Error("No meshes found in asset container");
            }

            const mainMesh = res.meshes[0];
            res.addAllToScene();

            return [mainMesh, res] as [AbstractMesh, AssetContainer];
        }).finally(() => {
            // Cleanup blob URL after loading
            if (blobUrl) URL.revokeObjectURL(blobUrl);
        });

        // Update state
        const result = {
            Model: modelMesh as Mesh,
            AssetContainer: assetContainer
        };
        return result;

    };

    useEffect(() => {
        const engine = new Engine(convRef.current, true, {
            preserveDrawingBuffer: false,
            stencil: false,
            antialias: false,
            alpha: true,
            premultipliedAlpha: false,
            powerPreference: "high-performance",
            doNotHandleTouchAction: false,
            doNotHandleContextLost: true,
            audioEngine: false,
        }, true);
        getMmdWasmInstance(new MmdWasmInstanceTypeMPD(), 2).then((mmdWasmInstance) => {
            const mmdscene = new Scene(engine);
            SdefInjector.OverrideEngineCreateEffect(engine);
            MaterialBuilder.loadOutlineRenderingProperties = (): void => { /* do nothing */ };
            engine.loadingUIBackgroundColor = "var(--bg-color)"
            mmdscene.ambientColor = new Color3(0, 0, 0);
            //const camera = new MmdCamera("mmdCamera", new Vector3(0, 10, 0), mmdscene);
            var camera = new FlyCamera("camera", new Vector3(0, 15, -35), mmdscene);

            camera.bankedTurnLimit = Math.PI / 2;
            camera.bankedTurnMultiplier = 1;
            camera.attachControl(true);
            // const camera = new ArcRotateCamera("Camera", -1.6, 1, 50, Vector3.Zero(), mmdscene);
            // camera.attachControl(convRef.current, true);
            const mmdRuntime = new MmdWasmRuntime(mmdWasmInstance, mmdscene, new MmdWasmPhysics(mmdscene));
            mmdRuntime.register(mmdscene)

            const hemisphericLight = new HemisphericLight("HemisphericLight", new Vector3(0, 1, 0), mmdscene);
            hemisphericLight.intensity = 0.3;
            hemisphericLight.specular.set(0, 0, 0);
            hemisphericLight.groundColor.set(1, 1, 1);

            const directionalLight = new DirectionalLight("DirectionalLight", new Vector3(0.5, -1, 1), mmdscene);
            directionalLight.intensity = 0.7;
            directionalLight.shadowMaxZ = 20;
            directionalLight.shadowMinZ = -15;

            const shadowGenerator = new ShadowGenerator(2048, directionalLight, true, camera);
            shadowGenerator.transparencyShadow = true;
            shadowGenerator.bias = 0.01;

            const ground = MeshBuilder.CreateGround("ground2", { width: 100, height: 100, subdivisions: 2, updatable: false }, mmdscene);
            ground.receiveShadows = true;
            shadowGenerator.addShadowCaster(ground);

            mmdscene.onAfterRenderObservable.addOnce(() => engine.hideLoadingUI());
            if (scene) {
                Promise.all([loadModel(engine, mmdscene, scene.modelPathOrLink, mmdRuntime, shadowGenerator)]).then(([res]) => {
                    SetMMDStates({
                        MMDRuntime: mmdRuntime,
                        MMDScene: mmdscene,
                        MMDEngine: engine,
                        MMDModel: mmdRuntime.createMmdModel(res.Model),
                        MMDAssetContainer: res.AssetContainer,
                        MMDShadowManager: shadowGenerator
                    })
                });
            }
        })
    }, [scene])

    useEffect(() => {

        if (VideoCurrentRef.current && VideoCurrentRef.current.src && VideoState) {
            if (VideoState.isPlaying) VideoCurrentRef.current.play()
            else VideoCurrentRef.current.pause();
        }
    }, [VideoState])
    //rerender model with shadow
    useEffect(() => {
        if (MMDStates.MMDEngine && MMDStates.MMDScene && MMDStates.MMDRuntime && MMDStates.MMDShadowManager && scene && scene.modelPathOrLink) {
            loadModel(MMDStates.MMDEngine, MMDStates.MMDScene, scene!.modelPathOrLink, MMDStates.MMDRuntime, MMDStates.MMDShadowManager).then((res) => {
                SetMMDStates({ ...MMDStates, MMDModel: MMDStates.MMDRuntime?.createMmdModel(res.Model), MMDAssetContainer: res.AssetContainer });
                MMDStates.MMDEngine!.hideLoadingUI();
            })
        }
        console.log("Changed to " + scene?.modelPathOrLink)
    }, [scene?.modelPathOrLink])
    //rerender scene
    useEffect(() => {
        if (MMDStates.MMDEngine && MMDStates.MMDScene) {
            console.log("Loaded");
            MMDStates.MMDEngine?.runRenderLoop(() => {
                MMDStates.MMDEngine!.resize();
                MMDStates.MMDScene?.render()

            });
        }
    }, [MMDStates.MMDEngine, MMDStates.MMDScene])

    useEffect(() => {
        if (MMDStates.MMDModel && MMDStates.MMDEngine) MotionCap.init(MMDStates.MMDModel, MMDStates.MMDEngine);
    }, [MMDStates.MMDModel])
    //settings
    useEffect(() => {
        MotionCap.setSettings(MotionCaptureSettings)
    }, [MotionCaptureSettings])
    useEffect(() => {
        MotionCap.SETTINGS_CONFIG = SETTINGS_CONFIG;
    }, [SETTINGS_CONFIG])

    useEffect(() => {
        setScene(scenes.find((el) => el.id == sceneId))
    }, [scenes, sceneId])

    return (<div className="relative overflow-y-hidden">
        <canvas ref={convRef} style={{ width: "100%", height: "100vh" }} className="" />
        {/* Controls */}
        <div className="absolute m-2 font-bold text-[20px] flex gap-x-2 right-0 top-0">
            <AkiraButton className="size-[45px]" onClick={() => convRef.current?.requestFullscreen()}>
                <ArrowsAltOutlined />
            </AkiraButton>
            <AkiraButton className="size-[45px]" onClick={() => OpenDrawer("VideoDrawerOpened", true)}>
                <VideoCameraFilled />
            </AkiraButton>
            <AkiraButton className="size-[45px]" onClick={() => OpenDrawer("SettingsDrawerOpened", true)}>
                <SettingFilled />
            </AkiraButton>
        </div>
        <AkiraDrawer removeBlurButton closable title="Settings" open={DrawerStates.SettingsDrawerOpened} onClose={() => { OpenDrawer("SettingsDrawerOpened", false) }} >
            <p className='text-ForegroundColor text-lg text-center font-bold'>Motion capture settings</p>
            <div className='flex justify-around mb-3'>

                <div className='flex flex-col text-base gap-y-3 text-ForegroundColor'>
                    <p>Move body</p>
                    <p>Move legs</p>
                    <p>Move arms</p>
                    <p>Move head</p>
                    <p>Calculate facial and eyes</p>
                </div>
                <div className='flex gap-y-3 flex-col justify-center items-center'>
                    {Object.keys(MotionCaptureSettings).map((el, ind) => <AkiraRadioButton
                        key={ind}
                        checked={MotionCaptureSettings[el as keyof MotionSettingsType]}
                        onChange={() => {

                            SetMotionCaptureSettings((prevState) => {
                                var prevStates = { ...prevState };
                                var elem = el as keyof MotionSettingsType;
                                var newState = prevStates;
                                newState[elem] = !prevStates[elem]
                                return newState;
                            })
                        }}
                    />)}
                </div>
            </div>
            <p className='text-ForegroundColor text-lg text-center font-bold'>Variables</p>
            <div className='flex justify-around mb-3'>

                <div className='flex flex-col text-base gap-y-3 text-ForegroundColor'>
                    <p>Pose scale</p>
                </div>
                <div className='flex gap-y-3 flex-col justify-center items-center'>
                    <InputNumber type="number" controls onChange={(value) => {
                        if (value) {
                            SetSETTINGS_CONFIG({
                                ...SETTINGS_CONFIG,
                                POSE_Y_SCALE: value
                            })
                        }
                    }} value={SETTINGS_CONFIG.POSE_Y_SCALE} />
                </div>
            </div>
        </AkiraDrawer>
        {/* Motion Video */}
        <AkiraDrawer removeBlurButton closable title="Select Video" open={DrawerStates.VideoDrawerOpened} onClose={() => { OpenDrawer("VideoDrawerOpened", false) }} loading={!OnHolisticLoaded}>
            <AkiraButton className="w-full p-0">
                <div className="w-full">
                    <label htmlFor="file" className='cursor-pointer text-white flex justify-center items-center h-[25px] w-full'>Load Video File</label>
                    <input id="file" type="file" className="hidden" accept="video/*" onChange={async (event) => {
                        const file = event.target.files![0]
                        const url = URL.createObjectURL(file);
                        VideoCurrentRef.current!.src = url;
                        requestAnimationFrame(runAnimation)
                    }} />
                </div>
            </AkiraButton>
            <div className='flex m-1 justify-center'>
                <div className="w-fit relative">
                    <video onPause={() => MotionCap.endRecordMp4()} muted={VideoState.SoundEnabled} ref={VideoCurrentRef} controls={false} className="rounded-md max-h-[400px] w-full min-h-[200px]" />
                    <canvas ref={SkeletonCanvasRef} className={`${VideoState.SkeletonPlaced ? "absolute" : "hidden"} top-0 h-full w-full`} />
                </div>
            </div>
            <div className="flex justify-around text-[20px]">
                <button id="isPlaying" className="p-2 size-[40px] font-bold cursor-pointer hover:bg-BackgroundHoverButton flex duration-700 justify-center items-center aspect-square rounded bg-BackgroundButton text-white" onClick={onClicked}>
                    {VideoState.isPlaying ? <PlayCircleOutlined /> : <PauseOutlined />}
                </button>
                <button id="SkeletonPlaced" className="p-2 size-[45px] font-bold cursor-pointer  hover:bg-BackgroundHoverButton duration-700 flex justify-center items-center aspect-square rounded bg-BackgroundButton text-white" onClick={onClicked}>
                    {VideoState.SkeletonPlaced ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                </button>
                <button id="SoundEnabled" className="p-2 size-[45px] font-bold cursor-pointer  hover:bg-BackgroundHoverButton duration-700 flex justify-center items-center aspect-square rounded bg-BackgroundButton text-white" onClick={onClicked}>
                    {!VideoState.SoundEnabled ? <SoundOutlined /> : <MutedOutlined />}
                </button>

            </div>
            <div className='mt-2 flex flex-col gap-y-2'>
                <AkiraButton className="w-full" onClick={() => {
                    if (VideoCurrentRef.current && VideoCurrentRef.current.src)
                        MotionCap.startRecordMp4(VideoCurrentRef.current)
                }}>
                    Record video
                </AkiraButton>
                
            </div>
            
        </AkiraDrawer>
        <AnimationControlUI KeyFrames={KeyFrames} MotionModelInstance={MotionCap}/>
    </div>)
} 