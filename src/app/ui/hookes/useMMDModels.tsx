type MMDModel = {
    ModelName: string,
    ModelPath: string
}
export function useMMDModels(): MMDModel[]{
    return [
        {
            ModelName: "Ganyubikini",
            ModelPath: "Ganyubikini.bpmx"
        },
        {
            ModelName: "Ganyu base",
            ModelPath: "Ganyu_base_v1.2.bpmx"
        },
        {
            ModelName: "Miku | [White dress]",
            ModelPath: "White.bpmx"
        },
        {
            ModelName: "Miku | [Black dress]",
            ModelPath: "Black.bpmx"
        },
        {
            ModelName: "Mita | Miside",
            ModelPath: "Mita.bpmx"
        },
        {
            ModelName: "Cappie | Miside",
            ModelPath: "Cappie.bpmx"
        },
    ]
}