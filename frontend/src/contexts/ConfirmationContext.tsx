import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ConfirmationModal, ConfirmationModalProps } from '../components/ui/confirmation-modal';

interface ConfirmationContextType {
  confirm: (
    title: string,
    message: string,
    options?: {
      type?: 'warning' | 'success' | 'error' | 'info';
      confirmText?: string;
      cancelText?: string;
      showCancel?: boolean;
    }
  ) => Promise<boolean>;
}

const ConfirmationContext = createContext<ConfirmationContextType | undefined>(undefined);

export function useConfirmation() {
  const context = useContext(ConfirmationContext);
  if (context === undefined) {
    throw new Error('useConfirmation must be used within a ConfirmationProvider');
  }
  return context;
}

interface ConfirmationProviderProps {
  children: ReactNode;
}

export function ConfirmationProvider({ children }: ConfirmationProviderProps) {
  const [modalProps, setModalProps] = useState<ConfirmationModalProps | null>(null);

  const confirm = useCallback((
    title: string,
    message: string,
    options?: {
      type?: 'warning' | 'success' | 'error' | 'info';
      confirmText?: string;
      cancelText?: string;
      showCancel?: boolean;
    }
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      setModalProps({
        isOpen: true,
        onClose: () => {
          setModalProps(null);
          resolve(false);
        },
        onConfirm: () => {
          setModalProps(null);
          resolve(true);
        },
        title,
        message,
        type: options?.type || 'warning',
        confirmText: options?.confirmText || 'Ya',
        cancelText: options?.cancelText || 'Batal',
        showCancel: options?.showCancel !== false,
      });
    });
  }, []);

  const value: ConfirmationContextType = {
    confirm,
  };

  return (
    <ConfirmationContext.Provider value={value}>
      {children}
      {modalProps && createPortal(
        <ConfirmationModal {...modalProps} />,
        document.body
      )}
    </ConfirmationContext.Provider>
  );
}
