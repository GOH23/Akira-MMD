"use client"

import { Input, Modal } from "antd"
import { useState, useEffect, useRef } from "react";
import { useScenes, ScenesType } from "../hookes/useScenes";
import { useSearchParams } from "next/navigation";
//babylon-mmd
import { AssetContainer, Color3, Color4, DirectionalLight, Engine, HemisphericLight, loadAssetContainerAsync, Mesh, MeshBuilder, Scene, SceneLoader, ShadowGenerator, Vector3 } from "@babylonjs/core";
import { MmdCamera, MmdMesh, MmdRuntime, VmdLoader } from "babylon-mmd";
import { useMMDModels } from '../hookes/useMMDModels';
import { AkiraButton } from './AkiraButton';

const modalStyles = {
    mask: {
        backdropFilter: 'blur(10px)',
    },
    header: {
        backgroundColor: "var(--menu-layout-bg) !important"
    },
    content: {
        backgroundColor: "var(--menu-layout-bg) !important"
    }
}


export default function SettingsModal({ opened, SetOpened }: { opened: boolean, SetOpened: () => void }) {
    const searchParams = useSearchParams();

    const [SubModalOpened, SetSubModalOpened] = useState(false)
    const sceneId = searchParams.get('sceneId')
    const { scenes, changeSceneModel } = useScenes((state) => state);
    const [scene, setScene] = useState<ScenesType>();

    //babylon-mmd
    const conv = useRef<HTMLCanvasElement>(null);
    const models = useMMDModels()

    const [engine, setEng] = useState<Engine>();
    const [MMDScene, setMMDScene] = useState<Scene>();
    const [mmdRuntime, setmmdRuntime] = useState<MmdRuntime>();
    const [mmdShadowGenerator, setShadowGenerator] = useState<ShadowGenerator>();
    const [MMDAssetContainer, SetMMDAssetContainer] = useState<AssetContainer>()

    //load mmd model
    const loadMMDModel = async (path?: string, shadowGenerator?: ShadowGenerator) => {
        if (MMDAssetContainer) {
            
            MMDAssetContainer.removeAllFromScene();
            if (MMDAssetContainer.meshes[0]) {
                
                for (const mesh of MMDAssetContainer.meshes[0].metadata.meshes) mesh.receiveShadows = false;
                shadowGenerator?.removeShadowCaster(MMDAssetContainer.meshes[0]);
            }

        }
        if (MMDScene) {
            const mmdMesh = await loadAssetContainerAsync(path ?? "Ganyubikini.bpmx", MMDScene, { rootUrl: `${window.location.origin}/model/` })
                .then((result) => {
                    SetMMDAssetContainer(result);
                    result.addAllToScene();
                    console.log("Load model");
                    return result.meshes[0] as MmdMesh;

                });
            for (const mesh of mmdMesh.metadata.meshes) mesh.receiveShadows = true;
            if (shadowGenerator) shadowGenerator.addShadowCaster(mmdMesh);
        }
    }
    //load animation
    //future function [load custom animation]
    const loadAnimation = async (vmdLoader: VmdLoader, container: AssetContainer, mmdRuntime: MmdRuntime) => {
        const modelMotion = await vmdLoader.loadAsync("model_motion_1", [
            "../animation/Way Back Home Motion.vmd"
        ]);
        var model = mmdRuntime.createMmdModel(container.meshes[0] as Mesh);
        model.addAnimation(modelMotion);
        model.setAnimation("model_motion_1");
        mmdRuntime.playAnimation()
    }

    useEffect(() => {
        if (mmdRuntime && MMDAssetContainer && MMDScene) {
            const vmdLoader = new VmdLoader(MMDScene);
            loadAnimation(vmdLoader, MMDAssetContainer, mmdRuntime);
        }
    }, [MMDAssetContainer])
    useEffect(() => {
        setScene(scenes.find((el) => el.id == sceneId))
    })
    useEffect(() => {
        if (SubModalOpened) {
            const engine = new Engine(conv.current!, true);


            const scene = new Scene(engine);

            scene.ambientColor = new Color3(0.5, 0.5, 0.5);
            scene.clearColor = new Color4(0.95, 0.95, 0.95, 1.0);
            const camera = new MmdCamera("mmdCamera", new Vector3(0, 10, 0), scene);
            const mmdRuntime = new MmdRuntime(scene);
            mmdRuntime.register(scene)

            const hemisphericLight = new HemisphericLight("HemisphericLight", new Vector3(0, 1, 0), scene);
            hemisphericLight.intensity = 0.3;
            hemisphericLight.specular.set(0, 0, 0);
            hemisphericLight.groundColor.set(1, 1, 1);

            const directionalLight = new DirectionalLight("DirectionalLight", new Vector3(0.5, -1, 1), scene);
            directionalLight.intensity = 0.7;
            directionalLight.shadowMaxZ = 20;
            directionalLight.shadowMinZ = -15;

            const shadowGenerator = new ShadowGenerator(2048, directionalLight, true, camera);
            shadowGenerator.transparencyShadow = true;
            shadowGenerator.bias = 0.01;

            const ground = MeshBuilder.CreateGround("ground1", { width: 60, height: 60, subdivisions: 2, updatable: false }, scene);
            ground.receiveShadows = true;

            shadowGenerator.addShadowCaster(ground);

            mmdRuntime.setCamera(camera);
            setMMDScene(scene);
            setEng(engine);
            setmmdRuntime(mmdRuntime);
            setShadowGenerator(shadowGenerator);
            engine.runRenderLoop(() => {
                scene.render()
            });
        } else {
            engine?.dispose();
            MMDScene?.dispose()
            MMDAssetContainer?.dispose()
            if (mmdRuntime && MMDScene) mmdRuntime.dispose(MMDScene);
            setEng(undefined);
            setMMDScene(undefined);
            setmmdRuntime(undefined);
            console.log("Disposed all")
        }
    }, [SubModalOpened])
    useEffect(() => {
        loadMMDModel(scene?.modelPathOrLink)
    }, [MMDScene])

    const SaveSettings = () => {
        SetOpened();
    }
    return (<>

        <Modal onCancel={SetOpened} title={<div className="bg-transparent">
            <p className="text-ForegroundColor">Settings</p>
        </div>} footer={
            <div className="flex gap-x-5">
                <AkiraButton fillWidth onClick={() => SetOpened()}>Cancel</AkiraButton>
                <AkiraButton fillWidth onClick={() => SaveSettings()}>Submit</AkiraButton>
            </div>
        } open={opened} styles={modalStyles}>
            <div className="flex flex-col gap-y-2">
                <div className="flex justify-center items-center gap-x-3">
                    <p className="text-ForegroundColor">Selected Model</p>
                    <Input value={scene?.modelPathOrLink} className="max-w-52" readOnly />
                    <AkiraButton onClick={() => SetSubModalOpened(true)}>Select Model</AkiraButton>
                </div>
                <div className="flex items-center gap-x-3">
                    <p className="text-ForegroundColor">Selected Language</p>
                    <Input className="max-w-52" readOnly />

                </div>
            </div>
        </Modal>
        <Modal title={<div className="bg-transparent">
            <p className="text-ForegroundColor">Selected Model</p>
        </div>} open={SubModalOpened} styles={modalStyles} onCancel={() => SetSubModalOpened(false)} footer={
            <div className="flex gap-x-5">

                <AkiraButton fillWidth onClick={() => SetSubModalOpened(false)}>Cancel</AkiraButton>
                <AkiraButton disabled fillWidth onClick={() => {

                }}>Submit</AkiraButton>
            </div>
        }>
            <div className="flex gap-x-4 h-[500px]">
                <div className="basis-1/2">
                    <AkiraButton className="my-2" disabled fillWidth>Add Model</AkiraButton>
                    <div>
                        {models.map((el, ind) => <div onClick={() => {
                            if (sceneId) {
                                changeSceneModel(sceneId, el.ModelPath)
                                loadMMDModel(el.ModelPath, mmdShadowGenerator)
                            }
                        }} key={ind} className="bg-BackgroundButton font-bold duration-700 hover:bg-BackgroundHoverButton cursor-pointer text-ForegroundButton p-3"><p>{el.ModelName}</p></div>)}
                    </div>
                </div>
                <div className="basis-1/2 relative">
                    {/* Controls */}
                    <div className="absolute right-0 gap-x-2 flex">
                        {/* Reload */}
                        {/* <button className="w-full text-[20px] bg-BackgroundButton text-ForegroundColor rounded-md duration-700 p-2 font-bold hover:bg-BackgroundHoverButton">

                        </button> */}
                        {/* Play Animation */}
                        {/* <button onClick={() => setPlayAnimation(!PlayAnimation)} className="w-full text-[20px]  size-[45px] aspect-square bg-BackgroundButton text-ForegroundColor rounded-md duration-700 p-2 font-bold hover:bg-BackgroundHoverButton">
                            {!PlayAnimation ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
                        </button> */}
                    </div>
                    <canvas ref={conv} className="shadow-md rounded-md m-1" style={{ width: '100%', height: '100%' }} />
                </div>
            </div>
        </Modal>
    </>)
}

