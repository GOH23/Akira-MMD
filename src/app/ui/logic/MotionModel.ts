import { Matrix, Quaternion, Space, Vector3 } from "@babylonjs/core";
import { HolisticLandmarkerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { MmdModel, MmdWasmModel } from "babylon-mmd";
import { IMmdRuntimeLinkedBone } from "babylon-mmd/esm/Runtime/IMmdRuntimeLinkedBone";
import { faceKeypoints, handKeypoints, poseKeypoints } from "./MotionTypes";
export type BoneType = "hand" | "pose" | "face"
// Константы для имен костей
enum MMDModelBones {
    UpperBody = "上半身",
    LowerBody = "下半身",
    LeftArm = "左腕",
    RightArm = "右腕",
    LeftElbow = "左ひじ",
    RightElbow = "右ひじ",
    LeftWrist = "左手首",
    RightWrist = "右手首",
    LeftHip = "左足",
    RightHip = "右足",
    LeftAnkle = "左足首",
    RightAnkle = "右足首",
    LeftFootIK = "左足ＩＫ",
    RightFootIK = "右足ＩＫ",
    Neck = "首",
    Head = "頭",
    Center = "センター",
    LeftEye = "左目",
    RightEye = "右目",
    Eyebrows = "眉",
    Mouth = "口"
}

const CONFIG = {
    POSE_SCALE: 25,
    Y_OFFSET: 0.5,
    POSE_HISTORY_LENGTH: 5,
    MIN_MOVEMENT_THRESHOLD: 0.008,
    HAND_SCALE: 0.5,
    LERP_FACTOR: 0.5,
    FINGER_BEND_SCALE: 0.3,
    HEAD_ROTATION_SCALE: 0.7,
    EYE_MOVEMENT_SCALE: 0.05,
    MOUTH_OPEN_SCALE: 3.0,
    BLINK_THRESHOLD: 0.02,
    EYEBROW_RAISE_SCALE: 4.0,
    MOUTH_CORNER_SCALE: 8.0,
    BROW_FURROW_SCALE: 5.0
};
//abstract class for support all extention models [on dev]
export abstract class MotionAbstractModel<TBones, TModel = any> {
    _Model?: TModel
    _bones?: TBones[] = []
    abstract init(model: TModel): void | any
    abstract motionCalculate(holisticResult: HolisticLandmarkerResult): void | any
}

export class MotionModel {
    private _positionHistory: Vector3[] = [];
    public _Model?: MmdWasmModel
    public _bones?: IMmdRuntimeLinkedBone[] = []
    constructor(private lerpFactor: number = CONFIG.LERP_FACTOR) { }
    searchBone(name: string) {
        return this._bones?.find((el) => {
            return el.name == name
        });
    }
    init(Model: MmdWasmModel) {
        if (!this._Model) {
            this._Model = Model;
            this._bones = this._Model.skeleton.bones;
        }
    }

    motionCalculate(holisticResult: HolisticLandmarkerResult) {
        if (!this._Model) return;
        var { mainBody, leftFingers, rightFingers, faceLandmarks } = new HolisticParser(holisticResult);
        const scale = 10;
        const yOffset = 7;
        var UpperBodyRotation = this.calculateUpperBodyRotation(mainBody);
        var LowerBodyRotation = this.calculateLowerBodyRotation(mainBody);
        const HeadRotation = this.calculateHeadRotation(mainBody, UpperBodyRotation);
        const [leftShoulderRot, leftElbowRot, leftWristRot] = this.calculateArmRotation(
            mainBody,
            leftFingers,
            {
                upperBodyRot: UpperBodyRotation,
                lowerBodyRot: LowerBodyRotation
            },
            "left_shoulder",
            "left_elbow",
            "left_wrist",
            false
        );
        const [rightShoulderRot, rightElbowRot, rightWristRot] = this.calculateArmRotation(
            mainBody,
            rightFingers,
            {
                upperBodyRot: UpperBodyRotation,
                lowerBodyRot: LowerBodyRotation
            },
            "right_shoulder",
            "right_elbow",
            "right_wrist",
            true
        );

        const [
            lefthipRotation,
            leftfootRotation
        ] = this.calculateLegRotation(
            mainBody,
            "left_hip",
            "left_knee",
            "left_ankle",
            LowerBodyRotation);
        const [
            righthipRotation,
            rightfootRotation
        ] = this.calculateLegRotation(
            mainBody,
            "right_hip",
            "right_knee",
            "right_ankle",
            LowerBodyRotation);
        //this.moveBody(mainBody);
        this.setRotation(MMDModelBones.LowerBody, LowerBodyRotation);
        this.setRotation(MMDModelBones.UpperBody, UpperBodyRotation);
        this.setRotation(MMDModelBones.RightArm, rightShoulderRot);
        this.setRotation(MMDModelBones.LeftArm, leftShoulderRot);
        this.setRotation(MMDModelBones.RightElbow, rightElbowRot);
        this.setRotation(MMDModelBones.LeftElbow, leftElbowRot);
        this.setRotation(MMDModelBones.RightWrist, rightWristRot);
        this.setRotation(MMDModelBones.LeftWrist, leftWristRot);
        this.setRotation(MMDModelBones.LeftHip, lefthipRotation);
        this.setRotation(MMDModelBones.LeftAnkle, leftfootRotation);
        this.setRotation(MMDModelBones.RightHip, righthipRotation);
        this.setRotation(MMDModelBones.RightAnkle, rightfootRotation);
        this.setRotation(MMDModelBones.Head, HeadRotation);
        this.updateEyeMovement(faceLandmarks);
        this.moveFoot("left", mainBody)
        this.moveFoot("right", mainBody)
        this.rotateFingers2(leftFingers, "left");
        this.rotateFingers2(rightFingers, "right");
        // // this.updateFingers("left", leftFingers);
        // // this.updateFingers("right", rightFingers);

        this.updateFacialExpressions(faceLandmarks)
    }
    updateFacialExpressions(faceLandmarks: NormalizedLandmark[]): void {
        const targetWeights = this.calculateFacialExpressions(faceLandmarks);

        Object.keys(targetWeights).forEach((morphName) => {
            var _currentMorphWeights = this._Model?.morph.getMorphWeight(morphName)
            const current = _currentMorphWeights || 0;
            const target = targetWeights[morphName];
            const newWeight = current + (target - current) * this.lerpFactor;
            _currentMorphWeights = Math.min(Math.max(newWeight, 0), 1);
            this._Model?.morph?.setMorphWeight(morphName, _currentMorphWeights);
        });
    }
    calculateFacialExpressions(faceLandmarks: NormalizedLandmark[]): { [key: string]: number } {
        const get = (name: string) => this.getKeyPoint(faceLandmarks, name, "face");

        // Получаем необходимые точки лица
        const upperLipTop = get("upper_lip_top");
        const lowerLipBottom = get("lower_lip_bottom");
        const mouthLeft = get("mouth_left");
        const mouthRight = get("mouth_right");
        const upperLipCenter = get("upper_lip_center");
        const lowerLipCenter = get("lower_lip_center");
        const leftCorner = get("left_corner");
        const rightCorner = get("right_corner");
        const leftEar = get("left_ear");
        const rightEar = get("right_ear");

        // Инициализация значений по умолчанию
        let mouthOpenness = 0;
        let mouthWidth = 0;
        let mouthSmile = 0;
        const calculateBlink = (faceLandmarks: NormalizedLandmark[]) => {
            const get = (name: string) => faceLandmarks[faceKeypoints[name]];
            const leftEyeTop = get("left_eye_upper");
            const leftEyeBottom = get("left_eye_lower");
            const rightEyeTop = get("right_eye_upper");
            const rightEyeBottom = get("right_eye_lower");

            const eyeOpenness = (top?: NormalizedLandmark, bottom?: NormalizedLandmark) =>
                top && bottom ? Math.abs(top.y - bottom.y) : 1;

            const leftOpen = eyeOpenness(leftEyeTop, leftEyeBottom);
            const rightOpen = eyeOpenness(rightEyeTop, rightEyeBottom);

            return {
                leftOpen: 1 - Math.min(Math.max((leftOpen - CONFIG.BLINK_THRESHOLD) * 50, 0), 1),
                rightOpen: 1 - Math.min(Math.max((rightOpen - CONFIG.BLINK_THRESHOLD) * 50, 0), 1)
            };

        }
        if (upperLipTop && lowerLipBottom && mouthLeft && mouthRight &&
            upperLipCenter && lowerLipCenter && leftCorner && rightCorner &&
            leftEar && rightEar) {

            // Расчет открытости рта
            const mouthHeight = Vector3.Distance(upperLipTop, lowerLipBottom);
            const mouthWidthRaw = Vector3.Distance(mouthLeft, mouthRight);
            mouthOpenness = Math.min(Math.max((mouthHeight / mouthWidthRaw - 0.1) / 0.5, 0), 0.7);

            // Расчет ширины рта
            const faceWidth = Vector3.Distance(leftEar, rightEar);
            const relativeWidth = mouthWidthRaw / faceWidth;
            mouthWidth = Math.min(Math.max((relativeWidth - 0.45) / 0.1, -1), 1);

            // Расчет улыбки
            const mouthCenter = Vector3.Center(upperLipCenter, lowerLipCenter);
            const leftLift = Vector3.Distance(leftCorner, mouthCenter);
            const rightLift = Vector3.Distance(rightCorner, mouthCenter);
            mouthSmile = Math.min(Math.max((leftLift + rightLift) / 2 - mouthWidthRaw * 0.3, -1), 1);
        }

        // Расчет моргания
        //const { leftOpen, rightOpen } = calculateBlink(faceLandmarks);

        return {
            //"まばたき": Math.pow(leftOpen, 1.5),
            //"まばたき右": Math.pow(rightOpen, 1.5),
            "あ": Math.pow(mouthOpenness, 1.5),
            "い": Math.max(0, -mouthWidth) * 0.7,
            "う": Math.max(0, mouthWidth) * 0.7,
            "お": Math.max(0, mouthOpenness - 0.3) * 1.5,
            "わ": Math.max(0, mouthSmile) * (1 - Math.min(mouthOpenness, 1) * 0.7),
            "にやり": Math.max(0, mouthSmile) * Math.min(mouthOpenness, 1) * 0.8,
            "∧": Math.max(0, -mouthSmile) * 0.5
        };
    }
    getKeyPoint(landMark: NormalizedLandmark[] | null, name: string, boneType: BoneType): Vector3 | null {
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
    
    moveBody(bodyLand: NormalizedLandmark[]) {
        const leftShoulder = this.getKeyPoint(bodyLand, "left_shoulder", "pose");
        const rightShoulder = this.getKeyPoint(bodyLand, "right_shoulder", "pose");
        const rootMesh = this._Model?.mesh;

        if (leftShoulder && rightShoulder && rootMesh) {
            // Фильтрация шума скользящим средним
            const shoulderCenter = Vector3.Center(leftShoulder, rightShoulder);
            this._positionHistory.push(shoulderCenter);

            if (this._positionHistory.length > CONFIG.POSE_HISTORY_LENGTH) {
                this._positionHistory.shift();
            }

            const smoothedCenter = this._positionHistory.reduce((acc, val) =>
                acc.add(val), new Vector3(0, 0, 0)
            ).scale(1 / this._positionHistory.length);

            // Расчет целевой позиции
            const targetPosition = new Vector3(
                -(smoothedCenter.x * CONFIG.POSE_SCALE * 2),
                0.2,
                smoothedCenter.z * CONFIG.POSE_SCALE
            );

            // Проверка порога движения
            if (Vector3.Distance(rootMesh.position, targetPosition) < CONFIG.MIN_MOVEMENT_THRESHOLD) {
                return;
            }

            // Плавная интерполяция
            rootMesh.position = Vector3.Lerp(
                rootMesh.position,
                targetPosition,
                0.2
            );
        }
    }
    
    rotateFingers(hand: NormalizedLandmark[] | null, side: "left" | "right"): void {
        if (!hand || hand.length === 0) return

        const fingerNames = ["親指", "人指", "中指", "薬指", "小指"]
        const fingerJoints = ["", "１", "２", "３"]
        const maxAngle = Math.PI / 2.5
        const maxEndSegmentAngle = (Math.PI * 2) / 3
        const fingerBaseIndices = [1, 5, 9, 13, 17]

        fingerNames.forEach((fingerName, fingerIndex) => {
            fingerJoints.forEach((joint, jointIndex) => {
                const boneName = `${side === "left" ? "左" : "右"}${fingerName}${joint}`
                const bone = this.searchBone(boneName)

                if (bone) {
                    const baseIndex = fingerBaseIndices[fingerIndex]
                    const currentIndex = baseIndex + jointIndex
                    const nextIndex = baseIndex + jointIndex + 1

                    let rotationAngle = 0

                    if (nextIndex < hand.length) {
                        const currentPoint = new Vector3(hand[currentIndex].x, hand[currentIndex].y, hand[currentIndex].z)
                        const nextPoint = new Vector3(hand[nextIndex].x, hand[nextIndex].y, hand[nextIndex].z)

                        const segmentVector = nextPoint.subtract(currentPoint)

                        let defaultVector: Vector3
                        if (fingerName === "親指") {
                            defaultVector = new Vector3(side === "left" ? -1 : 1, 1, 0)
                        } else {
                            defaultVector = new Vector3(0, -1, 0)
                        }
                        rotationAngle = Vector3.GetAngleBetweenVectors(segmentVector, defaultVector, new Vector3(1, 0, 0))

                        const isEndSegment = jointIndex === 3
                        const currentMaxAngle = isEndSegment ? maxEndSegmentAngle : maxAngle

                        rotationAngle = Math.min(Math.max(rotationAngle, 0), currentMaxAngle)

                        if (isEndSegment && rotationAngle > maxAngle) {
                            rotationAngle = 0
                        }
                    }

                    let defaultDir: Vector3

                    if (boneName.includes("親指")) {
                        defaultDir = new Vector3(-1, side === "left" ? -1 : 1, 0).normalize()
                    } else {
                        defaultDir = new Vector3(0, 0, side === "left" ? -1 : 1).normalize()
                    }

                    const rotation = defaultDir.scale(rotationAngle)

                    bone.setRotationQuaternion(
                        Quaternion.Slerp(
                            bone.rotationQuaternion || new Quaternion(),
                            Quaternion.FromEulerAngles(rotation.x, rotation.y, rotation.z),
                            this.lerpFactor
                        ),
                        Space.LOCAL
                    )
                }
            })
        })
    }
    private rotateFingers2(hand: NormalizedLandmark[] | null, side: "left" | "right"): void {
        if (!hand || hand.length === 0) return;
    
        const FINGER_CONFIG = {
            thumb: { base: 1, joints: 4, maxAngles: [0.8, 1.2, 1.5] },
            index: { base: 5, joints: 3, maxAngles: [1.5, 1.8, 2.0] },
            middle: { base: 9, joints: 3, maxAngles: [1.6, 1.9, 2.1] },
            ring: { base: 13, joints: 3, maxAngles: [1.4, 1.7, 1.9] },
            pinky: { base: 17, joints: 3, maxAngles: [1.3, 1.6, 1.8] }
        };
    
        Object.entries(FINGER_CONFIG).forEach(([fingerName, config]) => {
            for (let joint = 0; joint < config.joints; joint++) {
                const boneName = this.getFingerBoneName(side, fingerName, joint);
                const bone = this.searchBone(boneName);
                if (!bone) continue;
    
                const rotation = this.calculateFingerJointRotation(
                    hand,
                    config.base + joint,
                    config.maxAngles[joint] || 2.0
                );
    
                bone.setRotationQuaternion(
                    Quaternion.Slerp(
                        bone.rotationQuaternion || Quaternion.Identity(),
                        rotation,
                        0.7
                    ),
                    Space.LOCAL
                );
            }
        });
    }
    
    private calculateFingerJointRotation(
        landmarks: NormalizedLandmark[],
        jointIndex: number,
        maxAngle: number
    ): Quaternion {
        const current = landmarks[jointIndex];
        const next = landmarks[jointIndex + 1];
        
        if (!current || !next) return Quaternion.Identity();
    
        const dir = new Vector3(
            next.x - current.x,
            next.y - current.y,
            next.z - current.z
        ).normalize();
    
        const flexion = Math.acos(Vector3.Dot(dir, Vector3.Down()));
        const angle = Math.min(flexion * CONFIG.FINGER_BEND_SCALE, maxAngle);
        
        return Quaternion.RotationAxis(
            Vector3.Right(),
            angle * (dir.z > 0 ? 1 : -1)
        );
    }
    
    private getFingerBoneName(side: string, finger: string, joint: number): string {
        const fingerNamesJP = {
            thumb: "親指",
            index: "人指",
            middle: "中指",
            ring: "薬指",
            pinky: "小指"
        };
        
        const jointSuffixes = ["", "１", "２", "３"];
        return `${side === "left" ? "左" : "右"}${fingerNamesJP[finger as keyof typeof fingerNamesJP]}${jointSuffixes[joint]}`;
    }
    setRotation(boneName: MMDModelBones, rotation: Quaternion): void {
        if (this._bones) {
            const bone = this._bones.find(b => b.name === boneName);
            if (bone) {
                bone.setRotationQuaternion(Quaternion.Slerp(bone.rotationQuaternion || new Quaternion(), rotation, this.lerpFactor),
                    Space.LOCAL
                )
            }
        }
    }
    calculateHeadRotation(mainBody: NormalizedLandmark[] | null, upperBodyRotation: Quaternion): Quaternion {
        const nose = this.getKeyPoint(mainBody, "nose", "face")
        const leftShoulder = this.getKeyPoint(mainBody, "left_shoulder", "pose")
        const rightShoulder = this.getKeyPoint(mainBody, "right_shoulder", "pose")


        if (nose && leftShoulder && rightShoulder) {
            const neckPos = leftShoulder.add(rightShoulder).scale(0.5)
            const headDir = nose.subtract(neckPos).normalize()

            const upperBodyRotationMatrix = new Matrix()
            Matrix.FromQuaternionToRef(upperBodyRotation, upperBodyRotationMatrix)

            const localHeadDir = Vector3.TransformNormal(headDir, upperBodyRotationMatrix.invert())

            const forwardDir = new Vector3(localHeadDir.x, 0, localHeadDir.z).normalize()

            const tiltAngle = Math.atan2(-localHeadDir.y, forwardDir.length())

            const tiltOffset = -Math.PI / 9
            const adjustedTiltAngle = tiltAngle + tiltOffset

            const horizontalQuat = Quaternion.FromLookDirectionLH(forwardDir, Vector3.Up())

            const tiltQuat = Quaternion.RotationAxis(Vector3.Right(), adjustedTiltAngle)

            const combinedQuat = horizontalQuat.multiply(tiltQuat)
            return combinedQuat
        }
        return new Quaternion()
    }
    private calculateWristRotation(
        wrist: Vector3,
        pinkyFinger: Vector3,
        lowerArmRotation: Quaternion,
        isRight: boolean
    ): Quaternion {
        const wristDir = pinkyFinger.subtract(wrist).normalize()
        wristDir.y *= -1
        const lowerArmRotationMatrix = new Matrix()
        Matrix.FromQuaternionToRef(lowerArmRotation, lowerArmRotationMatrix)
        const localWristDir = Vector3.TransformNormal(wristDir, lowerArmRotationMatrix.invert())
        const defaultDir = new Vector3(!isRight ? 1 : -1, -1, 0).normalize()
        return Quaternion.FromUnitVectorsToRef(defaultDir, localWristDir, new Quaternion())

    }
    private calculateElbowRotation(
        upperBodyRotation: Quaternion,
        elbow: Vector3,
        wrist: Vector3,
        isRight: boolean
    ): Quaternion {

        const lowerArmDir = wrist.subtract(elbow).normalize()
        lowerArmDir.y *= -1

        const upperArmRotationMatrix = new Matrix()
        Matrix.FromQuaternionToRef(upperBodyRotation, upperArmRotationMatrix)

        const localLowerArmDir = Vector3.TransformNormal(lowerArmDir, upperArmRotationMatrix.invert())

        const defaultDir = new Vector3(!isRight ? 1 : -1, -1, 0).normalize()

        const rotationQuaternion = Quaternion.FromUnitVectorsToRef(defaultDir, localLowerArmDir, new Quaternion())

        return rotationQuaternion

    }
    private calculateLegRotation(
        mainBody: NormalizedLandmark[],
        hipLandmark: string,
        kneeLandmark: string,
        ankleLandmark: string,
        lowerBodyRot: Quaternion
    ): [Quaternion, Quaternion] {
        const hip = this.getKeyPoint(mainBody, hipLandmark, "pose");
        const knee = this.getKeyPoint(mainBody, kneeLandmark, "pose");
        const ankle = this.getKeyPoint(mainBody, ankleLandmark, "pose");
        const hipRotation = !hip || !knee ? new Quaternion() : this.calculateHipRotation(lowerBodyRot, hip, knee);
        const footRotation = !hip || !ankle ? new Quaternion() : this.calculateFootRotation(hip, ankle, hipRotation);
        return [hipRotation, footRotation];
    }
    private calculateHipRotation(
        lowerBodyRot: Quaternion,
        hip: Vector3,
        knee: Vector3
    ) {
        const legDir = knee.subtract(hip).normalize()
        legDir.y *= -1
        const lowerBodyRotationMatrix = new Matrix()
        Matrix.FromQuaternionToRef(lowerBodyRot, lowerBodyRotationMatrix)
        const localLegDir = Vector3.TransformNormal(legDir, lowerBodyRotationMatrix.invert())
        const defaultDir = new Vector3(0, -1, 0)
        const rotationQuaternion = Quaternion.FromUnitVectorsToRef(defaultDir, localLegDir, new Quaternion())
        return rotationQuaternion
    }
    private calculateFootRotation(hip: Vector3, ankle: Vector3, hipRotation: Quaternion) {
        const footDir = ankle.subtract(hip).normalize()
        footDir.y *= -1
        const hipRotationMatrix = new Matrix()
        Matrix.FromQuaternionToRef(hipRotation, hipRotationMatrix)
        const localFootDir = Vector3.TransformNormal(footDir, hipRotationMatrix.invert())
        const defaultDir = new Vector3(0, 0, 1)
        return Quaternion.FromUnitVectorsToRef(defaultDir, localFootDir, new Quaternion())
    }
    private calculateArmRotation(
        mainBody: NormalizedLandmark[],
        handKeypoints: NormalizedLandmark[],
        bodyRot: { upperBodyRot: Quaternion, lowerBodyRot: Quaternion },
        shoulderLandmark: string,
        elbowLandmark: string,
        wristLandmark: string,
        isRight: boolean
    ): [Quaternion, Quaternion, Quaternion] {
        const shoulder = this.getKeyPoint(mainBody, shoulderLandmark, "pose");
        const elbow = this.getKeyPoint(mainBody, elbowLandmark, "pose");
        const wrist = this.getKeyPoint(mainBody, wristLandmark, "pose");
        const fingerhand = this.getKeyPoint(handKeypoints, "pinky_mcp", "hand");
        const shoulderRot = !shoulder || !elbow ? new Quaternion() : this.calculateShoulderRotation(
            shoulder,
            elbow,
            bodyRot.upperBodyRot,
            isRight
        );
        const elbowRot = !elbow || !wrist ? new Quaternion() : this.calculateElbowRotation(
            bodyRot.upperBodyRot,
            elbow,
            wrist,
            isRight
        );
        const wristRot = !wrist || !fingerhand ? new Quaternion() : this.calculateWristRotation(
            wrist,
            fingerhand,
            bodyRot.lowerBodyRot,
            isRight
        )
        return [shoulderRot, elbowRot, wristRot];
    }
    private calculateShoulderRotation(
        shoulder: Vector3,
        elbow: Vector3,
        upperBodyRotation: Quaternion,
        isRight: boolean
    ): Quaternion {
        const armDir = elbow.subtract(shoulder).normalize()
        armDir.y *= -1;
        const upperBodyRotationMatrix = new Matrix()
        Matrix.FromQuaternionToRef(upperBodyRotation, upperBodyRotationMatrix)

        const localArmDir = Vector3.TransformNormal(armDir, upperBodyRotationMatrix.invert())

        const defaultDir = new Vector3(!isRight ? 1 : -1, -1, 0).normalize()

        const rotationQuaternion = Quaternion.FromUnitVectorsToRef(defaultDir, localArmDir, new Quaternion())

        return rotationQuaternion

    }
    private calculateLowerBodyRotation(mainBody: NormalizedLandmark[]): Quaternion {
        const leftHip = this.getKeyPoint(mainBody, "left_hip", "pose");
        const rightHip = this.getKeyPoint(mainBody, "right_hip", "pose");

        if (leftHip && rightHip) {
            const hipDir = leftHip.subtract(rightHip).normalize()
            hipDir.y *= -1
            const defaultDir = new Vector3(1, 0, 0)
            const hipRotation = Quaternion.FromUnitVectorsToRef(defaultDir, hipDir, new Quaternion())
            return hipRotation
        }
        return new Quaternion()
    }
    private updateEyeMovement(faceLandmarks: NormalizedLandmark[]): void {
        const leftEye = this.getKeyPoint(faceLandmarks, "left_eye", "face");
        const rightEye = this.getKeyPoint(faceLandmarks, "right_eye", "face");
        const eyeInner = this.getKeyPoint(faceLandmarks, "eye_inner", "face");
        const eyeOuter = this.getKeyPoint(faceLandmarks, "eye_outer", "face");

        if (leftEye && rightEye && eyeInner && eyeOuter) {
            const eyeMovement = (eye: Vector3, side: "left" | "right") => {
                const pupilCenter = eye.add(new Vector3(0, -0.1, 0)); // Смещение к центру глаза
                const lookAt = eyeInner.add(eyeOuter).scale(0.5);
                const direction = lookAt.subtract(pupilCenter).normalize();

                const rotation = Quaternion.FromEulerAngles(
                    direction.y * CONFIG.EYE_MOVEMENT_SCALE,
                    direction.x * CONFIG.EYE_MOVEMENT_SCALE * (side === "left" ? -1 : 1),
                    0
                );

                this.setRotation(
                    side === "left" ? MMDModelBones.LeftEye : MMDModelBones.RightEye,
                    rotation
                );
            };

            eyeMovement(leftEye, "left");
            eyeMovement(rightEye, "right");
        }
    }
    calculateUpperBodyRotation(mainBody: NormalizedLandmark[]): Quaternion {
        const leftShoulder = this.getKeyPoint(mainBody, "left_shoulder", "pose")
        const rightShoulder = this.getKeyPoint(mainBody, "right_shoulder", "pose")
        if (leftShoulder && rightShoulder) {
            // Calculate spine direction
            const spineDir = leftShoulder.subtract(rightShoulder).normalize()
            spineDir.y *= -1
            const defaultDir = new Vector3(1, 0, 0)

            // Calculate rotation from default to spine direction
            const spineRotation = Quaternion.FromUnitVectorsToRef(defaultDir, spineDir, new Quaternion())

            // Calculate bend
            const shoulderCenter = Vector3.Center(leftShoulder, rightShoulder)
            const hipCenter = new Vector3(0, 0, 0)
            const bendDir = shoulderCenter.subtract(hipCenter).normalize()
            bendDir.y *= -1
            const bendAngle = Math.acos(Vector3.Dot(bendDir, Vector3.Up()))
            const bendAxis = Vector3.Cross(Vector3.Up(), bendDir).normalize()
            const bendRotation = Quaternion.RotationAxis(bendAxis, bendAngle)

            // Combine spine rotation and bend
            return spineRotation.multiply(bendRotation)
        }
        return new Quaternion()
    }
    moveFoot(side: "right" | "left", bodyLand: NormalizedLandmark[], scale: number = 10, yOffset: number = 7) {
        const ankle = this.getKeyPoint(bodyLand, `${side}_ankle`, "pose")
        const hip = this.getKeyPoint(bodyLand, `${side}_hip`, "pose")
        const bone = this.searchBone(`${side === "right" ? "右" : "左"}足ＩＫ`)

        if (ankle && hip && bone) {
            const targetPosition = new Vector3(ankle.x * scale, -ankle.y * scale + yOffset, ankle.z * scale)

            bone.position = Vector3.Lerp(bone.position, targetPosition, this.lerpFactor)
        }
    }
}
class HolisticParser {
    mainBody: NormalizedLandmark[]
    leftFingers: NormalizedLandmark[]
    rightFingers: NormalizedLandmark[]
    faceLandmarks: NormalizedLandmark[]
    constructor(holisticResult: HolisticLandmarkerResult) {
        this.mainBody = holisticResult.poseWorldLandmarks[0];
        this.leftFingers = holisticResult.leftHandWorldLandmarks[0];
        this.rightFingers = holisticResult.rightHandWorldLandmarks[0];
        this.faceLandmarks = holisticResult.faceLandmarks[0];
    }
    static ParseHolistic(holisticResult: HolisticLandmarkerResult): HolisticParser {
        return new HolisticParser(holisticResult);
    }
}