import { AssetContainer, Mesh, Vector3 } from "@babylonjs/core";
import { HolisticLandmarker, HolisticLandmarkerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { MmdModel, MmdRuntime } from "babylon-mmd";
import { IMmdRuntimeLinkedBone } from "babylon-mmd/esm/Runtime/IMmdRuntimeLinkedBone";
import { faceKeypoints, handKeypoints, poseKeypoints } from "./MotionTypes";
export type BoneType = "hand" | "pose" | "face"
export class MotionModel {
    public MMDModel?: MmdModel
    public bones?: IMmdRuntimeLinkedBone[]
    constructor(public lerpFactor: number = .5) {

    }
    searchBone(name: string) {
        return this.bones?.find((el) => {
            return el.name == name
        });
    }
    motionCalculate(Model: MmdModel, holisticResult: HolisticLandmarkerResult) {
        if (!this.MMDModel) {
            this.MMDModel = Model;
            this.bones = this.MMDModel.skeleton.bones;
        }
        var { mainBody } = new HolisticParser(holisticResult);
        const scale = 10;
        const yOffset = 7;
        this.moveFoot("left", mainBody)
        this.moveFoot("right", mainBody)
    }
    static getKeyPoint(landMark: NormalizedLandmark[] | null, name: string, boneType: BoneType): Vector3 | null {
        if (!landMark || landMark.length == 0) return null;
        switch (boneType) {
            case "face":
                var point = landMark[faceKeypoints[name]]
                const scaleX = 10
                const scaleY = 10
                const scaleZ = 5
                return point ? new Vector3(point.x * scaleX, point.y * scaleY, point.z * scaleZ) : null
            case "hand":
                var point = landMark[handKeypoints[name]]
                return point ? new Vector3(point.x, point.y, point.z) : null
            case "pose":
                var point = landMark[poseKeypoints[name]]
                return point && point.visibility > 0.1 ? new Vector3(point.x, point.y, point.z) : null
            default:
                return null
        }
    }
    moveFoot(side: "right" | "left", bodyLand: NormalizedLandmark[], scale: number = 10, yOffset: number = 7) {
        const ankle = MotionModel.getKeyPoint(bodyLand, `${side}_ankle`, "pose")
        const hip = MotionModel.getKeyPoint(bodyLand, `${side}_hip`, "pose")
        const bone = this.searchBone(`${side === "right" ? "右" : "左"}足ＩＫ`)

        if (ankle && hip && bone) {
            const targetPosition = new Vector3(ankle.x * scale, -ankle.y * scale + yOffset, ankle.z * scale)

            bone.position = Vector3.Lerp(bone.position, targetPosition, this.lerpFactor)
        }
    }
}
class HolisticParser {
    mainBody: NormalizedLandmark[]
    constructor(holisticResult: HolisticLandmarkerResult) {
        this.mainBody = holisticResult.poseWorldLandmarks[0];
    }
    static ParseHolistic(holisticResult: HolisticLandmarkerResult): HolisticParser {
        return new HolisticParser(holisticResult);
    }
}