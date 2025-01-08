"use client"
import { CopyFilled, FolderFilled, FolderOutlined, MoonFilled, SettingFilled, SunFilled, ThunderboltFilled } from "@ant-design/icons";
import { Button, ConfigProvider, Menu } from "antd";
import Sider from "antd/es/layout/Sider";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { AnimatePresence } from 'framer-motion'
import { useNextJSToAntdTheme } from "./hookes/useCustomTheme";
import ModalDialog from "./components/ModalDialog";
import { useScenes } from "./hookes/useScenes";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import SettingsModal from "./components/SettingsModal";

export default function HeaderLayout() {
    const { theme, setTheme } = useTheme()
    const { push } = useRouter()
    const searchParams = useSearchParams()
    const sceneId = searchParams.get('sceneId')
    const { addScene, scenes } = useScenes((el) => el);
    const { Layout, MenuTheme } = useNextJSToAntdTheme(theme);
    const [SettingsOpened, SetSettingsOpened] = useState(false)
    const [collapsed, setCollapsed] = useState(false);
    setInterval(async ()=>{
        window.dispatchEvent(new Event('resize'));
    },2000)

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
        <Sider collapsible collapsed={collapsed} className="z-[100] overflow-y-hidden"  onCollapse={(value) => {
            setCollapsed(value);

        }}>
            <div className={!collapsed ? "flex items-center px-1 h-10 w-full" : "flex justify-center items-center  h-10 w-full"}>
                <p className={`text-center font-bold text-lg`}>
                    Akira
                </p>
                {!collapsed && <button className="ml-auto text-2xl" onClick={() => { setTheme(theme == "dark" ? "purple" : theme == "purple" ? "light" : "dark") }}>
                    <AnimatePresence >
                        {theme == "light" ? <SunFilled /> : theme == "dark" ? <MoonFilled /> : <ThunderboltFilled />}
                    </AnimatePresence>
                </button>}

            </div>
            {!collapsed && <div className="m-1 flex flex-col gap-y-1">
                <button className="w-full bg-BackgroundButton rounded-md duration-700 p-2 font-bold hover:bg-BackgroundHoverButton" onClick={() => {
                    addScene({
                        sceneName: `Scene ${scenes.length + 1}`,
                        id: crypto.randomUUID(),
                        modelPathOrLink: "Black.bpmx"
                    })
                }}>Add Scene</button>
                <button className="w-full bg-BackgroundButton rounded-md duration-700 p-2 font-bold hover:bg-BackgroundHoverButton">Add Model</button>
            </div>}

            <Menu
                defaultSelectedKeys={[sceneId ?? ""]}
                onClick={(el) => {
                    if (el.key == "settings") {
                        SetSettingsOpened(!SettingsOpened)
                    } else { push(`/scenes?sceneId=${el.key}`) }

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
                    }
                ]} />

        </Sider>
        <SettingsModal opened={SettingsOpened} SetOpened={() => SetSettingsOpened(!SettingsOpened)} />
    </ConfigProvider>
}