import type { InjectionKey } from 'vue';
import type { SightEditCore } from '@sightedit/core';

export interface SightEditState {
  instance: SightEditCore | null;
  isEditMode: boolean;
}

export interface SightEditApi {
  state: SightEditState;
  toggleEditMode: () => void;
  save: (sight: string, value: any, type?: string) => Promise<void>;
}

export const SightEditKey: InjectionKey<SightEditApi> = Symbol('sight-edit');