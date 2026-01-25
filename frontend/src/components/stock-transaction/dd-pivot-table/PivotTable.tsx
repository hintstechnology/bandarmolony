import React from 'react';
import PropTypes from 'prop-types';
import { PivotData } from './Utilities';
import TableRenderers from './TableRenderers';

interface PivotTableProps {
    rendererName?: string;
    renderers?: { [key: string]: React.ComponentType<any> };
    [key: string]: any;
}

// Helper to unwrap ESM modules or other object wrappers
const normalize = (obj: any) => {
    if (!obj) return obj;
    if (obj.__esModule && obj.default) return obj.default;
    if (typeof obj === 'object' && obj.default && (typeof obj.default === 'function' || (typeof obj.default === 'object' && obj.default.render))) {
        return obj.default;
    }
    return obj;
};

class PivotTable extends React.PureComponent<PivotTableProps> {
    static propTypes = Object.assign({}, PivotData.propTypes, {
        rendererName: PropTypes.string,
        renderers: PropTypes.objectOf(PropTypes.func),
    });

    static defaultProps = Object.assign({}, PivotData.defaultProps, {
        rendererName: 'Table',
        renderers: TableRenderers,
    });

    override render() {
        const rawRenderers = this.props.renderers || {};

        // Normalize the renderers object itself if it's a module
        let renderers = (normalize(rawRenderers) || {}) as Record<string, any>;

        // DEFENSIVE: Filter out any non-component keys
        const cleanedRenderers: Record<string, any> = {};
        for (const key in renderers) {
            // Skip module metadata
            if (key === 'default' || key === '__esModule' || key.startsWith('Symbol(')) {
                console.warn(`[PivotTable] Skipping module metadata key: ${key}`);
                continue;
            }

            const value = renderers[key];

            // Only include valid React components
            if (typeof value === 'function') {
                cleanedRenderers[key] = value;
            } else if (typeof value === 'object' && value !== null && (value.$$typeof || value.render)) {
                cleanedRenderers[key] = value;
            } else {
                console.error(`[PivotTable] Invalid renderer for key "${key}":`, {
                    type: typeof value,
                    value: value,
                    isNull: value === null,
                    isArray: Array.isArray(value),
                    keys: value && typeof value === 'object' ? Object.keys(value) : []
                });
            }
        }

        renderers = cleanedRenderers;
        const rendererName = this.props.rendererName || 'Table';
        const rendererKeys = Object.keys(renderers);

        let Renderer = renderers[
            rendererName in renderers
                ? rendererName
                : (rendererKeys.length > 0 ? rendererKeys[0] : 'Table')
        ];

        // Diagnostic logging
        console.log('[PivotTable] Renderer resolution:', {
            requestedName: rendererName,
            availableRenderers: rendererKeys,
            selectedRenderer: Renderer ? 'found' : 'NOT FOUND',
            rendererType: typeof Renderer
        });

        // Normalize the selected renderer
        Renderer = normalize(Renderer);

        // CRITICAL: Validate renderer before React.createElement
        if (!Renderer) {
            console.error('[PivotTable] Renderer not found:', {
                rendererName,
                availableKeys: rendererKeys,
                rawRenderers: Object.keys(rawRenderers)
            });
            return React.createElement('div', {
                style: { padding: '20px', color: 'red', border: '1px solid red' }
            }, `Renderer "${rendererName}" not found. Available: ${rendererKeys.join(', ')}`);
        }

        // CRITICAL: Final type check
        if (typeof Renderer !== 'function') {
            console.error('[PivotTable] Invalid Renderer type:', {
                rendererName,
                type: typeof Renderer,
                isObject: typeof Renderer === 'object',
                isArray: Array.isArray(Renderer),
                hasDefault: Renderer && typeof Renderer === 'object' && 'default' in Renderer,
                keys: Renderer && typeof Renderer === 'object' ? Object.keys(Renderer) : [],
                value: Renderer
            });

            return React.createElement('div', {
                style: { padding: '20px', color: 'red', border: '1px solid red' }
            }, `Invalid Renderer component for "${rendererName}". Expected function, got ${typeof Renderer}. Check console for details.`);
        }

        // Safe to render
        return React.createElement(Renderer, this.props);
    }
}

export default PivotTable;
