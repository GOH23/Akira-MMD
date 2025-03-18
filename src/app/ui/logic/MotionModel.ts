import { Engine, Matrix, Quaternion, Space, Vector3, VideoRecorder } from "@babylonjs/core";
import { HolisticLandmarkerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { MmdWasmModel, MmdWasmMorphController, ReadonlyRuntimeMorph } from "babylon-mmd";
import { IMmdRuntimeLinkedBone } from "babylon-mmd/esm/Runtime/IMmdRuntimeLinkedBone";
import { faceKeypoints, handKeypoints, poseKeypoints } from "./MotionTypes";
import { KalmanVectorFilter, OneEuroVectorFilter } from "./Filters";
import * as Kalidokit from 'kalidokit'
import Encoding from "encoding-japanese"
import { clamp } from "kalidokit/dist/utils/helpers";
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
    RootBone = "全ての親",
    LeftEye = "左目",
    RightEye = "右目",
    Eyebrows = "眉",
    Mouth = "口"
}
export type KeyFrameType = {
    keyNum: number;
    keyData: {
        boneName: string;
        position: Float32Array;
        quanternion: Float32Array;
    }[];
    morphData: {
      name: string,
      weight: number  
    }[]
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
const HUMAN_LIMITS = {
    HIP_X: [-0.5, 0.5],       // Вращение бедра вперед/назад
    HIP_Y: [-0.3, 0.3],       // Отведение бедра в сторону
    HIP_Z: [-0.4, 0.4],       // Вращение бедра внутрь/наружу
    KNEE_Y: [0, 2.0]          // Сгибание колена
};
export class MotionModel {
    public _Recorder?: VideoRecorder
    public _Model?: MmdWasmModel
    public boneMap: Map<string, IMmdRuntimeLinkedBone> = new Map();
    public keyframes: KeyFrameType[] = []
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

    searchBone(name: string | MMDModelBones) {
        return this.boneMap.get(name);
    }
    init(Model: MmdWasmModel, Engine: Engine) {
        this._Model = Model;
        this._Recorder = new VideoRecorder(Engine)
        this._Model.skeleton.bones.forEach((el) => {
            this.boneMap.set(el.name, el);
        })
    }

    // Метод для загрузки и воспроизведения VMD файла
    async loadAndPlayVmdAnimation(vmdBlob: Blob): Promise<boolean> {
        if (!this._Model) {
            console.error("Модель не инициализирована");
            return false;
        }

        try {
            // Создаем URL из Blob
            const vmdUrl = URL.createObjectURL(vmdBlob);

            // Загружаем анимацию через API babylon-mmd
            // Используем приведение типов для доступа к свойствам, которые могут отсутствовать в типе
            const mmdModel = this._Model as any;
            if (mmdModel.runtime && mmdModel.runtime.vmdLoader) {
                // Сбрасываем предыдущую анимацию
                if (mmdModel.animation) {
                    mmdModel.animation.stop();
                }

                // Загружаем новую анимацию из VMD
                const motion = await mmdModel.runtime.vmdLoader.loadAsync("motion", vmdUrl);

                // Добавляем и запускаем анимацию
                mmdModel.addAnimation(motion);
                mmdModel.setAnimation("motion");
                mmdModel.play();

                // Освобождаем URL
                URL.revokeObjectURL(vmdUrl);

                return true;
            }

            // Освобождаем URL в случае ошибки
            URL.revokeObjectURL(vmdUrl);
            return false;
        } catch (error) {
            console.error("Ошибка при загрузке VMD анимации:", error);
            return false;
        }
    }

    setRotation(boneName: MMDModelBones, rotation: Quaternion, Space: Space = 0): void {
        if (this.boneMap.size > 0) {
            const bone = this.boneMap.get(boneName);
            if (bone) {
                bone.setRotationQuaternion(Quaternion.Slerp(bone.rotationQuaternion, rotation, this.lerpFactor),
                    Space
                )
            }
        }
    }
    motionCalculate(holisticResult: HolisticLandmarkerResult) {
        if (!this._Model) return;
        var { mainBody, poseLandmarks, leftWorldFingers, rightWorldFingers, faceLandmarks } = new HolisticParser(holisticResult);
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
            this.moveBody(poseLandmarks);
            this.setRotation(MMDModelBones.LowerBody, LowerBodyRotation);
            this.setRotation(MMDModelBones.UpperBody, UpperBodyRotation);
        }

        if (this.MotionSettings.ArmsCalculate) {
            this.setRotation(MMDModelBones.RightArm, rightShoulderRot);
            this.setRotation(MMDModelBones.LeftArm, leftShoulderRot);
            this.setRotation(MMDModelBones.RightElbow, rightElbowRot);
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
        this.rotateFingers(rightWorldFingers, "right");
        //set keyframes
        this.keyframes.push({
            keyNum: this.keyframes.length + 1,
            keyData: this.get_keyframe_data(),
            morphData: this.get_morph_data()
        })

    }
    get_keyframe_data() {
        var res: typeof this.keyframes[0]["keyData"] = []
        this.boneMap.forEach((el) => {
            res.push({
                boneName: el.name,
                position: new Float32Array([el.position.x, el.position.y, el.position.z]),
                quanternion: new Float32Array([el.rotationQuaternion.x, el.rotationQuaternion.y, el.rotationQuaternion.z, el.rotationQuaternion.w])
            })
        })
        return res;
    }
    get_morph_data() {
        if (!this._Model) return []
        return [
            ...this._Model.morph.morphs.map((el) => {
                return { name: el.name, weight: this._Model!.morph.getMorphWeight(el.name) }
            })
        ]
    }
    moveBody(bodyLand: NormalizedLandmark[]): void {
        const hipLeft3D = this.getKeyPoint(bodyLand, "left_hip", "pose");
        const hipRight3D = this.getKeyPoint(bodyLand, "right_hip", "pose");
        const shoulderLeft3D = this.getKeyPoint(bodyLand, "left_shoulder", "pose");
        const shoulderRight3D = this.getKeyPoint(bodyLand, "right_shoulder", "pose");

        if (!hipLeft3D || !hipRight3D || !shoulderLeft3D || !shoulderRight3D) return;

        // Применяем фильтрацию для сглаживания движений
        const hipLeftFiltered = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.5, 0.1).next(Date.now(), hipLeft3D);
        const hipRightFiltered = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.5, 0.1).next(Date.now(), hipRight3D);
        const shoulderLeftFiltered = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.5, 0.1).next(Date.now(), shoulderLeft3D);
        const shoulderRightFiltered = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.5, 0.1).next(Date.now(), shoulderRight3D);

        const hipCenter3D = Vector3.Center(
            hipLeftFiltered,
            hipRightFiltered
        );
        const shoulderCenter3D = Vector3.Center(
            shoulderLeftFiltered,
            shoulderRightFiltered
        );
        const spineLength = Vector3.Distance(hipCenter3D, shoulderCenter3D);
        const spineLengthNormalized = Kalidokit.Utils.clamp(spineLength - 1, -2, 0);
        const dampingFactor = 0.7; // Коэффициент демпфирования для горизонтальных движений
        const hipsWorldPosition = {
            x: Kalidokit.Utils.clamp(hipCenter3D.x - 0.4, -1, 1) * dampingFactor,
            y: 0,
            z: spineLengthNormalized * Math.pow(spineLengthNormalized * -2, 2)
        };
        hipsWorldPosition.x *= hipsWorldPosition.z;
        const rootBone = this.searchBone(MMDModelBones.RootBone);
        if (!rootBone) return;
        const stableYPosition = (hipCenter3D.y) + this.SETTINGS_CONFIG.POSE_Y_SCALE;
        const mmdPosition = new Vector3(
            -hipsWorldPosition.x * 25,
            stableYPosition,
            hipsWorldPosition.z * 0.8 // Уменьшаем движение по Z
        );
        const smoothingFactor = Math.min(this.CONFIG.LERP_FACTOR, 0.2);
        rootBone.position = Vector3.Lerp(
            rootBone.position,
            mmdPosition,
            smoothingFactor
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
        const leftEyeUpper = get("left_eye_upper");
        const leftEyeLower = get("left_eye_lower");
        const rightEyeUpper = get("right_eye_upper");
        const rightEyeLower = get("right_eye_lower");

        const calculateEyeBlink = (): { leftBlink: number, rightBlink: number } => {
            if (!leftEyeUpper || !leftEyeLower || !rightEyeUpper || !rightEyeLower) {
                return { leftBlink: 0, rightBlink: 0 };
            }

            const leftEyeDistance = Vector3.Distance(leftEyeUpper, leftEyeLower);
            const rightEyeDistance = Vector3.Distance(rightEyeUpper, rightEyeLower);
            const baseThreshold = 0.08;
            const leftBlink = Math.min(Math.max(1 - (leftEyeDistance - baseThreshold) * 8, 0), 1);
            const rightBlink = Math.min(Math.max(1 - (rightEyeDistance - baseThreshold) * 8, 0), 1);

            return { leftBlink, rightBlink };
        };

        const { leftBlink, rightBlink } = calculateEyeBlink();

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
            "まばたき": leftBlink,
            "まばたき右": rightBlink,
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

        if (!hip || !knee || !ankle) {
            return [Quaternion.Identity(), Quaternion.Identity()];
        }

        // Улучшенная фильтрация с адаптивными параметрами
        const hipFilter = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.7, 0.15);
        const kneeFilter = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.7, 0.15);
        const ankleFilter = new OneEuroVectorFilter(0, Vector3.Zero(), Vector3.Zero(), 0.7, 0.15);

        const filteredHip = hipFilter.next(Date.now(), hip);
        const filteredKnee = kneeFilter.next(Date.now(), knee);
        const filteredAnkle = ankleFilter.next(Date.now(), ankle);
        const hipRotation = this.calculateHipRotation(lowerBodyRot, filteredHip, filteredKnee);
        const footRotation = this.calculateFootRotation(filteredHip, filteredAnkle, hipRotation);

        return [hipRotation, footRotation];
    }

    private calculateHipRotation(
        lowerBodyRot: Quaternion,
        hip: Vector3,
        knee: Vector3
    ): Quaternion {
        // Направление ноги
        const legDir = knee.subtract(hip).normalize();
        legDir.y *= -1;

        // Преобразование в локальные координаты
        const lowerBodyRotationMatrix = new Matrix();
        Matrix.FromQuaternionToRef(lowerBodyRot, lowerBodyRotationMatrix);
        const localLegDir = Vector3.TransformNormal(legDir, lowerBodyRotationMatrix.invert());
        // Вычисление углов Эйлера
        const angles = new Vector3();
        // Угол сгибания бедра вперед/назад (X)
        angles.x = Vector3.GetAngleBetweenVectors(
            new Vector3(localLegDir.x, 0, localLegDir.z),
            new Vector3(0, 0, 1),
            Vector3.Up()
        );
        angles.x = clamp(angles.x, HUMAN_LIMITS.HIP_X[0], HUMAN_LIMITS.HIP_X[1]);

        // Угол отведения бедра в сторону (Y)
        angles.y = Math.atan2(localLegDir.x, localLegDir.z);
        angles.y = clamp(angles.y, HUMAN_LIMITS.HIP_Y[0], HUMAN_LIMITS.HIP_Y[1]);

        // Угол вращения бедра внутрь/наружу (Z)
        angles.z = Math.atan2(localLegDir.y, Math.sqrt(localLegDir.x * localLegDir.x + localLegDir.z * localLegDir.z));
        angles.z = clamp(angles.z, HUMAN_LIMITS.HIP_Z[0], HUMAN_LIMITS.HIP_Z[1]);

        // Создание кватерниона из углов Эйлера
        return Quaternion.RotationYawPitchRoll(angles.y, angles.x, angles.z);
    }

    private calculateFootRotation(
        hip: Vector3,
        ankle: Vector3,
        hipRotation: Quaternion
    ): Quaternion {
        const footDir = ankle.subtract(hip).normalize();
        footDir.y *= -1;
        const hipRotationMatrix = new Matrix();
        Matrix.FromQuaternionToRef(hipRotation, hipRotationMatrix);
        const localFootDir = Vector3.TransformNormal(footDir, hipRotationMatrix.invert());
        const defaultDir = new Vector3(0, 0, 1);
        const angles = new Vector3();
        angles.y = Vector3.GetAngleBetweenVectors(
            new Vector3(localFootDir.x, 0, localFootDir.z),
            defaultDir,
            Vector3.Up()
        );
        angles.y = clamp(angles.y, HUMAN_LIMITS.KNEE_Y[0], HUMAN_LIMITS.KNEE_Y[1]);
        return Quaternion.RotationYawPitchRoll(0, angles.y, 0);
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
        const fingerhand = this.getKeyPoint(handKeypoints, "thumb_mcp", "hand");
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
        const leftEyeIris = this.getKeyPoint(faceLandmarks, "left_eye_iris", "face");
        const rightEyeIris = this.getKeyPoint(faceLandmarks, "right_eye_iris", "face");
        const leftEyeCenter = this.getKeyPoint(faceLandmarks, "left_eye", "face");
        const rightEyeCenter = this.getKeyPoint(faceLandmarks, "right_eye", "face");

        if (!leftEyeIris || !rightEyeIris || !leftEyeCenter || !rightEyeCenter) return;

        // Обработка левого глаза
        const leftDirection = leftEyeIris.subtract(leftEyeCenter).normalize();
        const leftRotation = Quaternion.RotationYawPitchRoll(
            leftDirection.x * 0.5,
            leftDirection.y * 0.5,
            0
        );
        this.setRotation(MMDModelBones.LeftEye, leftRotation);

        // Обработка правого глаза
        const rightDirection = rightEyeIris.subtract(rightEyeCenter).normalize();
        const rightRotation = Quaternion.RotationYawPitchRoll(
            rightDirection.x * 0.5,
            rightDirection.y * 0.5,
            0
        );
        this.setRotation(MMDModelBones.RightEye, rightRotation);
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
    moveFoot(side: "right" | "left", bodyLand: NormalizedLandmark[], scale: number = 10, yOffset: number = 7) {
        const ankle = this.getKeyPoint(bodyLand, `${side}_ankle`, "pose")
        const bone = this.searchBone(`${side === "right" ? "右" : "左"}足ＩＫ`)
        if (ankle && bone) {
            const targetPosition = new Vector3(ankle.x * scale, -ankle.y * scale + yOffset, ankle.z * scale)
            bone.position = Vector3.Lerp(bone.position, targetPosition, this.lerpFactor)
        }

    }

    exportToGLTF(fileName: string = "akira_animation.gltf"): Blob {
        if (!this._Model || this.keyframes.length === 0) {
            throw new Error("Модель не инициализирована или нет кадров анимации");
        }

        // Подготовка данных для буферов
        const buffers: { data: Uint8Array, byteOffset: number }[] = [];
        let totalBufferSize = 0;

        // Вспомогательная функция для добавления данных в буфер с выравниванием по 4 байта
        const addToBuffer = (data: Uint8Array): number => {
            const byteOffset = totalBufferSize;

            // Добавляем данные
            buffers.push({ data, byteOffset });
            totalBufferSize += data.byteLength;

            // Выравнивание по 4 байта
            const padding = (4 - (totalBufferSize % 4)) % 4;
            if (padding > 0) {
                buffers.push({ data: new Uint8Array(padding), byteOffset: totalBufferSize });
                totalBufferSize += padding;
            }

            return byteOffset;
        };

        // Создаем базовую структуру glTF
        const gltf: any = {
            asset: {
                version: "2.0",
                generator: "Akira Motion Exporter",
                copyright: "Akira Motion Capture"
            },
            scene: 0,
            scenes: [{
                nodes: [0]
            }],
            nodes: [{
                name: "AkiraRoot",
                children: [1]
            }],
            meshes: [],
            animations: [],
            skins: [],
            accessors: [],
            bufferViews: [],
            buffers: [{
                byteLength: 0,
                uri: "data:application/octet-stream;base64,"
            }],
            materials: [{
                name: "BoneMaterial",
                pbrMetallicRoughness: {
                    baseColorFactor: [1.0, 0.0, 0.0, 1.0],
                    metallicFactor: 0.0,
                    roughnessFactor: 1.0
                }
            }]
        };

        // Находим корневую кость
        const rootBone = this.searchBone(MMDModelBones.RootBone);
        if (!rootBone) {
            throw new Error("Корневая кость не найдена");
        }

        // Создаем корневой узел скелета
        gltf.nodes.push({
            name: MMDModelBones.RootBone,
            translation: [rootBone.position.x, rootBone.position.y, rootBone.position.z],
            rotation: [
                rootBone.rotationQuaternion.x,
                rootBone.rotationQuaternion.y,
                rootBone.rotationQuaternion.z,
                rootBone.rotationQuaternion.w
            ],
            children: []
        });

        // Карта для отслеживания индексов узлов по имени кости
        const nodeIndices = new Map<string, number>();
        nodeIndices.set(MMDModelBones.RootBone, 1); // Индекс корневой кости

        // Иерархия костей для MMD модели
        const boneHierarchy: Record<string, string[]> = {
            [MMDModelBones.RootBone]: [MMDModelBones.LowerBody, MMDModelBones.LeftFootIK, MMDModelBones.RightFootIK],
            [MMDModelBones.LowerBody]: [MMDModelBones.UpperBody, MMDModelBones.LeftHip, MMDModelBones.RightHip],
            [MMDModelBones.UpperBody]: [MMDModelBones.Neck, MMDModelBones.LeftArm, MMDModelBones.RightArm],
            [MMDModelBones.Neck]: [MMDModelBones.Head],
            [MMDModelBones.Head]: [MMDModelBones.LeftEye, MMDModelBones.RightEye],
            [MMDModelBones.LeftArm]: [MMDModelBones.LeftElbow],
            [MMDModelBones.RightArm]: [MMDModelBones.RightElbow],
            [MMDModelBones.LeftElbow]: [MMDModelBones.LeftWrist],
            [MMDModelBones.RightElbow]: [MMDModelBones.RightWrist],
            [MMDModelBones.LeftHip]: [MMDModelBones.LeftKnee],
            [MMDModelBones.RightHip]: [MMDModelBones.RightKnee],
            [MMDModelBones.LeftKnee]: [MMDModelBones.LeftAnkle],
            [MMDModelBones.RightKnee]: [MMDModelBones.RightAnkle]
        };

        // Рекурсивная функция для добавления костей в иерархию
        const addBoneNodes = (parentBoneName: string) => {
            const childBones = boneHierarchy[parentBoneName] || [];
            const parentNodeIndex = nodeIndices.get(parentBoneName)!;
            const childIndices: number[] = [];

            for (const childBoneName of childBones) {
                const bone = this.searchBone(childBoneName);
                if (!bone) continue;

                // Создаем узел для кости
                const nodeIndex = gltf.nodes.length;
                nodeIndices.set(childBoneName, nodeIndex);
                childIndices.push(nodeIndex);

                gltf.nodes.push({
                    name: childBoneName,
                    translation: [bone.position.x, bone.position.y, bone.position.z],
                    rotation: [
                        bone.rotationQuaternion.x,
                        bone.rotationQuaternion.y,
                        bone.rotationQuaternion.z,
                        bone.rotationQuaternion.w
                    ],
                    children: []
                });

                // Рекурсивно добавляем дочерние кости
                addBoneNodes(childBoneName);
            }

            // Добавляем индексы дочерних костей к родительской кости
            if (childIndices.length > 0) {
                gltf.nodes[parentNodeIndex].children = childIndices;
            }
        };

        // Добавляем все кости, начиная с корневой
        addBoneNodes(MMDModelBones.RootBone);

        // Добавляем кости пальцев
        const fingerBonePatterns = [
            { parent: MMDModelBones.LeftWrist, pattern: "左親指" },
            { parent: MMDModelBones.LeftWrist, pattern: "左人指" },
            { parent: MMDModelBones.LeftWrist, pattern: "左中指" },
            { parent: MMDModelBones.LeftWrist, pattern: "左薬指" },
            { parent: MMDModelBones.LeftWrist, pattern: "左小指" },
            { parent: MMDModelBones.RightWrist, pattern: "右親指" },
            { parent: MMDModelBones.RightWrist, pattern: "右人指" },
            { parent: MMDModelBones.RightWrist, pattern: "右中指" },
            { parent: MMDModelBones.RightWrist, pattern: "右薬指" },
            { parent: MMDModelBones.RightWrist, pattern: "右小指" }
        ];

        for (const { parent, pattern } of fingerBonePatterns) {
            if (!nodeIndices.has(parent)) continue;

            const parentNodeIndex = nodeIndices.get(parent)!;
            const fingerBones = Array.from(this.boneMap.entries())
                .filter(([name]) => name.startsWith(pattern))
                .sort((a, b) => {
                    // Сортировка по иерархии суставов пальцев (от основания к кончику)
                    const aHasJoint1 = a[0].includes("１");
                    const aHasJoint2 = a[0].includes("２");
                    const aHasJoint3 = a[0].includes("３");
                    const bHasJoint1 = b[0].includes("１");
                    const bHasJoint2 = b[0].includes("２");
                    const bHasJoint3 = b[0].includes("３");

                    if (!aHasJoint1 && !aHasJoint2 && !aHasJoint3) return -1;
                    if (!bHasJoint1 && !bHasJoint2 && !bHasJoint3) return 1;
                    if (aHasJoint1 && !bHasJoint1) return 1;
                    if (!aHasJoint1 && bHasJoint1) return -1;
                    if (aHasJoint2 && !bHasJoint2) return 1;
                    if (!aHasJoint2 && bHasJoint2) return -1;
                    if (aHasJoint3 && !bHasJoint3) return 1;
                    if (!aHasJoint3 && bHasJoint3) return -1;
                    return 0;
                });

            if (fingerBones.length === 0) continue;

            let previousNodeIndex = parentNodeIndex;
            for (const [name, bone] of fingerBones) {
                const nodeIndex = gltf.nodes.length;
                nodeIndices.set(name, nodeIndex);

                gltf.nodes.push({
                    name: name,
                    translation: [bone.position.x, bone.position.y, bone.position.z],
                    rotation: [
                        bone.rotationQuaternion.x,
                        bone.rotationQuaternion.y,
                        bone.rotationQuaternion.z,
                        bone.rotationQuaternion.w
                    ]
                });

                // Добавляем кость как дочернюю к предыдущей кости
                if (!gltf.nodes[previousNodeIndex].children) {
                    gltf.nodes[previousNodeIndex].children = [];
                }
                gltf.nodes[previousNodeIndex].children.push(nodeIndex);

                previousNodeIndex = nodeIndex;
            }
        }

        // Создаем скин для скелетной анимации
        const joints: number[] = [];
        const jointNames: string[] = [];

        // Собираем все узлы скелета
        for (const [boneName, nodeIndex] of nodeIndices.entries()) {
            joints.push(nodeIndex);
            jointNames.push(boneName);
        }

        // Создаем инверсные матрицы привязки
        const inverseBindMatricesData = new Float32Array(joints.length * 16);

        // Заполняем единичными матрицами (для простоты)
        for (let i = 0; i < joints.length; i++) {
            const offset = i * 16;
            inverseBindMatricesData[offset + 0] = 1;
            inverseBindMatricesData[offset + 5] = 1;
            inverseBindMatricesData[offset + 10] = 1;
            inverseBindMatricesData[offset + 15] = 1;
        }

        // Добавляем данные инверсных матриц в буфер
        const inverseBindMatricesBufferOffset = addToBuffer(new Uint8Array(inverseBindMatricesData.buffer));

        // Создаем буферный вид и аксессор для инверсных матриц
        const inverseBindMatricesBufferViewIndex = gltf.bufferViews.length;
        gltf.bufferViews.push({
            buffer: 0,
            byteOffset: inverseBindMatricesBufferOffset,
            byteLength: inverseBindMatricesData.byteLength
        });

        const inverseBindMatricesAccessorIndex = gltf.accessors.length;
        gltf.accessors.push({
            bufferView: inverseBindMatricesBufferViewIndex,
            componentType: 5126, // FLOAT
            count: joints.length,
            type: "MAT4"
        });

        // Создаем скин
        const skinIndex = gltf.skins ? gltf.skins.length : 0;
        if (!gltf.skins) gltf.skins = [];

        gltf.skins.push({
            inverseBindMatrices: inverseBindMatricesAccessorIndex,
            joints: joints,
            name: "AkiraSkeleton"
        });

        // Создаем простые меши для визуализации костей
        for (let nodeIndex = 1; nodeIndex < gltf.nodes.length; nodeIndex++) {
            const meshIndex = gltf.meshes.length;
            const nodeName = gltf.nodes[nodeIndex].name;

            // Находим родительский узел
            let parentNodeIndex = -1;
            for (let i = 0; i < gltf.nodes.length; i++) {
                if (gltf.nodes[i].children && gltf.nodes[i].children.includes(nodeIndex)) {
                    parentNodeIndex = i;
                    break;
                }
            }

            if (parentNodeIndex !== -1) {
                // Создаем меш для линии между родительской и текущей костью
                const parentPosition = gltf.nodes[parentNodeIndex].translation || [0, 0, 0];
                const currentPosition = gltf.nodes[nodeIndex].translation || [0, 0, 0];

                // Увеличиваем масштаб для пальцев, чтобы они были дальше от тела
                let scaleFactor = 1.0;
                let isExtremity = false;

                // Проверяем, является ли это частью конечности, которую нужно отдалить от тела
                if (nodeName.includes("指") || nodeName.includes("親指")) {
                    // Это кость пальца
                    scaleFactor = 10.0; // Увеличено с 5.0 до 10.0
                    isExtremity = true;

                    // Корректируем позицию пальца относительно родительской кости
                    if (parentNodeIndex !== -1) {
                        const parentName = gltf.nodes[parentNodeIndex].name;
                        if (parentName === MMDModelBones.LeftWrist || parentName === MMDModelBones.RightWrist) {
                            // Для пальцев, прикрепленных к запястью, увеличиваем отступ
                            const wristDir = nodeName.startsWith("左") ? [-1, 0, 0] : [1, 0, 0];
                            currentPosition[0] = parentPosition[0] + wristDir[0] * 6.0; // Увеличено с 4.0 до 6.0
                            currentPosition[1] = parentPosition[1] + wristDir[1] * 0.5;
                            currentPosition[2] = parentPosition[2] + 2.0; // Увеличено для выноса вперед
                            // Обновляем позицию в узле
                            gltf.nodes[nodeIndex].translation = currentPosition;
                        }
                    }
                }
                // Корректируем позиции локтей для лучшей визуализации
                else if (nodeName === MMDModelBones.LeftElbow || nodeName === MMDModelBones.RightElbow) {
                    scaleFactor = 3.0; // Увеличено с 2.0 до 3.0
                    isExtremity = true;

                    // Отодвигаем локти от тела гораздо дальше
                    const sideDir = nodeName === MMDModelBones.LeftElbow ? [-1, 0, 0] : [1, 0, 0];
                    currentPosition[0] = parentPosition[0] + sideDir[0] * 10.0; // Увеличено с 6.0 до 10.0
                    currentPosition[1] = parentPosition[1] + 1.0; // Приподнимаем локти
                    currentPosition[2] = parentPosition[2] + 2.0; // Выносим вперед

                    gltf.nodes[nodeIndex].translation = currentPosition;
                }
                // Корректируем ноги для лучшей визуализации
                else if (nodeName === MMDModelBones.LeftKnee || nodeName === MMDModelBones.RightKnee) {
                    scaleFactor = 3.0; // Увеличено с 2.0 до 3.0
                    isExtremity = true;

                    // Отодвигаем колени для лучшей видимости
                    const sideDir = nodeName === MMDModelBones.LeftKnee ? [-1.5, 0, 0] : [1.5, 0, 0];
                    currentPosition[0] = parentPosition[0] + sideDir[0] * 5.0; // Увеличено с 3.0 до 5.0
                    currentPosition[1] = parentPosition[1] - 12.0; // Опускаем колени ниже (с 7.0 до 12.0)
                    currentPosition[2] = parentPosition[2] + 3.0; // Значительно выдвигаем вперед

                    gltf.nodes[nodeIndex].translation = currentPosition;

                    // Полностью переопределяем поворот колена для реалистичной стойки
                    const isLeft = nodeName === MMDModelBones.LeftKnee;
                    gltf.nodes[nodeIndex].rotation = [
                        0.2, // Был 0.15 (X) -> теперь Y (сгибание колена)
                        0.15 * (isLeft ? -1 : 1), // Был Y (0.2) -> теперь X (отклонение в сторону)
                        0.1 * (isLeft ? 1 : -1), // Поворот по Z для естественной стойки
                        0.96 // Нормализованный компонент W кватерниона
                    ];
                }
                else if (nodeName === MMDModelBones.LeftAnkle || nodeName === MMDModelBones.RightAnkle) {
                    scaleFactor = 3.0;
                    isExtremity = true;

                    // Отодвигаем лодыжки для лучшей видимости
                    const sideDir = nodeName === MMDModelBones.LeftAnkle ? [-1.5, 0, 0] : [1.5, 0, 0];
                    currentPosition[0] = parentPosition[0] + sideDir[0] * 2.0;
                    currentPosition[1] = parentPosition[1] - 5.0;
                    currentPosition[2] = parentPosition[2] + 6.0;

                    gltf.nodes[nodeIndex].translation = currentPosition;

                    // Полностью переопределяем поворот лодыжек для натуральной стойки
                    const isLeft = nodeName === MMDModelBones.LeftAnkle;
                    gltf.nodes[nodeIndex].rotation = [
                        0.05 * (isLeft ? -1 : 1), // Был 0.25 (X) -> теперь Y (поворот по горизонтали)
                        0.25, // Был 0.05 (Y) -> теперь X (угол стопы вниз)
                        0.15 * (isLeft ? -1 : 1), // Поворот по Z (разворот стопы наружу)
                        0.95 // Нормализованный компонент W кватерниона
                    ];
                }
                else if (nodeName === MMDModelBones.LeftHip || nodeName === MMDModelBones.RightHip) {
                    scaleFactor = 3.0;
                    isExtremity = true;

                    // Расставляем бедра шире
                    const sideDir = nodeName === MMDModelBones.LeftHip ? [-1, 0, 0] : [1, 0, 0];
                    currentPosition[0] = parentPosition[0] + sideDir[0] * 8.0;
                    currentPosition[1] = parentPosition[1] - 5.0;
                    currentPosition[2] = parentPosition[2] + 1.5;

                    gltf.nodes[nodeIndex].translation = currentPosition;

                    // Полностью переопределяем поворот бедер для реалистичной стойки
                    const isLeft = nodeName === MMDModelBones.LeftHip;
                    gltf.nodes[nodeIndex].rotation = [
                        0.15, // Был 0.1 (X) -> теперь Y (поворот вперед)
                        0.1 * (isLeft ? -1 : 1), // Был 0.15 (Y) -> теперь X (разворот бедра)
                        0.1 * (isLeft ? 1 : -1), // Разворот "наружу" по Z
                        0.97 // Нормализованный компонент W кватерниона
                    ];
                }
                // Улучшаем позицию рук
                else if (nodeName === MMDModelBones.LeftWrist || nodeName === MMDModelBones.RightWrist) {
                    scaleFactor = 3.0; // Увеличено с 2.0 до 3.0
                    isExtremity = true;

                    // Отодвигаем запястья от локтей
                    const sideDir = nodeName === MMDModelBones.LeftWrist ? [-1, 0, 0] : [1, 0, 0];
                    currentPosition[0] = parentPosition[0] + sideDir[0] * 8.0; // Увеличено с 5.0 до 8.0
                    currentPosition[1] = parentPosition[1] - 1.0; // Немного ниже локтей
                    currentPosition[2] = parentPosition[2] + 3.0; // Выносим запястья вперед

                    gltf.nodes[nodeIndex].translation = currentPosition;
                }
                else if (nodeName === MMDModelBones.LeftArm || nodeName === MMDModelBones.RightArm) {
                    scaleFactor = 3.0; // Увеличено с 2.0 до 3.0
                    isExtremity = true;

                    // Расставляем плечи шире
                    const sideDir = nodeName === MMDModelBones.LeftArm ? [-1, 0, 0] : [1, 0, 0];
                    currentPosition[0] = parentPosition[0] + sideDir[0] * 8.0; // Увеличено с 5.0 до 8.0
                    currentPosition[1] = parentPosition[1] + 1.0; // Приподнимаем плечи
                    currentPosition[2] = parentPosition[2] + 1.0; // Небольшое смещение вперед

                    gltf.nodes[nodeIndex].translation = currentPosition;
                }

                // Позиции для линии (начало и конец)
                const linePositions = new Float32Array([
                    parentPosition[0], parentPosition[1], parentPosition[2],
                    currentPosition[0], currentPosition[1], currentPosition[2]
                ]);

                // Выбираем цвет линии в зависимости от типа кости
                let materialIndex = 0; // Базовый материал (красный по умолчанию)

                // Если у нас нет достаточного количества материалов, создаем их
                if (gltf.materials.length === 1) {
                    // Добавляем материалы разных цветов
                    gltf.materials.push({
                        name: "ArmMaterial",
                        pbrMetallicRoughness: {
                            baseColorFactor: [0.0, 0.7, 1.0, 1.0], // Голубой для рук
                            metallicFactor: 0.0,
                            roughnessFactor: 1.0
                        }
                    });

                    gltf.materials.push({
                        name: "LegMaterial",
                        pbrMetallicRoughness: {
                            baseColorFactor: [0.0, 1.0, 0.3, 1.0], // Зеленый для ног
                            metallicFactor: 0.0,
                            roughnessFactor: 1.0
                        }
                    });

                    gltf.materials.push({
                        name: "FingerMaterial",
                        pbrMetallicRoughness: {
                            baseColorFactor: [1.0, 0.7, 0.0, 1.0], // Оранжевый для пальцев
                            metallicFactor: 0.0,
                            roughnessFactor: 1.0
                        }
                    });

                    gltf.materials.push({
                        name: "TorsoMaterial",
                        pbrMetallicRoughness: {
                            baseColorFactor: [0.8, 0.2, 0.8, 1.0], // Фиолетовый для туловища
                            metallicFactor: 0.0,
                            roughnessFactor: 1.0
                        }
                    });
                }

                // Выбираем материал в зависимости от типа кости
                if (nodeName.includes("指") || nodeName.includes("親指")) {
                    materialIndex = 3; // Материал для пальцев
                } else if (nodeName.includes("足") || nodeName === MMDModelBones.LeftKnee ||
                    nodeName === MMDModelBones.RightKnee || nodeName === MMDModelBones.LeftHip ||
                    nodeName === MMDModelBones.RightHip) {
                    materialIndex = 2; // Материал для ног
                } else if (nodeName.includes("腕") || nodeName === MMDModelBones.LeftElbow ||
                    nodeName === MMDModelBones.RightElbow || nodeName === MMDModelBones.LeftArm ||
                    nodeName === MMDModelBones.RightArm || nodeName === MMDModelBones.LeftWrist ||
                    nodeName === MMDModelBones.RightWrist) {
                    materialIndex = 1; // Материал для рук
                } else if (nodeName.includes("体") || nodeName === MMDModelBones.UpperBody ||
                    nodeName === MMDModelBones.LowerBody) {
                    materialIndex = 4; // Материал для туловища
                }

                const linePositionsOffset = addToBuffer(new Uint8Array(linePositions.buffer));

                // Делаем линии толще для лучшей видимости
                // Создаем данные для цилиндрической линии вместо простой линии
                const cylinderRadius = isExtremity ? 0.2 : 0.1; // Радиус цилиндра
                const segments = 8; // Количество сегментов для боковой поверхности

                // Добавляем буферный вид для линии
                const positionBufferViewIndex = gltf.bufferViews.length;
                gltf.bufferViews.push({
                    buffer: 0,
                    byteOffset: linePositionsOffset,
                    byteLength: linePositions.byteLength,
                    target: 34962 // ARRAY_BUFFER
                });

                // Добавляем аксессор для линии
                const positionAccessorIndex = gltf.accessors.length;
                gltf.accessors.push({
                    bufferView: positionBufferViewIndex,
                    componentType: 5126, // FLOAT
                    count: 2,
                    type: "VEC3",
                    min: [
                        Math.min(parentPosition[0], currentPosition[0]),
                        Math.min(parentPosition[1], currentPosition[1]),
                        Math.min(parentPosition[2], currentPosition[2])
                    ],
                    max: [
                        Math.max(parentPosition[0], currentPosition[0]),
                        Math.max(parentPosition[1], currentPosition[1]),
                        Math.max(parentPosition[2], currentPosition[2])
                    ]
                });

                // Индексы для линии
                const indices = new Uint16Array([0, 1]);
                const indicesOffset = addToBuffer(new Uint8Array(indices.buffer));

                // Добавляем буферный вид для индексов
                const indicesBufferViewIndex = gltf.bufferViews.length;
                gltf.bufferViews.push({
                    buffer: 0,
                    byteOffset: indicesOffset,
                    byteLength: indices.byteLength,
                    target: 34963 // ELEMENT_ARRAY_BUFFER
                });

                // Добавляем аксессор для индексов
                const indicesAccessorIndex = gltf.accessors.length;
                gltf.accessors.push({
                    bufferView: indicesBufferViewIndex,
                    componentType: 5123, // UNSIGNED_SHORT
                    count: indices.length,
                    type: "SCALAR",
                    min: [0],
                    max: [1]
                });

                // Создаем меш с линией
                gltf.meshes.push({
                    name: `${nodeName}_mesh`,
                    primitives: [{
                        attributes: {
                            POSITION: positionAccessorIndex
                        },
                        indices: indicesAccessorIndex,
                        mode: 1, // LINES
                        material: materialIndex
                    }]
                });
            } else {
                // Для корневых костей создаем просто точку
                const pointPositions = new Float32Array([0, 0, 0]);
                const pointPositionsOffset = addToBuffer(new Uint8Array(pointPositions.buffer));

                // Добавляем буферный вид для точки
                const positionBufferViewIndex = gltf.bufferViews.length;
                gltf.bufferViews.push({
                    buffer: 0,
                    byteOffset: pointPositionsOffset,
                    byteLength: pointPositions.byteLength,
                    target: 34962 // ARRAY_BUFFER
                });

                // Добавляем аксессор для точки
                const positionAccessorIndex = gltf.accessors.length;
                gltf.accessors.push({
                    bufferView: positionBufferViewIndex,
                    componentType: 5126, // FLOAT
                    count: 1,
                    type: "VEC3",
                    min: [0, 0, 0],
                    max: [0, 0, 0]
                });

                // Создаем меш с точкой, делаем точку больше
                gltf.meshes.push({
                    name: `${nodeName}_mesh`,
                    primitives: [{
                        attributes: {
                            POSITION: positionAccessorIndex
                        },
                        mode: 0, // POINTS
                        material: 0
                    }]
                });
            }

            // Добавляем ссылку на меш к узлу и связываем со скином
            gltf.nodes[nodeIndex].mesh = meshIndex;
            gltf.nodes[nodeIndex].skin = skinIndex;
        }

        // Создаем анимацию
        const animation: {
            name: string;
            channels: Array<{
                sampler: number;
                target: {
                    node: number;
                    path: string;
                }
            }>;
            samplers: Array<{
                input: number;
                output: number;
                interpolation: string;
            }>;
        } = {
            name: "AkiraMotion",
            channels: [],
            samplers: []
        };

        // Добавляем временные точки для анимации (30 FPS)
        const times = new Float32Array(this.keyframes.map((_, i) => i / 30));
        const timesBufferOffset = addToBuffer(new Uint8Array(times.buffer));

        // Добавляем буферный вид для временных точек
        const timeBufferViewIndex = gltf.bufferViews.length;
        gltf.bufferViews.push({
            buffer: 0,
            byteOffset: timesBufferOffset,
            byteLength: times.byteLength
        });

        // Добавляем аксессор для временных точек
        const timeAccessorIndex = gltf.accessors.length;
        gltf.accessors.push({
            bufferView: timeBufferViewIndex,
            componentType: 5126, // FLOAT
            count: times.length,
            type: "SCALAR",
            min: [times[0]],
            max: [times[times.length - 1]]
        });

        // Добавляем анимацию для каждой кости
        for (const [boneName, nodeIndex] of nodeIndices.entries()) {
            // Собираем данные позиции и вращения из кадров
            const positions: number[] = [];
            const rotations: number[] = [];

            for (const keyframe of this.keyframes) {
                const boneData = keyframe.keyData.find(bd => bd.boneName === boneName);

                if (boneData) {
                    // Позиция кости
                    positions.push(
                        boneData.position[0],
                        boneData.position[1],
                        boneData.position[2]
                    );

                    // Вращение кости (убедимся, что кватернион нормализован)
                    let qx = boneData.quanternion[0] || 0;
                    let qy = boneData.quanternion[1] || 0;
                    let qz = boneData.quanternion[2] || 0;
                    let qw = boneData.quanternion[3] || 1.0;

                    // Нормализация кватерниона
                    const len = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
                    if (len > 0 && len !== 1) {
                        qx /= len;
                        qy /= len;
                        qz /= len;
                        qw /= len;
                    }

                    rotations.push(qx, qy, qz, qw);
                } else {
                    // Если нет данных для этого кадра, используем предыдущие значения
                    if (positions.length >= 3) {
                        positions.push(
                            positions[positions.length - 3],
                            positions[positions.length - 2],
                            positions[positions.length - 1]
                        );
                    } else {
                        // Или нулевые значения, если нет предыдущих данных
                        positions.push(0, 0, 0);
                    }

                    if (rotations.length >= 4) {
                        rotations.push(
                            rotations[rotations.length - 4],
                            rotations[rotations.length - 3],
                            rotations[rotations.length - 2],
                            rotations[rotations.length - 1]
                        );
                    } else {
                        // Или единичный кватернион, если нет предыдущих данных
                        rotations.push(0, 0, 0, 1);
                    }
                }
            }

            if (positions.length === 0 || rotations.length === 0) continue;

            // Создаем буферы для позиций и вращений
            const positionsArray = new Float32Array(positions);
            const rotationsArray = new Float32Array(rotations);

            // Добавляем данные позиции в буфер
            const positionsBufferOffset = addToBuffer(new Uint8Array(positionsArray.buffer));

            // Добавляем буферный вид для позиций
            const positionBufferViewIndex = gltf.bufferViews.length;
            gltf.bufferViews.push({
                buffer: 0,
                byteOffset: positionsBufferOffset,
                byteLength: positionsArray.byteLength
            });

            // Добавляем аксессор для позиций
            const positionAccessorIndex = gltf.accessors.length;
            gltf.accessors.push({
                bufferView: positionBufferViewIndex,
                componentType: 5126, // FLOAT
                count: this.keyframes.length,
                type: "VEC3",
                min: [
                    Math.min(...positions.filter((_, i) => i % 3 === 0)),
                    Math.min(...positions.filter((_, i) => i % 3 === 1)),
                    Math.min(...positions.filter((_, i) => i % 3 === 2))
                ],
                max: [
                    Math.max(...positions.filter((_, i) => i % 3 === 0)),
                    Math.max(...positions.filter((_, i) => i % 3 === 1)),
                    Math.max(...positions.filter((_, i) => i % 3 === 2))
                ]
            });

            // Добавляем данные вращения в буфер
            const rotationsBufferOffset = addToBuffer(new Uint8Array(rotationsArray.buffer));

            // Добавляем буферный вид для вращений
            const rotationBufferViewIndex = gltf.bufferViews.length;
            gltf.bufferViews.push({
                buffer: 0,
                byteOffset: rotationsBufferOffset,
                byteLength: rotationsArray.byteLength
            });

            // Добавляем аксессор для вращений
            const rotationAccessorIndex = gltf.accessors.length;
            gltf.accessors.push({
                bufferView: rotationBufferViewIndex,
                componentType: 5126, // FLOAT
                count: this.keyframes.length,
                type: "VEC4",
                min: [
                    Math.min(...rotations.filter((_, i) => i % 4 === 0)),
                    Math.min(...rotations.filter((_, i) => i % 4 === 1)),
                    Math.min(...rotations.filter((_, i) => i % 4 === 2)),
                    Math.min(...rotations.filter((_, i) => i % 4 === 3))
                ],
                max: [
                    Math.max(...rotations.filter((_, i) => i % 4 === 0)),
                    Math.max(...rotations.filter((_, i) => i % 4 === 1)),
                    Math.max(...rotations.filter((_, i) => i % 4 === 2)),
                    Math.max(...rotations.filter((_, i) => i % 4 === 3))
                ]
            });

            // Добавляем сэмплеры анимации
            const positionSamplerIndex = animation.samplers.length;
            animation.samplers.push({
                input: timeAccessorIndex,
                output: positionAccessorIndex,
                interpolation: "LINEAR"
            });

            const rotationSamplerIndex = animation.samplers.length;
            animation.samplers.push({
                input: timeAccessorIndex,
                output: rotationAccessorIndex,
                interpolation: "LINEAR"
            });

            // Добавляем каналы анимации для позиции и вращения
            animation.channels.push({
                sampler: positionSamplerIndex,
                target: {
                    node: nodeIndex,
                    path: "translation"
                }
            });

            animation.channels.push({
                sampler: rotationSamplerIndex,
                target: {
                    node: nodeIndex,
                    path: "rotation"
                }
            });
        }

        // Добавляем анимацию в glTF
        gltf.animations.push(animation);

        // Объединяем все буферы в один
        const totalBufferData = new Uint8Array(totalBufferSize);
        for (const buffer of buffers) {
            totalBufferData.set(buffer.data, buffer.byteOffset);
        }

        // Обновляем общий размер буфера
        gltf.buffers[0].byteLength = totalBufferSize;

        // Кодируем буфер в base64
        let base64Buffer = '';
        for (let i = 0; i < totalBufferData.length; i++) {
            base64Buffer += String.fromCharCode(totalBufferData[i]);
        }
        gltf.buffers[0].uri = `data:application/octet-stream;base64,${btoa(base64Buffer)}`;

        // Экспортируем glTF как JSON
        const gltfString = JSON.stringify(gltf, null, 2);
        return new Blob([gltfString], { type: 'application/json' });
    }

    exportToVMD(fileName: string = "akira_motion.vmd"): Blob {
        if (!this._Model || this.keyframes.length === 0) {
            throw new Error("Модель не инициализирована или нет кадров анимации");
        }

        function encodeShiftJIS(str: string): Uint8Array {
            const unicodeArray = Encoding.stringToCode(str)
            const sjisArray = Encoding.convert(unicodeArray, {
                to: "SJIS",
                from: "UNICODE",
            })
            return new Uint8Array(sjisArray)
        }

        // Функция для сравнения двух кадров
        const areFramesSimilar = (frame1: any, frame2: any, threshold: number = 0.003): boolean => {
            // Сравниваем позиции костей
            for (let i = 0; i < frame1.boneFrames.length; i++) {
                const pos1 = frame1.boneFrames[i].position;
                const pos2 = frame2.boneFrames[i].position;

                if (Math.abs(pos1.x - pos2.x) > threshold ||
                    Math.abs(pos1.y - pos2.y) > threshold ||
                    Math.abs(pos1.z - pos2.z) > threshold) {
                    return false;
                }

                // Сравниваем вращения (кватернионы)
                const rot1 = frame1.boneFrames[i].rotation;
                const rot2 = frame2.boneFrames[i].rotation;

                if (Math.abs(rot1.x - rot2.x) > threshold ||
                    Math.abs(rot1.y - rot2.y) > threshold ||
                    Math.abs(rot1.z - rot2.z) > threshold ||
                    Math.abs(rot1.w - rot2.w) > threshold) {
                    return false;
                }
            }

            // Сравниваем морфы
            for (let i = 0; i < frame1.morphFrames.length; i++) {
                if (Math.abs(frame1.morphFrames[i].weight - frame2.morphFrames[i].weight) > threshold * 10) {
                    return false;
                }
            }

            return true;
        };

        // Фильтрация кадров - удаление похожих кадров
        const filterSimilarFrames = (frames: any[]): any[] => {
            if (frames.length <= 1) return frames;

            const filteredFrames = [frames[0]];
            let lastFrame = frames[0];

            for (let i = 1; i < frames.length; i++) {
                if (!areFramesSimilar(lastFrame, frames[i])) {
                    filteredFrames.push(frames[i]);
                    lastFrame = frames[i];
                }
            }

            console.log(`Фильтрация: ${frames.length} -> ${filteredFrames.length} кадров`);
            return filteredFrames;
        };

        const writeBoneFrame = (
            dataView: DataView,
            offset: number,
            name: string,
            frame: number,
            position: Vector3,
            rotation: Quaternion
        ): number => {
            const nameBytes = encodeShiftJIS(name);
            for (let i = 0; i < 15; i++) {
                dataView.setUint8(offset + i, i < nameBytes.length ? nameBytes[i] : 0);
            }
            offset += 15;

            dataView.setUint32(offset, frame, true);
            offset += 4;

            dataView.setFloat32(offset, position.x, true);
            offset += 4;
            dataView.setFloat32(offset, position.y, true);
            offset += 4;
            dataView.setFloat32(offset, position.z, true);
            offset += 4;

            dataView.setFloat32(offset, rotation.x, true);
            offset += 4;
            dataView.setFloat32(offset, rotation.y, true);
            offset += 4;
            dataView.setFloat32(offset, rotation.z, true);
            offset += 4;
            dataView.setFloat32(offset, rotation.w, true);
            offset += 4;

            // Интерполяционные параметры (64 байта)
            for (let i = 0; i < 64; i++) {
                dataView.setUint8(offset + i, 20);
            }
            offset += 64;

            return offset;
        };

        const writeMorphFrame = (
            dataView: DataView,
            offset: number,
            name: string,
            frame: number,
            weight: number
        ): number => {
            const nameBytes = encodeShiftJIS(name);
            for (let i = 0; i < 15; i++) {
                dataView.setUint8(offset + i, i < nameBytes.length ? nameBytes[i] : 0);
            }
            offset += 15;

            dataView.setUint32(offset, frame, true);
            offset += 4;

            dataView.setFloat32(offset, weight, true);
            offset += 4;

            return offset;
        };

        // Собираем данные из keyframes
        const frames = this.keyframes.map(keyframe => {
            const boneFrames = keyframe.keyData.map(data => {
                // Применяем правильное масштабирование для ног
                const heightScale = 1.0;

                // Только для корневой кости, IK ног и рук сохраняем позицию
                if (data.boneName === MMDModelBones.RootBone ||
                    data.boneName === MMDModelBones.LeftFootIK ||
                    data.boneName === MMDModelBones.RightFootIK ||
                    data.boneName === MMDModelBones.LeftArm ||
                    data.boneName === MMDModelBones.RightArm) {
                    return {
                        name: data.boneName,
                        // Для ног используем специальное масштабирование по Y
                        position: new Vector3(
                            data.position[0],
                            data.boneName === MMDModelBones.RootBone ?
                                data.position[1] * heightScale :
                                data.position[1],
                            data.position[2]
                        ),
                        rotation: new Quaternion(
                            data.quanternion[0] || 0,
                            data.quanternion[1] || 0,
                            data.quanternion[2] || 0,
                            data.quanternion[3] || 1
                        )
                    };
                }

                // Для остальных костей не используем позицию (только вращение)
                return {
                    name: data.boneName,
                    position: new Vector3(0, 0, 0),
                    rotation: new Quaternion(
                        data.quanternion[0] || 0,
                        data.quanternion[1] || 0,
                        data.quanternion[2] || 0,
                        data.quanternion[3] || 1
                    )
                };
            });
            return { boneFrames, morphFrames: keyframe.morphData };
        });

        // Применяем несколько этапов фильтрации для сильного уменьшения количества кадров

        // 1. Сначала пробуем сэмплировать кадры с шагом (брать каждый N-ный кадр)
        const samplingStep = Math.max(1, Math.floor(frames.length / 3000));
        const sampledFrames = frames.filter((_, index) => index % samplingStep === 0);

        // 2. Затем удаляем похожие кадры для дальнейшего уменьшения
        const filteredFrames = filterSimilarFrames(sampledFrames);

        // Убедимся, что первый и последний кадры всегда включены
        if (frames.length > 1 && filteredFrames.length > 1) {
            if (!areFramesSimilar(filteredFrames[filteredFrames.length - 1], frames[frames.length - 1])) {
                filteredFrames.push(frames[frames.length - 1]);
            }
        }

        const frameCount = filteredFrames.length;
        const boneCnt = filteredFrames[0].boneFrames.length;
        const morphCnt = filteredFrames[0].morphFrames.length;
        const headerSize = 30 + 20;
        const boneFrameSize = 15 + 4 + 12 + 16 + 64;
        const morphFrameSize = 15 + 4 + 4;
        const totalSize =
            headerSize + 4 + boneFrameSize * frameCount * boneCnt + 4 + morphFrameSize * frameCount * morphCnt + 4 + 4 + 4;

        const buffer = new ArrayBuffer(totalSize);
        const dataView = new DataView(buffer);
        let offset = 0;

        // Записываем заголовок
        const header = "Vocaloid Motion Data 0002";
        for (let i = 0; i < 30; i++) {
            dataView.setUint8(offset + i, i < header.length ? header.charCodeAt(i) : 0);
        }
        offset += 30;

        // Записываем название модели (пустое в данном случае)
        offset += 20;

        // Записываем количество кадров костей
        dataView.setUint32(offset, frameCount * boneCnt, true);
        offset += 4;

        // Генерируем кадры костей
        for (let i = 0; i < frameCount; i++) {
            for (const boneFrame of filteredFrames[i].boneFrames) {
                offset = writeBoneFrame(
                    dataView,
                    offset,
                    boneFrame.name,
                    i,
                    boneFrame.position,
                    boneFrame.rotation
                );
            }
        }

        // Записываем количество кадров морфов
        dataView.setUint32(offset, frameCount * morphCnt, true);
        offset += 4;

        // Генерируем кадры морфов
        for (let i = 0; i < frameCount; i++) {
            for (const morphFrame of filteredFrames[i].morphFrames) {
                offset = writeMorphFrame(
                    dataView,
                    offset,
                    morphFrame.name,
                    i,
                    morphFrame.weight
                );
            }
        }

        // Записываем количество кадров для других типов (все 0 в этом примере)
        dataView.setUint32(offset, 0, true); // Количество кадров камеры
        offset += 4;
        dataView.setUint32(offset, 0, true); // Количество кадров света
        offset += 4;
        dataView.setUint32(offset, 0, true); // Количество кадров собственных теней
        offset += 4;

        return new Blob([buffer], { type: "application/octet-stream" });
    }
}
class HolisticParser {
    mainBody: NormalizedLandmark[]
    leftWorldFingers: NormalizedLandmark[]
    rightWorldFingers: NormalizedLandmark[]
    poseLandmarks: NormalizedLandmark[]
    faceLandmarks: NormalizedLandmark[]
    constructor(holisticResult: HolisticLandmarkerResult) {
        this.mainBody = holisticResult.poseWorldLandmarks?.[0] || [];
        this.leftWorldFingers = holisticResult.leftHandLandmarks?.[0] || [];
        this.rightWorldFingers = holisticResult.rightHandLandmarks?.[0] || [];
        this.poseLandmarks = holisticResult.poseLandmarks?.[0] || [];
        this.faceLandmarks = holisticResult.faceLandmarks?.[0] || [];
    }

    static ParseHolistic(holisticResult: HolisticLandmarkerResult): HolisticParser {
        return new HolisticParser(holisticResult);
    }
}
