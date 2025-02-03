"use client"
import { ConfigProvider, Switch, SwitchProps } from "antd";

export default function AkiraRadioButton(data: SwitchProps) {
    return (<ConfigProvider
        theme={{
            token: {
                colorPrimary: "" 
            }
        }}
    >
        <Switch {...data} />
    </ConfigProvider>)
}