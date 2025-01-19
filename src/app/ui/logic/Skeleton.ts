import { RefObject } from "react";
import { HolisticLandmarkerResult } from "@mediapipe/tasks-vision";
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";
import { POSE_CONNECTIONS, FACEMESH_TESSELATION, HAND_CONNECTIONS } from "@mediapipe/holistic";
export class SkeletonShow {
    static onShowSkeleton(canvas: RefObject<HTMLCanvasElement | null>, result: HolisticLandmarkerResult) {
        if (canvas.current) {
            const canvasCtx = canvas.current.getContext('2d')!;
            canvasCtx.save();
            canvasCtx.clearRect(0, 0, canvas.current.width, canvas.current.height);
            //canvasCtx.drawImage(result.faceBlendshapes[0], 0, 0, canvas.current.width, canvas.current.height);

            drawConnectors(canvasCtx, result.poseLandmarks[0], POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 1 });
            drawLandmarks(canvasCtx, result.poseLandmarks[0], { color: '#FF0000', lineWidth: 0.5 });

            //drawConnectors(canvasCtx, result.faceLandmarks[0], FACEMESH_TESSELATION, { color: '#C0C0C070', lineWidth: .1 });


            drawConnectors(canvasCtx, result.leftHandLandmarks[0], HAND_CONNECTIONS, { color: '#CC0000', lineWidth: 1 });
            drawLandmarks(canvasCtx, result.leftHandLandmarks[0], { color: '#00FF00', lineWidth: 1 });


            drawConnectors(canvasCtx, result.rightHandLandmarks[0], HAND_CONNECTIONS, { color: '#00CC00', lineWidth: 2.5 });
            drawLandmarks(canvasCtx, result.rightHandLandmarks[0], { color: '#FF0000', lineWidth: 1 });

            canvasCtx.restore();
        }

    }
}