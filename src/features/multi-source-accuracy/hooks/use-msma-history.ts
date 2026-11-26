'use client';

import { useCallback, useState } from 'react';
import {
  MsmaAuditTrailEntry,
  MsmaConfigurableSnapshot
} from '../types';

function cloneSnapshot(snap: MsmaConfigurableSnapshot): MsmaConfigurableSnapshot {
  return {
    ...snap,
    sources: snap.sources.map(s => ({ ...s })),
    rejectedTransformations: [...snap.rejectedTransformations]
  };
}

interface HistoryStore {
  initial: MsmaConfigurableSnapshot;
  past: MsmaConfigurableSnapshot[];
  present: MsmaConfigurableSnapshot;
  future: MsmaConfigurableSnapshot[];
  auditTrail: MsmaAuditTrailEntry[];
}

export function useMsmaHistory(initialConfig: MsmaConfigurableSnapshot) {
  const [store, setStore] = useState<HistoryStore>(() => {
    const clean = cloneSnapshot(initialConfig);
    return {
      initial: clean,
      past: [],
      present: cloneSnapshot(clean),
      future: [],
      auditTrail: [
        {
          id: 'init_0',
          timestamp: new Date().toLocaleTimeString('id-ID'),
          stepNumber: 0,
          actionLabel: 'Inisialisasi Analisis',
          detail: `Dataset dimuat (${clean.sources.length} sumber pengukuran awal).`
        }
      ]
    };
  });

  const reinitializeWithWorkbook = useCallback(
    (freshInitial: MsmaConfigurableSnapshot, fileName: string) => {
      const clean = cloneSnapshot(freshInitial);
      setStore({
        initial: clean,
        past: [],
        present: cloneSnapshot(clean),
        future: [],
        auditTrail: [
          {
            id: `init_${Date.now()}`,
            timestamp: new Date().toLocaleTimeString('id-ID'),
            stepNumber: 1,
            actionLabel: 'Muat Dataset Baru',
            detail: `Berkas "${fileName}" dimuat (${clean.sources.length} sumber terdeteksi pada sheet "${clean.activeSheetName}").`
          }
        ]
      });
    },
    []
  );

  const commitChange = useCallback(
    (
      updater: (prev: MsmaConfigurableSnapshot) => MsmaConfigurableSnapshot,
      stepNumber: number,
      actionLabel: string,
      detail: string
    ) => {
      setStore(curr => {
        const nextSnap = cloneSnapshot(updater(cloneSnapshot(curr.present)));
        const nextPast = [...curr.past, cloneSnapshot(curr.present)].slice(-35);
        const entry: MsmaAuditTrailEntry = {
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toLocaleTimeString('id-ID'),
          stepNumber,
          actionLabel,
          detail
        };
        return {
          ...curr,
          past: nextPast,
          present: nextSnap,
          future: [],
          auditTrail: [entry, ...curr.auditTrail].slice(0, 60)
        };
      });
    },
    []
  );

  const undo = useCallback(() => {
    setStore(curr => {
      if (curr.past.length === 0) return curr;
      const previous = curr.past[curr.past.length - 1];
      const nextPast = curr.past.slice(0, -1);
      const nextFuture = [cloneSnapshot(curr.present), ...curr.future];
      const entry: MsmaAuditTrailEntry = {
        id: `undo_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('id-ID'),
        stepNumber: 0,
        actionLabel: 'Undo Perubahan',
        detail: 'Mengembalikan snapshot konfigurasi/data ke langkah sebelumnya.'
      };
      return {
        ...curr,
        past: nextPast,
        present: cloneSnapshot(previous),
        future: nextFuture,
        auditTrail: [entry, ...curr.auditTrail].slice(0, 60)
      };
    });
  }, []);

  const redo = useCallback(() => {
    setStore(curr => {
      if (curr.future.length === 0) return curr;
      const nextItem = curr.future[0];
      const remainingFuture = curr.future.slice(1);
      const nextPast = [...curr.past, cloneSnapshot(curr.present)];
      const entry: MsmaAuditTrailEntry = {
        id: `redo_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('id-ID'),
        stepNumber: 0,
        actionLabel: 'Redo Perubahan',
        detail: 'Menerapkan kembali snapshot konfigurasi yang dibatalkan.'
      };
      return {
        ...curr,
        past: nextPast,
        present: cloneSnapshot(nextItem),
        future: remainingFuture,
        auditTrail: [entry, ...curr.auditTrail].slice(0, 60)
      };
    });
  }, []);

  const resetStep = useCallback((stepNumber: number) => {
    setStore(curr => {
      const base = curr.initial;
      const next = cloneSnapshot(curr.present);

      if (stepNumber === 2) {
        next.entityColumn = base.entityColumn;
        next.timeColumn = base.timeColumn;
      } else if (stepNumber === 3) {
        next.sources = base.sources.map(s => ({ ...s }));
      } else if (stepNumber === 4) {
        next.classificationOverride = null;
        next.userConfirmedClassification = false;
        next.sources = next.sources.map(s => ({
          ...s,
          conversionModelEnabled: false,
          conversionSlope: 1,
          conversionIntercept: 0,
          conversionUncertaintySd: 0
        }));
      } else if (stepNumber === 7) {
        next.activeTransformation = 'NONE';
        next.rejectedTransformations = [];
        next.dropDuplicates = false;
        next.outlierHandling = 'KEEP_ALL';
        next.missingHandling = 'COMPLETE_CASE';
      } else if (stepNumber === 8) {
        next.preferredMethodOverride = null;
        next.demingLambdaRatio = 1;
        next.demingLambdaExternalKnown = false;
        next.bootstrapReplications = base.bootstrapReplications;
        next.bootstrapSeed = base.bootstrapSeed ?? 20261126;
      }

      const entry: MsmaAuditTrailEntry = {
        id: `rst_step_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('id-ID'),
        stepNumber,
        actionLabel: `Reset Step ${stepNumber}`,
        detail: `Pengaturan pada Step ${stepNumber} dikembalikan ke nilai awal.`
      };

      return {
        ...curr,
        past: [...curr.past, cloneSnapshot(curr.present)].slice(-35),
        present: next,
        future: [],
        auditTrail: [entry, ...curr.auditTrail].slice(0, 60)
      };
    });
  }, []);

  const restoreOriginalData = useCallback(() => {
    setStore(curr => {
      const next = cloneSnapshot(curr.present);
      next.activeTransformation = 'NONE';
      next.rejectedTransformations = [];
      next.dropDuplicates = false;
      next.outlierHandling = 'KEEP_ALL';
      next.missingHandling = 'COMPLETE_CASE';
      next.sources = next.sources.map(s => ({
        ...s,
        unitScaleMultiplier: 1,
        conversionModelEnabled: false,
        conversionSlope: 1,
        conversionIntercept: 0,
        conversionUncertaintySd: 0
      }));

      const entry: MsmaAuditTrailEntry = {
        id: `restore_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('id-ID'),
        stepNumber: 7,
        actionLabel: 'Restore Original Data',
        detail: 'Seluruh transformasi, filter pencilan, dan faktor konversi dibatalkan kembali ke data asli.'
      };

      return {
        ...curr,
        past: [...curr.past, cloneSnapshot(curr.present)].slice(-35),
        present: next,
        future: [],
        auditTrail: [entry, ...curr.auditTrail].slice(0, 60)
      };
    });
  }, []);

  const resetEntireAnalysis = useCallback(() => {
    setStore(curr => {
      const entry: MsmaAuditTrailEntry = {
        id: `reset_all_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('id-ID'),
        stepNumber: 0,
        actionLabel: 'Reset Seluruh Analisis',
        detail: 'Seluruh konfigurasi dikembalikan ke snapshot awal dataset.'
      };
      return {
        ...curr,
        past: [...curr.past, cloneSnapshot(curr.present)].slice(-35),
        present: cloneSnapshot(curr.initial),
        future: [],
        auditTrail: [entry, ...curr.auditTrail].slice(0, 60)
      };
    });
  }, []);

  return {
    config: store.present,
    canUndo: store.past.length > 0,
    canRedo: store.future.length > 0,
    undoCount: store.past.length,
    redoCount: store.future.length,
    auditTrail: store.auditTrail,
    reinitializeWithWorkbook,
    commitChange,
    undo,
    redo,
    resetStep,
    restoreOriginalData,
    resetEntireAnalysis
  };
}
