import { CloseOutlined } from "@ant-design/icons";
import { Drawer, DrawerProps } from "antd";
import { useCallback, useState } from "react";
import { AkiraButton } from "./AkiraButton";
export type DrawerUpdatedProps = {
    removeBlurButton?: boolean
}
export function AkiraDrawer({ ...data }: DrawerProps & DrawerUpdatedProps) {
    const [blurDisabled, SetBlurDisabled] = useState(false)
    const disableBlur = useCallback(() => {
        SetBlurDisabled(!blurDisabled)
    }, [blurDisabled])
    return (<Drawer styles={{
        mask: {
            backdropFilter: !blurDisabled ? 'blur(10px)' : "none",
        },
        header: {
            backgroundColor: "var(--menu-layout-bg) !important",
            color: "var(--text-color)"
        },
        content: {
            backgroundColor: "var(--menu-layout-bg) !important"
        },

    }} closeIcon={<CloseOutlined className="text-ForegroundColor" />} {...data}>
        {data.removeBlurButton && <AkiraButton onClick={disableBlur}
                className="absolute right-0 top-0 m-2"
                children={<p>{!blurDisabled ? "Remove" : "Restore"} blur</p>}
            />}
        {data.children}
    </Drawer>)
}