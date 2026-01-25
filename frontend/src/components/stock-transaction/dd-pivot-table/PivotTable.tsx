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
        const renderers = (normalize(rawRenderers) || {}) as Record<string, any>;
        const rendererName = this.props.rendererName || 'Table';
        const rendererKeys = Object.keys(renderers);

        let Renderer = renderers[
            rendererName in renderers
                ? rendererName
                : (rendererKeys.length > 0 ? rendererKeys[0] : 'Table')
        ];

        // Diagnostic logging for production
        if (typeof process !== 'undefined' && process.env && (process.env as any)['NODE_ENV'] === 'production' && (!Renderer || typeof Renderer !== 'function')) {
            console.error('PivotTable Resolution Error:', {
                rendererName,
                resolvedType: typeof Renderer,
                isObject: Renderer && typeof Renderer === 'object',
                hasDefault: Renderer && typeof Renderer === 'object' && 'default' in Renderer,
                availableKeys: rendererKeys
            });
        }

        // Normalize the selected renderer
        Renderer = normalize(Renderer);

        if (!Renderer) {
            return React.createElement('div', null, `Renderer "${rendererName}" not found.`);
        }

        // Final safety check: if still not a valid React type, return an error div
        if (typeof Renderer === 'object' && !Array.isArray(Renderer)) {
            return React.createElement('div', null, `Invalid Renderer component for "${rendererName}". Check console.`);
        }

        return React.createElement(Renderer, this.props);
    }
}

export default PivotTable;
