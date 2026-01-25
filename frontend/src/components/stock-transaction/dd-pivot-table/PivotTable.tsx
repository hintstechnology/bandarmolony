import React from 'react';
import PropTypes from 'prop-types';
import { PivotData } from './Utilities';
import TableRenderers from './TableRenderers';

interface PivotTableProps {
    rendererName?: string;
    renderers?: { [key: string]: React.ComponentType<any> };
    [key: string]: any;
}

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
        const renderers = (this.props.renderers || {}) as Record<string, any>;
        const rendererName = this.props.rendererName || 'Table';
        const rendererKeys = Object.keys(renderers);
        let Renderer = renderers[
            rendererName in renderers
                ? rendererName
                : (rendererKeys.length > 0 ? rendererKeys[0] : 'Table')
        ];

        // Diagnostic logging for production
        if (typeof process !== 'undefined' && process.env && (process.env as any)['NODE_ENV'] === 'production' && (!Renderer || typeof Renderer !== 'function')) {
            console.error('PivotTable Render Error Diagnostic:', {
                rendererName,
                hasRenderer: !!Renderer,
                type: typeof Renderer,
                availableRenderers: Object.keys(renderers)
            });
        }

        // Handle ESM default wrapper if found
        if (Renderer && typeof Renderer === 'object' && 'default' in Renderer) {
            Renderer = Renderer.default;
        }

        if (!Renderer) {
            return React.createElement('div', null, `Renderer "${rendererName}" not found.`);
        }

        // If it's still an object and not a valid React type, show error instead of crashing
        if (typeof Renderer === 'object' && !Array.isArray(Renderer)) {
            return React.createElement('div', null, `Invalid Renderer type for "${rendererName}": object. Check console.`);
        }

        return React.createElement(Renderer, this.props);
    }
}

export default PivotTable;
