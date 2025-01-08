import { useAnimate } from "framer-motion"
import { useEffect } from "react"

export default function Loading(){
    const [word1, animate1] = useAnimate()
    const [word2, animate2] = useAnimate()
    const [word3, animate3] = useAnimate()
    const [word4, animate4] = useAnimate()
    const [word5, animate5] = useAnimate()
    useEffect(()=>{
        const handleAnim = async ()=>{
            await animate1(word1.current,{ transform: "scale(1, 0.6)",  "transform-origin":" bottom "},{duration: 1})
            await animate1(word1.current,{ transform: "scale(1)",  "transform-origin":" bottom " },{duration: 1})
            await animate1(word2.current,{ transform: "scale(1, 0.5)",  "transform-origin":" bottom "},{duration: 1})
            await animate1(word2.current,{ transform: "scale(1)",  "transform-origin":" bottom " },{duration: 1})
            await animate1(word3.current,{ transform: "scale(1, 0.5)",  "transform-origin":" bottom "},{duration: 1})
            await animate1(word3.current,{ transform: "scale(1)",  "transform-origin":" bottom " },{duration: 1})
            await animate1(word4.current,{ transform: "scale(1, 0.5)",  "transform-origin":" bottom "},{duration: 1})
            await animate1(word4.current,{ transform: "scale(1)" ,  "transform-origin":" bottom "},{duration: 1})
            await animate1(word5.current,{ transform: "scale(1, 0.5)",  "transform-origin":" bottom "},{duration: 1})
            await animate1(word5.current,{ transform: "scale(1)",  "transform-origin":" bottom " },{duration: 1})
            handleAnim()
        }
        handleAnim()
    },[])
    return(<div className="bg-BackgroundColor  min-h-dvh top-0 text-ForegroundColor">
        <div className="flex justify-center h-full text-[100px] font-bold items-center">
            <p ref={word1}>A</p>
            <p ref={word2}>k</p>
            <p ref={word3}>i</p>
            <p ref={word4}>r</p>
            <p ref={word5}>a</p>
        </div>
    </div>)
}