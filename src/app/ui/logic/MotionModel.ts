import { Engine, Matrix, Quaternion, Space, Vector3, VideoRecorder } from "@babylonjs/core";
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
    POSE_SCALE: 15,

    POSE_HISTORY_LENGTH: 5,
    MIN_MOVEMENT_THRESHOLD: 0.01,
    HAND_SCALE: 0.7,
    LERP_FACTOR: 0.3,
    //FINGER_BEND_SCALE: 0.3,
    HEAD_ROTATION_SCALE: 0.7,
    EYE_MOVEMENT_SCALE: 0.05,
    MOUTH_OPEN_SCALE: 3.0,
    BLINK_THRESHOLD: 0.02,
    EYEBROW_RAISE_SCALE: 4.0,
    MOUTH_CORNER_SCALE: 8.0,
    BROW_FURROW_SCALE: 5.0,
    //

    THUMB_TWIST_SCALE: 0.35,
    FINGER_LERP_SPEED: 0.28,
    MIN_FINGER_ANGLE: 0.01,
    MAX_FINGER_ANGLE: Math.PI / 2
};
export type SettingsType = {
    BodyCalculate: boolean,
    LegsCalculate: boolean,
    ArmsCalculate: boolean,
    HeadCalculate: boolean,
    FacialAndEyesCalculate: boolean
}
//abstract class for support all extention models [on dev]
export abstract class MotionAbstractModel<TBones, TModel = any> {
    _Model?: TModel
    _bones?: TBones[] = []
    abstract init(model: TModel): void | any
    abstract motionCalculate(holisticResult: HolisticLandmarkerResult): void | any
}

export class MotionModel {
    public _Recorder?: VideoRecorder
    public _Model?: MmdWasmModel
    public _bones?: IMmdRuntimeLinkedBone[] = []
    constructor(private lerpFactor: number = CONFIG.LERP_FACTOR) { }
    searchBone(name: string) {
        return this._bones?.find((el) => {
            return el.name == name
        });
    }
    init(Model: MmdWasmModel, Engine: Engine) {
        this._Model = Model;
        this._Recorder = new VideoRecorder(Engine)
        this._bones = this._Model.skeleton.bones;
    }

    motionCalculate(holisticResult: HolisticLandmarkerResult, {
        BodyCalculate,
        LegsCalculate,
        FacialAndEyesCalculate,
        ArmsCalculate,
        HeadCalculate,

    }: SettingsType) {
        if (!this._Model) return;
        var { mainBody, leftWorldFingers, rightWorldFingers, faceLandmarks } = new HolisticParser(holisticResult);
        const scale = 10;
        const yOffset = 7;

        var UpperBodyRotation = this.calculateUpperBodyRotation(mainBody);
        var LowerBodyRotation = this.calculateLowerBodyRotation(mainBody);
        const HeadRotation = this.calculateHeadRotation(mainBody, UpperBodyRotation);
        const [leftShoulderRot, leftElbowRot, leftWristRot] = this.calculateArmRotation(
            mainBody,
            leftWorldFingers,
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
            rightWorldFingers,
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
        if (!BodyCalculate) this.moveBody(mainBody);
        this.setRotation(MMDModelBones.LowerBody, LowerBodyRotation);
        this.setRotation(MMDModelBones.UpperBody, UpperBodyRotation);
        if (!ArmsCalculate) {
            this.setRotation(MMDModelBones.RightArm, rightShoulderRot);
            this.setRotation(MMDModelBones.LeftArm, leftShoulderRot);
            this.setRotation(MMDModelBones.RightElbow, rightElbowRot);
            this.setRotation(MMDModelBones.LeftElbow, leftElbowRot);
            this.setRotation(MMDModelBones.RightWrist, rightWristRot);
            this.setRotation(MMDModelBones.LeftWrist, leftWristRot);
        }
        if (!LegsCalculate) {
            this.setRotation(MMDModelBones.LeftHip, lefthipRotation);
            this.setRotation(MMDModelBones.LeftAnkle, leftfootRotation, Space.WORLD);
            this.setRotation(MMDModelBones.RightHip, righthipRotation);
            this.setRotation(MMDModelBones.RightAnkle, rightfootRotation, Space.WORLD);
        }
        if (!HeadCalculate) {
            this.setRotation(MMDModelBones.Head, HeadRotation);
        }
        this.rotateFingers(leftWorldFingers, "left");
        this.rotateFingers(rightWorldFingers, "right")
        if (!FacialAndEyesCalculate) {
            this.updateFacialExpressions(faceLandmarks);
            this.updateEyeMovement(faceLandmarks);
        }
    }
    moveBody(bodyLand: NormalizedLandmark[]): void {
        const leftShoulder = this.getKeyPoint(bodyLand, "left_shoulder", "pose");
        const rightShoulder = this.getKeyPoint(bodyLand, "right_shoulder", "pose");
        const leftHip = this.getKeyPoint(bodyLand, "left_hip", "pose");
        const rightHip = this.getKeyPoint(bodyLand, "right_hip", "pose");
        const rootBone = this.searchBone("センター"); // Кость "センター"
        if (!leftShoulder || !rightShoulder || !leftHip || !rightHip || !rootBone) return;
        const shoulderCenter = Vector3.Center(leftShoulder, rightShoulder);
        const hipCenter = Vector3.Center(leftHip, rightHip);
        const bodyCenter = Vector3.Center(shoulderCenter, hipCenter);
        const leftAnkle = this.getKeyPoint(bodyLand, "left_ankle", "pose");
        const rightAnkle = this.getKeyPoint(bodyLand, "right_ankle", "pose");
        const baseY = bodyCenter.y * 10;
        const avgFootY = (leftAnkle!.y + rightAnkle!.y) * 4;
        const mmdPosition = new Vector3(
            hipCenter.z * 10,
            (baseY + avgFootY) + 2.5,
            hipCenter.z * 10
        );
        rootBone.position = Vector3.Lerp(
            rootBone.position,
            mmdPosition,
            CONFIG.LERP_FACTOR
        );
        this.moveFoot("left", bodyLand);
        this.moveFoot("right", bodyLand);
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
        // Mouth landmarks
        const upperLipTop = get("upper_lip_top");
        const lowerLipBottom = get("lower_lip_bottom");
        const mouthLeft = get("mouth_left");
        const mouthRight = get("mouth_right");
        const upperLipCenter = get("upper_lip_center");
        const lowerLipCenter = get("lower_lip_center");
        const leftCorner = get("left_corner");
        const rightCorner = get("right_corner");
        const calculateMouthShape = (): {
            openness: number;
            width: number;
            smile: number
        } => {
            if (!upperLipTop || !lowerLipBottom || !mouthLeft || !mouthRight ||
                !upperLipCenter || !lowerLipCenter || !leftCorner || !rightCorner) {
                return { openness: 0, width: 0, smile: 0 };
            }

            // Расчет открытости рта
            const mouthHeight = Vector3.Distance(upperLipTop, lowerLipBottom);
            const mouthWidth = Vector3.Distance(mouthLeft, mouthRight);
            const openness = Math.min(Math.max((mouthHeight / mouthWidth - 0.1) / 0.5, 0), 0.7);

            // Расчет ширины рта относительно лица
            const faceWidth = Vector3.Distance(get("left_ear")!, get("right_ear")!);
            const relativeWidth = mouthWidth / faceWidth;
            const width = Math.min(Math.max((relativeWidth - 0.45) / 0.1, -1), 1);

            // Расчет улыбки
            const mouthCenter = Vector3.Center(upperLipCenter, lowerLipCenter);
            const leftLift = Vector3.Distance(leftCorner, mouthCenter);
            const rightLift = Vector3.Distance(rightCorner, mouthCenter);
            const averageLift = (leftLift + rightLift) / 2;
            const smile = Math.min(Math.max((averageLift - mouthWidth * 0.3) / (mouthWidth * 0.2), -1), 1);

            return { openness, width, smile };
        };

        const { openness: mouthOpenness, width: mouthWidth, smile: mouthSmile } = calculateMouthShape();

        // Брови и другие выражения
        const leftBrow = get("left_eye_upper");
        const rightBrow = get("right_eye_upper");
        const browHeight = leftBrow && rightBrow
            ? (leftBrow.y + rightBrow.y) / 2
            : 0.5;

        return {
            // "まばたき": leftBlink,
            // "まばたき右": rightBlink,
            "あ": Math.pow(mouthOpenness, 1.5),
            "い": Math.max(0, -mouthWidth) * 0.7,
            "う": Math.max(0, mouthWidth) * 0.7,
            "お": Math.max(0, mouthOpenness - 0.3) * 1.5,
            "わ": Math.max(0, mouthSmile) * (1 - Math.min(mouthOpenness, 1) * 0.7),
            "にやり": Math.max(0, mouthSmile) * Math.min(mouthOpenness, 1) * 0.8,
            "∧": Math.max(0, -mouthSmile) * 0.5,
            "困る": Math.max(0, browHeight - 0.6) * 2.0,
            "怒り": Math.max(0, 0.5 - browHeight) * 2.0
        };
    }

    endRecordMp4() {
        if (this._Recorder && this._Recorder.isRecording) this._Recorder.stopRecording();

    }
    startRecordMp4(VideoCurrentRef: HTMLVideoElement) {
        VideoCurrentRef.play()
        if (this._Recorder) {
            this._Recorder.startRecording("akira.mp4", 0);
        }

    }
    getKeyPoint(landMark: NormalizedLandmark[] | null, name: string, boneType: BoneType): Vector3 | null {
        if (!landMark || landMark.length == 0) return null;
        switch (boneType) {
            case "face":
                var point = landMark[faceKeypoints[name]]
                const scaleX = 10;
                const scaleY = 10;
                const scaleZ = 5;
                return point ? new Vector3(point.x * scaleX, point.y * scaleY, point.z * scaleZ) : null
            case "hand":

                var point = landMark[handKeypoints[name]]
                return point ? new Vector3(point.x, point.y, point.z) : null
            case "pose":
                var point = landMark[poseKeypoints[name]]
                return point ? new Vector3(point.x, point.y, point.z) : null
            default:
                return null
        }
    }
    getBoneRotation(p1: Vector3, p2: Vector3, p3: Vector3): Quaternion {
        // Создаем векторы между точками
        const v1 = p2.subtract(p1).normalize();
        const v2 = p3.subtract(p2).normalize();
        // Рассчитываем ось вращения
        const rotationAxis = Vector3.Cross(v1, v2).normalize();

        // Рассчитываем угол между векторами
        const cosTheta = Vector3.Dot(v1, v2);
        const angle = Math.acos(Math.min(Math.max(cosTheta, -1), 1));

        // Создаем кватернион поворота
        const rotationQuaternion = Quaternion.RotationAxis(rotationAxis, angle);


        return rotationQuaternion;
    }
    // rotateFingersMMD(hand: NormalizedLandmark[], side: "left" | "right"): void {
    //     if (!hand || hand.length < 21) return;

    //     const fingerNames = ["親指", "人差し指", "中指", "薬指", "小指"];
    //     const fingerJoints = ["", "１", "２", "３"];
    //     const mmdSide = side === "left" ? "左" : "右";

    //     // Соответствие суставов MMD индексам landmarks руки
    //     const fingerBones = [
    //         { // Большой палец
    //             joints: [1, 2, 3, 4],
    //             twistScale: 0.35
    //         },
    //         { // Указательный
    //             joints: [5, 6, 7, 8],
    //             twistScale: 0.15
    //         },
    //         { // Средний
    //             joints: [9, 10, 11, 12],
    //             twistScale: 0.1
    //         },
    //         { // Безымянный
    //             joints: [13, 14, 15, 16],
    //             twistScale: 0.1
    //         },
    //         // { // Мизинец
    //         //     joints: [17, 18, 19, 20],
    //         //     twistScale: 0.15
    //         // }
    //     ];

    //     fingerBones.forEach((finger, fingerIdx) => {
    //         let prevBone: IMmdRuntimeLinkedBone | null = null;

    //         finger.joints.forEach((jointIdx, jointLevel) => {
    //             const boneName = `${mmdSide}${fingerNames[fingerIdx]}${fingerJoints[jointLevel]}`;
    //             const bone = this.searchBone(boneName);
    //             if (!bone) return;
    //             var currentIndex = jointIdx;
    //             var nextIndex = jointIdx +1;

    //             // Получаем точки для текущего и следующего сустава
    //             const currentJoint = new Vector3(
    //                 hand[currentIndex].x,
    //                 hand[currentIndex].y,
    //                 hand[currentIndex].z
    //             );

    //             const nextJoint = new Vector3(
    //                 hand[nextIndex + 1].x,
    //                 hand[nextIndex + 1].y,
    //                 hand[nextIndex + 1].z
    //             );

    //             // Рассчитываем направление
    //             const direction = nextJoint.subtract(currentJoint).normalize();

    //             // Создаем локальную систему координат
    //             const xAxis = new Vector3();
    //             const yAxis = new Vector3();
    //             const zAxis = new Vector3();

    //             if (fingerIdx === 0) { // Особые условия для большого пальца
    //                 const palmCenter = new Vector3(
    //                     hand[0].x,
    //                     hand[0].y,
    //                     hand[0].z
    //                 );
    //                 xAxis.copyFrom(palmCenter.subtract(currentJoint)).normalize();
    //             } else {
    //                 xAxis.copyFrom(direction).normalize();
    //             }

    //             yAxis.copyFrom(direction.cross(xAxis)).normalize();
    //             zAxis.copyFrom(xAxis.cross(yAxis)).normalize();

    //             // Рассчитываем поворот
    //             const targetRotation = Quaternion.RotationQuaternionFromAxis(
    //                 xAxis,
    //                 yAxis,
    //                 zAxis
    //             );

    //             // Применяем ограничения
    //             let finalRotation = targetRotation;
    //             if (jointLevel > 0) {
    //                 const prevRotation = prevBone?.rotationQuaternion || new Quaternion();
    //                 const twist = Quaternion.RotationAxis(
    //                     xAxis,
    //                     direction.y * finger.twistScale
    //                 );

    //                 finalRotation = prevRotation.multiply(twist);

    //                 // Ограничение углов
    //                 const angles = finalRotation.toEulerAngles();
    //                 // angles.x = clamp(angles.x,
    //                 //     -CONFIG.MAX_FINGER_ANGLE,
    //                 //     CONFIG.MAX_FINGER_ANGLE
    //                 // );

    //                 // if (jointLevel > 1) {
    //                 //     angles.y = 0;
    //                 //     angles.z = 0;
    //                 // }

    //                 finalRotation = Quaternion.RotationYawPitchRoll(angles.y, angles.x, angles.z);
    //             }

    //             // Интерполяция и применение поворота
    //             bone.setRotationQuaternion(
    //                 Quaternion.Slerp(
    //                     bone.rotationQuaternion,
    //                     finalRotation,
    //                     .3
    //                 ),
    //                 Space.LOCAL
    //             );

    //             prevBone = bone;
    //         });
    //     });
    // }

    // // Обновленный метод rotateFingers:
    // rotateFingers2(hand: NormalizedLandmark[], side: "left" | "right"): void {
    //     if (!hand) return;
    //     this.rotateFingersMMD(hand, side);
    // }
    rotateFingers(hand: NormalizedLandmark[] | null, side: "left" | "right"): void {
        if (!hand || hand.length === 0) return;

        const fingerNames = ["親指", "人指", "中指", "薬指", "小指"];
        const fingerJoints = ["", "１", "２", "３"];
        const maxAngle = Math.PI / 2.5; // Maximum bend angle for fingers
        const maxEndSegmentAngle = (Math.PI * 2) / 3; // Maximum bend angle for the end segment
        const fingerBaseIndices = [1, 5, 9, 13, 17]; // Base indices for each finger

        fingerNames.forEach((fingerName, fingerIndex) => {
            fingerJoints.forEach((joint, jointIndex) => {
                const boneName = `${side === "left" ? "左" : "右"}${fingerName}${joint}`;
                const bone = this.searchBone(boneName);

                if (bone) {
                    const baseIndex = fingerBaseIndices[fingerIndex];
                    const currentIndex = baseIndex + jointIndex;
                    const nextIndex = baseIndex + jointIndex + 1;

                    let rotationAngle = 0;

                    if (nextIndex < hand.length) {
                        const currentPoint = new Vector3(hand[currentIndex].x, hand[currentIndex].y, hand[currentIndex].z);
                        const nextPoint = new Vector3(hand[nextIndex].x, hand[nextIndex].y, hand[nextIndex].z);

                        const segmentVector = nextPoint.subtract(currentPoint);

                        let defaultVector: Vector3;
                        if (fingerName === "親指") {
                            defaultVector = new Vector3(side === "left" ? -1 : 1, 1, 0); // Thumb default direction
                        } else {
                            defaultVector = new Vector3(0, -1, 0); // Other fingers default direction
                        }

                        rotationAngle = Vector3.GetAngleBetweenVectors(segmentVector, defaultVector, new Vector3(1, 0, 0));

                        const isEndSegment = jointIndex === 3;
                        const currentMaxAngle = isEndSegment ? maxEndSegmentAngle : maxAngle;

                        rotationAngle = Math.min(Math.max(rotationAngle, 0), currentMaxAngle);

                        if (isEndSegment && rotationAngle > maxAngle) {
                            rotationAngle = 0; // Prevent over-bending for the end segment
                        }
                    }

                    let defaultDir: Vector3;

                    if (boneName.includes("親指")) {
                        defaultDir = new Vector3(-1, side === "left" ? -1 : 1, 0).normalize(); // Thumb default direction
                    } else {
                        defaultDir = new Vector3(0, 0, side === "left" ? -1 : 1).normalize(); // Other fingers default direction
                    }

                    const rotation = defaultDir.scale(rotationAngle);

                    bone.setRotationQuaternion(
                        Quaternion.Slerp(
                            bone.rotationQuaternion || new Quaternion(),
                            Quaternion.FromEulerAngles(rotation.x, rotation.y, rotation.z),
                            this.lerpFactor
                        ),
                        Space.LOCAL
                    );
                }
            });
        });
    }


    setRotation(boneName: MMDModelBones, rotation: Quaternion, Space: Space = 0): void {
        if (this._bones) {
            const bone = this._bones.find(b => b.name === boneName);
            if (bone) {
                bone.setRotationQuaternion(Quaternion.Slerp(bone.rotationQuaternion, rotation, this.lerpFactor),
                    Space
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

                const rotation = Quaternion.RotationYawPitchRoll(
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
        const bone = this.searchBone(`${side === "right" ? "右" : "左"}足ＩＫ`)
        if (ankle && bone) {
            const targetPosition = new Vector3(ankle.x * scale, -ankle.y * scale + yOffset, ankle.z * scale)
            bone.position = Vector3.Lerp(bone.position, targetPosition, this.lerpFactor)
        }

    }
}
class HolisticParser {
    mainBody: NormalizedLandmark[]
    leftWorldFingers: NormalizedLandmark[]
    rightWorldFingers: NormalizedLandmark[]

    faceLandmarks: NormalizedLandmark[]
    constructor(holisticResult: HolisticLandmarkerResult) {
        this.mainBody = holisticResult.poseWorldLandmarks[0];
        this.leftWorldFingers = holisticResult.leftHandWorldLandmarks[0];
        this.rightWorldFingers = holisticResult.rightHandWorldLandmarks[0];
        this.faceLandmarks = holisticResult.faceLandmarks[0];
    }
    static ParseHolistic(holisticResult: HolisticLandmarkerResult): HolisticParser {
        return new HolisticParser(holisticResult);
    }
}