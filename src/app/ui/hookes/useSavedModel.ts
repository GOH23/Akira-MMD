import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { set as setKey,get as getValue } from 'idb-keyval';
type ModelPath = {
    id: string
    fileName: string
}
interface SavedModelPath {
    ModelPaths: ModelPath[],
    AddModelPath: (file: File) => void,
    GetModelData: (id: string) => Promise<Uint8Array | undefined>,
    RemoveModelPath: (modelPath: ModelPath) => void
}
const useSavedModel = create<SavedModelPath>()(
    persist(
        (set) => ({
            ModelPaths: [],
            async AddModelPath(data) {
                const id = crypto.randomUUID();
                const buffer = await data.arrayBuffer();
                setKey(id, new Uint8Array(buffer));
                var model: ModelPath = {
                    id: id,
                    fileName: data.name
                }
                set((state) => ({ ModelPaths: [...state.ModelPaths, model] }))
            },
            async GetModelData(id) {
                return getValue<Uint8Array>(id);
            },
            RemoveModelPath: (modelPath: ModelPath) => set((state) => ({
                ModelPaths: state.ModelPaths.filter((el, i) => el.id !== modelPath.id)
            })),
        }), {
        name: "models",
        version: 1
    }
    )
)
export { useSavedModel }
export type { ModelPath, SavedModelPath }