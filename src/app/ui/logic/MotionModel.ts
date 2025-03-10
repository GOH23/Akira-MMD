import { Engine, Matrix, Quaternion, Space, Vector3, VideoRecorder } from "@babylonjs/core";
import { HolisticLandmarkerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { MmdWasmModel } from "babylon-mmd";
import { IMmdRuntimeLinkedBone } from "babylon-mmd/esm/Runtime/IMmdRuntimeLinkedBone";
import { faceKeypoints, handKeypoints, poseKeypoints } from "./MotionTypes";
import { KalmanVectorFilter, OneEuroVectorFilter } from "./Filters";

export type BoneType = "hand" | "pose" | "face"
// Константы для имен костей
export enum MMDModelBones {
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
    RightKnee = "右ひざ",
    LeftKnee = "左ひざ",
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

export type MotionSettingsType = {
    BodyCalculate: boolean,
    LegsCalculate: boolean,
    ArmsCalculate: boolean,
    HeadCalculate: boolean,
    FacialAndEyesCalculate: boolean
}
export type SETTINGS_CONFIGType = {
    POSE_Y_SCALE: number
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
    public CONFIG = {
        POSE_SCALE: 15,
        LERP_FACTOR: 0.3,
        EYE_MOVEMENT_SCALE: 0.05,
        POSE_SETTINGS_SCALE: 1.5
    };
    public SETTINGS_CONFIG = {
        POSE_Y_SCALE: 0
    }
    public MotionSettings: MotionSettingsType = {
        BodyCalculate: true,
        LegsCalculate: true,
        ArmsCalculate: true,
        HeadCalculate: true,
        FacialAndEyesCalculate: true
    }
    public setSettings(setting: MotionSettingsType) {
        this.MotionSettings = setting;
    }
    constructor(private lerpFactor: number = 0.3) { }

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

    motionCalculate(holisticResult: HolisticLandmarkerResult) {
        if (!this._Model) return;
        var { mainBody, poseLandmarks, leftWorldFingers, rightWorldFingers, faceLandmarks } = new HolisticParser(holisticResult);
        // console.log(`left hip: ${poseLandmarks[23].x} right hip: ${poseLandmarks[24].x}`)
        // console.log(`left hip 3: ${mainBody[23].x} right hip 3: ${mainBody[24].x}`)
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
        if (this.MotionSettings.BodyCalculate) {
            this.moveBody(mainBody);
            this.setRotation(MMDModelBones.LowerBody, LowerBodyRotation);
            this.setRotation(MMDModelBones.UpperBody, UpperBodyRotation);
        }

        if (this.MotionSettings.ArmsCalculate) {
            //right
            this.setRotation(MMDModelBones.RightArm, rightShoulderRot);
            this.setRotation(MMDModelBones.LeftArm, leftShoulderRot);
            this.setRotation(MMDModelBones.RightElbow, rightElbowRot);
            //left
            this.setRotation(MMDModelBones.LeftElbow, leftElbowRot);
            this.setRotation(MMDModelBones.RightWrist, rightWristRot);
            this.setRotation(MMDModelBones.LeftWrist, leftWristRot);
        }
        if (this.MotionSettings.LegsCalculate) {
            this.setRotation(MMDModelBones.LeftHip, lefthipRotation);
            this.setRotation(MMDModelBones.LeftAnkle, leftfootRotation, Space.WORLD);
            this.setRotation(MMDModelBones.RightHip, righthipRotation);
            this.setRotation(MMDModelBones.RightAnkle, rightfootRotation, Space.WORLD);
            this.moveFoot("left", mainBody);
            this.moveFoot("right", mainBody);
        }
        if (this.MotionSettings.HeadCalculate) {
            this.setRotation(MMDModelBones.Head, HeadRotation);
        }
        if (this.MotionSettings.FacialAndEyesCalculate) {
            this.updateFacialExpressions(faceLandmarks);
            this.updateEyeMovement(faceLandmarks);
        }

        this.rotateFingers(leftWorldFingers, "left");
        this.rotateFingers(rightWorldFingers, "right")
    }
    moveBody(bodyLand: NormalizedLandmark[]): void {
        const leftShoulder = this.getKeyPoint(bodyLand, "left_shoulder", "pose");
        const rightShoulder = this.getKeyPoint(bodyLand, "right_shoulder", "pose");
        const leftHip = this.getKeyPoint(bodyLand, "left_hip", "pose");
        const rightHip = this.getKeyPoint(bodyLand, "right_hip", "pose");
        const rootBone = this.searchBone("全ての親"); // Кость "センター"
        // co 
        if (!leftShoulder || !rightShoulder || !leftHip || !rightHip || !rootBone) return;
        const shoulderCenter = Vector3.Center(leftShoulder, rightShoulder);
        const hipCenter = Vector3.Center(leftHip, rightHip);
        const bodyCenter = Vector3.Center(shoulderCenter, hipCenter);
        const leftAnkle = this.getKeyPoint(bodyLand, "left_ankle", "pose");
        const rightAnkle = this.getKeyPoint(bodyLand, "right_ankle", "pose");
        const baseY = bodyCenter.y * this.CONFIG.POSE_SCALE;
        const avgFootY = (leftAnkle!.y + rightAnkle!.y);

        const mmdPosition = new Vector3(
            bodyCenter.x * this.CONFIG.POSE_SCALE, // Fixed X-axis scaling
            (baseY + avgFootY) + 1.5 + this.SETTINGS_CONFIG.POSE_Y_SCALE,
            bodyCenter.z * this.CONFIG.POSE_SCALE
        );
        rootBone.position = Vector3.Lerp(
            rootBone.position,
            mmdPosition,
            this.CONFIG.LERP_FACTOR
        );

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
                            defaultVector = new Vector3(side === "left" ? -1 : 1, -1, 0); // Other fingers default direction
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
        const filteredHip = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.5, 0.1).next(Date.now(), hip!);
        const filteredKnee = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.5, 0.1).next(Date.now(), knee!);
        const filteredAnkle = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.5, 0.1).next(Date.now(), ankle!);
        const hipRotation = !hip || !knee ? Quaternion.Identity() : this.calculateHipRotation(lowerBodyRot, filteredHip, filteredKnee);
        const footRotation = !hip || !ankle ? Quaternion.Identity() : this.calculateFootRotation(filteredHip, filteredAnkle, hipRotation);
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
        var armFilter = new KalmanVectorFilter(0.1, 3);

        const filteredShoulder = armFilter.next(Date.now(), shoulder!);
        const filteredElbow = armFilter.next(Date.now(), elbow!);
        const filteredWrist = armFilter.next(Date.now(), wrist!);
        const shoulderRot = !shoulder || !elbow ? new Quaternion() : this.calculateShoulderRotation(
            filteredShoulder,
            filteredElbow,
            bodyRot.upperBodyRot,
            isRight
        );
        const elbowRot = !elbow || !wrist ? new Quaternion() : this.calculateElbowRotation(
            bodyRot.upperBodyRot,
            filteredElbow,
            filteredWrist,
            isRight
        );
        const wristRot = !wrist || !fingerhand ? new Quaternion() : this.calculateWristRotation(
            filteredWrist,
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
        const leftVec = this.getKeyPoint(mainBody, "left_hip", "pose");
        const rightVec = this.getKeyPoint(mainBody, "right_hip", "pose");
        const leftHip = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.5, 0.1).next(Date.now(), leftVec!)
        const rightHip = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.5, 0.1).next(Date.now(), rightVec!)
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
                    direction.y * this.CONFIG.EYE_MOVEMENT_SCALE,
                    direction.x * this.CONFIG.EYE_MOVEMENT_SCALE * (side === "left" ? -1 : 1),
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
            const filteredLeft = new KalmanVectorFilter(0.1, 3).next(Date.now(), leftShoulder!);
            const filteredRight = new KalmanVectorFilter(0.1, 3).next(Date.now(), rightShoulder!);
            const spineDir = filteredLeft.subtract(filteredRight).normalize()
            spineDir.y *= -1
            const defaultDir = new Vector3(1, 0, 0)

            // Calculate rotation from default to spine direction
            const spineRotation = Quaternion.FromUnitVectorsToRef(defaultDir, spineDir, new Quaternion())

            // Calculate bend
            const shoulderCenter = Vector3.Center(filteredLeft, filteredRight)
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
    moveFoot(side: "right" | "left", bodyLand: NormalizedLandmark[], scale: number = this.CONFIG.POSE_SCALE, yOffset: number = 7) {
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
    poseLandmarks: NormalizedLandmark[]
    faceLandmarks: NormalizedLandmark[]
    constructor(holisticResult: HolisticLandmarkerResult) {
        this.mainBody = holisticResult.poseWorldLandmarks[0];
        this.poseLandmarks = holisticResult.poseLandmarks[0];
        this.leftWorldFingers = holisticResult.leftHandWorldLandmarks[0];
        this.rightWorldFingers = holisticResult.rightHandWorldLandmarks[0];
        this.faceLandmarks = holisticResult.faceLandmarks[0];
    }
    static ParseHolistic(holisticResult: HolisticLandmarkerResult): HolisticParser {
        return new HolisticParser(holisticResult);
    }
}