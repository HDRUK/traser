import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_JSON, DEFAULT_TEMPLATE } from "../config/playgroundDefaults";

export interface SchemaRef { name: string; version: string }
export interface TemplateRef {
  input_model: string;
  input_version: string;
  output_model: string;
  output_version: string;
}
export interface DatasetRef { pid: string; title: string }

interface PersistedState {
  jsonText: string;
  template: string;
  inputSchema: SchemaRef | null;
  customOutputSchema: SchemaRef | null;
  validateOutputOn: boolean;
  hSplit: number;
  vSplit: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  templateCollapsed: boolean;
  resultCollapsed: boolean;
  selectedMapping: TemplateRef | null;
  loadedTemplateText: string | null;
  selectedDataset: DatasetRef | null;
}

interface PlaygroundStore extends PersistedState {
  setJsonText: (v: string) => void;
  setTemplate: (v: string) => void;
  setInputSchema: (v: SchemaRef | null) => void;
  setCustomOutputSchema: (v: SchemaRef | null) => void;
  setValidateOutputOn: (v: boolean) => void;
  setHSplit: (v: number) => void;
  setVSplit: (v: number) => void;
  setLeftCollapsed: (v: boolean) => void;
  setRightCollapsed: (v: boolean) => void;
  setTemplateCollapsed: (v: boolean) => void;
  setResultCollapsed: (v: boolean) => void;
  setSelectedMapping: (v: TemplateRef | null) => void;
  setLoadedTemplateText: (v: string | null) => void;
  setSelectedDataset: (v: DatasetRef | null) => void;
  seed: (partial: Partial<PersistedState>) => void;
}

export const playgroundStore = create<PlaygroundStore>()(
  persist(
    (set) => ({
      jsonText: DEFAULT_JSON,
      template: DEFAULT_TEMPLATE,
      inputSchema: null,
      customOutputSchema: null,
      validateOutputOn: true,
      hSplit: 50,
      vSplit: 45,
      leftCollapsed: false,
      rightCollapsed: false,
      templateCollapsed: false,
      resultCollapsed: false,
      selectedMapping: null,
      loadedTemplateText: null,
      selectedDataset: null,
      setJsonText: (v) => set({ jsonText: v }),
      setTemplate: (v) => set({ template: v }),
      setInputSchema: (v) => set({ inputSchema: v }),
      setCustomOutputSchema: (v) => set({ customOutputSchema: v }),
      setValidateOutputOn: (v) => set({ validateOutputOn: v }),
      setHSplit: (v) => set({ hSplit: v }),
      setVSplit: (v) => set({ vSplit: v }),
      setLeftCollapsed: (v) => set({ leftCollapsed: v }),
      setRightCollapsed: (v) => set({ rightCollapsed: v }),
      setTemplateCollapsed: (v) => set({ templateCollapsed: v }),
      setResultCollapsed: (v) => set({ resultCollapsed: v }),
      setSelectedMapping: (v) => set({ selectedMapping: v }),
      setLoadedTemplateText: (v) => set({ loadedTemplateText: v }),
      setSelectedDataset: (v) => set({ selectedDataset: v }),
      seed: (partial) => set(partial),
    }),
    {
      name: "traser-playground",
      skipHydration: true,
      partialize: (state): PersistedState => ({
        jsonText: state.jsonText,
        template: state.template,
        inputSchema: state.inputSchema,
        customOutputSchema: state.customOutputSchema,
        validateOutputOn: state.validateOutputOn,
        hSplit: state.hSplit,
        vSplit: state.vSplit,
        leftCollapsed: state.leftCollapsed,
        rightCollapsed: state.rightCollapsed,
        templateCollapsed: state.templateCollapsed,
        resultCollapsed: state.resultCollapsed,
        selectedMapping: state.selectedMapping,
        loadedTemplateText: state.loadedTemplateText,
        selectedDataset: state.selectedDataset,
      }),
    }
  )
);
