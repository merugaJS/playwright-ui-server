import { create } from 'zustand';

interface TestFileInfo {
  id: string;
  filePath: string;
  fileName: string;
  directory: string;
}

type ViewMode = 'test' | 'pageObject' | 'config';

interface ProjectState {
  viewMode: ViewMode;
  selectedTestId: string | null;
  selectTest: (id: string | null) => void;
  selectedFile: TestFileInfo | null;
  setSelectedFile: (file: TestFileInfo | null) => void;
  selectedPageObjectId: string | null;
  selectPageObject: (id: string | null) => void;
  openConfig: () => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  viewMode: 'test',
  selectedTestId: null,
  selectTest: (id) => set({ selectedTestId: id, viewMode: 'test', selectedPageObjectId: null }),
  selectedFile: null,
  setSelectedFile: (file) => set({ selectedFile: file }),
  selectedPageObjectId: null,
  selectPageObject: (id) => set({ selectedPageObjectId: id, viewMode: 'pageObject', selectedTestId: null, selectedFile: null }),
  openConfig: () => set({ viewMode: 'config', selectedTestId: null, selectedFile: null, selectedPageObjectId: null }),
}));
