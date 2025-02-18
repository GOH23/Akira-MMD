import { RefObject } from "react";
import { HolisticLandmarkerResult, PoseLandmarker, HandLandmarker, DrawingUtils } from "@mediapipe/tasks-vision";


export class SkeletonShow {
    static onShowSkeleton(canvas: RefObject<HTMLCanvasElement | null>, result: HolisticLandmarkerResult) {
        if (canvas.current) {
            const canvasCtx = canvas.current.getContext('2d')!;
            canvasCtx.save();
            canvasCtx.clearRect(0, 0, canvas.current.width, canvas.current.height)
            const drawingUtils = new DrawingUtils(canvasCtx);
            drawingUtils.drawConnectors(result.rightHandLandmarks[0], HandLandmarker.HAND_CONNECTIONS);
            drawingUtils.drawConnectors(result.leftHandLandmarks[0], HandLandmarker.HAND_CONNECTIONS);
            drawingUtils.drawConnectors(result.poseLandmarks[0], PoseLandmarker.POSE_CONNECTIONS);

        }

    }
}