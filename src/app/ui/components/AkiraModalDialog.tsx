import { CloseOutlined } from "@ant-design/icons";
import { Modal, ModalProps } from "antd";
interface ModalAkiraProps extends ModalProps {
    onupdate?: {
        update: string,
        status: boolean
    }
}
export function AkiraModalDialog(data: ModalAkiraProps) {
    return (<Modal
        styles={{
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
        }}
        closeIcon={<CloseOutlined className="text-ForegroundColor" />}
        {...data}
    />)
}