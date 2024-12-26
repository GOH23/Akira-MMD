"use client"
import { CopyFilled, SettingFilled } from "@ant-design/icons";
import { Menu } from "antd";
import Sider from "antd/es/layout/Sider";
import { useState } from "react";

export default function HeaderLayout() {
    const [collapsed, setCollapsed] = useState(false);
    return <Sider className="z-50" collapsible collapsed={collapsed} onCollapse={(value) => setCollapsed(value)}>
        <div>
            <p className="text-center font-bold text-lg">
                Akira
            </p>
        </div>
        <Menu theme="dark"
            style={{ height: '100%', borderRight: 0 }} mode="inline" items={[
                {
                    key: 'g1',
                    label: 'Scenes',
                    icon: <CopyFilled />
                },
                {
                    key: 'g2',
                    label: 'Settings',
                    icon: <SettingFilled />
                }
            ]} />
    </Sider>
}