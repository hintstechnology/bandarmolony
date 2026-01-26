declare module 'react-sortablejs' {
    import React from 'react';
    export interface SortableProps {
        options?: any;
        onChange?: (order: any, sortable: any, evt: any) => void;
        tag?: string;
        style?: React.CSSProperties;
        className?: string;
        children?: React.ReactNode;
    }
    const Sortable: React.ComponentClass<SortableProps>;
    export default Sortable;
}
