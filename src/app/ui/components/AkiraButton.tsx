import React from "react";

export function AkiraButton({textSize,fillWidth,children,className}:{
    textSize?: number,
    fillWidth?: boolean,
    children: React.ReactNode,
    className?: string,

}){
    return(<button className={`${fillWidth && "w-full"} ${textSize && `text-[${textSize}px]`} bg-BackgroundButton text-ForegroundColor rounded-md duration-700 p-2 font-bold hover:bg-BackgroundHoverButton ${className}`}>
        {children}
    </button>)
}