import { CloseOutlined } from "@ant-design/icons";
import { Drawer, DrawerProps } from "antd";

export function AkiraDrawer({...data}: DrawerProps){

    return(<Drawer styles={{
        mask: {
            backdropFilter: 'blur(10px)',
        },
        header: {
            backgroundColor: "var(--menu-layout-bg) !important",
            color: "var(--text-color)"
        },
        content: {
            backgroundColor: "var(--menu-layout-bg) !important"
        },
        
    }} closeIcon={<CloseOutlined className="text-ForegroundColor"/>} {...data}/>)
}