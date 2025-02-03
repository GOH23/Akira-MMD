"use client"
import { useSearchParams } from 'next/navigation'
import { useScenes, ScenesType } from '../hookes/useScenes'
import { useEffect, useRef, useState, MouseEvent, useMemo } from 'react'
//babylon-mmd & babylonjs


import { AbstractMesh, ArcRotateCamera, AssetContainer, Color3, Color4, DirectionalLight, Engine, HavokPlugin, HemisphericLight, loadAssetContainerAsync, Material, Mesh, MeshBuilder, MirrorTexture, Plane, Scene, SceneLoader, ShadowGenerator, StandardMaterial, Vector3 } from '@babylonjs/core'
import { getMmdWasmInstance, MmdModel, MmdPhysics, MmdRuntime, MmdStandardMaterialBuilder, MmdWasmInstance, MmdWasmInstanceTypeMD, MmdWasmInstanceTypeMPD, MmdWasmInstanceTypeSD, MmdWasmModel, MmdWasmPhysics, MmdWasmRuntime, SdefInjector } from 'babylon-mmd'
import { AkiraButton } from '../components/AkiraButton'
import { ArrowsAltOutlined, EyeInvisibleOutlined, EyeOutlined, MutedOutlined, PauseOutlined, PlayCircleOutlined, SettingFilled, SoundOutlined, VideoCameraFilled, VideoCameraOutlined } from '@ant-design/icons'
import HavokPhysics from '@babylonjs/havok'

import { AkiraDrawer } from "../components/AkiraDrawer";
import { FilesetResolver, HolisticLandmarker } from "@mediapipe/tasks-vision";
import { SkeletonShow } from "../logic/Skeleton";
import { MotionModel } from '../logic/MotionModel'
import AkiraRadioButton from '../components/AkiraRadioButton'

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
    const [VideoState, SetVideoState] = useState<{
        isPlaying: boolean,
        SkeletonPlaced: boolean,
        SoundEnabled: boolean
    }>({
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
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm"
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
            HolisticRef.current!.detectForVideo(VideoCurrentRef.current, performance.now(), (res) => {
                if (VideoState.SkeletonPlaced) SkeletonShow.onShowSkeleton(SkeletonCanvasRef, res)
                if (MMDStates.MMDRuntime && MMDStates.MMDModel) {
                    if (!MotionCap._Model) MotionCap.init(MMDStates.MMDModel);
                    MotionCap.motionCalculate(res)
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

    const loadModel = async (eng: Engine, modelScene: Scene, modelName: string, mmdRuntime: MmdWasmRuntime, shadowGenerator: ShadowGenerator) => {
        if (MMDStates.MMDModel && MMDStates.MMDAssetContainer) {
            shadowGenerator.removeShadowCaster(MMDStates.MMDModel.mesh);
            MMDStates.MMDModel.mesh.dispose();
            mmdRuntime.destroyMmdModel(MMDStates.MMDModel);
            MMDStates.MMDAssetContainer.removeAllFromScene();
        }
        const modelMesh: [AbstractMesh, AssetContainer] = await loadAssetContainerAsync(
            modelName,
            modelScene,
            {
                rootUrl: `${window.location.origin}/model/`,
                onProgress(event) {
                    eng.loadingUIText = `\n\n\nLoading model... ${event.loaded}/${event.total} (${Math.floor(event.loaded * 100 / event.total)}%)`
                },
                pluginOptions: {
                    mmdmodel: {
                        materialBuilder: MaterialBuilder,
                        boundingBoxMargin: 60,
                        loggingEnabled: true
                    }
                }
            }).then((res) => {
                res.addAllToScene();
                for (const mesh of res.meshes[0].metadata.meshes) mesh.receiveShadows = true;
                shadowGenerator.addShadowCaster(res.meshes[0]);
                return [res.meshes[0], res]
            })

        return {
            Model: modelMesh[0] as Mesh,
            AssetContainer: modelMesh[1]
        }
    }

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
            const camera = new ArcRotateCamera("Camera", -1.6, 1, 50, Vector3.Zero(), mmdscene);
            camera.attachControl(convRef.current, true);
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

            //mmdRuntime.setCamera(camera);

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
        if (MMDStates.MMDEngine && MMDStates.MMDScene && MMDStates.MMDRuntime && MMDStates.MMDShadowManager && scene!.modelPathOrLink) {
            loadModel(MMDStates.MMDEngine, MMDStates.MMDScene, scene!.modelPathOrLink, MMDStates.MMDRuntime, MMDStates.MMDShadowManager).then((res) => {
                SetMMDStates({ ...MMDStates, MMDModel: MMDStates.MMDRuntime?.createMmdModel(res.Model), MMDAssetContainer: res.AssetContainer })
                MMDStates.MMDEngine!.hideLoadingUI();
            })
        }
        console.log("Changed to " + scene?.modelPathOrLink)
    }, [scene?.modelPathOrLink])
    //rerender scene
    useEffect(() => {

        if (MMDStates.MMDEngine && MMDStates.MMDScene) {
            MMDStates.MMDEngine.hideLoadingUI();
            console.log("Loaded");
            MMDStates.MMDEngine?.runRenderLoop(() => {
                MMDStates.MMDEngine!.resize();
                MMDStates.MMDScene?.render()

            });


        }
    }, [MMDStates.MMDEngine, MMDStates.MMDScene])
    //
    useEffect(() => {
        setScene(scenes.find((el) => el.id == sceneId))
    }, [scenes, sceneId])
    return (<div className="relative">
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
        {/* Motion capture settings [Update 0.7.1b] */}
        
        <AkiraDrawer closable title="Settings" open={DrawerStates.SettingsDrawerOpened} onClose={() => { OpenDrawer("SettingsDrawerOpened", false) }} >
            {/* Akira motion capture radio button settings */}
            <AkiraRadioButton />
        </AkiraDrawer>
        {/* Motion Video */}
        <AkiraDrawer closable title="Select Video" open={DrawerStates.VideoDrawerOpened} onClose={() => { OpenDrawer("VideoDrawerOpened", false) }} loading={!OnHolisticLoaded}>
            <AkiraButton className="w-full p-0">
                <div className="w-full">
                    <label htmlFor="file" className='cursor-pointer text-white flex justify-center items-center h-[32px] w-full'>Load Video File</label>
                    <input id="file" type="file" className="hidden" accept="video/*" onChange={async (event) => {
                        const file = event.target.files![0]
                        const url = URL.createObjectURL(file);
                        VideoCurrentRef.current!.src = url;
                        requestAnimationFrame(runAnimation)
                    }} />
                </div>
            </AkiraButton>
            {/* Video Controls */}
            <div className='flex m-1 justify-center'>
                <div className="w-fit relative">
                    <video muted={VideoState.SoundEnabled} ref={VideoCurrentRef} controls={false} className="rounded-md max-h-[400px] w-full min-h-[200px]" />
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
        </AkiraDrawer>
    </div>)
} 