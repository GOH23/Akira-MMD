"use client"
import { CloudOutlined, CopyFilled, FolderFilled, FolderOutlined, MoonFilled, SettingFilled, SunFilled, ThunderboltFilled } from "@ant-design/icons";
import { Button, ConfigProvider, Menu, notification } from "antd";
import Sider from "antd/es/layout/Sider";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from 'framer-motion'
import { useNextJSToAntdTheme } from "./hookes/useCustomTheme";

import { ScenesType, useScenes } from "./hookes/useScenes";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import SettingsModal from "./components/SettingsModal";
import { AkiraModalDialog } from "./components/AkiraModalDialog";


export default function HeaderLayout() {
    const { theme, setTheme } = useTheme()
    const { push } = useRouter()
    const searchParams = useSearchParams()
    const sceneId = searchParams.get('sceneId')
    const { addScene, scenes, removeScene } = useScenes((el) => el);
    const { Layout, MenuTheme } = useNextJSToAntdTheme(theme);
    const [SettingsOpened, SetSettingsOpened] = useState(false)
    const [collapsed, setCollapsed] = useState(false);
    const timerRef = useRef<NodeJS.Timeout>(null);
    const [ModalDeleteSceneOpened, SetModalDeleteSceneOpened] = useState(false);
    const [SelectedScene, SetSelectedScene] = useState<ScenesType>()
    const [api, contextHolder] = notification.useNotification();
    useEffect(() => {
        if (SelectedScene) SetModalDeleteSceneOpened(!ModalDeleteSceneOpened);
    }, [SelectedScene])
    const onHoldingEnded = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    }
    const onHoldingStarted = (el: any) =>{
        const element = el.target as HTMLUListElement;
        if (element.innerText == "Scenes" || element.innerText == "Settings" || element.innerText == "Explore") return;
        timerRef.current = setTimeout(() => {
            const searchedScene = scenes.find((el) => el.sceneName == element.innerText);
            if (searchedScene) SetSelectedScene(searchedScene);
        }, 1000)
    }
    return <ConfigProvider

        theme={{
            components: {
                Layout: {
                    siderBg: Layout.bg,
                    triggerBg: MenuTheme.itemSelectedBg
                },
                Menu: {
                    colorBgContainer: MenuTheme.bg,
                    colorText: MenuTheme.fg,
                    itemSelectedBg: MenuTheme.itemSelectedBg,
                    itemSelectedColor: MenuTheme.fg,
                    colorBgElevated: MenuTheme.bg,

                },

            }
        }}
    >
        <Sider collapsible collapsed={collapsed} className="z-[100] overflow-y-hidden" onCollapse={(value) => {
            setCollapsed(value);

        }}>
            {contextHolder}
            <div className={!collapsed ? "flex items-center px-1 h-10 w-full" : "flex justify-center items-center  my-2 h-10 w-full"}>
                <p className={`text-center font-bold text-lg text-ForegroundColor`}>
                    Akira v0.7.0b
                </p>

                {!collapsed && <button className="ml-auto text-2xl text-ForegroundColor" onClick={() => { setTheme(theme == "dark" ? "purple" : theme == "purple" ? "light" : "dark") }}>
                    <AnimatePresence >
                        {theme == "light" ? <SunFilled /> : theme == "dark" ? <MoonFilled /> : <ThunderboltFilled />}
                    </AnimatePresence>
                </button>}

            </div>
            {!collapsed && <div className="m-1 flex flex-col gap-y-1">
                <button className="w-full bg-BackgroundButton rounded-md duration-700 p-2 font-bold hover:bg-BackgroundHoverButton" onClick={() => {
                    if (scenes.length <= 10) {
                        addScene({
                            sceneName: `Scene ${scenes.length + 1}`,
                            id: crypto.randomUUID(),
                            modelPathOrLink: "Black.bpmx"
                        });
                        api.success({
                            message: "Added scene",
                            pauseOnHover: true,
                            className: ""
                        })
                    }

                }}>Add Scene</button>
            </div>}

            <Menu
                defaultSelectedKeys={[sceneId ?? ""]}
                onTouchStart={onHoldingStarted}
                onTouchEnd={onHoldingEnded}
                onMouseDown={onHoldingStarted}
                onMouseUp={onHoldingEnded}
                onClick={(el) => {
                    if (el.key == "settings") {
                        SetSettingsOpened(!SettingsOpened)
                    } else {
                        push(`/scenes?sceneId=${el.key}`)
                    }

                }}
                style={{ height: '100%', borderRight: 0 }} mode="inline" items={[
                    {
                        key: 'g1',
                        label: 'Scenes',
                        icon: <FolderFilled />,
                        children: scenes.map((el) => {
                            return {
                                label: el.sceneName,
                                key: el.id,
                            }
                        }),
                    },
                    {
                        key: 'settings',
                        label: 'Settings',
                        icon: <SettingFilled />
                    },
                    {
                        key: "explore",
                        label: "Explore",
                        disabled: true,
                        icon: <CloudOutlined />
                    }
                ]} />

        </Sider>
        <AkiraModalDialog title={<div>
            <p className="text-ForegroundColor">Delete scene</p>
        </div>} okText="Delete" cancelText="Cancel" okType="danger" open={ModalDeleteSceneOpened}
            onOk={() => {
                if (SelectedScene?.id){
                    removeScene(SelectedScene.id)
                    if(sceneId == SelectedScene.id) push("/")
                }
                SetModalDeleteSceneOpened(false);
            }}
            onCancel={() => {
                SetModalDeleteSceneOpened(false);
            }}>
            <div className="text-ForegroundColor">
                <p>You want to delete selected scene?</p>
            </div>

        </AkiraModalDialog>
        <SettingsModal opened={SettingsOpened} SetOpened={() => SetSettingsOpened(!SettingsOpened)} />
    </ConfigProvider>
}
