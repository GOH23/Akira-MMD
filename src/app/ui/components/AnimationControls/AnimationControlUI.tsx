"use client"
import { motion } from "framer-motion"
import { useState } from "react"
import { VideoCameraAddOutlined, CloseOutlined, RestFilled } from "@ant-design/icons"
import { AkiraButton } from "../AkiraButton";
import { KeyFrameType, MotionModel } from "../../logic/MotionModel";

export function AnimationControlUI({ KeyFrames, MotionModelInstance }: {
    KeyFrames: KeyFrameType[];
    MotionModelInstance?: MotionModel;
}) {
    const [AnimationOpened, SetAnimationOpened] = useState(false);
    
    // Функция для экспорта в VMD
    const exportToVMD = () => {
        if (!MotionModelInstance) {
            alert("Model is not initialized");
            return;
        }
        
        try {
            const vmdBlob = MotionModelInstance.exportToVMD();
            const url = URL.createObjectURL(vmdBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = "akira_animation.vmd";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Error exporting to VMD:", error);
            alert(`Export error: ${error instanceof Error ? error.message : String(error)}`);
        }
    };
    
    // Функция для воспроизведения VMD
    const loadAndPlayVMD = () => {
        if (!MotionModelInstance) {
            alert("Model is not initialized");
            return;
        }
        
        // Создаем элемент ввода файла
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.vmd';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
        
        // Обработчик выбора файла
        fileInput.onchange = async (event) => {
            const target = event.target as HTMLInputElement;
            const files = target.files;
            
            if (files && files.length > 0) {
                const vmdFile = files[0];
                try {
                    // Загружаем и воспроизводим VMD файл
                    const success = await MotionModelInstance.loadAndPlayVmdAnimation(vmdFile);
                    if (!success) {
                        alert("Failed to play animation");
                    }
                } catch (error) {
                    console.error("Error loading VMD:", error);
                    alert(`Error loading VMD: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            
            // Удаляем элемент ввода файла
            document.body.removeChild(fileInput);
        };
        
        // Эмулируем клик для открытия диалога выбора файла
        fileInput.click();
    };
    
    // Функция для экспорта в glTF
    const exportToGLTF = async () => {
        if (!MotionModelInstance) {
            alert("Model is not initialized");
            return;
        }
        
        try {
            const gltfBlob = MotionModelInstance.exportToGLTF();
            const url = URL.createObjectURL(gltfBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = "akira_animation.gltf";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Error exporting to glTF:", error);
            alert(`Export error: ${error instanceof Error ? error.message : String(error)}`);
        }
    };
    
    return (<motion.div animate={{ bottom: AnimationOpened ? 0 : "-400px" }} className="absolute border-l-[2px] border-ForegroundColor w-full bottom-0 bg-MenuItemBg h-[400px]">
        <button
            className="p-2 absolute text-lg -top-[50px] size-[45px] font-bold cursor-pointer  hover:bg-BackgroundHoverButton duration-700 flex justify-center items-center aspect-square rounded bg-BackgroundButton text-white"
            onClick={() => {
                SetAnimationOpened(!AnimationOpened)
            }}>
            {!AnimationOpened ? <VideoCameraAddOutlined /> : <CloseOutlined />}
        </button>
        {AnimationOpened && <button
            className="p-2 absolute text-lg right-0 -top-[50px] size-[45px] font-bold cursor-pointer  hover:bg-BackgroundHoverButton duration-700 flex justify-center items-center aspect-square rounded bg-BackgroundButton text-white"
            onClick={() => {

            }}>
            <RestFilled />
        </button>}
        <div className='h-[40px] text-ForegroundColor flex items-center container mx-auto'>
            <p className=" text-[20px] font-bold">Animation controller</p>
            <div className="flex ml-auto gap-x-2 justify-end items-center">

                <AkiraButton onClick={exportToVMD}>
                    Export to vmd
                </AkiraButton>
                
                <AkiraButton onClick={exportToGLTF}>
                    Export to glTF
                </AkiraButton>
            </div>
        </div>
       
    </motion.div>)
}
