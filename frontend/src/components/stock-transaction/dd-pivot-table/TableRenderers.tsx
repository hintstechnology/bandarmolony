import React from 'react';
import PropTypes from 'prop-types';
import { PivotData } from './Utilities';

// helper function for setting row/col-span in pivotTableRenderer
const spanSize = function (arr: any[][], i: number, j: number) {
    let x;
    if (i !== 0) {
        let asc, end;
        let noDraw = true;
        for (
            x = 0, end = j, asc = end >= 0;
            asc ? x <= end : x >= end;
            asc ? x++ : x--
        ) {
            if (arr[i - 1][x] !== arr[i][x]) {
                noDraw = false;
            }
        }
        if (noDraw) {
            return -1;
        }
    }
    let len = 0;
    while (i + len < arr.length) {
        let asc1, end1;
        let stop = false;
        for (
            x = 0, end1 = j, asc1 = end1 >= 0;
            asc1 ? x <= end1 : x >= end1;
            asc1 ? x++ : x--
        ) {
            if (arr[i][x] !== arr[i + len][x]) {
                stop = true;
            }
        }
        if (stop) {
            break;
        }
        len++;
    }
    return len;
};

function redColorScaleGenerator(values: number[]) {
    const min = Math.min.apply(Math, values);
    const max = Math.max.apply(Math, values);
    return function (x: number) {
        // eslint-disable-next-line no-magic-numbers
        const nonRed = 255 - Math.round((255 * (x - min)) / (max - min));
        return { backgroundColor: 'rgb(255,' + nonRed + ',' + nonRed + ')' };
    };
}

function makeRenderer(opts: any = {}) {
    class TableRenderer extends React.PureComponent<any, { displayLimit: number }> {
        static defaultProps = PivotData.defaultProps;
        static propTypes = PivotData.propTypes;

        constructor(props: any) {
            super(props);
            this.state = {
                displayLimit: 50
            };
        }

        override render() {
            const pivotData = new PivotData(this.props);
            const colAttrs = pivotData.props.cols;
            const rowAttrs = pivotData.props.rows;
            const rowKeys = pivotData.getRowKeys();
            const colKeys = pivotData.getColKeys();
            const grandTotalAggregator = pivotData.getAggregator([], []);

            let valueCellColors: any = () => { };
            let rowTotalColors: any = () => { };
            let colTotalColors: any = () => { };
            if (opts.heatmapMode) {
                const colorScaleGenerator = this.props['tableColorScaleGenerator'];
                const rowTotalValues = colKeys.map(x =>
                    pivotData.getAggregator([], x).value()
                );
                rowTotalColors = colorScaleGenerator(rowTotalValues);
                const colTotalValues = rowKeys.map(x =>
                    pivotData.getAggregator(x, []).value()
                );
                colTotalColors = colorScaleGenerator(colTotalValues);

                if (opts.heatmapMode === 'full') {
                    const allValues: number[] = [];
                    rowKeys.map(r =>
                        colKeys.map(c => allValues.push(pivotData.getAggregator(r, c).value()))
                    );
                    const colorScale = colorScaleGenerator(allValues);
                    valueCellColors = (r: any, c: any, v: any) => colorScale(v);
                } else if (opts.heatmapMode === 'row') {
                    const rowColorScales: any = {};
                    rowKeys.map(r => {
                        const rowValues = colKeys.map(x =>
                            pivotData.getAggregator(r, x).value()
                        );
                        rowColorScales[r.join('\0')] = colorScaleGenerator(rowValues);
                    });
                    valueCellColors = (r: any, c: any, v: any) => rowColorScales[r.join('\0')](v);
                } else if (opts.heatmapMode === 'col') {
                    const colColorScales: any = {};
                    colKeys.map(c => {
                        const colValues = rowKeys.map(x =>
                            pivotData.getAggregator(x, c).value()
                        );
                        colColorScales[c.join('\0')] = colorScaleGenerator(colValues);
                    });
                    valueCellColors = (r: any, c: any, v: any) => colColorScales[c.join('\0')](v);
                }
            }

            const getClickHandler =
                (this.props['tableOptions'] && this.props['tableOptions'].clickCallback)
                    ? (value: any, rowValues: any, colValues: any) => {
                        const filters: any = {};
                        for (const i of Object.keys(colAttrs || {})) {
                            const attr = colAttrs[i as any];
                            if (colValues[i] !== null) {
                                filters[attr] = colValues[i];
                            }
                        }
                        for (const i of Object.keys(rowAttrs || {})) {
                            const attr = rowAttrs[i as any];
                            if (rowValues[i] !== null) {
                                filters[attr] = rowValues[i];
                            }
                        }

                        return (e: any) =>
                            this.props['tableOptions'].clickCallback(
                                e,
                                value,
                                filters,
                                pivotData
                            );
                    }
                    : null;

            const table = React.createElement(
                'table',
                { className: 'pvtTable' },
                React.createElement(
                    'thead',
                    null,
                    colAttrs.map((c: any, j: number) =>
                        React.createElement(
                            'tr',
                            { key: 'colAttr' + j },
                            j === 0 &&
                            rowAttrs.length !== 0 &&
                            React.createElement('th', {
                                colSpan: rowAttrs.length,
                                rowSpan: colAttrs.length,
                            }),
                            React.createElement('th', { className: 'pvtAxisLabel' }, c),
                            colKeys.map((colKey, i) => {
                                const x = spanSize(colKeys, i, j);
                                if (x === -1) {
                                    return null;
                                }
                                return React.createElement(
                                    'th',
                                    {
                                        className: 'pvtColLabel',
                                        key: 'colKey' + i,
                                        colSpan: x,
                                        rowSpan:
                                            j === colAttrs.length - 1 && rowAttrs.length !== 0
                                                ? 2
                                                : 1,
                                    },
                                    colKey[j]
                                );
                            }),
                            j === 0 &&
                            React.createElement(
                                'th',
                                {
                                    className: 'pvtTotalLabel',
                                    rowSpan: colAttrs.length + (rowAttrs.length === 0 ? 0 : 1),
                                },
                                'Totals'
                            )
                        )
                    ),
                    rowAttrs.length !== 0 &&
                    React.createElement(
                        'tr',
                        null,
                        rowAttrs.map((r: any, i: number) =>
                            React.createElement(
                                'th',
                                { className: 'pvtAxisLabel', key: 'rowAttr' + i },
                                r
                            )
                        ),
                        React.createElement(
                            'th',
                            { className: 'pvtTotalLabel' },
                            colAttrs.length === 0 ? 'Totals' : null
                        )
                    )
                ),
                React.createElement(
                    'tbody',
                    null,
                    rowKeys.slice(0, this.state.displayLimit).map((rowKey, i) => {
                        const totalAggregator = pivotData.getAggregator(rowKey, []);
                        return React.createElement(
                            'tr',
                            { key: 'rowKeyRow' + i },
                            rowKey.map((txt, j) => {
                                const x = spanSize(rowKeys, i, j);
                                if (x === -1) {
                                    return null;
                                }
                                return React.createElement(
                                    'th',
                                    {
                                        key: 'rowKeyLabel' + i + '-' + j,
                                        className: 'pvtRowLabel',
                                        rowSpan: x,
                                        colSpan:
                                            j === rowAttrs.length - 1 && colAttrs.length !== 0
                                                ? 2
                                                : 1,
                                    },
                                    txt
                                );
                            }),
                            colKeys.map((colKey, j) => {
                                const aggregator = pivotData.getAggregator(rowKey, colKey);
                                return React.createElement(
                                    'td',
                                    {
                                        className: 'pvtVal',
                                        key: 'pvtVal' + i + '-' + j,
                                        onClick:
                                            (getClickHandler &&
                                                getClickHandler(aggregator.value(), rowKey, colKey)) || undefined,
                                        style: valueCellColors(rowKey, colKey, aggregator.value()),
                                    },
                                    aggregator.format(aggregator.value())
                                );
                            }),
                            React.createElement(
                                'td',
                                {
                                    className: 'pvtTotal',
                                    onClick:
                                        (getClickHandler &&
                                            getClickHandler(totalAggregator.value(), rowKey, [null])) || undefined,
                                    style: colTotalColors(totalAggregator.value()),
                                },
                                totalAggregator.format(totalAggregator.value())
                            )
                        );
                    }),
                    React.createElement(
                        'tr',
                        null,
                        React.createElement(
                            'th',
                            {
                                className: 'pvtTotalLabel',
                                colSpan: rowAttrs.length + (colAttrs.length === 0 ? 0 : 1),
                            },
                            'Totals'
                        ),
                        colKeys.map((colKey, i) => {
                            const totalAggregator = pivotData.getAggregator([], colKey);
                            return React.createElement(
                                'td',
                                {
                                    className: 'pvtTotal',
                                    key: 'total' + i,
                                    onClick:
                                        (getClickHandler &&
                                            getClickHandler(totalAggregator.value(), [null], colKey)) || undefined,
                                    style: rowTotalColors(totalAggregator.value()),
                                },
                                totalAggregator.format(totalAggregator.value())
                            );
                        }),
                        React.createElement(
                            'td',
                            {
                                onClick:
                                    (getClickHandler &&
                                        getClickHandler(
                                            grandTotalAggregator.value(),
                                            [null],
                                            [null]
                                        )) || undefined,
                                className: 'pvtGrandTotal',
                            },
                            grandTotalAggregator.format(grandTotalAggregator.value())
                        )
                    )
                )
            );

            return React.createElement(
                'div',
                {
                    className: 'pvtTableContainer',
                    style: {
                        overflow: 'auto',
                        position: 'relative'
                    },
                    onScroll: (e: any) => {
                        const el = e.target;
                        if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
                            if (this.state.displayLimit < rowKeys.length) {
                                this.setState({ displayLimit: this.state.displayLimit + 50 });
                            }
                        }
                    }
                },
                table
            );
        }
    }

    (TableRenderer as any).defaultProps = Object.assign({}, PivotData.defaultProps, {
        tableColorScaleGenerator: redColorScaleGenerator,
        tableOptions: {},
    });
    (TableRenderer as any).propTypes = Object.assign({}, PivotData.propTypes, {
        tableColorScaleGenerator: PropTypes.func,
        tableOptions: PropTypes.object,
    });

    return TableRenderer as any as React.ComponentType<any>;
}

class TSVExportRenderer extends React.PureComponent<any> {
    static defaultProps = PivotData.defaultProps;
    static propTypes = PivotData.propTypes;

    override render() {
        const pivotData = new PivotData(this.props);
        const rowKeys = pivotData.getRowKeys();
        const colKeys = pivotData.getColKeys();
        if (rowKeys.length === 0) {
            rowKeys.push([]);
        }
        if (colKeys.length === 0) {
            colKeys.push([]);
        }

        const headerRow = pivotData.props.rows.map((r: any) => r);
        if (colKeys.length === 1 && colKeys[0].length === 0) {
            headerRow.push(this.props['aggregatorName']);
        } else {
            colKeys.map(c => headerRow.push(c.join('-')));
        }

        const result = rowKeys.map(r => {
            const row = r.map(x => x);
            colKeys.map(c => {
                const v = pivotData.getAggregator(r, c).value();
                row.push(v ? v : '');
            });
            return row;
        });

        result.unshift(headerRow);

        return React.createElement('textarea', {
            value: result.map(r => r.join('\t')).join('\n'),
            style: { width: window.innerWidth / 2, height: window.innerHeight / 2 },
            readOnly: true,
        });
    }
}

export default {
    Table: makeRenderer(),
    'Table Heatmap': makeRenderer({ heatmapMode: 'full' }),
    'Table Col Heatmap': makeRenderer({ heatmapMode: 'col' }),
    'Table Row Heatmap': makeRenderer({ heatmapMode: 'row' }),
    'Exportable TSV': TSVExportRenderer as any as React.ComponentType<any>,
};
