"use client"
import { useSearchParams } from 'next/navigation'
import { useScenes, ScenesType } from '../hookes/useScenes'
import { Fragment, useEffect, useRef, useState } from 'react'
//babylon-mmd & babylonjs
import { AbstractMesh, ArcRotateCamera, AssetContainer, Color3, Color4, DirectionalLight, Engine, FreeCamera, HemisphericLight, loadAssetContainerAsync, Mesh, MeshBuilder, Scene, ShadowGenerator, Vector3 } from '@babylonjs/core'
import { MmdCamera, MmdMesh, MmdModel, MmdRuntime, MmdStandardMaterialBuilder, SdefInjector } from 'babylon-mmd'

export default function ScenePage() {
    const searchParams = useSearchParams()
    const sceneId = searchParams.get('sceneId')
    const scenes = useScenes((state) => state.scenes);
    const [scene, setScene] = useState<ScenesType>()
    //babylon-mmd
    const [MMDStates, SetMMDStates] = useState<{
        MMDScene?: Scene,
        MMDRuntime?: MmdRuntime,
        MMDModel?: AssetContainer,
        MMDEngine?: Engine,
        MMDShadowManager?: ShadowGenerator
    }>({})
    const [MaterialBuilder, SetMaterialBuilder] = useState(new MmdStandardMaterialBuilder())
    const convRef = useRef<HTMLCanvasElement>(null)
    const loadModel = async (eng: Engine, modelScene: Scene, modelName: string, shadowGenerator: ShadowGenerator) => {
        const modelMesh = await loadAssetContainerAsync(
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
                        loggingEnabled: true
                    }
                }
            }
        ).then((result) => {
            result.addAllToScene();
            for (const mesh of result.meshes[0].metadata.meshes) mesh.receiveShadows = true;
            shadowGenerator.addShadowCaster(result.meshes[0]);
            return result;
        });
        return modelMesh;
    }
    useEffect(() => {
        const engine = new Engine(convRef.current, true);
        const mmdscene = new Scene(engine);
        MaterialBuilder.loadOutlineRenderingProperties = (): void => { /* do nothing */ };

        engine.loadingUIBackgroundColor = "var(--bg-color)"
        mmdscene.ambientColor = new Color3(0.5, 0.5, 0.5);
        mmdscene.clearColor = new Color4(0.95, 0.95, 0.95, 1.0);
        //const camera = new MmdCamera("mmdCamera", new Vector3(0, 10, 0), mmdscene);
        const camera = new ArcRotateCamera("Camera",-1.3, Math.PI / 4 , 40, Vector3.Zero(), mmdscene);
        camera.attachControl(convRef.current, true);
        const mmdRuntime = new MmdRuntime(mmdscene);
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

        const ground = MeshBuilder.CreateGround("ground2", { width: 60, height: 60, subdivisions: 2, updatable: false }, mmdscene);
        ground.receiveShadows = true;

        shadowGenerator.addShadowCaster(ground);

        //mmdRuntime.setCamera(camera);
        SdefInjector.OverrideEngineCreateEffect(engine);
        window.addEventListener("resize", function () {
            engine.resize();
        });
        mmdscene.onAfterRenderObservable.addOnce(() => engine.hideLoadingUI());
        if (scene) {

            loadModel(engine, mmdscene, scene.modelPathOrLink, shadowGenerator).then((res) => {
                SetMMDStates({
                    MMDRuntime: mmdRuntime,
                    MMDScene: mmdscene,
                    MMDEngine: engine,
                    MMDModel: res,
                    MMDShadowManager: shadowGenerator
                })
            })
        }


    }, [scene])
    //rerender model with shadow
    useEffect(() => {
        if (MMDStates.MMDEngine && MMDStates.MMDScene && MMDStates.MMDShadowManager && scene!.modelPathOrLink) {
            loadModel(MMDStates.MMDEngine, MMDStates.MMDScene, scene!.modelPathOrLink, MMDStates.MMDShadowManager).then((res) => {
                SetMMDStates({ ...MMDStates, MMDModel: res })
                MMDStates.MMDEngine!.hideLoadingUI();
            })
        }
        console.log("Changed to " + scene?.modelPathOrLink)
    }, [scene?.modelPathOrLink])
    //rerender scene

    useEffect(() => {

        if (MMDStates.MMDEngine && MMDStates.MMDModel && MMDStates.MMDScene) {
            MMDStates.MMDEngine.hideLoadingUI();
            console.log("Loaded");
            MMDStates.MMDEngine.runRenderLoop(() => {
                MMDStates.MMDScene!.render()

            });
        }
    }, [MMDStates.MMDEngine, MMDStates.MMDEngine, MMDStates.MMDScene])
    //
    useEffect(() => {
        setScene(scenes.find((el) => el.id == sceneId))
    })
    return (<div className="relative">
        <canvas ref={convRef} style={{ width: "100%", height: "100vh" }} className="" />
    </div>)
}