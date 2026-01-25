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

    render() {
        const renderers = this.props.renderers || {};
        const rendererName = this.props.rendererName || 'Table';
        const Renderer = renderers[
            rendererName in renderers
                ? rendererName
                : Object.keys(renderers)[0]
        ];

        if (!Renderer) {
            return <div>Renderer "{rendererName}" not found.</div>;
        }

        return React.createElement(Renderer, this.props);
    }
}

export default PivotTable;
