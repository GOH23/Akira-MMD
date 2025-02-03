import React from "react";
export type HoverAnimation = "" | ""
export function AkiraButton({textSize,fillWidth,children,className,onClick}:{
    textSize?: number,
    fillWidth?: boolean,
    children?: React.ReactNode,
    className?: string,
    loading?: boolean,
    onClick?: (event: React.MouseEvent)=>void
}){
    return(<button onClick={onClick} className={`${fillWidth && "w-full"} ${textSize && `text-[${textSize}px]`} bg-BackgroundButton text-ForegroundButton rounded-md duration-700 p-2 font-bold hover:bg-BackgroundHoverButton ${className}`}>
        {children}
    </button>)
}